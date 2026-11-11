"""
Caminhantes: NPCs que atravessam o saguão (ciclo de caminhada + deslocamento no front).

Diferente das vinhetas (patch com fundo, fixo no lugar), o caminhante se move sobre o cenário:
  - o frame A é gerado DENTRO de um trecho real de piso (herda luz, traço e escala);
  - os outros passos do ciclo são EDIÇÕES do frame A (mesmo personagem, mesmo lugar);
  - extraímos só a silhueta (diferença forte contra a placa) e a SOMBRA vira uma camada de
    transparência preta (sem a textura do piso), então nada desliza junto com ele;
  - todos os frames compartilham a mesma tela, então o alinhamento entre passos é o da geração.

  python Frontend/scripts/hall-life/walker.py gen-a   --only traveler --variants 2
  python Frontend/scripts/hall-life/walker.py pick    --only traveler --variant 1
  python Frontend/scripts/hall-life/walker.py frames  --only traveler
  python Frontend/scripts/hall-life/walker.py extract --only traveler
  python Frontend/scripts/hall-life/walker.py export  --only traveler

Configuração em vignettes.json -> "walkers".
"""
from __future__ import annotations

import argparse
import io
import json

import cv2
import numpy as np
from PIL import Image

import common as C
from extract import align, color_match, delta_e, to_np

DATA_WALKERS = C.FRONTEND / "assets" / "data" / "hall-walkers.json"

PROMPT_A = (
    "This image is a crop of a hand-drawn 2D illustration of a medieval fantasy adventurers' guild hall. "
    "Edit it: add {who}, walking to the RIGHT across the stone floor, seen in a clean side (profile) view, "
    "in this exact walk-cycle pose: {pose}. His FULL BODY, from the boots to the top of the head, spans about "
    "85% of the image height, with the boots on the floor near the bottom edge. Paint him in EXACTLY the same "
    "illustration style as the rest of the image: the same dark-brown outline thickness, the same cel shading and "
    "the same warm torch-lit palette, lit by the light that already exists in the image, with a soft contact "
    "shadow under the boots. Keep EVERYTHING else pixel-identical. Do not add any other object, prop or light. "
    "No text."
)

PROMPT_STEP = (
    "This image is a crop of a hand-drawn 2D illustration. Edit it. Change ONLY the pose of the walking "
    "traveler to this walk-cycle pose: {pose}. He stays at exactly the same place on the floor (same hips "
    "position, same height, same size), still walking to the RIGHT in profile view, with the same face, clothes, "
    "backpack and colors. Keep every other pixel identical. Do not add anything. No text."
)


def walkers(manifest: dict, ids, all_) -> list[dict]:
    items = manifest.get("walkers", [])
    if ids:
        items = [w for w in items if w["id"] in set(ids)]
    elif not all_:
        raise SystemExit("informe --only <ids> ou --all")
    return items


def wstate(state: dict, wid: str) -> dict:
    return state.setdefault("walkers", {}).setdefault(wid, {})


def cmd_gen_a(args, manifest, state):
    key = C.load_env_key()
    scene = Image.open(C.SCENE).convert("RGB")  # placa da cena ORIGINAL: o caminhante não carrega fundo
    W, H = scene.size
    for w in walkers(manifest, args.only, args.all):
        u0, v0, u1, v1 = w["generate_area"]
        rect, aspect = C.snap_rect_to_aspect((round(u0 * W), round(v0 * H), round(u1 * W), round(v1 * H)), (W, H))
        plate = scene.crop(rect)
        C.PLATES.mkdir(parents=True, exist_ok=True)
        plate.save(C.PLATES / f"walker-{w['id']}.png")
        st = wstate(state, w["id"])
        st.update({"rect": list(rect), "aspect": aspect})
        raw = C.RAW / f"walker-{w['id']}"
        raw.mkdir(parents=True, exist_ok=True)
        start = len(list(raw.glob("a-*.png")))
        prompt = PROMPT_A.format(who=w["who"], pose=w["cycle"][0]["pose"])
        for i in range(start + 1, start + 1 + args.variants):
            print(f"[{w['id']}] frame A variacao {i} ({aspect}, placa {plate.size})...")
            png = C.call_gemini_edit(key, manifest["model"], prompt, [plate], aspect)
            Image.open(io.BytesIO(png)).convert("RGB").save(raw / f"a-{i}.png")
        C.save_state(state)
        from generate import variants_sheet

        variants_sheet(f"walker-{w['id']}", plate, sorted(raw.glob("a-*.png")))


