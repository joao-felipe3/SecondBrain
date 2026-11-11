"""
Intermediários por MARIONETE (como a distorção da porta no Photoshop): o mesmo desenho deformado,
sem o "ferver" de redesenhar cada quadro no Gemini.

Para um gesto (ex.: o gole do Gloin, frame "b"):
  1. placa limpa: o Gemini pinta UMA vez o personagem sem a peça que se move (o que fica atrás dela);
  2. recorte fino: a peça (braço + mão + caneca) = onde a pose difere da placa limpa, dentro de um
     polígono amplo; `whole` entra inteiro (ex.: braço de cima, que tem a cor da túnica) e `keep` nunca
     se move (ex.: malha de escamas sob a ombreira);
  3. esqueleto: alfinetes (ombro, cotovelo, punho, caneca) no repouso e na pose desenhada; em t cada
     segmento gira a partir da articulação anterior (arco, não linha reta) e a peça é deformada por
     MLS rígido (Schaefer 2006) — o equivalente da Distorção de Marionete;
  4. perspectiva do Gemini: no trecho `morph` o desenho do gesto entra por metamorfose (esqueleto +
     fluxo óptico nos dois sentidos), só na parte distal (`morph_ramp` ao longo de E->W);
  5. `key_regions` (ex.: olhos semicerrados) vêm do desenho do gesto no fim do movimento.
A pose final calculada vira o quadro-chave do gesto; o desenho original fica em <g>.drawn.png.

  python Frontend/scripts/hall-life/rig.py clean --only dwarf-crate --gesture b [--variants 2]
  python Frontend/scripts/hall-life/rig.py pins  --only dwarf-crate --gesture b   # folha de revisão
  python Frontend/scripts/hall-life/rig.py gen   --only dwarf-crate --gesture b
  # depois: extract.py, quality_gate.py, export.py
Coordenadas no manifesto: pixels do quadro A bruto (work/raw/<id>/a-<n>.png).
"""
from __future__ import annotations

import argparse
import io
import json
import math
import shutil

import cv2
import numpy as np
from PIL import Image

import common as C
from generate import FRAME_N
import extract as X
from extract import align, color_match, to_np

CLEAN = (
    "This is a frame of a hand-drawn 2D illustration of a medieval fantasy guild hall. Edit it: REMOVE {remove} "
    "Paint what was hidden behind them in the same illustration style, outline thickness, cel shading and warm "
    "lighting. Keep the beard and its braids EXACTLY as they are. Keep every other pixel identical: same head, "
    "face, armor, the other hand, furniture, wall, framing and zoom. Do not add any object or text."
)


# ─── geometria ───
def lerp_angle(a0: float, a1: float, t: float) -> float:
    d = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
    return a0 + d * t


def two_bone_ik(root, end, l1: float, l2: float, side: float):
    """Cotovelo para ombro `root` e punho `end` com ossos de comprimento fixo (l1, l2)."""
    d_vec = end - root
    d = float(np.clip(np.linalg.norm(d_vec), abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3))
    u = d_vec / (np.linalg.norm(d_vec) + 1e-9)
    a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
    hh = math.sqrt(max(l1 * l1 - a * a, 0.0))
    return root + a * u + side * hh * np.array([-u[1], u[0]])


def pins_at(rest: dict, key: dict, chain: list, t: float, ik: list | None = None) -> dict:
    """Alfinetes em t: raízes interpoladas; cada filho gira a partir do pai (ângulo e comprimento).

    `ik` = [ombro, cotovelo, punho]: o punho segue o caminho (em volta do ombro) e o cotovelo é
    calculado com os comprimentos do REPOUSO — o antebraço não estica; o cotovelo sobe/avança."""
    children = {c for _, c in chain}
    out = {k: rest[k] * (1 - t) + key[k] * t for k in rest if k not in children}
    done = set()
    if ik:
        s_, e_, w_ = ik
        va, vb = rest[w_] - rest[s_], key[w_] - key[s_]
        ang = lerp_angle(math.atan2(va[1], va[0]), math.atan2(vb[1], vb[0]), t)
        ln = np.linalg.norm(va) * (1 - t) + np.linalg.norm(vb) * t
        out[w_] = out[s_] + ln * np.array([math.cos(ang), math.sin(ang)])
        l1 = float(np.linalg.norm(rest[e_] - rest[s_]))
        l2 = float(np.linalg.norm(rest[w_] - rest[e_]))
        # lado da dobra: o mesmo do repouso
        side = min((1.0, -1.0), key=lambda sd: np.linalg.norm(two_bone_ik(rest[s_], rest[w_], l1, l2, sd) - rest[e_]))
        out[e_] = two_bone_ik(out[s_], out[w_], l1, l2, side)
        done = {e_, w_}
    for p, c in chain:
        if c in done:
            continue
        va, vb = rest[c] - rest[p], key[c] - key[p]
        ang = lerp_angle(math.atan2(va[1], va[0]), math.atan2(vb[1], vb[0]), t)
        ln = np.linalg.norm(va) * (1 - t) + np.linalg.norm(vb) * t
        out[c] = out[p] + ln * np.array([math.cos(ang), math.sin(ang)])
    return out


