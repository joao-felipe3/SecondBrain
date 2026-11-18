"""
Etapas 1, 2 e 4: placas + geracao in-scene + frames de animacao.

  # 1) recorta a placa (da composicao acumulada) e gera N variacoes do frame A
  python Frontend/scripts/hall-life/generate.py plate-and-a --only dwarf-crate --variants 2

  # 2) escolhe a variacao (depois de olhar work/previews/<id>-variants.jpg)
  python Frontend/scripts/hall-life/generate.py pick --only dwarf-crate --variant 1

  # 3) gera os frames seguintes (b, c...) editando o frame A escolhido
  python Frontend/scripts/hall-life/generate.py frames --only dwarf-crate

Use --draft para iterar com o modelo barato (draftModel do manifesto).
"""
from __future__ import annotations

import argparse
import io
from pathlib import Path

from PIL import Image

import common as C

STYLE = (
    "This image is a crop of a hand-drawn 2D illustration of a medieval fantasy adventurers' guild hall. "
)

FRAME_A = (
    STYLE
    + "Edit it: add {who}, {doing}. "
    "Paint them in EXACTLY the same illustration style as the rest of the image: the same dark-brown outline "
    "thickness at this scale, the same cel shading and the same warm torch-lit palette. They are lit by the light "
    "that already exists in the image (torches and fireplace), with soft contact shadows where they touch the floor, "
    "benches or furniture. Respect the perspective and the scale of the furniture around them, and anything that is "
    "in front of them must hide the parts of their bodies behind it. "
    "Keep EVERYTHING else pixel-identical: do not move, recolor, redraw, crop, zoom or reframe any other part of the "
    "image. Do not add any other new object, prop, lamp, lantern or light source besides what the character holds, and do not change the overall lighting or colors of the scene. Do not add text, letters, frames or borders."
)

FRAME_N = (
    STYLE
    + "Edit it. Change ONLY this: {change}. "
    "Keep every other pixel identical: the same characters with the same design, colors, size and position, the "
    "same furniture, the same background, the same framing and the same illustration style. Do not add text."
)


TWEEN = (
    "These two images are two KEY frames of the same hand-drawn 2D animation of a medieval fantasy guild hall. "
    "Image 1 is the START pose and image 2 is the END pose; they are identical except for this motion: {change}. "
    "Edit IMAGE 1 to draw the IN-BETWEEN frame at about {pct}% of the way from the start pose to the end pose, "
    "like a traditional animator's in-between drawing. Every part that moves (head, arms, hands, fingers, held "
    "objects, tail, eyelids, mouth) must sit at an intermediate position along its path between the two poses — "
    "not equal to either key — and be fully drawn and solid (no motion blur, no ghosting, no double outlines). "
    "Use exactly the same character design, outline thickness, cel shading and warm palette as the keys. "
    "Keep every pixel that does not move identical to image 1: same background, furniture, framing and zoom. "
    "Do not add any object or text."
)


def tween_specs(fr: dict) -> list[tuple[str, str | None]]:
    """Intermediarios de um frame-chave, na ordem de ida: [(nome, pose descrita ou None)].

    `tweens` no manifesto pode ser um numero (o modelo ve as duas chaves e interpola) ou, melhor,
    uma lista com a pose de cada intermediario descrita (ex.: "mug lifted to belly height") —
    com as duas chaves visiveis o modelo tende a copiar a pose final."""
    t = fr.get("tweens", 0)
    descs = t if isinstance(t, list) else [None] * int(t)
    return [(f"{fr['name']}_{k}", d) for k, d in enumerate(descs, 1)]


def model_for(manifest: dict, draft: bool) -> str:
    return manifest["draftModel"] if draft else manifest["model"]


def cmd_plate_and_a(args, manifest, state):
    key = C.load_env_key()
    composite = Image.open(C.COMPOSITE if C.COMPOSITE.exists() else C.SCENE).convert("RGB")
    W, H = composite.size
    model = model_for(manifest, args.draft)
    for v in C.select(manifest, args.only, args.all):
        vid = v["id"]
        u0, v0, u1, v1 = v["area"]
        rect, aspect = C.snap_rect_to_aspect(
            (round(u0 * W), round(v0 * H), round(u1 * W), round(v1 * H)), (W, H)
        )
        plate = composite.crop(rect)
        C.PLATES.mkdir(parents=True, exist_ok=True)
        plate.save(C.PLATES / f"{vid}.png")
        st = state["vignettes"].setdefault(vid, {})
        st.update({"rect": list(rect), "aspect": aspect, "model": model})

        raw_dir = C.RAW / vid
        raw_dir.mkdir(parents=True, exist_ok=True)
        prompt = FRAME_A.format(who=v["who"], doing=v["doing"])
        start = len(list(raw_dir.glob("a-*.png")))
        for i in range(start + 1, start + 1 + args.variants):
            print(f"[{vid}] frame A variacao {i} com {model} ({aspect}, placa {plate.size})...")
            png = C.call_gemini_edit(key, model, prompt, [plate], aspect)
            img = Image.open(io.BytesIO(png)).convert("RGB")
            img.save(raw_dir / f"a-{i}.png")
            print(f"[{vid}]   -> {img.size}")
        C.save_state(state)
        variants_sheet(vid, plate, sorted(raw_dir.glob("a-*.png")))