def cmd_pick(args, manifest, state):
    for w in walkers(manifest, args.only, args.all):
        wstate(state, w["id"])["picked"] = args.variant
        print(f"[{w['id']}] frame A = variacao {args.variant}")
    C.save_state(state)


PROMPT_GRID = (
    "This image is a 2x2 grid of four panels that show the SAME crop of a hand-drawn 2D illustration of a "
    "medieval guild hall floor. The TOP-LEFT panel already contains a walking traveler (walk-cycle step 1). "
    "Draw the SAME traveler (identical face, hood, cloak, backpack, colors, outline style, size and lighting) in "
    "the other three panels, at the same place in each panel (same hips position, boots on the same floor line), "
    "still walking to the RIGHT in profile, in these walk-cycle steps: TOP-RIGHT = {p1}; BOTTOM-LEFT = {p2}; "
    "BOTTOM-RIGHT = {p3}. The legs and arms must be clearly different between the panels, like a real "
    "animation walk cycle. Do NOT change the top-left panel, do not change the floor or the background, do not "
    "draw borders, labels or numbers. Each traveler casts a soft contact shadow under the boots."
)


def cmd_frames(args, manifest, state):
    """Passos b, c, d numa unica geracao (grade 2x2): o modelo mantem o personagem identico entre os quadros."""
    key = C.load_env_key()
    for w in walkers(manifest, args.only, args.all):
        st = wstate(state, w["id"])
        raw = C.RAW / f"walker-{w['id']}"
        names = [s_["name"] for s_ in w["cycle"]]
        if all((raw / f"{n}.png").exists() for n in names[1:]) and not args.force:
            print(f"[{w['id']}] passos ja existem (use --force)")
            continue
        plate = Image.open(C.PLATES / f"walker-{w['id']}.png").convert("RGB")
        pw, ph = plate.size
        frame_a = Image.open(raw / f"a-{st['picked']}.png").convert("RGB").resize((pw, ph), Image.LANCZOS)
        grid = Image.new("RGB", (pw * 2, ph * 2))
        grid.paste(frame_a, (0, 0))
        grid.paste(plate, (pw, 0))
        grid.paste(plate, (0, ph))
        grid.paste(plate, (pw, ph))
        grid.save(raw / "grid-in.png")
        prompt = PROMPT_GRID.format(p1=w["cycle"][1]["pose"], p2=w["cycle"][2]["pose"], p3=w["cycle"][3]["pose"])
        print(f"[{w['id']}] grade 2x2 com os passos {names[1:]}...")
        png = C.call_gemini_edit(key, manifest["model"], prompt, [grid], st["aspect"])
        out = Image.open(io.BytesIO(png)).convert("RGB")
        out.save(raw / "grid-out.png")
        gw, gh = out.size
        tiles = {
            names[1]: out.crop((gw // 2, 0, gw, gh // 2)),
            names[2]: out.crop((0, gh // 2, gw // 2, gh)),
            names[3]: out.crop((gw // 2, gh // 2, gw, gh)),
        }
        for n, t in tiles.items():
            t.save(raw / f"{n}.png")
        print(f"[{w['id']}] grade {out.size} -> passos salvos")


def _lab(x: np.ndarray) -> np.ndarray:
    lab = cv2.cvtColor(x, cv2.COLOR_RGB2LAB).astype(np.float32)
    lab[..., 0] *= 100 / 255
    return lab


def silhouette(frame: np.ndarray, plate: np.ndarray, threshold: float) -> np.ndarray:
    """Máscara 0/1 do personagem. Piso apenas escurecido (sombra: mesma cor, menos luz) NÃO é corpo."""
    lf, lp = _lab(frame), _lab(plate)
    dab = np.hypot(lf[..., 1] - lp[..., 1], lf[..., 2] - lp[..., 2])
    dl = lp[..., 0] - lf[..., 0]
    de = cv2.GaussianBlur(delta_e(frame, plate), (0, 0), 1.2)
    shadow_like = (cv2.GaussianBlur(dab, (0, 0), 1.5) < 7) & (dl > 0) & (lf[..., 0] > 18)
    m = ((de > threshold) & ~shadow_like).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1:
        return m
    biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    keep = (labels == biggest).astype(np.uint8)
    near = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25)))
    for i in range(1, n):
        if i != biggest and stats[i, cv2.CC_STAT_AREA] > 60 and (near[labels == i] > 0).any():
            keep[labels == i] = 1
    # buracos cercados pelo corpo: no tronco são falhas do casaco (preenche); entre as pernas é o
    # piso visto pelo vão (só preenche se o conteúdo NÃO for parecido com o piso original)
    ys, _ = np.where(keep > 0)
    top, bottom = ys.min(), ys.max()
    knee = top + 0.72 * (bottom - top)
    inv = (1 - keep).astype(np.uint8)
    cv2.floodFill(inv, np.zeros((inv.shape[0] + 2, inv.shape[1] + 2), np.uint8), (0, 0), 0)
    n2, lab2, _, cents = cv2.connectedComponentsWithStats(inv, 8)
    for i in range(1, n2):
        hole = lab2 == i
        if cents[i][1] < knee or float(de[hole].mean()) > threshold * 0.7:
            keep[hole] = 1
    # entalhes abertos na borda do casaco (acima do joelho): aceita só pixels com a cor do próprio corpo
    closed = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21)))
    cand = (closed > 0) & (keep == 0)
    cand[int(knee):, :] = False
    if cand.any():
        lf = _lab(frame)
        body_col = np.median(lf[keep > 0], axis=0)
        dist = np.linalg.norm(lf - body_col, axis=2)
        keep[cand & (dist < 14)] = 1
    return keep.astype(np.uint8)