def mls_rigid_inverse(src: np.ndarray, dst: np.ndarray, xs: np.ndarray, ys: np.ndarray, alpha=1.5):
    """Para cada ponto de saída, a posição de origem (MLS rígido com os pinos invertidos dst->src)."""
    p, q = dst, src
    v = np.stack([xs, ys], -1).reshape(-1, 2)
    w = 1.0 / (((v[:, None, :] - p[None]) ** 2).sum(-1) + 1e-6) ** alpha
    ws = w.sum(1, keepdims=True)
    pstar = (w[..., None] * p[None]).sum(1) / ws
    qstar = (w[..., None] * q[None]).sum(1) / ws
    ph, qh, vp = p[None] - pstar[:, None], q[None] - qstar[:, None], v - pstar
    perp = lambda u: np.stack([-u[..., 1], u[..., 0]], -1)  # noqa: E731
    php, vpp = perp(ph), perp(vp)
    a1 = (ph * vp[:, None]).sum(-1)
    a2 = -(ph * vpp[:, None]).sum(-1)
    b1 = -(php * vp[:, None]).sum(-1)
    b2 = (php * vpp[:, None]).sum(-1)
    fr = np.stack([(w * (qh[..., 0] * a1 + qh[..., 1] * b1)).sum(1), (w * (qh[..., 0] * a2 + qh[..., 1] * b2)).sum(1)], -1)
    res = np.linalg.norm(vp, axis=1, keepdims=True) * fr / (np.linalg.norm(fr, axis=1, keepdims=True) + 1e-9) + qstar
    return res.reshape(xs.shape + (2,))


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def rect_mask(rects, shape) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    for x0, y0, x1, y1 in rects:
        m[int(y0) : int(y1), int(x0) : int(x1)] = 1
    return m


def poly_mask(poly, shape) -> np.ndarray:
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.array(poly, np.int32)], 1)
    return m


def piece_mask(img, clean, poly) -> np.ndarray:
    """Silhueta exata da peça: onde a pose difere da placa limpa, dentro do polígono, sem buracos."""
    p = {**X.DEFAULTS, "threshold": 14.0, "blur": 2.0, "close": 15, "min_area": 0.002}
    m = X.change_mask(X.delta_e(img, clean), p) & poly
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return np.clip(cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.3), 0, 1)


# ─── entradas ───
def gesture(v: dict, name: str) -> tuple[int, dict]:
    idx = next(i for i, f in enumerate(v["frames"]) if f["name"] == name)
    return idx, v["frames"][idx]


def raw_dir(v: dict):
    return C.RAW / v["id"]


def load_rest(v: dict, st: dict) -> np.ndarray:
    return to_np(Image.open(raw_dir(v) / f"a-{st['picked']}.png"))


def drawn_path(v: dict, g: str):
    """Desenho original do gesto (o <g>.png passa a ser a pose final calculada)."""
    d = raw_dir(v) / f"{g}.drawn.png"
    if not d.exists():
        shutil.copy(raw_dir(v) / f"{g}.png", d)
    return d


def load_like(path, a: np.ndarray) -> np.ndarray:
    h, w = a.shape[:2]
    return color_match(align(to_np(Image.open(path).convert("RGB").resize((w, h), Image.LANCZOS)), a), a)


