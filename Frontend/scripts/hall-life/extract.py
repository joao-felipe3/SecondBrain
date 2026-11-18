"""
Etapa 3: extracao por diferenca.

Para cada vinheta (frame A escolhido + frames seguintes):
  1. redimensiona o frame gerado para o tamanho nativo da placa;
  2. alinha ao original (ECC afim, o modelo costuma deslocar/escalar levemente);
  3. corrige a cor global (ganho/offset por canal ajustado nos pixels que nao mudaram);
  4. mascara = distancia perceptual (Lab) acima do limiar -> limpeza -> componentes relevantes;
  5. mascara-uniao de todos os frames + feather -> alpha comum (frames so diferem onde ha movimento);
  6. salva patches RGBA recortados + metadados em work/extract/<id>/.

  python Frontend/scripts/hall-life/extract.py --only dwarf-crate
"""
from __future__ import annotations

import argparse
import json

import cv2
import numpy as np
from PIL import Image

import common as C

DEFAULTS = {
    "threshold": 9.0,  # delta E (Lab, escala OpenCV ~ CIE76) para considerar "mudou"
    "min_area": 0.0015,  # componente minimo (fracao da placa) para entrar na mascara
    "close": 9,  # fechamento morfologico (px) para unir partes do personagem
    "grow": 3,  # dilatacao antes do feather (px)
    "feather": 3.0,  # sigma do desfoque da borda (px)
    "blur": 1.5,  # desfoque da diferenca antes do limiar; maior = ignora redesenho de linhas finas
}


def to_np(img: Image.Image) -> np.ndarray:
    return np.asarray(img.convert("RGB"), dtype=np.uint8)


def align(frame: np.ndarray, plate: np.ndarray) -> np.ndarray:
    """ECC afim em cinza; retorna o frame warpado para a geometria da placa."""
    g_ref = cv2.cvtColor(plate, cv2.COLOR_RGB2GRAY).astype(np.float32)
    g_mov = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY).astype(np.float32)
    warp = np.eye(2, 3, dtype=np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
    try:
        _, warp = cv2.findTransformECC(g_ref, g_mov, warp, cv2.MOTION_AFFINE, criteria, None, 5)
    except cv2.error:
        return frame
    h, w = plate.shape[:2]
    return cv2.warpAffine(frame, warp, (w, h), flags=cv2.INTER_LANCZOS4 + cv2.WARP_INVERSE_MAP,
                          borderMode=cv2.BORDER_REPLICATE)


def color_match(frame: np.ndarray, plate: np.ndarray) -> np.ndarray:
    """Ganho/offset por canal ajustado nos pixels estaveis (2 passadas robustas)."""
    f = frame.reshape(-1, 3).astype(np.float64)
    p = plate.reshape(-1, 3).astype(np.float64)
    keep = np.ones(len(f), dtype=bool)
    for _ in range(2):
        out = np.empty_like(f)
        for c in range(3):
            A = np.stack([f[keep, c], np.ones(keep.sum())], axis=1)
            gain, off = np.linalg.lstsq(A, p[keep, c], rcond=None)[0]
            out[:, c] = f[:, c] * gain + off
        resid = np.abs(out - p).sum(axis=1)
        keep = resid < np.percentile(resid, 60)
    return np.clip(out, 0, 255).reshape(frame.shape).astype(np.uint8)


def delta_e(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    la = cv2.cvtColor(a, cv2.COLOR_RGB2LAB).astype(np.float32)
    lb = cv2.cvtColor(b, cv2.COLOR_RGB2LAB).astype(np.float32)
    # OpenCV: L em 0..255 (=L*2.55), a/b deslocados de 128
    la[..., 0] *= 100 / 255
    lb[..., 0] *= 100 / 255
    return np.sqrt(((la - lb) ** 2).sum(axis=2))


def change_mask(de: np.ndarray, p: dict) -> np.ndarray:
    de = cv2.GaussianBlur(de, (0, 0), p["blur"])
    m = (de > p["threshold"]).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (p["close"], p["close"]))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    min_px = p["min_area"] * m.size
    keep = np.zeros_like(m)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= min_px:
            keep[labels == i] = 1
    # preenche buracos (regioes internas iguais ao fundo, ex.: entre bracos e corpo)
    inv = (1 - keep).astype(np.uint8)
    h, w = keep.shape
    flood = inv.copy()
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 0)
    return np.clip(keep + flood, 0, 1)