def shadow_alpha(frame: np.ndarray, plate: np.ndarray, body: np.ndarray, max_alpha: float = 0.55) -> np.ndarray:
    """Sombra = escurecimento do piso perto dos pés (sem textura): alpha de uma camada preta."""
    L_f = cv2.cvtColor(frame, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32) + 1
    L_p = cv2.cvtColor(plate, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32) + 1
    a = np.clip(1 - cv2.GaussianBlur(L_f, (0, 0), 4) / cv2.GaussianBlur(L_p, (0, 0), 4), 0, max_alpha)
    ys, xs = np.where(body > 0)
    feet_y = ys.max()
    h = ys.max() - ys.min()
    zone = np.zeros_like(body, dtype=np.float32)
    x0, x1 = max(0, xs.min() - int(0.15 * h)), min(body.shape[1], xs.max() + int(0.15 * h))
    zone[max(0, feet_y - int(0.12 * h)) : min(body.shape[0], feet_y + int(0.08 * h)), x0:x1] = 1
    zone = cv2.GaussianBlur(zone, (0, 0), 6)
    a = cv2.GaussianBlur(a * zone * (1 - body), (0, 0), 3.0)
    return np.where(a > 0.06, a, 0)


def faces_opposite(body: np.ndarray, ref: np.ndarray) -> bool:
    """Compara o tronco (40% de cima) com o passo de referência, normal x espelhado."""
    def torso(m):
        ys, xs = np.where(m > 0)
        y0, y1 = ys.min(), ys.min() + int(0.4 * (ys.max() - ys.min()))
        t = m[y0:y1, xs.min() : xs.max() + 1].astype(np.float32)
        return cv2.resize(t, (64, 64))
    a, b = torso(body), torso(ref)
    same = (a * b).sum() / max((a + b - a * b).sum(), 1)
    flip = (a[:, ::-1] * b).sum() / max((a[:, ::-1] + b - a[:, ::-1] * b).sum(), 1)
    return flip > same + 0.05


