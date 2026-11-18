"""
Exporta as vinhetas aprovadas para o frontend.

Fonte dos frames: work/photoshop/export/<id>/ (se a vinheta passou pelo Photoshop, inclusive retoques
manuais) ou, na falta, work/extract/<id>/.

Saidas:
  Frontend/public/vfx/hall-life/<id>/<frame>.webp  (qualidade 92, alpha sem perda)
  Frontend/assets/data/hall-life.json               (retangulo em px da imagem, frames, tempos, luz, tooltip)
  work/composite.png                                (cena + frame A de todas as vinhetas exportadas)

  python Frontend/scripts/hall-life/export.py --only dwarf-crate
  python Frontend/scripts/hall-life/export.py --all
"""
from __future__ import annotations

import argparse
import json

import cv2
import numpy as np
from PIL import Image

import common as C

# WebP com perda em qualidade alta e alfa sem perda: ~3x menor que lossless (agora ha intermediarios),
# erro medio ~2,5/255 — invisivel na cena
WEBP = {"quality": 92, "alpha_quality": 100, "method": 6, "exact": False}
from extract import delta_e, to_np
from run_photoshop import EXPORT_DIR


def source_for(vid: str, st: dict) -> tuple[list[int], dict[str, Image.Image]]:
    ps = st.get("photoshop_export")
    meta_path = C.EXTRACT / vid / "meta.json"
    extract_frames = json.loads(meta_path.read_text(encoding="utf-8"))["frames"] if meta_path.exists() else []
    ps_ok = (
        ps
        and set(extract_frames) <= set(ps["frames"])
        and all((EXPORT_DIR / vid / f"{n}.png").exists() for n in ps["frames"])
        # retoques do Photoshop só valem se forem mais novos que a última extração
        and min((EXPORT_DIR / vid / f"{n}.png").stat().st_mtime for n in ps["frames"]) >= meta_path.stat().st_mtime
    )
    if ps_ok:
        frames = {n: Image.open(EXPORT_DIR / vid / f"{n}.png").convert("RGBA") for n in ps["frames"]}
        return list(ps["rect"]), frames
    meta = json.loads((C.EXTRACT / vid / "meta.json").read_text(encoding="utf-8"))
    frames = {n: Image.open(C.EXTRACT / vid / f"{n}.png").convert("RGBA") for n in meta["frames"]}
    return list(meta["rect"]), frames


def foreground_layer(vid: str, rect: list[int], frames: dict[str, Image.Image], box: list[float]) -> dict:
    """Silhueta justa dos personagens dentro de 'box' (fracoes do patch), para desenhar ACIMA dos
    efeitos (fogo da lareira, tochas). Mascara = diferenca forte contra a cena original, sem fundo."""
    x, y, w, h = rect
    bx0, by0 = round(box[0] * w), round(box[1] * h)
    bx1, by1 = round(box[2] * w), round(box[3] * h)
    scene = to_np(Image.open(C.SCENE).crop((x + bx0, y + by0, x + bx1, y + by1)))
    out_dir = C.PUBLIC_OUT / vid
    fg_frames = []
    for name, img in frames.items():
        rgba = np.asarray(img.crop((bx0, by0, bx1, by1)), dtype=np.uint8)
        de = cv2.GaussianBlur(delta_e(rgba[..., :3].copy(), scene), (0, 0), 1.0)
        m = ((de > 14) & (rgba[..., 3] > 128)).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
        n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
        keep = np.zeros_like(m)
        for i in range(1, n):
            if stats[i, cv2.CC_STAT_AREA] >= 0.003 * m.size:
                keep[labels == i] = 1
        inv = (1 - keep).astype(np.uint8)
        cv2.floodFill(inv, np.zeros((inv.shape[0] + 2, inv.shape[1] + 2), np.uint8), (0, 0), 0)
        keep = np.clip(keep + inv, 0, 1).astype(np.float32)
        alpha = np.clip(cv2.GaussianBlur(cv2.erode(keep, np.ones((2, 2), np.uint8)), (0, 0), 0.8), 0, 1)
        fg = np.dstack([rgba[..., :3], (alpha * 255).round().astype(np.uint8)])
        path = out_dir / f"{name}.fg.webp"
        Image.fromarray(fg, "RGBA").save(path, "WEBP", **WEBP)
        fg_frames.append({"name": name, "src": f"/vfx/hall-life/{vid}/{name}.fg.webp"})
    return {"rect": [x + bx0, y + by0, bx1 - bx0, by1 - by0], "frames": fg_frames}


