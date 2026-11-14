"""
NPC no Rive: o rig do `rig.py` (recortes, alfinetes, placas limpas, IK) vira um projeto Rive (RML) que o
runtime anima em tempo real — sem quadros pré-renderizados.

  python Frontend/scripts/hall-life/rive_rig.py --only dwarf-crate                 # projeto em work/rive/<id>/
  python Frontend/scripts/hall-life/rive_rig.py --only dwarf-crate --entry b       # prévia: entra direto no gesto b
  ~/.rive/bin/rive work/rive/dwarf-crate --verify                                   # compila
  ~/.rive/bin/rive work/rive/dwarf-crate --publish                                  # .riv assinado (precisa `rive login`)

O que sai:
  - corpo: repouso com os braços trocados pelas placas limpas, recortado pela máscara da extração (o resto é a
    própria cena do site);
  - cada braço: uma peça por pose-chave (repouso, intermediários do Gemini, desenho final), cada uma com malha
    em grade e pesos para os ossos (ombro -> cotovelo -> punho -> mão), ligada na pose dela; a troca de desenho
    entre chaves é uma troca rápida de opacidade;
  - remendos do desenho final (olhos, espuma) que aparecem no fim do gesto;
  - uma animação por gesto (ida, parada com ciclo opcional, volta) amostrada do mesmo esqueleto do rig.py;
  - máquina de estados: dois "parados" que sorteiam o próximo (parado / gesto).

Pegadinhas do RML (ver README): o PRIMEIRO elemento desenhado fica NA FRENTE; cada ImageAsset precisa de
`assetId` próprio (senão a segunda imagem some sem erro).
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import math
import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

import common as C
import extract as X
import rig as RG

RIVE_DIR = C.WORK / "rive"
K = 3  # px do artboard por px da imagem da cena (3x = nítido em telas de alta densidade)
FPS = 60
CELL = 14  # lado da célula da malha (px do artboard)


# ─── geometria: quadro bruto -> artboard ───
def raw_to_art(v: dict, st: dict, a: np.ndarray) -> tuple[np.ndarray, tuple[int, int], list[int]]:
    """Afim 2x3 que leva pixels do quadro A bruto para o artboard (recorte da vinheta na cena, x K)."""
    plate = X.to_np(Image.open(C.PLATES / f"{v['id']}.png"))
    ph, pw = plate.shape[:2]
    rh, rw = a.shape[:2]
    small = cv2.resize(a, (pw, ph), interpolation=cv2.INTER_AREA)
    W = np.eye(2, 3, dtype=np.float32)
    crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
    _, W = cv2.findTransformECC(cv2.cvtColor(plate, cv2.COLOR_RGB2GRAY).astype(np.float32),
                                cv2.cvtColor(small, cv2.COLOR_RGB2GRAY).astype(np.float32),
                                W, cv2.MOTION_AFFINE, crit, None, 5)
    # placa -> bruto reduzido (W) -> bruto (escala)
    P2R = np.diag([rw / pw, rh / ph, 1.0]) @ np.vstack([W, [0, 0, 1]])
    R2P = np.linalg.inv(P2R)
    meta = json.loads((C.EXTRACT / v["id"] / "meta.json").read_text(encoding="utf-8"))
    cx0, cy0, cx1, cy1 = meta["crop_in_plate"]
    P2A = np.array([[K, 0, -K * cx0], [0, K, -K * cy0], [0, 0, 1.0]])
    A = (P2A @ R2P)[:2]
    return A, (K * (cx1 - cx0), K * (cy1 - cy0)), meta["rect"]


def color_fit(a: np.ndarray, A: np.ndarray, v: dict) -> tuple[np.ndarray, np.ndarray]:
    """Ganho/desvio por canal (como a extração) para a cor do quadro bruto casar com a cena."""
    plate = X.to_np(Image.open(C.PLATES / f"{v['id']}.png"))
    ph, pw = plate.shape[:2]
    meta = json.loads((C.EXTRACT / v["id"] / "meta.json").read_text(encoding="utf-8"))
    cx0, cy0 = meta["crop_in_plate"][:2]
    A2P = np.vstack([A, [0, 0, 1]])
    A2P = np.array([[1 / K, 0, cx0], [0, 1 / K, cy0], [0, 0, 1]]) @ A2P
    warped = cv2.warpAffine(a, A2P[:2], (pw, ph), flags=cv2.INTER_AREA)
    matched = X.color_match(warped, plate)
    f = warped.reshape(-1, 3).astype(np.float64)
    g = matched.reshape(-1, 3).astype(np.float64)
    gains, offs = np.zeros(3), np.zeros(3)
    for c in range(3):
        M = np.stack([f[:, c], np.ones(len(f))], 1)
        gains[c], offs[c] = np.linalg.lstsq(M, g[:, c], rcond=None)[0]
    return gains, offs


def to_art(rgb: np.ndarray, alpha: np.ndarray, A: np.ndarray, size, gains, offs):
    """Leva uma peça (RGB + alfa no quadro bruto) para o artboard, com alfa pré-multiplicado."""
    blur = lambda im: cv2.GaussianBlur(im, (0, 0), 0.7)  # noqa: E731 (reduz ~2x: evita serrilhado)
    pre = blur(rgb.astype(np.float32) * alpha[..., None])
    al = blur(alpha.astype(np.float32))
    pre = cv2.warpAffine(pre, A, size, flags=cv2.INTER_LINEAR, borderValue=0)
    al = cv2.warpAffine(al, A, size, flags=cv2.INTER_LINEAR, borderValue=0)
    out = pre / np.maximum(al, 1e-4)[..., None]
    out = np.clip(out * gains + offs, 0, 255)
    return out, np.clip(al, 0, 1)


def pt(A: np.ndarray, p) -> np.ndarray:
    return A @ np.array([p[0], p[1], 1.0])


# ─── malha + pesos ───
def leb128(n: int) -> bytes:
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        out.append(b | (0x80 if n else 0))
        if not n:
            return bytes(out)


def seg_dist(p, a, b) -> float:
    ab = b - a
    t = np.clip(np.dot(p - a, ab) / max(np.dot(ab, ab), 1e-9), 0, 1)
    return float(np.linalg.norm(p - (a + t * ab)))


def mesh_xml(alpha: np.ndarray, origin, segs: list, ids: str) -> tuple[str, str]:
    """Malha em grade sobre a peça (células com tinta) e pesos para os ossos (2 mais próximos)."""
    ah, aw = alpha.shape
    ink = cv2.dilate((alpha > 0.02).astype(np.uint8), np.ones((5, 5), np.uint8))
    nx, ny = math.ceil(aw / CELL), math.ceil(ah / CELL)
    idx, verts, tris = {}, [], []

    def vid(i, j):
        if (i, j) not in idx:
            idx[(i, j)] = len(verts)
            verts.append((min(i * CELL, aw), min(j * CELL, ah)))
        return idx[(i, j)]

    for j in range(ny):
        for i in range(nx):
            if ink[j * CELL : (j + 1) * CELL, i * CELL : (i + 1) * CELL].any():
                q = vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)
                tris += [q[0], q[1], q[2], q[0], q[2], q[3]]
    out = []
    st_w = []
    for px, py in verts:
        p = np.array([px + origin[0], py + origin[1]], float)
        d = np.array([seg_dist(p, a, b) for a, b in segs])
        w = 1.0 / (d + 2.0) ** 4
        top = np.argsort(-w)[:2]
        ww = w[top] / w[top].sum()
        v0 = int(round(255 * ww[0]))
        st_w += [int(top[0]), round(float(ww[0]), 4), int(top[1]) if len(top) > 1 else 0,
                 round(1 - float(ww[0]), 4) if len(top) > 1 else 0.0]
        if v0 >= 255 or len(top) == 1:
            wx = f'<Weight values="255" indices="{top[0] + 1}"/>'
        else:
            wx = f'<Weight values="{v0 | ((255 - v0) << 8)}" indices="{(top[0] + 1) | ((top[1] + 1) << 8)}"/>'
        out.append(f'<MeshVertex x="{p[0]:.2f}" y="{p[1]:.2f}" u="{px / aw:.5f}" v="{py / ah:.5f}">{wx}</MeshVertex>')
    tri = base64.b64encode(b"".join(leb128(t) for t in tris)).decode()
    struct = {
        "v": [round(c, 2) for px, py in verts for c in (px + origin[0], py + origin[1])],
        "uv": [round(c, 5) for px, py in verts for c in (px / aw, py / ah)],
        "tri": tris,
        "w": st_w,
    }
    return (f'<Mesh triangleIndexBytes="{tri}" name="Mesh" id="{ids}">' + "".join(out),
            f"{len(verts)}v/{len(tris) // 3}t", struct)


# ─── esqueleto ───
def chain_pose(p: dict, names: list[str]) -> list[tuple[np.ndarray, float, float]]:
    """(origem, ângulo no mundo, comprimento) de cada osso da cadeia S -> E -> W -> mão."""
    out = []
    for a_, b_ in zip(names, names[1:]):
        d = p[b_] - p[a_]
        out.append((p[a_], math.atan2(d[1], d[0]), float(np.linalg.norm(d))))
    return out


def tendons(pose, bone_ids) -> str:
    s = []
    for (o, th, _), bid in zip(pose, bone_ids):
        c, sn = math.cos(th), math.sin(th)
        s.append(f'<Tendon boneId="{bid}" xx="{c:.6f}" xy="{sn:.6f}" yx="{-sn:.6f}" yy="{c:.6f}" '
                 f'tx="{o[0]:.2f}" ty="{o[1]:.2f}" name="T"/>')
    return "".join(s)


def ease(t: float) -> float:
    return t * t * (3 - 2 * t)


class Doc:
    """Acumula assets, imagens, ossos e trilhas de animação; gera ids únicos."""

    def __init__(self):
        self.n = 100
        self.assets: list[str] = []
        self.drawables: list[tuple[int, str]] = []  # (profundidade: maior = mais na frente, xml)
        self.bones: list[str] = []
        self.asset_n = 0
        self.images: dict[str, list] = {}  # asset -> [arquivo, x, y, w, h]
        self.pbones: list[dict] = []
        self.pdraw: list[tuple[float, dict]] = []

    def id(self) -> str:
        self.n += 1
        return f"0:{self.n}"

    def asset(self, out_dir, name: str, rgb: np.ndarray, alpha: np.ndarray, quality: int = 92, alpha_quality: int = 100):
        ys, xs = np.where(alpha > 0.01)
        if not len(xs):
            return None
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        rgba = np.dstack([rgb[y0:y1, x0:x1], alpha[y0:y1, x0:x1] * 255]).round().astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(out_dir / f"{name}.webp", "WEBP", quality=quality, alpha_quality=alpha_quality, method=6)
        aid = self.id()
        self.asset_n += 1
        self.assets.append(f'<ImageAsset file="{name}.webp" assetId="{self.asset_n}" name="{name}" id="{aid}"/>')
        self.images[aid] = [f"{name}.webp", int(x0), int(y0), int(x1 - x0), int(y1 - y0)]
        return aid, (int(x0), int(y0)), rgba[..., 3].astype(np.float32) / 255


def build(v: dict, st: dict, entry: str | None) -> None:
    vid = v["id"]
    out_dir = RIVE_DIR / vid
    out_dir.mkdir(parents=True, exist_ok=True)
    for p in out_dir.iterdir():  # limpa o conteúdo (a pasta pode estar aberta num terminal/preview)
        shutil.rmtree(p) if p.is_dir() else p.unlink()
    a = RG.load_rest(v, st)
    h, w = a.shape[:2]
    A, (AW, AH), rect = raw_to_art(v, st, a)
    gains, offs = color_fit(a, A, v)
    doc = Doc()

    gestures = [fr for fr in v["frames"][1:] if fr.get("rig")]
    # corpo: braços trocados pelas placas limpas de cada gesto
    body = a.astype(np.float32)
    rigs = {}
    for fr in gestures:
        g, rig = fr["name"], fr["rig"]
        clean = RG.load_like(RG.raw_dir(v) / f"clean_{g}.png", a)
        specs = RG.key_specs(rig)
        grow = cv2.dilate(RG.poly_mask(specs[0]["poly"], (h, w)), np.ones((15, 15), np.uint8))
        gsoft = cv2.GaussianBlur(grow.astype(np.float32), (0, 0), 4)[..., None]
        body = body * (1 - gsoft) + clean * gsoft
        rigs[g] = (rig, specs, clean)

    # recorte do corpo = máscara da extração (fora dela o site já mostra a cena); franja = pixel da cena
    union = np.asarray(Image.open(C.EXTRACT / vid / "mask-union.png"), np.float32) / 255
    alpha_p = np.asarray(Image.open(C.EXTRACT / vid / "alpha.png"), np.float32) / 255
    meta = json.loads((C.EXTRACT / vid / "meta.json").read_text(encoding="utf-8"))
    cx0, cy0, cx1, cy1 = meta["crop_in_plate"]
    up = lambda m: cv2.resize(m[cy0:cy1, cx0:cx1], (AW, AH), interpolation=cv2.INTER_LINEAR)  # noqa: E731
    plate = X.to_np(Image.open(C.PLATES / f"{vid}.png")).astype(np.float32)
    plate_art = cv2.resize(plate[cy0:cy1, cx0:cx1], (AW, AH), interpolation=cv2.INTER_LINEAR)
    body_rgb, _ = to_art(body, np.ones((h, w), np.float32), A, (AW, AH), gains, offs)
    restore = np.clip(cv2.GaussianBlur(1 - up(union), (0, 0), K * 1.0), 0, 1)[..., None]
    body_rgb = body_rgb * (1 - restore) + plate_art * restore
    body_asset = doc.asset(out_dir, "body", body_rgb, up(alpha_p))

    # camadas de ESTADO (ex.: espuma na barba): a diferença "clareou muito" entre o overlay do Gemini e o
    # repouso (pega espuma/gotas e não o redesenho leve da barba), dividida em estágios do mais perto
    # da origem (boca) para fora; o player mostra o estágio k quando a variável passa de k
    pst = v.get("puppet_state", {})
    var_layers: dict = {}
    for vname, vc in pst.get("vars", {}).items():
        o = RG.load_like(RG.raw_dir(v) / vc["overlay"], a)
        x0, y0, x1, y1 = vc["region"]
        L = lambda im: cv2.cvtColor(im, cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32) * 100 / 255  # noqa: E731
        m = (L(o) - L(a)) > vc.get("lift", 20)
        m[:y0], m[y1:], m[:, :x0], m[:, x1:] = False, False, False, False
        m = cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))  # contorno da espuma
        n, labels, stats, cents = cv2.connectedComponentsWithStats(m, 8)
        comps = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] >= 40]
        org_ = np.array(vc["origin"], float)
        comps.sort(key=lambda i: float(np.linalg.norm(cents[i] - org_)))
        total_area = sum(int(stats[i, cv2.CC_STAT_AREA]) for i in comps)
        stages = int(vc.get("stages", 3))
        groups: list[list[int]] = [[] for _ in range(stages)]
        acc = 0
        for i in comps:
            k = min(stages - 1, int(acc / max(total_area, 1) * stages))
            groups[k].append(i)
            acc += int(stats[i, cv2.CC_STAT_AREA])
        layers = []
        for k, grp in enumerate(groups):
            if not grp:
                continue
            sel = np.isin(labels, grp).astype(np.float32)
            alpha = np.clip(cv2.GaussianBlur(sel, (0, 0), 1.2) * 1.15, 0, 1)
            rgb_art, al_art = to_art(o, alpha, A, (AW, AH), gains, offs)
            got = doc.asset(out_dir, f"{vname}{k + 1}", rgb_art, al_art)
            if got:
                pid = doc.id()
                doc.pdraw.append((16 + k * 0.1, {"id": pid, "image": got[0], "opacity": 1}))
                layers.append(pid)
        var_layers[vname] = {"max": len(layers), "layers": layers}
        print(f"[{vid}] estado {vname}: {len(comps)} manchas em {len(layers)} estágios")
    effects_by: dict = {}  # gesto -> efeitos nas variáveis (quadros já resolvidos)

    anims = []  # (nome, duração em quadros, {objeto: {propriedade: [(quadro, valor)]}})
    for gi, fr in enumerate(gestures):
        g = fr["name"]
        rig, specs, clean = rigs[g]
        chain = [tuple(c) for c in rig["chain"]]
        names = [chain[0][0]] + [c for _, c in chain if c in ("E", "W")]
        hand = "T" if "T" in specs[0]["pins"] else "H"
        names = names + [hand]  # S, E, W, mão
        old = RG.raw_dir(v) / f"_gemini_{g}"

        def key_image(name):
            if name == "a":
                return a
            if name == "drawn":
                return RG.load_like(RG.drawn_path(v, g), a)
            p = old / f"{name}.png" if (old / f"{name}.png").exists() else RG.raw_dir(v) / f"{name}.png"
            return RG.load_like(p, a)

        # ossos (pose de repouso) em coordenadas do artboard
        rest_art = {n: pt(A, specs[0]["pins"][n]) for n in names}
        pose0 = chain_pose(rest_art, names)
        bone_ids = [doc.id() for _ in pose0]
        (o0, th0, l0), (_, th1, l1), (_, th2, l2) = pose0
        doc.pbones += [
            {"id": bone_ids[0], "parent": None, "x": round(float(o0[0]), 2), "y": round(float(o0[1]), 2),
             "rotation": th0, "length": l0},
            {"id": bone_ids[1], "parent": bone_ids[0], "rotation": th1 - th0, "length": l1},
            {"id": bone_ids[2], "parent": bone_ids[1], "rotation": th2 - th1, "length": l2},
        ]
        doc.bones.append(
            f'<RootBone x="{o0[0]:.2f}" y="{o0[1]:.2f}" length="{l0:.2f}" rotation="{th0:.6f}" name="{g}_braço" id="{bone_ids[0]}">'
            f'<Bone length="{l1:.2f}" rotation="{th1 - th0:.6f}" name="{g}_antebraço" id="{bone_ids[1]}">'
            f'<Bone length="{l2:.2f}" rotation="{th2 - th1:.6f}" name="{g}_mão" id="{bone_ids[2]}"/>'
            f"</Bone></RootBone>"
        )

        # peças: uma por chave, ligada na pose da própria chave
        piece_ids = []
        for ki, spec in enumerate(specs):
            img = key_image(spec["frame"])
            poly = RG.poly_mask(spec["poly"], (h, w))
            m = RG.piece_mask(img, clean, poly)
            if spec.get("whole") or spec.get("whole_poly"):
                wm = RG.poly_mask(spec["whole_poly"], (h, w)) if spec.get("whole_poly") else RG.rect_mask(spec["whole"], (h, w))
                m = np.maximum(m, np.clip(cv2.GaussianBlur((poly & wm).astype(np.float32), (0, 0), 1.3), 0, 1))
            if spec.get("keep"):
                m = m * (1 - cv2.GaussianBlur(RG.rect_mask(spec["keep"], (h, w)).astype(np.float32), (0, 0), 2))
            pins = {n: pt(A, spec["pins"][n]) for n in names}
            pose = chain_pose(pins, names)
            segs = [(o, o + ln * np.array([math.cos(th), math.sin(th)])) for o, th, ln in pose]

            def u_along(sp):  # posição ao longo do antebraço (0 = cotovelo, 1 = punho) no quadro bruto
                E_, W_ = np.array(sp["pins"]["E"], float), np.array(sp["pins"]["W"], float)
                yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
                ax = W_ - E_
                return ((xx - E_[0]) * ax[0] + (yy - E_[1]) * ax[1]) / (ax @ ax)

            parts = [(m, segs, ki, True)]  # (alfa, ossos que puxam, chave, entra na troca de desenho)
            if spec.get("morph_ramp"):
                # desenho com perspectiva só na parte distal (mão + caneca), preso SÓ ao osso da mão (o
                # antebraço do desenho é mais comprido que o do esqueleto com IK)
                parts = [(m * np.clip((u_along(spec) - 0.8) / 0.15, 0, 1), segs[-1:], ki, True)]
            elif ki == 0 and any(s.get("morph_ramp") for s in specs[1:]):
                # repouso dividido: braço (sempre visível) + mão/caneca (trocada pelo desenho do gesto)
                uu_ = u_along(spec)
                prox = m * (1 - cv2.GaussianBlur((uu_ > 0.875).astype(np.float32), (0, 0), 1.5))
                dist = m * np.clip((uu_ - 0.78) / 0.09, 0, 1)
                parts = [(prox, segs, ki, False), (dist, segs, ki, True)]
            for pi, (mm, sg_, kk, swaps) in enumerate(parts):
                rgb_art, al_art = to_art(img, mm, A, (AW, AH), gains, offs)
                got = doc.asset(out_dir, f"{g}_{ki}_{spec['frame']}_{pi}", rgb_art, al_art)
                if not got:
                    continue
                aid, org, al_crop = got
                bones_here = bone_ids if len(sg_) == len(segs) else bone_ids[-len(sg_):]
                pose_here = pose if len(sg_) == len(segs) else pose[-len(sg_):]
                mesh, stat, mst = mesh_xml(al_crop, org, sg_, doc.id())
                pid = doc.id()
                start_op = 1 if ki == 0 else 0
                depth = 20 + gi * 10 + (1 if ki else 0) + (0.5 if pi else 0)
                doc.drawables.append((
                    depth,
                    f'<Image x="0" y="0" originX="0" originY="0" opacity="{start_op}" assetId="{aid}" '
                    f'name="{g}_{spec["frame"]}_{pi}" id="{pid}">'
                    f'{mesh}<Skin tx="0" ty="0" name="Skin">{tendons(pose_here, bones_here)}</Skin></Mesh></Image>',
                ))
                doc.pdraw.append((depth, {
                    "id": pid, "image": aid, "opacity": start_op,
                    "mesh": {**mst, "bones": bones_here,
                             "bind": [[math.cos(th), math.sin(th), -math.sin(th), math.cos(th), float(o[0]), float(o[1])]
                                      for o, th, _ in pose_here]},
                }))
                if swaps:
                    piece_ids.append((pid, spec, kk))
                print(f"[{vid}] {g}: peça {spec['frame']}/{pi} {stat}")

        # remendos do desenho final (olhos, espuma), por cima do corpo e sob os braços
        final = key_image(specs[-1]["frame"])
        patch_ids = []
        for ri, (x0_, y0_, x1_, y1_, start) in enumerate(rig.get("key_regions", [])):
            mm = RG.rect_mask([[x0_, y0_, x1_, y1_]], (h, w)).astype(np.float32)
            mm = cv2.GaussianBlur(mm, (0, 0), 10)
            rgb_art, al_art = to_art(final, mm, A, (AW, AH), gains, offs)
            got = doc.asset(out_dir, f"{g}_detalhe{ri}", rgb_art, al_art)
            if got:
                aid, org, _ = got
                pid = doc.id()
                doc.drawables.append((5 + ri, f'<Image x="{org[0]}" y="{org[1]}" originX="0" originY="0" opacity="0" '
                                              f'assetId="{aid}" name="{g}_detalhe{ri}" id="{pid}"/>'))
                patch_ids.append((pid, start))
                doc.pdraw.append((5 + ri, {"id": pid, "image": aid, "opacity": 0}))

        # gole: a barba logo abaixo do queixo (a garganta fica escondida atrás dela) estufa e volta.
        # Malha fina em disco: miolo preso ao osso "gole" (escala), borda ao osso "âncora" (parado) —
        # deforma sem costura. Aparece junto com os detalhes do desenho final.
        gulp_bone = None
        gp = rig.get("gulp")
        if gp:
            c_raw = np.array(gp["center"], float)
            R = float(gp["radius"])
            yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
            dist = np.hypot(xx - c_raw[0], yy - c_raw[1])
            disk = np.clip((R - dist) / (0.3 * R), 0, 1)
            rgb_art, al_art = to_art(final, disk, A, (AW, AH), gains, offs)
            got = doc.asset(out_dir, f"{g}_gole", rgb_art, al_art)
            if got:
                aid, org, al_crop = got
                c_art = pt(A, c_raw)
                r_art = R * float(np.sqrt(abs(np.linalg.det(A[:, :2]))))
                anchor, gulp_bone = doc.id(), doc.id()
                for bid in (anchor, gulp_bone):
                    doc.pbones.append({"id": bid, "parent": None, "x": round(float(c_art[0]), 2),
                                       "y": round(float(c_art[1]), 2), "rotation": 0.0, "length": 1.0})
                ah_, aw_ = al_crop.shape
                step = max(2.0, r_art / 6)
                nx_, ny_ = math.ceil(aw_ / step), math.ceil(ah_ / step)
                verts, tris, wts = [], [], []
                for j in range(ny_ + 1):
                    for i in range(nx_ + 1):
                        px, py = min(i * step, aw_), min(j * step, ah_)
                        verts.append((px, py))
                        rr = math.hypot(px + org[0] - c_art[0], py + org[1] - c_art[1]) / (0.8 * r_art)
                        f_ = ease(float(np.clip(1 - rr, 0, 1)))
                        wts += [0, round(1 - f_, 4), 1, round(f_, 4)]
                for j in range(ny_):
                    for i in range(nx_):
                        q = j * (nx_ + 1) + i
                        tris += [q, q + 1, q + nx_ + 2, q, q + nx_ + 2, q + nx_ + 1]
                pid = doc.id()
                bind = [1.0, 0.0, 0.0, 1.0, float(c_art[0]), float(c_art[1])]
                doc.pdraw.append((15, {
                    "id": pid, "image": aid, "opacity": 0,
                    "mesh": {"v": [round(c, 2) for px, py in verts for c in (px + org[0], py + org[1])],
                             "uv": [round(c, 5) for px, py in verts for c in (px / aw_, py / ah_)],
                             "tri": tris, "w": wts, "bones": [anchor, gulp_bone], "bind": [bind, bind]},
                }))
                patch_ids.append((pid, float(gp.get("start", 0.75))))
                print(f"[{vid}] {g}: gole em {c_art.round(1)} raio {r_art:.1f}px ({len(verts)}v)")

        # animação: ida (pose do rig.py), parada (com ciclo), volta
        keys = [{**s, "pins_np": {n: np.array(p, float) for n, p in s["pins"].items()}} for s in specs]
        ik = rig.get("ik")
        up_frames = int(round(FPS * fr.get("tweenMs", 40) * (rig.get("tweens", 24) + 1) / 1000))
        hold_frames = int(FPS * 0.35)

        def pose_at(t):
            sg = next(i for i in range(1, len(keys)) if t <= keys[i]["t"] + 1e-9)
            ka, kb = keys[sg - 1], keys[sg]
            uu = (t - ka["t"]) / (kb["t"] - ka["t"])
            p = RG.pins_at(ka["pins_np"], kb["pins_np"], chain, uu, ik)
            return {n: pt(A, p[n]) for n in names}, sg, uu

        tracks: dict = {}

        def key(obj, prop, frame, val):
            tracks.setdefault(obj, {}).setdefault(prop, []).append((frame, val))

        def put_pose(frame, p):
            (_, t0, l0_), (_, t1, l1_), (_, t2, _) = chain_pose(p, names)
            key(bone_ids[0], "rotation", frame, t0)
            key(bone_ids[0], "length", frame, l0_)
            key(bone_ids[1], "rotation", frame, t1 - t0)
            key(bone_ids[1], "length", frame, l1_)
            key(bone_ids[2], "rotation", frame, t2 - t1)

        def put_opacity(frame, t, sg, uu):
            for pid, spec, ki in piece_ids:
                # troca rápida no meio de cada trecho (desenho da chave anterior -> da seguinte)
                m0, m1 = keys[sg].get("morph", [0.35, 0.65])
                # troca curta (~2 quadros a 60 fps): misturar dois desenhos diferentes deixa "caneca dupla";
                # no gole ela acontece perto da boca, onde os dois desenhos quase coincidem
                mid = (m0 + m1) / 2 if not keys[sg].get("morph_ramp") else 0.9
                s = float(np.clip((uu - (mid - 0.02)) / 0.04, 0, 1))
                op = (1 - s) if ki == sg - 1 else (s if ki == sg else 0.0)
                key(pid, "opacity", frame, op)
            for pid, start in patch_ids:
                key(pid, "opacity", frame, float(np.clip((t - start) / max(1 - start, 1e-6), 0, 1)))

        samples = []
        n_s = max(12, up_frames // 2)
        for i in range(n_s + 1):
            t = ease(i / n_s)
            samples.append((round(i * up_frames / n_s), t))
        frame = 0
        for f_, t in samples:
            p, sg, uu = pose_at(max(t, 1e-6))
            put_pose(f_, p)
            put_opacity(f_, t, sg, uu)
        frame = up_frames + hold_frames
        p_end, sg_end, _ = pose_at(1.0)
        put_pose(frame, p_end)
        put_opacity(frame, 1.0, sg_end, 1.0)
        marks = {"start": (0, 1)}  # trechos do gesto onde os efeitos de estado acontecem
        lp = rig.get("loop_rive") or rig.get("loop")  # loop_rive: só no Rive (o rig.py não gera quadros)
        if lp:  # goles: mão + caneca giram em volta do alfinete e voltam; cotovelo pelo IK
            end_raw = RG.pins_at(keys[-2]["pins_np"], keys[-1]["pins_np"], chain, 1.0, ik)
            piv = end_raw[lp["pivot"]]
            l1r = float(np.linalg.norm(keys[0]["pins_np"]["E"] - keys[0]["pins_np"]["S"]))  # noqa: E501
            l2r = float(np.linalg.norm(keys[0]["pins_np"]["W"] - keys[0]["pins_np"]["E"]))
            side = min((1.0, -1.0), key=lambda sd: np.linalg.norm(
                RG.two_bone_ik(end_raw["S"], end_raw["W"], l1r, l2r, sd) - end_raw["E"]))
            n_lp, cyc = 24, int(lp.get("cycles", 2))
            lp_frames = int(round(FPS * lp.get("ms", 70) * lp.get("frames", 16) / 1000))
            if lp.get("continuous"):
                n_lp = 48
            for i in range(1, n_lp + 1):
                ph = i / n_lp
                # `signed`: vaivém para os dois lados (limpar o bigode); `continuous`: um só movimento
                # lento (inclina até o fundo e volta); senão vai e volta de um lado `cycles` vezes
                if lp.get("continuous"):
                    shape = (1 - math.cos(2 * math.pi * ph)) / 2
                elif lp.get("signed"):
                    shape = math.sin(2 * math.pi * ph * cyc)
                else:
                    shape = math.sin(math.pi * ph * cyc) ** 2
                ang = math.radians(lp["angle"]) * shape
                cs, sn = math.cos(ang), math.sin(ang)
                pr = dict(end_raw)
                for nm in lp.get("rotate", ["W", "T", "B"]):
                    d = end_raw[nm] - piv
                    pr[nm] = piv + np.array([cs * d[0] - sn * d[1], sn * d[0] + cs * d[1]])
                if ik:
                    pr["E"] = RG.two_bone_ik(pr["S"], pr["W"], l1r, l2r, side)
                put_pose(frame + round(ph * lp_frames), {n: pt(A, pr[n]) for n in names})
            if gulp_bone and gp:
                # goles: a garganta estufa `count` vezes enquanto a caneca está inclinada
                cnt, amt, wid = int(gp.get("count", 2)), float(gp.get("amount", 0.08)), float(gp.get("width", 0.26))
                centers = [0.5 + (k - (cnt - 1) / 2) * wid * 1.1 for k in range(cnt)]
                key(gulp_bone, "scale", 0, 1.0)
                for i in range(n_lp * 2 + 1):
                    ph = i / (n_lp * 2)
                    bump = sum(math.sin(math.pi * float(np.clip((ph - c0) / wid + 0.5, 0, 1))) ** 2 for c0 in centers)
                    key(gulp_bone, "scale", frame + round(ph * lp_frames), 1.0 + amt * bump)
            marks["loop"] = (frame, frame + lp_frames)
            frame += lp_frames
        frame += int(FPS * fr["hold"][0] / 1000 * 0.4)
        put_pose(frame, p_end)
        put_opacity(frame, 1.0, sg_end, 1.0)
        marks["return"] = (frame, frame + max(1, up_frames // 3))  # caneca saindo da boca
        for f_, t in samples:  # volta: a ida ao contrário
            ff = frame + up_frames - f_
            p, sg, uu = pose_at(max(t, 1e-6))
            put_pose(ff, p)
            put_opacity(ff, t, sg, uu)
        total = frame + up_frames
        if gulp_bone:
            key(gulp_bone, "scale", total, 1.0)
        effects_by[f"gesto_{g}"] = [
            {"var": e["var"], **({"to": e["to"]} if "to" in e else {"add": e.get("add", 1)}),
             "from": int(marks[e.get("at", "start")][0]), "until": int(marks[e.get("at", "start")][1])}
            for e in pst.get("effects", {}).get(g, [])
        ]
        anims.append((f"gesto_{g}", total, tracks))
        print(f"[{vid}] {g}: animação de {total / FPS:.1f} s, {len(piece_ids)} peças, {len(patch_ids)} detalhes")

    # ─── RML ───
    def anim_xml(name, dur, tracks, aid, loop=False):
        ko = []
        for obj, props in tracks.items():
            kp = []
            for prop, ks in props.items():
                ks = sorted(dict(ks).items())
                kf = "".join(f'<KeyFrameDouble value="{val:.6f}" frame="{f_}" interpolationType="linear"/>' for f_, val in ks)
                kp.append(f'<KeyedProperty property="{prop}">{kf}</KeyedProperty>')
            ko.append(f'<KeyedObject objectId="{obj}">{"".join(kp)}</KeyedObject>')
        lv = ' loopValue="loop"' if loop else ""
        return f'<LinearAnimation{lv} fps="{FPS}" duration="{dur}" name="{name}" id="{aid}">{"".join(ko)}</LinearAnimation>'

    sm_id, layer_id = doc.id(), doc.id()
    idle_a, idle_b = doc.id(), doc.id()
    st_idle_a, st_idle_b = doc.id(), doc.id()
    gest = [(doc.id(), doc.id(), n, d, t) for n, d, t in anims]  # (anim id, state id, ...)
    holds = v["frames"][0]["hold"]
    ia = round(FPS * holds[0] / 1000)
    ib = round(FPS * holds[1] / 1000)

    def out_transitions(weights_idle):
        tr = [f'<StateTransition stateToId="{weights_idle[0]}" randomWeight="{weights_idle[1]}" '
              f'enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"/>']
        for _, sid, *_ in gest:
            tr.append(f'<StateTransition stateToId="{sid}" randomWeight="3" enableExitTime="true" '
                      f'exitTimeIsPercetange="true" exitTime="100"/>')
        return "".join(tr)

    first = {"b": gest[0][1]} if entry else {}
    entry_to = next((sid for _, sid, n, *_ in gest if n == f"gesto_{entry}"), st_idle_a) if entry else st_idle_a
    states = [
        f'<AnimationState x="160" y="0" animationId="{idle_a}" random="true" reset="true" id="{st_idle_a}">{out_transitions((st_idle_b, 1))}</AnimationState>',
        f'<AnimationState x="160" y="200" animationId="{idle_b}" random="true" reset="true" id="{st_idle_b}">{out_transitions((st_idle_a, 1))}</AnimationState>',
    ]
    for i, (aid, sid, n, d, t) in enumerate(gest):
        back = st_idle_b if i % 2 else st_idle_a
        states.append(f'<AnimationState x="{420 + 200 * i}" y="100" animationId="{aid}" reset="true" id="{sid}">'
                      f'<StateTransition stateToId="{back}" enableExitTime="true" exitTimeIsPercetange="true" exitTime="100"/>'
                      f"</AnimationState>")
    del first
    sm = (f'<StateMachine name="Vida" id="{sm_id}"><StateMachineLayer name="Gestos" id="{layer_id}">'
          f'<AnyState x="160" y="-150"/><ExitState x="420" y="-150"/>'
          f'<EntryState x="0" y="0"><StateTransition stateToId="{entry_to}"/></EntryState>'
          f'{"".join(states)}</StateMachineLayer></StateMachine>')
    anim_x = [anim_xml("parado_a", ia, {}, idle_a), anim_xml("parado_b", ib, {}, idle_b)]
    anim_x += [anim_xml(n, d, t, aid) for aid, _, n, d, t in gest]

    # o PRIMEIRO desenhado fica na FRENTE: braços (mais na frente) ... corpo (atrás)
    draw = [x for _, x in sorted(doc.drawables, key=lambda d: -d[0])]
    body_xml = f'<Image x="0" y="0" originX="0" originY="0" assetId="{body_asset[0]}" name="corpo" id="{doc.id()}"/>'
    if entry:  # prévia: a cena atrás (no site ela já está lá)
        bg = doc.asset(out_dir, "_cena_previa", plate_art, np.ones((AH, AW), np.float32))
        body_xml += f'<Image x="0" y="0" originX="0" originY="0" assetId="{bg[0]}" name="cena" id="{doc.id()}"/>'
    style = doc.id()
    rml = (
        '<Rive version="1" kind="fragment">' + "".join(doc.assets)
        + f'<Artboard defaultStateMachineId="{sm_id}" styleId="{style}" width="{AW}" height="{AH}" clip="true" name="{vid}" id="{doc.id()}">'
        + f'<LayoutComponentStyle name="Artboard Style" id="{style}"/>'
        + "".join(doc.bones) + "".join(draw) + body_xml + sm + "".join(anim_x)
        + "</Artboard></Rive>\n"
    )
    (out_dir / f"{vid}.rml").write_text(rml, encoding="utf-8")
    (out_dir / "rive.yaml").write_text(f"name: {vid}\nlogs:\n  file: build/rive.log\n  problems: build/problems.log\n", encoding="utf-8")
    # marionete do site (player próprio, GuildPuppetCanvas): os mesmos dados, em JSON
    def r6(x):
        return round(float(x), 5)

    puppet = {
        "size": [AW, AH],
        "fps": FPS,
        "images": doc.images,
        "bones": [{**b, "rotation": r6(b["rotation"]), "length": r6(b["length"])} for b in doc.pbones],
        # de trás para a frente
        "draw": [{"id": "corpo", "image": body_asset[0], "opacity": 1}]
        + [d for _, d in sorted(doc.pdraw, key=lambda t: t[0])],
        "anims": [
            {"name": n, "frames": int(d),
             "tracks": {obj: {pr: [[int(f_), r6(val)] for f_, val in sorted(dict(ks).items())]
                              for pr, ks in props.items()} for obj, props in t.items()}}
            for n, d, t in anims
        ],
        "vars": var_layers,
        "idleMs": v["frames"][0]["hold"],
        "weights": {"idle": 1, "gesture": 3},
    }
    for an in puppet["anims"]:
        if effects_by.get(an["name"]):
            an["effects"] = effects_by[an["name"]]
        wb = pst.get("weightBy", {}).get(an["name"].removeprefix("gesto_"))
        if wb:
            an["weightBy"] = wb
    for d in puppet["draw"]:
        if "mesh" in d:
            d["mesh"]["bind"] = [[r6(x) for x in b] for b in d["mesh"]["bind"]]
    (out_dir / "puppet.json").write_text(json.dumps(puppet, separators=(",", ":")), encoding="utf-8")
    info = {"rect": rect, "artboard": [AW, AH], "scale": K}
    (out_dir / "info.json").write_text(json.dumps(info), encoding="utf-8")
    kb = sum(p.stat().st_size for p in out_dir.glob("*.webp")) / 1024
    print(f"[{vid}] projeto Rive em {out_dir} ({AW}x{AH}, imagens {kb:.0f} KB)")


def install(vid: str) -> None:
    """Copia a marionete (puppet.json + imagens) para o site e liga no hall-life.json."""
    src = RIVE_DIR / vid
    dest = C.PUBLIC_OUT / vid / "puppet"
    dest.mkdir(parents=True, exist_ok=True)
    for p in dest.iterdir():  # esvazia sem apagar a pasta (o dev server / um terminal pode estar nela)
        shutil.rmtree(p) if p.is_dir() else p.unlink()
    puppet = json.loads((src / "puppet.json").read_text(encoding="utf-8"))
    used = {img[0] for img in puppet["images"].values()}
    for f in used:
        shutil.copy(src / f, dest / f)
    shutil.copy(src / "puppet.json", dest / "puppet.json")
    old_riv = C.PUBLIC_OUT / vid / f"{vid}.riv"
    old_riv.unlink(missing_ok=True)
    data = json.loads(C.DATA_OUT.read_text(encoding="utf-8"))
    data[vid].pop("rive", None)
    data[vid]["puppet"] = {"src": f"/vfx/hall-life/{vid}/puppet/puppet.json"}
    C.DATA_OUT.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    kb = sum(p.stat().st_size for p in dest.iterdir()) / 1024
    print(f"[{vid}] marionete no site: {dest} ({kb:.0f} KB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", required=True)
    ap.add_argument("--entry", help="prévia: a máquina começa direto neste gesto (ex.: b)")
    ap.add_argument("--site", action="store_true", help="copia a marionete para o site e liga no hall-life.json")
    args = ap.parse_args()
    v = next(x for x in C.load_manifest()["vignettes"] if x["id"] == args.only)
    st = C.load_state()["vignettes"][args.only]
    build(v, st, None if args.site else args.entry)
    if args.site:
        install(args.only)


if __name__ == "__main__":
    main()