# ─── comandos ───
def cmd_clean(args):
    """Placa limpa: o Gemini pinta o personagem sem a peça móvel; fica a que melhor casa com o repouso."""
    key = C.load_env_key()
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    _, fr = gesture(v, args.gesture)
    rig = fr["rig"]
    a = load_rest(v, st)
    src = Image.fromarray(a)
    grow = cv2.dilate(poly_mask(key_specs(rig)[0]["poly"], a.shape[:2]), np.ones((15, 15), np.uint8))
    ring = (cv2.dilate(grow, np.ones((41, 41), np.uint8)) - grow).astype(bool)
    best = None
    for i in range(1, args.variants + 1):
        png = C.call_gemini_edit(key, manifest["model"], CLEAN.format(remove=rig["remove"]), [src], st["aspect"])
        img = Image.open(io.BytesIO(png)).convert("RGB")
        img.save(raw_dir(v) / f"clean_{args.gesture}-{i}.png")
        c = load_like(raw_dir(v) / f"clean_{args.gesture}-{i}.png", a)
        err = float(np.abs(c.astype(np.float32) - a)[ring].mean())
        print(f"[{v['id']}] placa limpa {i}: erro na borda {err:.1f}")
        if best is None or err < best[0]:
            best = (err, i)
    shutil.copy(raw_dir(v) / f"clean_{args.gesture}-{best[1]}.png", raw_dir(v) / f"clean_{args.gesture}.png")
    print(f"[{v['id']}] escolhida a variante {best[1]} (revise: work/raw/{v['id']}/clean_{args.gesture}.png)")


def cmd_pins(args):
    """Folha de revisão: polígonos e alfinetes no repouso e no desenho do gesto."""
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    _, fr = gesture(v, args.gesture)
    rig = fr["rig"]
    a = load_rest(v, st)
    b = load_like(drawn_path(v, args.gesture), a)
    x0, y0, x1, y1 = rig["roi"]
    tiles = []
    for img, poly, pins in ((a, rig["poly_rest"], rig["pins_rest"]), (b, rig["poly_key"], rig["pins_key"])):
        im = img.copy()
        cv2.polylines(im, [np.array(poly, np.int32)], True, (0, 255, 255), 3)
        for n, pt in pins.items():
            c = tuple(int(u) for u in pt)
            cv2.circle(im, c, 12, (255, 0, 255), -1)
            cv2.putText(im, n, (c[0] + 14, c[1]), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 0), 3)
        tiles.append(im[y0:y1, x0:x1])
    out = C.PREVIEWS / f"{v['id']}-{args.gesture}-rig.jpg"
    Image.fromarray(np.hstack(tiles)).save(out, quality=88)
    print(f"[{v['id']}] {out}")


def key_specs(rig: dict) -> list[dict]:
    """Poses-chave do gesto em ordem (repouso ... desenho final). Formato curto = 2 chaves."""
    if rig.get("keys"):
        return rig["keys"]
    return [
        {"frame": "a", "t": 0.0, "poly": rig["poly_rest"], "pins": rig["pins_rest"],
         "whole": rig.get("whole"), "whole_poly": rig.get("whole_poly"), "keep": rig.get("keep")},
        {"frame": "drawn", "t": 1.0, "poly": rig["poly_key"], "pins": rig["pins_key"],
         "morph": rig.get("morph", [0.45, 1.0]), "morph_ramp": rig.get("morph_ramp"), "fit": rig.get("fit", [])},
    ]


