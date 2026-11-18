"""
Etapa 6: portao de qualidade + folha de revisao.

Metricas por vinheta (sobre o frame A composto na placa original):
  seam   - gradiente medio na faixa da borda da mascara / gradiente medio do entorno (costura visivel)
  edge_de - delta E (patch x original) no anel mais externo do patch (mancha de cor na borda)
  edge_alpha - alpha medio nesse anel (borda dura = recorte sem feather)
  bg_de  - delta E (patch x original) na faixa do feather (patch inteiro com outra luz/cor)
  drift  - fracao da placa FORA da mascara em que o modelo alterou o desenho (deveria ser ~0)
  stroke - espessura media do traco escuro no patch / no entorno (traco fino ou grosso demais)

  python Frontend/scripts/hall-life/quality_gate.py --only dwarf-crate
  python Frontend/scripts/hall-life/quality_gate.py --all
"""
from __future__ import annotations

import argparse
import json

import cv2
import numpy as np
from PIL import Image, ImageDraw

import common as C
from extract import align, color_match, delta_e, to_np

LIMITS = {
    "seam": 1.3,
    "edge_de": 6.0,
    "edge_alpha": 0.25,
    "bg_de": 4.0,
    "drift": 0.04,
    "stroke_low": 0.65,
    "stroke_high": 1.5,
}


def stroke_width(rgb: np.ndarray, region: np.ndarray) -> float:
    """Espessura media (px) dos tracos escuros dentro de 'region'."""
    if region.sum() < 50:
        return float("nan")
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    L = lab[..., 0].astype(np.float32)
    dark = ((L < np.percentile(L[region > 0], 12)) & (region > 0)).astype(np.uint8)
    if dark.sum() < 50:
        return float("nan")
    dist = cv2.distanceTransform(dark, cv2.DIST_L2, 3)
    skel = cv2.ximgproc.thinning(dark * 255) if hasattr(cv2, "ximgproc") else None
    if skel is not None:
        vals = dist[skel > 0]
    else:  # aproximacao: maximos locais da distancia
        dil = cv2.dilate(dist, np.ones((3, 3), np.uint8))
        vals = dist[(dist == dil) & (dist > 0)]
    return float(np.median(vals) * 2) if len(vals) else float("nan")