def feather(mask: np.ndarray, p: dict) -> np.ndarray:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * p["grow"] + 1, 2 * p["grow"] + 1))
    grown = cv2.dilate(mask, k).astype(np.float32)
    return np.clip(cv2.GaussianBlur(grown, (0, 0), p["feather"]), 0, 1)


def other_vignettes_mask(v: dict, st: dict, shape: tuple[int, int]) -> np.ndarray:
    """Regiao (0/1, dilatada) onde vinhetas de tras SE MOVEM dentro desta placa.

    So o que se move precisa ser protegido: cobrir a parte estatica de outra vinheta com a copia
    redesenhada e inofensivo (e permite um personagem passar na frente do outro)."""
    if not C.DATA_OUT.exists():
        return np.zeros(shape, np.float32)
    data = json.loads(C.DATA_OUT.read_text(encoding="utf-8"))
    px, py = st["rect"][0], st["rect"][1]
    h, w = shape
    out = np.zeros(shape, np.float32)
    for oid, info in data.items():
        # so as que ficam ATRAS (ordem menor): as da frente ja sao pintadas por cima desta
        if oid == v["id"] or info["order"] >= v["order"]:
            continue
        ox, oy, ow, oh = info["rect"]
        x0, y0 = max(ox - px, 0), max(oy - py, 0)
        x1, y1 = min(ox + ow - px, w), min(oy + oh - py, h)
        if x0 >= x1 or y0 >= y1:
            continue
        imgs = [np.asarray(Image.open(C.PUBLIC_OUT / oid / f"{fr['name']}.webp").convert("RGBA"), np.float32)
                for fr in info["frames"]]
        moving = np.zeros((oh, ow), np.float32)
        for other in imgs[1:]:
            diff = np.abs(other[..., :3] - imgs[0][..., :3]).max(axis=2) * (imgs[0][..., 3] / 255)
            moving = np.maximum(moving, (cv2.GaussianBlur(diff, (0, 0), 1.5) > 18).astype(np.float32))
        sub = moving[y0 - (oy - py) : y1 - (oy - py), x0 - (ox - px) : x1 - (ox - px)]
        out[y0:y1, x0:x1] = np.maximum(out[y0:y1, x0:x1], sub)
    if out.any():  # margem para o feather desta vinheta nao invadir a outra
        out = cv2.dilate(out, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    return out


def frame_paths(v: dict, st: dict) -> list[tuple[str, str]]:
    out = [("a", str(C.RAW / v["id"] / f"a-{st['picked']}.png"))]
    for fr in v["frames"][1:]:
        out.append((fr["name"], str(C.RAW / v["id"] / f"{fr['name']}.png")))
        # intermediarios desenhados (generate.py tweens) entram na mesma mascara-uniao
        t = fr.get("tweens", 0)
        for k in range(1, (len(t) if isinstance(t, list) else int(t)) + 1):
            out.append((f"{fr['name']}_{k}", str(C.RAW / v["id"] / f"{fr['name']}_{k}.png")))
        # ciclo parado na pose (rig.py: goles enquanto bebe)
        for k in range(1, int(fr.get("loop", 0)) + 1):
            out.append((f"{fr['name']}_loop_{k}", str(C.RAW / v["id"] / f"{fr['name']}_loop_{k}.png")))
    return out


def process(v: dict, st: dict) -> dict:
    vid = v["id"]
    p = {**DEFAULTS, **v.get("extract", {})}
    plate = to_np(Image.open(C.PLATES / f"{vid}.png"))
    h, w = plate.shape[:2]
    frames = {}
    masks = []
    frame_a = None
    # movimento entre frames: sensibilidade propria (gestos pequenos como olhar/piscar precisam
    # de pouco desfoque) e alcance limitado em volta dos personagens do frame A
    motion_p = {
        **p,
        "threshold": p.get("motion_threshold", min(12.6, p["threshold"] * 1.4)),
        "blur": p.get("motion_blur", 1.5),
    }
    reach = int(p.get("motion_reach", 41)) | 1
    for name, path in frame_paths(v, st):
        img = Image.open(path).convert("RGB").resize((w, h), Image.LANCZOS)
        f = color_match(align(to_np(img), plate), plate)
        if frame_a is None:
            frame_a = f
            m = change_mask(delta_e(f, plate), p)
            # movimento dos frames seguintes so vale perto dos personagens do frame A
            # (o modelo as vezes inventa objetos no cenario ao editar: tocha, lampiao...)
            near_a = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (reach, reach)))
            print(f"[{vid}] frame {name}: area alterada {m.mean() * 100:.1f}% da placa")
        else:
            # alinha ao frame A e so aceita pixels novos onde houve movimento real
            f = color_match(align(f, frame_a), frame_a)
            motion = change_mask(delta_e(f, frame_a), motion_p) & near_a
            mb = feather(motion, p)[..., None]
            f = (frame_a * (1 - mb) + f * mb).round().astype(np.uint8)
            m = change_mask(delta_e(f, plate), p)
            print(f"[{vid}] frame {name}: movimento em {motion.mean() * 100:.1f}% da placa")
        frames[name] = (f, None)
        masks.append(m)
    union = np.clip(np.sum(masks, axis=0), 0, 1).astype(np.uint8)
    # nunca cobrir outra vinheta ja exportada (ela e animada; uma copia estatica congelaria o movimento)
    protect = other_vignettes_mask(v, st, (h, w))
    if protect.any():
        before = union.sum()
        union = (union & (protect == 0)).astype(np.uint8)
        print(f"[{vid}] protegendo outras vinhetas: -{(before - union.sum()) / union.size * 100:.1f}% da placa")
    alpha = feather(union, p) * (1 - protect)

    ys, xs = np.where(alpha > 0.004)
    by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    out_dir = C.EXTRACT / vid
    out_dir.mkdir(parents=True, exist_ok=True)
    a8 = (alpha * 255).round().astype(np.uint8)
    # fora da mascara de mudanca nada mudou por definicao: na franja do feather usa o pixel ORIGINAL
    # (o modelo redesenha linhas finas do cenario; misturar redesenho com original gera "linha dupla")
    outside = (1 - union).astype(np.float32)
    restore = np.clip(cv2.GaussianBlur(outside, (0, 0), 1.0), 0, 1)[..., None]
    for name, (f, _) in frames.items():
        f = (f * (1 - restore) + plate * restore).round().astype(np.uint8)
        rgba = np.dstack([f, a8])[by0:by1, bx0:bx1]
        Image.fromarray(rgba, "RGBA").save(out_dir / f"{name}.png")
    Image.fromarray((union * 255).astype(np.uint8)).save(out_dir / "mask-union.png")
    Image.fromarray(a8).save(out_dir / "alpha.png")

    rx, ry = st["rect"][0], st["rect"][1]
    meta = {
        "rect": [int(rx + bx0), int(ry + by0), int(bx1 - bx0), int(by1 - by0)],  # x, y, w, h na imagem
        "crop_in_plate": [int(bx0), int(by0), int(bx1), int(by1)],
        "frames": list(frames.keys()),
        "params": p,
    }
    (out_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"[{vid}] patch {meta['rect'][2]}x{meta['rect'][3]} em ({meta['rect'][0]}, {meta['rect'][1]})")
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    manifest, state = C.load_manifest(), C.load_state()
    for v in C.select(manifest, args.only, args.all):
        st = state["vignettes"].get(v["id"], {})
        if "picked" not in st:
            print(f"[{v['id']}] sem frame A escolhido, pulando")
            continue
        process(v, st)


if __name__ == "__main__":
    main()