def mirror_around_body(frame: np.ndarray, plate: np.ndarray, body: np.ndarray):
    """Espelha só o personagem (o piso continua o da placa), mantendo o centro do corpo no lugar."""
    ys, xs = np.where(body > 0)
    cx = int(round((xs.min() + xs.max()) / 2))
    w = body.shape[1]
    M = np.float32([[-1, 0, 2 * cx], [0, 1, 0]])
    fb = cv2.warpAffine(body, M, (w, body.shape[0]), flags=cv2.INTER_NEAREST)
    ff = cv2.warpAffine(frame, M, (w, body.shape[0]), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    out = np.where(fb[..., None] > 0, ff, plate)
    return out.astype(np.uint8), fb


def cmd_extract(args, manifest, state):
    for w in walkers(manifest, args.only, args.all):
        wid = w["id"]
        st = wstate(state, wid)
        raw = C.RAW / f"walker-{wid}"
        plate = to_np(Image.open(C.PLATES / f"walker-{wid}.png"))
        h, w_ = plate.shape[:2]
        thr = w.get("threshold", 14.0)
        names = [s["name"] for s in w["cycle"]]
        paths = {"a": raw / f"a-{st['picked']}.png", **{n: raw / f"{n}.png" for n in names[1:]}}
        frames, bodies, shadows = {}, {}, {}
        frame_a = None
        for n in names:
            img = to_np(Image.open(paths[n]).convert("RGB").resize((w_, h), Image.LANCZOS))
            f = color_match(align(img, plate), plate)
            if frame_a is not None:
                f = color_match(align(f, frame_a), frame_a)
            else:
                frame_a = f
            body = silhouette(f, plate, thr)
            if n != "a" and faces_opposite(body, bodies["a"]):
                print(f"[{wid}] passo {n} saiu espelhado: virando horizontalmente em torno do corpo")
                f, body = mirror_around_body(f, plate, body)
            frames[n], bodies[n] = f, body
            shadows[n] = shadow_alpha(f, plate, body)
            ys, xs = np.where(body > 0)
            print(f"[{wid}] passo {n}: corpo {xs.max() - xs.min()}x{ys.max() - ys.min()} px, pés em y={ys.max()}")
        # tela comum = uniao de corpos + sombras
        union = np.zeros((h, w_), np.uint8)
        for n in names:
            union |= bodies[n] | (shadows[n] > 0).astype(np.uint8)
        ys, xs = np.where(union > 0)
        pad = 4
        y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad + 1)
        x0, x1 = max(0, xs.min() - pad), min(w_, xs.max() + pad + 1)
        out = C.EXTRACT / f"walker-{wid}"
        out.mkdir(parents=True, exist_ok=True)
        feet = []
        for n in names:
            body_a = np.clip(cv2.GaussianBlur(bodies[n].astype(np.float32), (0, 0), 0.7), 0, 1)
            rgb = frames[n].astype(np.float32)
            a = body_a + shadows[n] * (1 - body_a)
            # sombra é preta; corpo usa a cor gerada (pre-multiplicado e depois desfeito)
            col = (rgb * body_a[..., None]) / np.maximum(a[..., None], 1e-4)
            rgba = np.dstack([np.clip(col, 0, 255), a * 255]).round().astype(np.uint8)[y0:y1, x0:x1]
            Image.fromarray(rgba, "RGBA").save(out / f"{n}.png")
            bys, bxs = np.where(bodies[n][y0:y1, x0:x1] > 0)
            feet.append(int(bys.max()))
        # ancora: centro horizontal do corpo no frame A, linha dos pés (maior y entre os passos)
        bys, bxs = np.where(bodies["a"][y0:y1, x0:x1] > 0)
        meta = {
            "canvas": [int(x1 - x0), int(y1 - y0)],
            "anchor": [int(np.median(bxs)), int(max(feet))],
            "body_height": int(bys.max() - bys.min()),
            # pés na imagem completa no momento da geracao (referencia de escala por profundidade)
            "ref_feet_v": (st["rect"][1] + y0 + max(feet)) / 3392,
            "frames": names,
        }
        (out / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
        print(f"[{wid}] tela {meta['canvas']}, ancora {meta['anchor']}, altura {meta['body_height']} px")
        sheet(wid, names)


def sheet(wid: str, names: list[str]) -> None:
    out = C.EXTRACT / f"walker-{wid}"
    tiles = [C.checker(Image.open(out / f"{n}.png")).convert("RGB") for n in names]
    w, h = tiles[0].size
    s = min(3.0, 600 / h)
    img = Image.new("RGB", (int(w * s) * len(tiles) + 10 * len(tiles), int(h * s)), (255, 255, 255))
    for i, t in enumerate(tiles):
        img.paste(t.resize((int(w * s), int(h * s)), Image.LANCZOS), (i * (int(w * s) + 10), 0))
    img.save(C.PREVIEWS / f"walker-{wid}-cycle.jpg", quality=88)
    print(f"[{wid}] folha do ciclo: {(C.PREVIEWS / f'walker-{wid}-cycle.jpg').relative_to(C.ROOT)}")


def cmd_export(args, manifest, state):
    data = json.loads(DATA_WALKERS.read_text(encoding="utf-8")) if DATA_WALKERS.exists() else {}
    for w in walkers(manifest, args.only, args.all):
        wid = w["id"]
        src = C.EXTRACT / f"walker-{wid}"
        meta = json.loads((src / "meta.json").read_text(encoding="utf-8"))
        dst = C.PUBLIC_OUT / f"walker-{wid}"
        dst.mkdir(parents=True, exist_ok=True)
        for old in dst.glob("*.webp"):
            old.unlink()
        frames = []
        for n in meta["frames"]:
            Image.open(src / f"{n}.png").save(dst / f"{n}.webp", "WEBP", lossless=True, quality=100, method=6)
            frames.append(f"/vfx/hall-life/walker-{wid}/{n}.webp")
        data[wid] = {
            "frames": frames,
            "canvas": meta["canvas"],
            "anchor": meta["anchor"],
            "bodyHeight": meta["body_height"],
            "refFeetV": round(meta["ref_feet_v"], 4),
            "route": w["route"],
            "behaviour": w["behaviour"],
            "tooltip": w.get("tooltip"),
        }
        size = sum(p.stat().st_size for p in dst.glob("*.webp")) / 1024
        print(f"[{wid}] exportado: {len(frames)} passos, {size:.0f} KB")
    DATA_WALKERS.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("gen-a", "pick", "frames", "extract", "export"):
        p = sub.add_parser(name)
        p.add_argument("--only", nargs="*")
        p.add_argument("--all", action="store_true")
        if name == "gen-a":
            p.add_argument("--variants", type=int, default=2)
        if name == "pick":
            p.add_argument("--variant", type=int, required=True)
        if name == "frames":
            p.add_argument("--force", action="store_true")
    args = ap.parse_args()
    C.ensure_dirs()
    manifest, state = C.load_manifest(), C.load_state()
    {
        "gen-a": cmd_gen_a,
        "pick": cmd_pick,
        "frames": cmd_frames,
        "extract": cmd_extract,
        "export": cmd_export,
    }[args.cmd](args, manifest, state)


if __name__ == "__main__":
    main()