def evaluate(vid: str, st: dict) -> dict:
    plate = to_np(Image.open(C.PLATES / f"{vid}.png"))
    meta = json.loads((C.EXTRACT / vid / "meta.json").read_text(encoding="utf-8"))
    bx0, by0, bx1, by1 = meta["crop_in_plate"]
    patch = np.asarray(Image.open(C.EXTRACT / vid / "a.png").convert("RGBA"), dtype=np.float32)

    comp = plate.astype(np.float32).copy()
    region = comp[by0:by1, bx0:bx1]
    a = patch[..., 3:4] / 255
    comp[by0:by1, bx0:bx1] = region * (1 - a) + patch[..., :3] * a
    comp = comp.round().astype(np.uint8)

    # alpha e cor efetivamente entregues (do proprio patch), na geometria da placa
    alpha = np.zeros(plate.shape[:2], np.float32)
    alpha[by0:by1, bx0:bx1] = patch[..., 3] / 255
    patch_rgb = plate.copy()
    patch_rgb[by0:by1, bx0:bx1] = patch[..., :3].round().astype(np.uint8)
    de_patch = delta_e(patch_rgb, plate)

    hard = (alpha > 0.5).astype(np.uint8)
    k = np.ones((5, 5), np.uint8)
    edge = cv2.dilate(hard, k) - cv2.erode(hard, k)
    around = cv2.dilate(hard, np.ones((41, 41), np.uint8)) - cv2.dilate(hard, np.ones((9, 9), np.uint8))
    gray = cv2.cvtColor(comp, cv2.COLOR_RGB2GRAY).astype(np.float32)
    grad = np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1))
    gp = cv2.cvtColor(plate, cv2.COLOR_RGB2GRAY).astype(np.float32)
    grad_plate = np.hypot(cv2.Sobel(gp, cv2.CV_32F, 1, 0), cv2.Sobel(gp, cv2.CV_32F, 0, 1))

    # anel mais externo do patch: pixels visiveis vizinhos de pixels invisiveis.
    # Num patch bem feito eles sao cenario quase identico ao original e quase transparentes.
    visible = (alpha > 0.02).astype(np.uint8)
    boundary = (visible > 0) & (cv2.dilate(1 - visible, np.ones((3, 3), np.uint8)) > 0)
    edge_de = float(np.median(de_patch[boundary])) if boundary.any() else 0.0  # mancha/luz diferente na borda
    edge_alpha = float(alpha[boundary].mean()) if boundary.any() else 0.0  # borda dura (sem feather)
    # costura: bordas novas que a composicao tem e o original nao tinha, perto do limite do patch
    near = cv2.dilate(boundary.astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
    seam = float(grad[near].mean() / max(grad_plate[near].mean(), 1e-3)) if near.any() else 1.0
    # cor global: na faixa do feather o patch e cenario puro; deslocamento = patch inteiro em outra luz
    # denunciam patch inteiro mais claro/escuro/frio que a cena
    feather_band = (alpha > 0.05) & (alpha < 0.95)
    if feather_band.sum() >= 50:
        bg_de = float(np.median(de_patch[feather_band]))
    else:  # sem feather (recorte duro): usa os pixels mais parecidos com o original
        bg_de = float(np.percentile(de_patch[alpha > 0.05], 10)) if (alpha > 0.05).any() else 0.0

    # deriva: quanto o modelo mexeu FORA do personagem (frame A bruto vs placa)
    raw = Image.open(C.RAW / vid / f"a-{st['picked']}.png").convert("RGB")
    raw = raw.resize((plate.shape[1], plate.shape[0]), Image.LANCZOS)
    rawf = color_match(align(to_np(raw), plate), plate)
    outside = cv2.dilate(hard, np.ones((15, 15), np.uint8)) == 0
    # mesma sensibilidade da extracao (redesenho de linhas finas nao conta, mudancas em bloco sim)
    prm = meta.get("params", {})
    de_drift = cv2.GaussianBlur(delta_e(rawf, plate), (0, 0), prm.get("blur", 1.5))
    drift = float((de_drift[outside] > prm.get("threshold", 9.0)).mean())

    sw_in = stroke_width(comp, hard)
    sw_out = stroke_width(plate, around)
    stroke = sw_in / sw_out if sw_out and not np.isnan(sw_in) and not np.isnan(sw_out) else float("nan")

    fails = []
    if seam > LIMITS["seam"]:
        fails.append("costura")
    if edge_alpha > LIMITS["edge_alpha"]:
        fails.append("borda dura")
    if edge_de > LIMITS["edge_de"] or bg_de > LIMITS["bg_de"]:
        fails.append("cor")
    if drift > LIMITS["drift"]:
        fails.append("deriva")
    if not np.isnan(stroke) and not (LIMITS["stroke_low"] <= stroke <= LIMITS["stroke_high"]):
        fails.append("traco")
    return {
        "seam": round(seam, 2),
        "edge_de": round(edge_de, 2),
        "edge_alpha": round(edge_alpha, 3),
        "bg_de": round(bg_de, 2),
        "drift": round(drift, 4),
        "stroke": None if np.isnan(stroke) else round(stroke, 2),
        "pass": not fails,
        "fails": fails,
        "_comp": comp,
        "_edge": edge,
    }


def review_sheet(vid: str, res: dict) -> None:
    """Antes | depois | sequencia de frames | zoom 200% da borda."""
    plate = Image.open(C.PLATES / f"{vid}.png").convert("RGB")
    meta = json.loads((C.EXTRACT / vid / "meta.json").read_text(encoding="utf-8"))
    bx0, by0, bx1, by1 = meta["crop_in_plate"]
    tiles = [plate, Image.fromarray(res["_comp"])]
    for name in meta["frames"][1:]:
        comp = plate.convert("RGBA")
        comp.alpha_composite(Image.open(C.EXTRACT / vid / f"{name}.png").convert("RGBA"), (bx0, by0))
        tiles.append(comp.convert("RGB"))
    # zoom da borda: recorte em torno do ponto da borda com maior gradiente
    edge = res["_edge"]
    ys, xs = np.where(edge > 0)
    my, mx = np.median(ys), np.median(xs)
    k = int(np.argmin((ys - my) ** 2 + (xs - mx) ** 2))  # ponto que esta de fato na borda
    cy, cx = int(ys[k]), int(xs[k])
    half = max(24, min(plate.size) // 6)
    z = Image.fromarray(res["_comp"]).crop((cx - half, cy - half, cx + half, cy + half))
    tiles.append(z.resize(plate.size, Image.NEAREST))

    scale = min(3.0, 700 / plate.height)
    tw, th = int(plate.width * scale), int(plate.height * scale)
    sheet = Image.new("RGB", ((tw + 10) * len(tiles), th + 40), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    labels = ["original", "frame a"] + [f"frame {n}" for n in meta["frames"][1:]] + ["borda (zoom)"]
    for i, (t, lab) in enumerate(zip(tiles, labels)):
        sheet.paste(t.resize((tw, th), Image.LANCZOS), (i * (tw + 10), 40))
        d.text((i * (tw + 10) + 6, 12), lab, fill=(0, 0, 0))
    summary = "  ".join(f"{k}={res[k]}" for k in ("seam", "edge_de", "edge_alpha", "bg_de", "drift", "stroke"))
    d.text((6, 26), ("PASSOU  " if res["pass"] else f"REPROVOU {res['fails']}  ") + summary, fill=(0, 120, 0) if res["pass"] else (200, 0, 0))
    out = C.PREVIEWS / f"{vid}-review.jpg"
    sheet.save(out, quality=90)
    print(f"[{vid}] folha de revisao: {out.relative_to(C.ROOT)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()
    manifest, state = C.load_manifest(), C.load_state()
    failed = []
    for v in C.select(manifest, args.only, args.all):
        vid = v["id"]
        st = state["vignettes"].get(vid, {})
        if not (C.EXTRACT / vid / "meta.json").exists():
            print(f"[{vid}] sem extracao, pulando")
            continue
        res = evaluate(vid, st)
        review_sheet(vid, res)
        st["quality"] = {k: res[k] for k in ("seam", "edge_de", "edge_alpha", "bg_de", "drift", "stroke", "pass", "fails")}
        print(f"[{vid}] {'PASSOU' if res['pass'] else 'REPROVOU ' + str(res['fails'])} {st['quality']}")
        if not res["pass"]:
            failed.append(vid)
    C.save_state(state)
    if failed:
        raise SystemExit(f"reprovadas: {failed}")


if __name__ == "__main__":
    main()