def variants_sheet(vid: str, plate: Image.Image, paths) -> None:
    """Folha: placa original + variacoes lado a lado (para escolher)."""
    tiles = [plate] + [Image.open(p).convert("RGB").resize(plate.size, Image.LANCZOS) for p in paths]
    w, h = plate.size
    scale = min(1.0, 900 / h)
    tw, th = int(w * scale), int(h * scale)
    sheet = Image.new("RGB", (tw * len(tiles) + 10 * (len(tiles) - 1), th), (255, 255, 255))
    for i, t in enumerate(tiles):
        sheet.paste(t.resize((tw, th), Image.LANCZOS), (i * (tw + 10), 0))
    C.PREVIEWS.mkdir(parents=True, exist_ok=True)
    out = C.PREVIEWS / f"{vid}-variants.jpg"
    sheet.save(out, quality=88)
    print(f"[{vid}] folha de variacoes: {out.relative_to(C.ROOT)} (0 = placa original)")


def cmd_pick(args, manifest, state):
    for v in C.select(manifest, args.only, args.all):
        vid = v["id"]
        src = C.RAW / vid / f"a-{args.variant}.png"
        if not src.exists():
            raise SystemExit(f"[{vid}] variacao {args.variant} nao existe")
        state["vignettes"].setdefault(vid, {})["picked"] = args.variant
        print(f"[{vid}] frame A = variacao {args.variant}")
    C.save_state(state)


def cmd_frames(args, manifest, state):
    key = C.load_env_key()
    for v in C.select(manifest, args.only, args.all):
        vid = v["id"]
        st = state["vignettes"].get(vid, {})
        if "picked" not in st:
            raise SystemExit(f"[{vid}] escolha o frame A antes (pick)")
        model = model_for(manifest, args.draft)
        frame_a = Image.open(C.RAW / vid / f"a-{st['picked']}.png").convert("RGB")
        for fr in v["frames"][1:]:
            out = C.RAW / vid / f"{fr['name']}.png"
            if out.exists() and not args.force:
                print(f"[{vid}] frame {fr['name']} ja existe (use --force para refazer)")
                continue
            print(f"[{vid}] frame {fr['name']} com {model}...")
            png = C.call_gemini_edit(key, model, FRAME_N.format(change=fr["change"]), [frame_a], st["aspect"])
            img = Image.open(io.BytesIO(png)).convert("RGB")
            img.save(out)
            print(f"[{vid}]   -> {img.size}")


def tween_from(v: dict, idx: int, st: dict) -> Path:
    """Pose de partida do movimento ate o frame idx: repouso (a) nos gestos; o frame anterior no loop."""
    if v.get("sequence", "gestures") == "loop" and idx > 1:
        return C.RAW / v["id"] / f"{v['frames'][idx - 1]['name']}.png"
    return C.RAW / v["id"] / f"a-{st['picked']}.png"


def cmd_tweens(args, manifest, state):
    """Intermediarios desenhados (como os 8 frames da porta): o modelo ve as duas poses-chave e
    desenha a pose a k/(n+1) do caminho, editando a pose de partida."""
    key = C.load_env_key()
    model = model_for(manifest, args.draft)
    for v in C.select(manifest, args.only, args.all):
        vid = v["id"]
        st = state["vignettes"].get(vid, {})
        for idx, fr in enumerate(v["frames"]):
            specs = tween_specs(fr)
            if not specs:
                continue
            start = Image.open(tween_from(v, idx, st)).convert("RGB")
            end = Image.open(C.RAW / vid / f"{fr['name']}.png").convert("RGB").resize(start.size, Image.LANCZOS)
            for k, (name, desc) in enumerate(specs, 1):
                out = C.RAW / vid / f"{name}.png"
                if args.names and name not in args.names:
                    continue
                if isinstance(desc, dict):  # gerado pelo inbetween.py (meio de dois vizinhos)
                    continue
                if out.exists() and not args.force:
                    print(f"[{vid}] {name} ja existe (use --force)")
                    continue
                pct = round(100 * k / (len(specs) + 1))
                print(f"[{vid}] intermediario {name} ({pct}%) com {model}...")
                if desc:
                    # pose descrita, em cadeia: edita o intermediario anterior (avanca aos poucos e o
                    # modelo nao "pula" para a pose final); o primeiro parte da pose de partida
                    prev = C.RAW / vid / f"{specs[k - 2][0]}.png" if k > 1 else None
                    base = Image.open(prev).convert("RGB") if prev and prev.exists() else start
                    png = C.call_gemini_edit(key, model, FRAME_N.format(change=desc), [base], st["aspect"])
                else:
                    prompt = TWEEN.format(change=fr["change"], pct=pct)
                    png = C.call_gemini_edit(key, model, prompt, [start, end], st["aspect"])
                Image.open(io.BytesIO(png)).convert("RGB").save(out)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("plate-and-a", "pick", "frames", "tweens"):
        p = sub.add_parser(name)
        p.add_argument("--only", nargs="*")
        p.add_argument("--all", action="store_true")
        p.add_argument("--draft", action="store_true")
        if name == "plate-and-a":
            p.add_argument("--variants", type=int, default=2)
        if name == "pick":
            p.add_argument("--variant", type=int, required=True)
        if name in ("frames", "tweens"):
            p.add_argument("--force", action="store_true")
        if name == "tweens":
            p.add_argument("--names", nargs="*", help="so estes intermediarios (ex.: b_2 c_1)")
    args = ap.parse_args()
    C.ensure_dirs()
    manifest, state = C.load_manifest(), C.load_state()
    cmds = {"plate-and-a": cmd_plate_and_a, "pick": cmd_pick, "frames": cmd_frames, "tweens": cmd_tweens}
    cmds[args.cmd](args, manifest, state)


if __name__ == "__main__":
    main()