def cmd_gen(args):
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    g = args.gesture
    _, fr = gesture(v, g)
    rig = fr["rig"]
    n_tw = int(rig.get("tweens", 24))
    a = load_rest(v, st)
    h, w = a.shape[:2]
    clean = load_like(raw_dir(v) / f"clean_{g}.png", a)
    old = raw_dir(v) / f"_gemini_{g}"  # intermediários desenhados (Gemini), guardados na 1a vez

    def key_image(name):
        if name == "a":
            return a
        if name == "drawn":
            return load_like(drawn_path(v, g), a)
        p = old / f"{name}.png" if (old / f"{name}.png").exists() else raw_dir(v) / f"{name}.png"
        return load_like(p, a)

    keys = []
    for spec in key_specs(rig):
        img = key_image(spec["frame"])
        poly = poly_mask(spec["poly"], (h, w))
        m = piece_mask(img, clean, poly)
        if spec.get("whole") or spec.get("whole_poly"):
            # peça sempre inteira (ex.: braço de cima, da cor da túnica). Polígono JUSTO: um retângulo
            # largo arrastava junto pedaços da túnica/coxa (dobras soltas na barriga)
            whole = poly_mask(spec["whole_poly"], (h, w)) if spec.get("whole_poly") else rect_mask(spec["whole"], (h, w))
            whole = poly & whole
            m = np.maximum(m, np.clip(cv2.GaussianBlur(whole.astype(np.float32), (0, 0), 1.3), 0, 1))
        if spec.get("keep"):
            m = m * (1 - cv2.GaussianBlur(rect_mask(spec["keep"], (h, w)).astype(np.float32), (0, 0), 2))
        pins = {n: np.array(p, np.float64) for n, p in spec["pins"].items()}
        keys.append({**spec, "img": img, "mask": m, "pins_np": pins, "polym": poly})
    final = keys[-1]["img"]

    # corpo: placa limpa onde a peça estava no repouso (região ampla, borda suave)
    grow = cv2.dilate(keys[0]["polym"], np.ones((15, 15), np.uint8))
    gsoft = cv2.GaussianBlur(grow.astype(np.float32), (0, 0), 4)[..., None]
    body = (a * (1 - gsoft) + clean * gsoft).astype(np.float32)

    x0, y0, x1, y1 = rig["roi"]
    gx, gy = np.meshgrid(np.arange(x0, x1, 4, dtype=np.float64), np.arange(y0, y1, 4, dtype=np.float64))
    names = list(keys[0]["pins"])
    chain = [tuple(c) for c in rig["chain"]]
    gyy, gxx = np.mgrid[0 : y1 - y0, 0 : x1 - x0].astype(np.float32)

    def g8(im):
        return cv2.cvtColor(np.clip(im, 0, 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)

    def warp(img, alpha, src, dst):
        m = mls_rigid_inverse(np.array([src[n] for n in names]), np.array([dst[n] for n in names]), gx, gy)
        mx = cv2.resize(m[..., 0].astype(np.float32), (x1 - x0, y1 - y0), interpolation=cv2.INTER_LINEAR)
        my = cv2.resize(m[..., 1].astype(np.float32), (x1 - x0, y1 - y0), interpolation=cv2.INTER_LINEAR)
        rgb = cv2.remap(img, mx, my, cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
        al = cv2.remap(alpha, mx, my, cv2.INTER_LINEAR, borderValue=0)[..., None]
        return rgb, al

    segments = []
    for ka, kb in zip(keys, keys[1:]):
        pa_, pb_ = ka["pins_np"], kb["pins_np"]
        # ajusta os alfinetes distais da chave seguinte: alinha a peça calculada ao desenho (ECC)
        for _ in range(2 if kb.get("fit") else 0):
            rgb, al = warp(ka["img"], ka["mask"], pa_, pb_)
            c = np.mean([pb_[n] for n in kb["fit"]], axis=0) - [x0, y0]
            near = ((gxx - c[0]) ** 2 + (gyy - c[1]) ** 2) < rig.get("fit_radius", 250) ** 2
            W = np.eye(2, 3, dtype=np.float32)
            try:
                _, W = cv2.findTransformECC(
                    g8(kb["img"][y0:y1, x0:x1]).astype(np.float32), g8(rgb).astype(np.float32), W,
                    cv2.MOTION_EUCLIDEAN, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6),
                    ((al[..., 0] > 0.5) & near).astype(np.uint8), 5)
            except cv2.error:
                print(f"[{v['id']}] ajuste dos alfinetes de {kb['frame']} falhou; usando os do manifesto")
                break
            Wi = cv2.invertAffineTransform(W)
            for n in kb["fit"]:
                p = pb_[n] - [x0, y0]
                pb_[n] = Wi @ np.array([p[0], p[1], 1.0]) + [x0, y0]
        # metamorfose no espaço da chave seguinte: chave anterior deformada (a_end) x desenho,
        # fluxo óptico nos dois sentidos (depois do esqueleto a diferença é pequena)
        a_end, a_end_al = warp(ka["img"], ka["mask"], pa_, pb_)
        b_roi, b_al = kb["img"][y0:y1, x0:x1].astype(np.float32), kb["mask"][y0:y1, x0:x1]
        bg = body[y0:y1, x0:x1]
        dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        comp_a = bg * (1 - a_end_al) + a_end * a_end_al
        comp_b = bg * (1 - b_al[..., None]) + b_roi * b_al[..., None]
        F = dis.calc(g8(comp_b), g8(comp_a), None)  # b(x) ~ a_end(x + F)
        G = dis.calc(g8(comp_a), g8(comp_b), None)  # a_end(y) ~ b(y + G)
        wsp = np.ones((y1 - y0, x1 - x0), np.float32)
        if kb.get("morph_ramp"):  # perspectiva só na parte distal (rampa ao longo de E -> W)
            e_, w_ = pb_["E"] - [x0, y0], pb_["W"] - [x0, y0]
            ax = w_ - e_
            u = ((gxx - e_[0]) * ax[0] + (gyy - e_[1]) * ax[1]) / (ax @ ax)
            r0, rw = kb["morph_ramp"]
            wsp = smooth((u - r0) / rw).astype(np.float32)
        segments.append({"a": ka, "b": kb, "a_end": a_end, "a_end_al": a_end_al[..., 0], "b_roi": b_roi,
                         "b_al": b_al, "F": F, "G": G, "wsp": wsp})
        print(f"[{v['id']}] {ka['frame']} -> {kb['frame']}: alfinetes "
              + ", ".join(f"{n}={tuple(int(q) for q in pb_[n])}" for n in names))

    def rm(im, fl, k, interp):
        return cv2.remap(im, gxx + k * fl[..., 0], gyy + k * fl[..., 1], interp, borderMode=cv2.BORDER_REPLICATE)

    def morph_layer(sg, s):
        sm = s * sg["wsp"]
        ia, aa = rm(sg["a_end"], sg["F"], sm, cv2.INTER_CUBIC), rm(sg["a_end_al"], sg["F"], sm, cv2.INTER_LINEAR)
        ib, ab = rm(sg["b_roi"], sg["G"], 1 - sm, cv2.INTER_CUBIC), rm(sg["b_al"], sg["G"], 1 - sm, cv2.INTER_LINEAR)
        wa, wb = aa * (1 - sm), ab * sm
        rgb = (ia * wa[..., None] + ib * wb[..., None]) / np.maximum(wa + wb, 1e-4)[..., None]
        full, full_al = np.zeros_like(body), np.zeros((h, w), np.float32)
        full[y0:y1, x0:x1], full_al[y0:y1, x0:x1] = rgb, np.clip(wa + wb, 0, 1)
        return full, full_al

    regions = []
    for x_0, y_0, x_1, y_1, start in rig.get("key_regions", []):
        m = rect_mask([[x_0, y_0, x_1, y_1]], (h, w)).astype(np.float32)
        regions.append((cv2.GaussianBlur(m, (0, 0), 10)[..., None], start))

    out_dir = raw_dir(v)
    if not old.exists():
        old.mkdir()
        for p in out_dir.glob(f"{g}_*.png"):
            shutil.move(p, old / p.name)
    else:
        for p in out_dir.glob(f"{g}_*.png"):
            p.unlink()
    for k in range(1, n_tw + 2):
        t = k / (n_tw + 1)
        sg = next(s_ for s_ in segments if t <= s_["b"]["t"] + 1e-9)
        ta, tb = sg["a"]["t"], sg["b"]["t"]
        uu = (t - ta) / (tb - ta)
        dst = pins_at(sg["a"]["pins_np"], sg["b"]["pins_np"], chain, uu, rig.get("ik"))
        m0, m1 = sg["b"].get("morph", [0.0, 1.0])
        s = float(smooth((uu - m0) / max(m1 - m0, 1e-6)))
        frame = body.copy()
        if s <= 0:
            rgb, al = warp(sg["a"]["img"], sg["a"]["mask"], sg["a"]["pins_np"], dst)
        else:
            lay, lay_al = morph_layer(sg, s)
            rgb, al = warp(lay, lay_al, sg["b"]["pins_np"], dst)
        frame[y0:y1, x0:x1] = frame[y0:y1, x0:x1] * (1 - al) + rgb * al
        for m, start in regions:
            ea = max(0.0, (t - start) / (1 - start))
            if ea > 0:
                frame = frame * (1 - m * ea) + final * (m * ea)
        name = f"{g}_{k}" if k <= n_tw else g
        Image.fromarray(np.clip(frame, 0, 255).astype(np.uint8)).save(out_dir / f"{name}.png")
    fr["tweens"] = n_tw

    # ciclo parado na pose (ex.: goles): a peça final gira em volta de um alfinete e volta
    lp = rig.get("loop")
    if lp:
        end_rgb, end_al = rgb, al  # peça já na pose final (último quadro do laço acima)
        full = np.zeros_like(body)
        full_al = np.zeros((h, w), np.float32)
        full[y0:y1, x0:x1], full_al[y0:y1, x0:x1] = end_rgb, end_al[..., 0]
        end = dst
        piv = end[lp["pivot"]]
        n_lp = int(lp.get("frames", 12))
        moving = lp.get("rotate", ["W", "T", "B"])
        ik = rig.get("ik")
        if ik:
            s_, e_, w_ = ik
            l1 = float(np.linalg.norm(keys[0]["pins_np"][e_] - keys[0]["pins_np"][s_]))
            l2 = float(np.linalg.norm(keys[0]["pins_np"][w_] - keys[0]["pins_np"][e_]))
            side = min((1.0, -1.0), key=lambda sd: np.linalg.norm(two_bone_ik(end[s_], end[w_], l1, l2, sd) - end[e_]))
        cycles = int(lp.get("cycles", 2))
        for k in range(1, n_lp + 1):
            ph = k / (n_lp + 1)
            ang = math.radians(lp["angle"]) * math.sin(math.pi * ph * cycles) ** 2
            cs, sn = math.cos(ang), math.sin(ang)
            pins = dict(end)
            for n in moving:
                d = end[n] - piv
                pins[n] = piv + np.array([cs * d[0] - sn * d[1], sn * d[0] + cs * d[1]])
            if ik:
                pins[e_] = two_bone_ik(pins[s_], pins[w_], l1, l2, side)
            rgb2, al2 = warp(full, full_al, end, pins)
            frame = body.copy()
            frame[y0:y1, x0:x1] = frame[y0:y1, x0:x1] * (1 - al2) + rgb2 * al2
            for m, _ in regions:
                frame = frame * (1 - m) + final * m
            Image.fromarray(np.clip(frame, 0, 255).astype(np.uint8)).save(out_dir / f"{g}_loop_{k}.png")
        fr["loop"] = n_lp
        fr["loopMs"] = lp.get("ms", 70)
        print(f"[{v['id']}] {g}: ciclo parado com {n_lp} quadros ({cycles} goles)")
    C.MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[{v['id']}] {g}: {n_tw} intermediários + pose final calculada ({len(keys)} chaves)")


def cmd_overlay(args):
    """Camada de ESTADO sobre o repouso (ex.: espuma na barba): o Gemini pinta a mudança no quadro A;
    fica a variante que menos redesenhou FORA da região. O rive_rig.py extrai a diferença e a divide
    em estágios (vars no puppet.json)."""
    key = C.load_env_key()
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    a = load_rest(v, st)
    h, w = a.shape[:2]
    x0, y0, x1, y1 = args.region
    out_mask = np.ones((h, w), bool)
    out_mask[y0:y1, x0:x1] = False
    best = None
    for i in range(1, args.variants + 1):
        png = C.call_gemini_edit(key, manifest["model"], FRAME_N.format(change=args.desc), [Image.fromarray(a)], st["aspect"])
        p = raw_dir(v) / f"overlay_{args.name}-{i}.png"
        Image.open(io.BytesIO(png)).convert("RGB").save(p)
        o = load_like(p, a).astype(np.float32)
        drift = float(np.abs(o - a)[out_mask].mean())
        inside = float(np.abs(o - a)[~out_mask].mean())
        print(f"[{v['id']}] {args.name} {i}: mudança na região {inside:.1f}, fora {drift:.1f}")
        if best is None or drift < best[0]:
            best = (drift, i)
    shutil.copy(raw_dir(v) / f"overlay_{args.name}-{best[1]}.png", raw_dir(v) / f"overlay_{args.name}.png")
    print(f"[{v['id']}] escolhida a variante {best[1]} (revise: work/raw/{v['id']}/overlay_{args.name}.png)")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("clean", "pins", "gen"):
        p = sub.add_parser(name)
        p.add_argument("--only", required=True)
        p.add_argument("--gesture", required=True)
        if name == "clean":
            p.add_argument("--variants", type=int, default=2)
    p = sub.add_parser("overlay")
    p.add_argument("--only", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--desc", required=True)
    p.add_argument("--region", type=int, nargs=4, required=True, help="x0 y0 x1 y1 no quadro bruto")
    p.add_argument("--variants", type=int, default=3)
    args = ap.parse_args()
    {"clean": cmd_clean, "pins": cmd_pins, "gen": cmd_gen, "overlay": cmd_overlay}[args.cmd](args)


if __name__ == "__main__":
    main()