def rebuild_composite(data: dict) -> None:
    """Cena + frame A de cada vinheta exportada, na ordem de pintura."""
    comp = Image.open(C.SCENE).convert("RGBA")
    for vid, info in sorted(data.items(), key=lambda kv: kv[1]["order"]):
        x, y, _, _ = info["rect"]
        a = Image.open(C.PUBLIC_OUT / vid / f"{info['frames'][0]['name']}.webp").convert("RGBA")
        comp.alpha_composite(a, (x, y))
    comp.convert("RGB").save(C.COMPOSITE)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--force", action="store_true", help="exporta mesmo reprovada no portao de qualidade")
    args = ap.parse_args()
    manifest, state = C.load_manifest(), C.load_state()
    data = json.loads(C.DATA_OUT.read_text(encoding="utf-8")) if C.DATA_OUT.exists() else {}

    for v in C.select(manifest, args.only, args.all):
        vid = v["id"]
        st = state["vignettes"].get(vid, {})
        q = st.get("quality")
        if not q:
            print(f"[{vid}] rode o quality_gate antes; pulando")
            continue
        if not q["pass"] and not args.force:
            print(f"[{vid}] reprovada {q['fails']}; use --force para exportar assim mesmo")
            continue
        rect, frames = source_for(vid, st)
        out_dir = C.PUBLIC_OUT / vid
        out_dir.mkdir(parents=True, exist_ok=True)
        for old in out_dir.glob("*.webp"):
            old.unlink()
        total = 0
        holds = {f["name"]: f.get("hold", [2000, 4000]) for f in v["frames"]}
        frame_list = []
        all_names = []

        def save(name: str) -> str:
            nonlocal total
            if name not in frames:
                raise SystemExit(f"[{vid}] frame {name} ausente na fonte")
            path = out_dir / f"{name}.webp"
            frames[name].save(path, "WEBP", **WEBP)
            total += path.stat().st_size
            all_names.append(name)
            return f"/vfx/hall-life/{vid}/{name}.webp"

        keep_puppet = (data.get(vid) or {}).get("puppet")  # instalado pelo rive_rig.py --site
        # NPC marionete: o site só usa o repouso (por baixo, até a marionete carregar); os gestos vêm
        # do puppet/ — exportar os quadros dos gestos seria peso morto
        for fr in v["frames"][:1] if keep_puppet else v["frames"]:
            name = fr["name"]
            entry = {"name": name, "src": save(name), "hold": holds[name]}
            t = fr.get("tweens", 0)
            n_tweens = len(t) if isinstance(t, list) else int(t)
            if n_tweens:  # intermediarios do movimento que chega nesta pose
                entry["tweens"] = [
                    {"name": f"{name}_{k}", "src": save(f"{name}_{k}")} for k in range(1, n_tweens + 1)
                ]
            if fr.get("tweenMs"):  # ritmo próprio do gesto (ex.: marionete com 24 quadros)
                entry["tweenMs"] = fr["tweenMs"]
            if fr.get("loop"):  # ciclo tocado enquanto a pose está parada (ex.: goles)
                entry["loop"] = [
                    {"name": f"{name}_loop_{k}", "src": save(f"{name}_loop_{k}")}
                    for k in range(1, int(fr["loop"]) + 1)
                ]
                entry["loopMs"] = fr.get("loopMs", 70)
            frame_list.append(entry)
        data[vid] = {
            "order": v["order"],
            "rect": rect,
            "frames": frame_list,
            "light": v.get("light", {"source": "torch", "gain": 0.06}),
            "tooltip": v.get("tooltip"),
            "sequence": v.get("sequence", "gestures"),
        }
        if keep_puppet:
            data[vid]["puppet"] = keep_puppet
        if v.get("foreground"):  # partes que precisam ficar na frente dos efeitos (ex.: fogo da lareira)
            ordered = {n: frames[n] for n in all_names}
            data[vid]["foreground"] = foreground_layer(vid, rect, ordered, v["foreground"]["box"])
            print(f"[{vid}] primeiro plano: rect {data[vid]['foreground']['rect']}")
        print(f"[{vid}] {len(frame_list)} frames, {total / 1024:.0f} KB, rect {rect}")

    data = dict(sorted(data.items(), key=lambda kv: kv[1]["order"]))
    C.DATA_OUT.parent.mkdir(parents=True, exist_ok=True)
    C.DATA_OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    rebuild_composite(data)
    print(f"dados: {C.DATA_OUT.relative_to(C.ROOT)} | composicao: {C.COMPOSITE.relative_to(C.ROOT)}")


if __name__ == "__main__":
    main()
