"""
Marionete em LOOP (ex.: bardo tocando sem parar): uma malha só sobre o personagem, deformada por
ossos com pesos suaves (técnica de "mesh deform" do Spine/Rive). Não precisa de poses desenhadas
nem de placa limpa: os movimentos são pequenos e procedurais (dedilhar, marcar o ritmo com a
cabeça, bater o pé), sincronizados num andamento (bpm).

Camadas no puppet.json (de trás para a frente):
  base    repouso com as regiões que se mexem preenchidas (inpaint): se a malha sair de cima, aparece
          fundo plausível em vez de uma "segunda mão" fantasma
  figura  o repouso nas regiões que se mexem, como malha; cada vértice puxado por até 2 ossos

Config em vignettes.json, na vinheta, chave "loop_rig" (coordenadas no quadro A bruto):
  bpm, idleMs, cell? (malha: lado da célula em px do artboard; padrão 6)
  bones:   {nome: {pivot, tip, parent?, region (polígono), blur, fill: plate|inpaint}} (filho: pivot = tip do pai)
           só os pixels do personagem (máscara da extração) se mexem; ao sair do lugar aparece a cena
           real (`plate`, sobre o fundo) ou o entorno preenchido (`inpaint`, ex.: mão sobre o alaúde)
  motions: {osso: {kind: strum|nod|tap|scribble|line|sway|chords, amp (graus), lag?, sway?, sway_beats?,
           period? (line/sway, em tempos)}}
           chords: {steps: [posição por compasso], bar, lead} — a mão dos acordes troca antes do 1
  music:   {bar, melody: ["NOTA:tempos ..." por compasso], chords: [acorde por compasso]}
           -> puppet.json "music": eventos [tempo, nota, ganho, duração] (ver arrange)
  patches: {nome: {overlay, region [x0 y0 x1 y1], bone, feather?}}  rostos do Gemini (rig.py overlay)
           presos a um osso; aparecem por `blinks` (tempos das piscadas) e por `looks[].patch`
  page_flip: {spine, right, left (bordas de fora: [topo, base]), frames, curl, lift, occluders: [ossos]}
           página virando renderizada aqui; o trecho com `flip: {from, to}` (tempos) mostra os quadros
  poses:   {nome: {overlay, hand: polígono da mão nova, cover: osso cuja mão some}}; no trecho
           `pose: {name, in: [t0, t1], out: [t0, t1]}` (a mão nova fica por cima da página que vira)
  vars:    {nome: {max}} + nos trechos `effects: [{var, add|to, from, until}]` e `weightBy`
  anims:   [{name, beats, weight?, blinks?, looks?: [{bone, angle, from, to, quiet?, patch?}]}]  (looks: vira e volta entre
           os tempos from..to; `quiet`: ossos que param nesse meio tempo; beats = múltiplo da música)

  python Frontend/scripts/hall-life/loop_rig.py --only stair-bard [--site]
"""
from __future__ import annotations

import argparse
import json
import math
import shutil

import cv2
import numpy as np
from PIL import Image

import common as C
import extract as X
import rig as RG
import rive_rig as RR

FPS = RR.FPS
STEP = 2  # keyframe a cada 2 quadros (60 fps): o player interpola linear entre eles


def poly_art(poly, A, size) -> np.ndarray:
    pts = np.array([RR.pt(A, p)[:2] for p in poly], np.float32)
    m = np.zeros((size[1], size[0]), np.uint8)
    cv2.fillPoly(m, [np.round(pts).astype(np.int32)], 1)
    return m.astype(np.float32)


def beat_shape(kind: str, p: float) -> float:
    """Posição normalizada dentro de um tempo (p em [0, 1)), contínua e suave entre tempos."""
    if kind == "strum":  # desce rápido pelas cordas no tempo, sobe devagar até o próximo
        return -math.cos(math.pi * p / 0.3) if p < 0.3 else math.cos(math.pi * (p - 0.3) / 0.7)
    if kind == "nod":  # a cabeça acompanha a batida (desce logo depois do tempo e volta)
        return math.sin(math.pi * ((p + 0.9) % 1.0)) ** 2
    if kind == "tap":  # ponta do pé sobe na segunda metade e bate NO tempo
        u = min(1.0, max(0.0, (p - 0.5) / 0.5))
        return math.sin(math.pi * u) ** 2
    if kind == "scribble":  # pena escrevendo: voltinhas rápidas e irregulares (frequências inteiras: fecha no tempo)
        return 0.65 * math.sin(2 * math.pi * 5 * p) + 0.35 * math.sin(2 * math.pi * 3 * p + 0.8)
    raise ValueError(kind)


def motion_value(mo: dict, beat: float) -> float:
    """Ângulo (graus) de um movimento no tempo `beat` (contado desde o início do trecho)."""
    if mo["kind"] == "chords":  # mão dos acordes: uma posição por compasso, troca pouco antes do 1
        bar, steps = mo.get("bar", 4), mo["steps"]
        k = int(beat // bar)
        u = beat - k * bar
        cur, nxt = steps[k % len(steps)], steps[(k + 1) % len(steps)]
        lead = mo.get("lead", 0.35)
        s = 0.0 if u < bar - lead else (lambda x: x * x * (3 - 2 * x))((u - (bar - lead)) / lead)
        return mo["amp"] * (cur + (nxt - cur) * s)
    if mo["kind"] == "line":  # escrevendo uma linha: avança devagar e volta rápido para a próxima
        u = (beat % mo["period"]) / mo["period"]
        saw = u / 0.85 if u < 0.85 else 1 - (lambda x: x * x * (3 - 2 * x))((u - 0.85) / 0.15)
        return mo["amp"] * (saw - 0.5)
    if mo["kind"] == "sway":  # balanço lento
        return mo["amp"] * math.sin(2 * math.pi * beat / mo["period"])
    off = mo["amp"] * beat_shape(mo["kind"], (beat - mo.get("lag", 0.0)) % 1.0)
    if mo.get("sway"):  # balanço lento (período em tempos; divide o trecho)
        off += mo["sway"] * math.sin(2 * math.pi * beat / mo.get("sway_beats", 8))
    return off


CHORDS = {  # baixo + 3 notas do acorde, na região do alaúde
    "Am": ["A2", "A3", "C4", "E4"],
    "C": ["C3", "G3", "C4", "E4"],
    "G": ["G2", "G3", "B3", "D4"],
    "Em": ["E2", "E3", "G3", "B3"],
    "E": ["E2", "E3", "G#3", "B3"],
    "F": ["F2", "F3", "A3", "C4"],
    "Dm": ["D3", "A3", "D4", "F4"],
}


def arrange(m: dict, bpm: float) -> dict:
    """Partitura compacta -> eventos [tempo, nota, ganho, duração em tempos].

    melody: um texto por compasso, "NOTA:duração" (ex.: "E5:1.5 F5:.5 E5:1");
    chords: um acorde por compasso. Acompanhamento de alaúde dedilhado em 3/4: baixo no 1, duas notas
    do acorde no 2 e no 3 (levemente arpejadas)."""
    bar = m["bar"]
    events = []
    for k, (mel, ch) in enumerate(zip(m["melody"], m["chords"])):
        t0 = k * bar
        bass, *upper = CHORDS[ch]
        events.append([t0, bass, 0.75, bar])
        for b in range(1, bar):
            pair = upper[:2] if b % 2 else upper[1:]
            events += [[t0 + b, pair[0], 0.32, 1.2], [t0 + b + 0.04, pair[1], 0.3, 1.2]]
        t = t0
        for tok in mel.split():
            note, dur = tok.split(":")
            events.append([round(t, 4), note, 0.7, float(dur)])
            t += float(dur)
        if abs(t - t0 - bar) > 1e-6:
            raise SystemExit(f"compasso {k + 1} soma {t - t0} tempos (esperado {bar}): {mel}")
    events.sort(key=lambda e: e[0])
    return {"bpm": bpm, "bar": bar, "length": bar * len(m["melody"]), "events": events}


THIN_TOL = {"rotation": 2e-4, "length": 0.05, "scale": 1e-4, "opacity": 0.004}


def thin(keys: list, tol: float) -> list:
    """Tira as chaves que a interpolação linear do player já reproduz (erro <= tol): mesmo movimento,
    JSON bem menor. Guloso: estende cada segmento enquanto todas as chaves do meio cabem nele."""
    if len(keys) <= 2:
        return keys
    out = [keys[0]]
    i = 0
    while i < len(keys) - 1:
        j = i + 1
        while j + 1 < len(keys):
            (f0, v0), (f1, v1) = keys[i], keys[j + 1]
            if all(abs(v0 + (v1 - v0) * (fm - f0) / (f1 - f0) - vm) <= tol for fm, vm in keys[i + 1:j + 1]):
                j += 1
            else:
                break
        out.append(keys[j])
        i = j
    return out


def poly_mask_dil(m: np.ndarray, r: int) -> np.ndarray:
    return cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))


def refine_cut(a: np.ndarray, poly_mask: np.ndarray, band: int = 14, cuts: list | None = None) -> np.ndarray:
    """Recorte justo a partir de um contorno traçado à mão: miolo = certo, faixa de `band` px dos dois
    lados da linha = em dúvida, fora = fundo. O GrabCut decide a faixa pela cor (a borda cai na linha
    de tinta do desenho, sem lascas do fundo). Devolve máscara 0..1 suave."""
    h, w = a.shape[:2]
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * band + 1, 2 * band + 1))
    inner = cv2.erode(poly_mask, k)
    outer = cv2.dilate(poly_mask, k)
    gc = np.full((h, w), cv2.GC_BGD, np.uint8)
    gc[outer > 0] = cv2.GC_PR_BGD
    gc[poly_mask > 0] = cv2.GC_PR_FGD
    gc[inner > 0] = cv2.GC_FGD
    ys, xs = np.where(outer > 0)
    y0, y1 = max(0, ys.min() - 20), min(h, ys.max() + 21)
    x0, x1 = max(0, xs.min() - 20), min(w, xs.max() + 21)
    sub = gc[y0:y1, x0:x1].copy()
    cv2.grabCut(cv2.cvtColor(a, cv2.COLOR_RGB2BGR)[y0:y1, x0:x1], sub, None, np.zeros((1, 65), np.float64),
                np.zeros((1, 65), np.float64), 8, cv2.GC_INIT_WITH_MASK)
    fg = np.zeros((h, w), np.uint8)
    fg[y0:y1, x0:x1] = ((sub == cv2.GC_FGD) | (sub == cv2.GC_PR_FGD)).astype(np.uint8)
    # fica o pedaço principal; fecha buraquinhos (traço fino de tinta dentro do braço)
    n_, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
    if n_ > 2:
        fg = (lab == 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    # a linha de tinta do contorno é do braço: recoloca a tinta escura encostada no recorte
    lum = a.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    ink = (lum < 85).astype(np.uint8) & poly_mask_dil(poly_mask, band)
    fg = fg | (cv2.dilate(fg, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) & ink)
    for poly in cuts or []:
        cv2.fillPoly(fg, [np.array(poly, np.int32)], 0)
    hole_fill = fg.copy()
    cv2.floodFill(hole_fill, None, (0, 0), 1)
    fg = fg | (1 - hole_fill)
    return np.clip(cv2.GaussianBlur(fg.astype(np.float32), (0, 0), 0.9), 0, 1)


def hand_silhouettes(a: np.ndarray, polys: list) -> np.ndarray:
    """Silhueta exata das mãos (GrabCut a partir dos polígonos dos ossos): a página que vira passa
    POR BAIXO delas. Devolve máscara 0..1 no quadro bruto."""
    h, w = a.shape[:2]
    out = np.zeros((h, w), np.float32)
    bgr = cv2.cvtColor(a, cv2.COLOR_RGB2BGR)
    for poly in polys:
        pm = np.zeros((h, w), np.uint8)
        cv2.fillPoly(pm, [np.array(poly, np.int32)], 1)
        near = cv2.dilate(pm, np.ones((41, 41), np.uint8))
        core = cv2.erode(pm, np.ones((25, 25), np.uint8))
        gc = np.full((h, w), cv2.GC_BGD, np.uint8)
        gc[near > 0] = cv2.GC_PR_BGD
        gc[pm > 0] = cv2.GC_PR_FGD
        gc[core > 0] = cv2.GC_FGD
        ys, xs = np.where(near > 0)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        sub = gc[y0:y1, x0:x1].copy()
        cv2.grabCut(bgr[y0:y1, x0:x1], sub, None, np.zeros((1, 65), np.float64),
                    np.zeros((1, 65), np.float64), 6, cv2.GC_INIT_WITH_MASK)
        fg = ((sub == cv2.GC_FGD) | (sub == cv2.GC_PR_FGD)).astype(np.uint8)
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        out[y0:y1, x0:x1] = np.maximum(out[y0:y1, x0:x1], fg.astype(np.float32))
    return np.clip(cv2.GaussianBlur(cv2.dilate(out, np.ones((3, 3), np.uint8)), (0, 0), 1.0), 0, 1)


def flip_frames(a: np.ndarray, pf: dict, n: int) -> list[tuple[np.ndarray, np.ndarray]]:
    """Página virando (2D clássico): a página da direita gira em volta da lombada, sobe em perspectiva,
    curva na borda e pousa à esquerda. Frente = textura da página direita; verso = da página esquerda
    (ao pousar, o livro fica idêntico ao começo: o loop não salta). Devolve n quadros (rgb, alfa) brutos."""
    h, w = a.shape[:2]
    st_, sb_ = np.array(pf["spine"][0], float), np.array(pf["spine"][1], float)
    rt_, rb_ = np.array(pf["right"][0], float), np.array(pf["right"][1], float)
    lt_, lb_ = np.array(pf["left"][0], float), np.array(pf["left"][1], float)
    up = np.array([0.0, -1.0]) * pf.get("lift", 0.7) * float(np.linalg.norm(rt_ - st_))
    curl = pf.get("curl", 0.6)
    NS, NT = 18, 10

    def page_pt(outer_t, outer_b, s, t):
        sp = st_ + (sb_ - st_) * t
        return sp + ((outer_t + (outer_b - outer_t) * t) - sp) * s

    def pos(s, t, phi):
        # segura pelo canto: subindo, a borda de fora vai na frente; caindo, ela fica para trás (curva)
        ph = phi + curl * s * s * math.sin(2 * phi)
        sp = st_ + (sb_ - st_) * t
        if ph <= math.pi / 2:
            u = (rt_ + (rb_ - rt_) * t) - sp
            return sp + s * (math.cos(ph) * u + math.sin(ph) * up), ph
        u = (lt_ + (lb_ - lt_) * t) - sp
        return sp + s * (-math.cos(ph) * u + math.sin(ph) * up), ph

    frames = []
    for k in range(1, n + 1):
        e = k / (n + 1)
        phi = math.pi * e * e * (3 - 2 * e)
        rgb = np.zeros((h, w, 3), np.float32)
        al = np.zeros((h, w), np.float32)
        border = []
        for i in range(NS):
            for j in range(NT):
                s0, s1, t0, t1 = i / NS, (i + 1) / NS, j / NT, (j + 1) / NT
                corners = [(s0, t0), (s1, t0), (s1, t1), (s0, t1)]
                dst = np.array([pos(s_, t_, phi)[0] for s_, t_ in corners], np.float32)
                ph_c = pos((s0 + s1) / 2, (t0 + t1) / 2, phi)[1]
                front = ph_c <= math.pi / 2
                ot, ob = (rt_, rb_) if front else (lt_, lb_)
                src = np.array([page_pt(ot, ob, s_, t_) for s_, t_ in corners], np.float32)
                x0, y0 = np.floor(dst.min(0)).astype(int) - 1
                x1, y1 = np.ceil(dst.max(0)).astype(int) + 2
                x0, y0, x1, y1 = max(0, x0), max(0, y0), min(w, x1), min(h, y1)
                if x1 - x0 < 2 or y1 - y0 < 2:
                    continue
                M = cv2.getPerspectiveTransform(src, dst - np.array([x0, y0], np.float32))
                patch = cv2.warpPerspective(a, M, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR,
                                            borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
                mk = np.zeros((y1 - y0, x1 - x0), np.uint8)
                cv2.fillConvexPoly(mk, np.round(dst - [x0, y0]).astype(np.int32), 1)
                shade = (0.78 + 0.22 * abs(math.cos(ph_c))) * (1.0 if front else 0.93)
                sel = mk > 0
                rgb[y0:y1, x0:x1][sel] = patch[sel] * shade
                al[y0:y1, x0:x1][sel] = 1
        # contorno da folha no traço do desenho (marrom-escuro), como as outras bordas do livro
        edge = [pos(s_, 0, phi)[0] for s_ in np.linspace(0, 1, NS + 1)]
        edge += [pos(1, t_, phi)[0] for t_ in np.linspace(0, 1, NT + 1)]
        edge += [pos(s_, 1, phi)[0] for s_ in np.linspace(1, 0, NS + 1)]
        line = np.zeros((h, w), np.uint8)
        cv2.polylines(line, [np.round(np.array(edge)).astype(np.int32)], False, 1, pf.get("stroke", 7), cv2.LINE_AA)
        lm = cv2.GaussianBlur(line.astype(np.float32), (0, 0), 1.0)[..., None]
        rgb = rgb * (1 - lm) + np.array(pf.get("ink", [58, 30, 20]), np.float32) * lm
        al = np.maximum(al, lm[..., 0])
        frames.append((rgb, np.clip(cv2.GaussianBlur(al, (0, 0), 0.8), 0, 1)))
    return frames


def build(v: dict, st: dict) -> None:
    vid = v["id"]
    cfg = v["loop_rig"]
    out_dir = RR.RIVE_DIR / vid
    out_dir.mkdir(parents=True, exist_ok=True)
    for p in out_dir.iterdir():
        shutil.rmtree(p) if p.is_dir() else p.unlink()
    a = RG.load_rest(v, st)
    h, w = a.shape[:2]
    A, (AW, AH), _ = RR.raw_to_art(v, st, a)
    gains, offs = RR.color_fit(a, A, v)
    doc = RR.Doc()

    # recorte = máscara da extração; fora dela, pixel da cena (como no rive_rig)
    union = np.asarray(Image.open(C.EXTRACT / vid / "mask-union.png"), np.float32) / 255
    alpha_p = np.asarray(Image.open(C.EXTRACT / vid / "alpha.png"), np.float32) / 255
    meta = json.loads((C.EXTRACT / vid / "meta.json").read_text(encoding="utf-8"))
    cx0, cy0, cx1, cy1 = meta["crop_in_plate"]
    up = lambda m: cv2.resize(m[cy0:cy1, cx0:cx1], (AW, AH), interpolation=cv2.INTER_LINEAR)  # noqa: E731
    plate = X.to_np(Image.open(C.PLATES / f"{vid}.png")).astype(np.float32)
    plate_art = cv2.resize(plate[cy0:cy1, cx0:cx1], (AW, AH), interpolation=cv2.INTER_LINEAR)
    restore = np.clip(cv2.GaussianBlur(1 - up(union), (0, 0), RR.K * 1.0), 0, 1)[..., None]
    alpha = up(alpha_p)

    def art_of(img):
        rgb, _ = RR.to_art(img, np.ones((h, w), np.float32), A, (AW, AH), gains, offs)
        return rgb * (1 - restore) + plate_art * restore

    # SÓ o personagem se mexe: a máscara da extração (onde o desenho difere da cena vazia) separa o
    # bardo do fundo; a malha não arrasta degraus/corrimão junto com a cabeça
    person = np.clip(cv2.GaussianBlur(up(union), (0, 0), 0.8), 0, 1)
    rest_art = art_of(a)

    # influência de cada osso = região borrada (só dentro do personagem)
    names = list(cfg["bones"])
    infl = []
    for n in names:
        m = poly_art(cfg["bones"][n]["region"], A, (AW, AH))
        sig = cfg["bones"][n].get("blur", 6) * RR.K
        infl.append(np.clip(cv2.GaussianBlur(m, (0, 0), sig) * 1.6, 0, 1) * person)
    moving = cv2.dilate((np.max(infl, axis=0) > 0.003).astype(np.uint8), np.ones((9, 9), np.uint8))

    # base: o que aparece quando uma parte sai do lugar. Sobre o fundo (cabeça, pé): a cena REAL sem o
    # personagem (placa); sobre o próprio corpo/instrumento (mão no alaúde): preenchido pelo entorno
    base_rgb = rest_art.copy()
    base_al = alpha.copy()
    grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13))
    for n, mi in zip(names, infl):
        hole = cv2.dilate(((mi > 0.05) & (person > 0.3)).astype(np.uint8), grow)
        fill = cfg["bones"][n].get("fill", "plate")
        if fill == "plate" or fill.endswith(".png"):  # cena sem o personagem, ou sem a peça (Gemini)
            src = plate_art if fill == "plate" else art_of(RG.load_like(RG.raw_dir(v) / fill, a))
            soft = cv2.GaussianBlur(hole.astype(np.float32), (0, 0), 1.5)[..., None]
            base_rgb = base_rgb * (1 - soft) + src * soft
        else:
            u8 = np.clip(base_rgb, 0, 255).astype(np.uint8)
            base_rgb = cv2.inpaint(u8, hole * 255, 5, cv2.INPAINT_TELEA).astype(np.float32)
    pfb = cfg.get("page_flip") or {}
    arm_hole = None
    if pfb.get("front"):  # embaixo do braço que vira peça própria: a cena sem ele, no contorno todo
        fill = cfg["bones"][pfb["occluders"][0]].get("fill", "")
        if fill.endswith(".png"):
            fm = np.zeros((h, w), np.uint8)
            for poly in pfb["front"]:
                cv2.fillPoly(fm, [np.array(poly, np.int32)], 1)
            fm = cv2.dilate(fm, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))).astype(np.float32)
            _, fa = RR.to_art(a, np.clip(cv2.GaussianBlur(fm, (0, 0), 3), 0, 1), A, (AW, AH), gains, offs)
            src = art_of(RG.load_like(RG.raw_dir(v) / fill, a))
            base_rgb = base_rgb * (1 - fa[..., None]) + src * fa[..., None]
            base_al = np.maximum(base_al, fa * alpha)
            arm_hole = fa
    base_asset = doc.asset(out_dir, "base", base_rgb, base_al)
    # braço com contorno traçado (page_flip.front): na zona dos ossos dele só o contorno se mexe; o
    # avental atrás da pena fica na base (senão gira junto quando a mão levanta)
    fig_al = alpha * moving * person
    pf_ = cfg.get("page_flip") or {}
    front_rigid, rigid_w = None, []
    if pf_.get("front"):
        fm = np.zeros((h, w), np.float32)
        for poly in pf_["front"]:
            cv2.fillPoly(fm, [np.array(poly, np.int32)], 1.0)
        _, front_art = RR.to_art(a, np.clip(cv2.GaussianBlur(fm, (0, 0), 1.2), 0, 1), A, (AW, AH), gains, offs)
        zone = np.max([infl[names.index(b)] for b in pf_["occluders"]], axis=0)
        zone = np.clip(zone * 4, 0, 1)
        fig_al = fig_al * (1 - zone)  # o braço vira peça própria (maos_frente), por cima da folha
        if arm_hole is not None:  # inclusive o que do contorno cai fora das regiões dos ossos
            fig_al = fig_al * (1 - np.clip(arm_hole * 1.5, 0, 1))
        front_rigid = np.ones((AH, AW), np.float32)
        # peso de cada osso do braço sem a máscara da pessoa e bem espalhado (cobre o contorno todo)
        rigid_w = [np.clip(cv2.GaussianBlur(poly_art(cfg["bones"][n]["region"], A, (AW, AH)), (0, 0), 6 * RR.K) * 2, 0, 1)
                   if n in pf_["occluders"] else np.zeros((AH, AW), np.float32) for n in names]
    fig_asset = doc.asset(out_dir, "figura", rest_art, fig_al)

    # ossos: raiz parada + móveis (filho começa na ponta do pai)
    bones = [{"id": "fixo", "parent": None, "x": 0.0, "y": 0.0, "rotation": 0.0, "length": 1.0}]
    world: dict[str, list[float]] = {"fixo": [1, 0, 0, 1, 0, 0]}
    rest_rot: dict[str, float] = {}  # rotação de repouso (relativa ao pai)
    abs_rot: dict[str, float] = {}  # ângulo no mundo
    for name, b in cfg["bones"].items():
        p0, p1 = RR.pt(A, b["pivot"]), RR.pt(A, b["tip"])
        d = p1 - p0
        th, ln = math.atan2(d[1], d[0]), float(np.linalg.norm(d))
        par = b.get("parent")
        rel = th - abs_rot[par] if par else th
        entry = {"id": name, "parent": par, "rotation": round(rel, 6), "length": round(ln, 4)}
        if not par:
            entry.update({"x": round(float(p0[0]), 3), "y": round(float(p0[1]), 3)})
        bones.append(entry)
        rest_rot[name] = rel
        abs_rot[name] = th
        world[name] = [math.cos(th), math.sin(th), -math.sin(th), math.cos(th), float(p0[0]), float(p0[1])]

    # malha: grade fina nas células com tinta; pesos = regiões borradas (até 2 ossos)
    cell = int(cfg.get("cell", 6))  # lado da célula da malha (px do artboard); vinhetas grandes: 8
    mesh_bones = ["fixo"] + names

    def grid_mesh(got, cell_, rigid=None):
        ox, oy = got[1]
        al = got[2]
        ah_, aw_ = al.shape
        ink = cv2.dilate((al > 0.02).astype(np.uint8), np.ones((5, 5), np.uint8))
        nx, ny = math.ceil(aw_ / cell_), math.ceil(ah_ / cell_)
        idx, verts, tris = {}, [], []

        def vid_(i, j):
            if (i, j) not in idx:
                idx[(i, j)] = len(verts)
                verts.append((min(i * cell_, aw_), min(j * cell_, ah_)))
            return idx[(i, j)]

        for j in range(ny):
            for i in range(nx):
                if ink[j * cell_:(j + 1) * cell_, i * cell_:(i + 1) * cell_].any():
                    q = vid_(i, j), vid_(i + 1, j), vid_(i + 1, j + 1), vid_(i, j + 1)
                    tris += [q[0], q[1], q[2], q[0], q[2], q[3]]
        wts = []
        for px, py in verts:
            X_, Y_ = int(min(AW - 1, px + ox)), int(min(AH - 1, py + oy))
            ws = np.array([m[Y_, X_] for m in infl], float)
            # filho domina o pai onde os dois valem (mão sobre o antebraço)
            for k, n in enumerate(names):
                par = cfg["bones"][n].get("parent")
                if par:
                    ws[names.index(par)] *= 1 - ws[k]
            allw = np.concatenate([[max(0.0, 1 - ws.sum())], ws])
            if rigid is not None and rigid[Y_, X_] > 0.5:
                # dentro do contorno do braço: inteiro nos ossos do braço (sem o fixo esticar a borda)
                aw = np.array([rigid_w[k][Y_, X_] for k in range(len(names))], float)
                for k, n in enumerate(names):
                    par = cfg["bones"][n].get("parent")
                    if par:
                        aw[names.index(par)] *= 1 - aw[k] / max(aw.max(), 1e-9)
                allw = np.concatenate([[0.0], aw])
            top = np.argsort(-allw)[:2]
            tw = allw[top] / max(allw[top].sum(), 1e-9)
            wts += [int(top[0]), round(float(tw[0]), 4), int(top[1]), round(float(tw[1]), 4)]
        if len(verts) > 65535:
            raise SystemExit("malha grande demais para índices de 16 bits; aumente `cell`")
        return {  # sem "uv": o player tira da posição dentro do retângulo da imagem (meshUv)
            "v": [round(c, 2) for px, py in verts for c in (px + ox, py + oy)],
            "tri": tris,
            "w": wts,
            "bones": mesh_bones,
            "bind": [[round(x, 6) for x in world[b]] for b in mesh_bones],
        }

    mesh = grid_mesh(fig_asset, cell)
    verts = mesh["v"][::2]
    tris = mesh["tri"]

    # trocas de rosto (piscar, olhar sorrindo): o Gemini pinta a expressão no repouso (rig.py overlay);
    # recorta só a região do rosto, presa 100% a um osso (gira junto com a cabeça); opacidade animada
    patches: dict = {}
    for pname, pc in cfg.get("patches", {}).items():
        img = RG.load_like(RG.raw_dir(v) / pc["overlay"], a)
        x0, y0, x1, y1 = pc["region"]
        m = np.zeros((h, w), np.float32)
        m[y0:y1, x0:x1] = 1
        m = np.clip(cv2.GaussianBlur(m, (0, 0), pc.get("feather", 10)) * 1.4, 0, 1)
        rgb, al = RR.to_art(img, m, A, (AW, AH), gains, offs)
        got = doc.asset(out_dir, f"rosto_{pname}", rgb, al * alpha)
        if not got:
            continue
        (px0, py0), (ph_, pw_) = got[1], got[2].shape
        quad = [px0, py0, px0 + pw_, py0, px0 + pw_, py0 + ph_, px0, py0 + ph_]
        patches[pname] = {
            "id": f"rosto_{pname}", "image": got[0], "opacity": 0,
            "mesh": {"v": quad, "uv": [0, 0, 1, 0, 1, 1, 0, 1], "tri": [0, 1, 2, 0, 2, 3],
                     "w": [1, 1, 0, 0] * 4, "bones": ["fixo", pc["bone"]],
                     "bind": [[1, 0, 0, 1, 0, 0], [round(x, 6) for x in world[pc["bone"]]]]},
        }

    # página virando: quadros renderizados aqui, por cima de tudo, com a silhueta das mãos recortada
    flips: list[dict] = []
    front: list[dict] = []
    pf = cfg.get("page_flip")
    if pf:
        for k, (rgb, al) in enumerate(flip_frames(a, pf, int(pf.get("frames", 20)))):
            rgb_art, al_art = RR.to_art(rgb, al, A, (AW, AH), gains, offs)
            got = doc.asset(out_dir, f"pagina{k + 1:02d}", rgb_art, al_art, pf.get("quality", 80))
            if got:
                flips.append({"id": f"pagina{k + 1:02d}", "image": got[0], "opacity": 0})
        print(f"[{vid}] página virando: {len(flips)} quadros")
        # mãos na frente da folha: cópia só das mãos (silhueta exata), com a MESMA malha/ossos da figura,
        # desenhada por cima da página que vira; a mão pode se mexer (afastar) e o recorte vai junto
        if pf.get("occluders"):
            if pf.get("front"):  # contorno traçado como guia; o GrabCut acha a borda de tinta exata
                fm = np.zeros((h, w), np.uint8)
                for poly in pf["front"]:
                    cv2.fillPoly(fm, [np.array(poly, np.int32)], 1)
                hands = refine_cut(a, fm, pf.get("front_band", 14), pf.get("front_cut"))
            else:
                hands = hand_silhouettes(a, [cfg["bones"][b]["region"] for b in pf["occluders"]])
            _, h_al = RR.to_art(a, hands, A, (AW, AH), gains, offs)
            got = doc.asset(out_dir, "maos_frente", rest_art, h_al * alpha)
            if got:
                front.append({"id": "maos_frente", "image": got[0], "opacity": 1,
                              "mesh": grid_mesh(got, cell, rigid=front_rigid)})

    # poses desenhadas (ex.: mão no canto da página para virá-la): do overlay do Gemini só entram a
    # silhueta da mão nova (por cima da folha que vira) e um "tampão" onde a mão estava antes
    pose_cover, pose_hand = [], []
    reach: dict = {}  # pose -> dados do caminho da mão (osso de trilho + osso da mão)
    for pname, pc in cfg.get("poses", {}).items():
        img = RG.load_like(RG.raw_dir(v) / pc["overlay"], a)
        hand = hand_silhouettes(img, [pc["hand"]])
        # papel que a mão pinça: por cor (creme: R-G pequeno; paper_rg 0 desliga, quando o brilho da pele
        # tem o mesmo tom) e/ou pelo polígono hand_cut
        f_ = img.astype(np.float32)
        paper = ((f_[..., 0] - f_[..., 1]) < pc.get("paper_rg", 62)) & (f_.sum(-1) > 480)
        paper = cv2.morphologyEx(paper.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        hand = hand * (1 - cv2.dilate(paper, np.ones((5, 5), np.uint8)).astype(np.float32))
        # fica a mão (e os dedos curvados sob a folha); cai o que sobrou solto do papel
        hb = (hand > 0.5).astype(np.uint8)
        n_, lab, stats, _ = cv2.connectedComponentsWithStats(hb)
        hb = np.isin(lab, [k for k in range(1, n_) if stats[k, cv2.CC_STAT_AREA] >= pc.get("min_part", 400)]).astype(np.uint8)
        hb = cv2.morphologyEx(hb, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5)))
        for poly in pc.get("hand_cut", []):
            cv2.fillPoly(hb, [np.array(poly, np.int32)], 0)
        hand = np.clip(cv2.GaussianBlur(hb.astype(np.float32), (0, 0), 1.0), 0, 1)
        # tampão: a pose SEM a mão (furo da mão preenchido), sobre a mão e o antebraço antigos inteiros
        old_ = np.zeros((h, w), np.uint8)
        for poly in [cfg["bones"][pc["cover"]]["region"], *pc.get("cover_extra", [])]:
            cv2.fillPoly(old_, [np.array(poly, np.int32)], 1)
        old_ = cv2.dilate(old_, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (41, 41))).astype(np.float32)
        cover = np.clip(cv2.GaussianBlur(old_, (0, 0), 5), 0, 1)
        if pc.get("clean"):  # cena em repouso SEM a mão livre (Gemini): página plana, sem a folha levantada
            holed = RG.load_like(RG.raw_dir(v) / pc["clean"], a)
        else:
            holed = cv2.inpaint(img, (cv2.dilate((hand > 0.2).astype(np.uint8), np.ones((9, 9), np.uint8)) * 255),
                                9, cv2.INPAINT_TELEA)
        for lst, nm, src, mk in ((pose_cover, f"pose_{pname}_tampa", holed, cover),
                                 (pose_hand, f"pose_{pname}_mao", img, hand)):
            rgb_art, al_art = RR.to_art(src, mk, A, (AW, AH), gains, offs)
            got = doc.asset(out_dir, nm, rgb_art, al_art * alpha)
            if got:
                lst.append({"id": nm, "image": got[0], "opacity": 0, "pose": pname, "got": got})
        rc = pc.get("reach")
        if not rc or not pose_hand or pose_hand[-1]["pose"] != pname:
            continue
        # a mão VAI até o canto: malha da pose presa à manga (osso fixo) e à mão (osso que anda por um
        # trilho: raiz parada no ponto final, comprimento/ângulo animados = deslocamento da mão)
        hd = pose_hand[-1]
        (hx0, hy0), hal = hd["got"][1], hd["got"][2]
        hh_, hw_ = hal.shape
        c_ = RR.pt(A, rc["cuff"])
        w_ = RR.pt(A, rc["wrist"])
        h1 = RR.pt(A, rc["to"])
        axis = w_ - c_
        cellp = 5
        hidx, hverts, htris = {}, [], []
        hink = cv2.dilate((hal > 0.02).astype(np.uint8), np.ones((5, 5), np.uint8))

        def hv(i, j):
            if (i, j) not in hidx:
                hidx[(i, j)] = len(hverts)
                hverts.append((min(i * cellp, hw_), min(j * cellp, hh_)))
            return hidx[(i, j)]

        for j in range(math.ceil(hh_ / cellp)):
            for i in range(math.ceil(hw_ / cellp)):
                if hink[j * cellp:(j + 1) * cellp, i * cellp:(i + 1) * cellp].any():
                    q = hv(i, j), hv(i + 1, j), hv(i + 1, j + 1), hv(i, j + 1)
                    htris += [q[0], q[1], q[2], q[0], q[2], q[3]]
        hw = []
        for px, py in hverts:
            u = float(np.dot(np.array([px + hx0, py + hy0]) - c_, axis) / np.dot(axis, axis))
            u = min(1.0, max(0.0, u))
            wb = u * u * (3 - 2 * u)  # manga parada, punho/mão inteiros no osso da mão
            hw += [1, round(wb, 4), 0, round(1 - wb, 4)]
        trail, hbone = f"trilho_{pname}", f"mao_{pname}"
        # repouso = mão no começo do caminho (invisível); a ligação da malha é a pose final (deslocamento 0)
        d0 = RR.pt(A, rc["from"]) - h1
        th0 = math.atan2(d0[1], d0[0])
        bones.append({"id": trail, "parent": None, "x": round(float(h1[0]), 3), "y": round(float(h1[1]), 3),
                      "rotation": round(th0, 5), "length": round(float(np.linalg.norm(d0)), 2)})
        bones.append({"id": hbone, "parent": trail,
                      "rotation": round(math.radians(rc.get("turn", 0)) - th0, 5), "length": 1.0})
        world[hbone] = [1, 0, 0, 1, float(h1[0]), float(h1[1])]
        hd["mesh"] = {
            "v": [round(c, 2) for px, py in hverts for c in (px + hx0, py + hy0)],
            "tri": htris, "w": hw, "bones": ["fixo", hbone],
            "bind": [[1, 0, 0, 1, 0, 0], [round(x, 6) for x in world[hbone]]],
        }
        reach[pname] = {"trail": trail, "hand": hbone, "from": RR.pt(A, rc["from"]) - h1,
                        "turn": math.radians(rc.get("turn", 0)),
                        "lift": rc.get("lift", 30) * float(np.hypot(A[0, 0], A[1, 0])),
                        "fade": rc.get("fade", 0.3)}
        print(f"[{vid}] pose {pname}: mão com {len(hverts)} vértices, anda {np.linalg.norm(reach[pname]['from']):.0f} px")

    # animações procedurais em cima do andamento
    beat_s = 60.0 / cfg["bpm"]
    beat_f = beat_s * FPS
    if abs(beat_f - round(beat_f)) > 1e-6:
        raise SystemExit(f"bpm {cfg['bpm']}: um tempo precisa ter um número inteiro de quadros a {FPS} fps")
    beat_f = int(round(beat_f))
    anims = []
    for an in cfg["anims"]:
        frames = an["beats"] * beat_f
        tracks: dict = {}
        periods: dict = {}
        looks = an.get("looks", [])  # [{bone, angle, from, to}]: olha para cima e volta (em tempos)
        for bone, mo in cfg["motions"].items():
            looking = any(lk["bone"] == bone or bone in lk.get("quiet", []) for lk in looks)
            # dedilhar/bater o pé/rabiscar repetem a cada tempo: um tempo só, repetido pelo player (periods)
            if mo["kind"] in ("strum", "tap", "scribble") and not mo.get("sway") and not looking:
                keys = [[f, round(rest_rot[bone] + math.radians(motion_value(mo, f / beat_f)), 5)]
                        for f in list(range(0, beat_f, STEP)) + [beat_f]]
                tracks[bone] = {"rotation": keys}
                periods[bone] = beat_f
                continue
            # movimentos lentos (cabeça, troca de acorde): menos chaves; rápidos parados por `quiet`: todas
            step = STEP if mo["kind"] in ("strum", "tap", "scribble") else 2 * STEP
            keys = []
            for f in list(range(0, frames, step)) + [frames]:
                beat = f / beat_f
                off = motion_value(mo, beat)
                envs = []
                for lk in looks:
                    u = min(1.0, max(0.0, (beat - lk["from"]) / (lk["to"] - lk["from"])))
                    envs.append((lk, math.sin(math.pi * u) ** 2))
                for lk, env in envs:
                    if bone in lk.get("quiet", []):  # para o que estava fazendo enquanto olha
                        off *= 1 - min(1.0, env * 1.6)
                for lk, env in envs:
                    if lk["bone"] == bone:
                        off += lk["angle"] * env
                keys.append([f, round(rest_rot[bone] + math.radians(off), 5)])
            tracks[bone] = {"rotation": keys}
        for pname in patches:  # opacidade: piscadas nos tempos dados + olhares que usam este rosto
            keys = {0: 0.0, frames: 0.0}
            if pname == an.get("blink_patch", "blink"):
                for b in an.get("blinks", []):  # fecha ~70 ms, segura ~50 ms, abre ~100 ms
                    f0 = int(round(b * beat_f))
                    keys.update({f0 - 1: 0.0, f0 + 4: 1.0, f0 + 7: 1.0, f0 + 13: 0.0})
            for lk in looks:
                if lk.get("patch") == pname:
                    for f in range(0, frames + 1, STEP):
                        u = min(1.0, max(0.0, (f / beat_f - lk["from"]) / (lk["to"] - lk["from"])))
                        env = math.sin(math.pi * u) ** 2
                        keys[f] = max(keys.get(f, 0.0), round(min(1.0, env * 2.2), 4))
            tracks[patches[pname]["id"]] = {"opacity": [[f, keys[f]] for f in sorted(keys)]}
        for k, fl in enumerate(flips):  # um quadro da página por vez (troca seca de 1 quadro)
            keys = [[0, 0.0], [frames, 0.0]]
            if an.get("flip"):
                f0, f1 = an["flip"]["from"] * beat_f, an["flip"]["to"] * beat_f
                a0 = int(round(f0 + (f1 - f0) * k / len(flips)))
                a1 = int(round(f0 + (f1 - f0) * (k + 1) / len(flips)))
                keys = [[0, 0.0], [a0 - 1, 0.0], [a0, 1.0], [max(a0, a1 - 1), 1.0], [max(a0 + 1, a1), 0.0], [frames, 0.0]]
            tracks[fl["id"]] = {"opacity": keys}
        ps = an.get("pose")
        for d in pose_cover + pose_hand:  # a mão vai até a pose (aparece no começo do caminho) e volta
            keys = [[0, 0.0], [frames, 0.0]]
            if ps and ps["name"] == d["pose"]:
                (i0, i1), (o0, o1) = ps["in"], ps["out"]
                fd = reach[d["pose"]]["fade"] if d["pose"] in reach else 1.0
                keys = [[0, 0.0]] + [[int(round(b * beat_f)), val] for b, val in
                                     ((i0, 0.0), (i0 + (i1 - i0) * fd, 1.0),
                                      (o1 - (o1 - o0) * fd, 1.0), (o1, 0.0))] + [[frames, 0.0]]
            tracks[d["id"]] = {"opacity": keys}
        if ps and ps["name"] in reach:
            rc = reach[ps["name"]]
            (i0, i1), (o0, o1) = [[b * beat_f for b in ab] for ab in (ps["in"], ps["out"])]
            fs = sorted(set(list(range(0, frames, STEP)) + [frames] +
                            [int(round(x)) for x in (i0, i1, o0, o1)]))
            ths, lns, rots, scs = [], [], [], []
            for f in fs:
                if f <= i0 or f >= o1:
                    e = 0.0
                elif f < i1:
                    e = (f - i0) / (i1 - i0)
                elif f <= o0:
                    e = 1.0
                else:
                    e = 1 - (f - o0) / (o1 - o0)
                e = e * e * (3 - 2 * e)  # parte devagar, acelera, assenta devagar
                d_ = rc["from"] * (1 - e) + np.array([0.0, -rc["lift"] * math.sin(math.pi * e)])
                ths.append(math.atan2(d_[1], d_[0]) if np.linalg.norm(d_) > 1e-3 else (ths[-1] if ths else 0.0))
                lns.append(float(np.linalg.norm(d_)))
                rots.append(rc["turn"] * (1 - e))
                scs.append(1 + 0.04 * math.sin(math.pi * e))  # sobe um pouco (mais perto de quem olha)
            ths = list(np.unwrap(ths))  # começa no ângulo de repouso do osso (o mesmo atan2)
            tracks[rc["trail"]] = {"rotation": [[f, round(t, 5)] for f, t in zip(fs, ths)],
                                   "length": [[f, round(ln, 2)] for f, ln in zip(fs, lns)]}
            tracks[rc["hand"]] = {"rotation": [[f, round(r - t, 5)] for f, r, t in zip(fs, rots, ths)],
                                  "scale": [[f, round(s, 4)] for f, s in zip(fs, scs)]}
        tracks = {o: {p: thin(k, THIN_TOL[p]) for p, k in props.items()} for o, props in tracks.items()}
        entry = {"name": f"gesto_{an['name']}", "frames": frames, "weight": an.get("weight", 1), "tracks": tracks}
        for key_ in ("weightBy",):
            if an.get(key_):
                entry[key_] = an[key_]
        if an.get("effects"):  # estado entre trechos (ex.: linhas escritas desde a última página)
            entry["effects"] = [{**{k: e[k] for k in ("var", "add", "to") if k in e},
                                 "from": int(round(e["from"] * beat_f)), "until": int(round(e["until"] * beat_f))}
                                for e in an["effects"]]
        if periods:
            entry["periods"] = periods
        anims.append(entry)
        print(f"[{vid}] {an['name']}: {an['beats']} tempos, {frames / FPS:.1f} s")

    # a pose de "parado" (antes do primeiro tempo) tem que casar com o quadro 0 dos loops
    for b in bones:
        if b["id"] in cfg["motions"]:
            b["rotation"] = round(rest_rot[b["id"]] + math.radians(motion_value(cfg["motions"][b["id"]], 0.0)), 5)
    puppet = {
        "size": [AW, AH],
        "fps": FPS,
        "images": doc.images,
        "bones": bones,
        "draw": [
            {"id": "base", "image": base_asset[0], "opacity": 1},
            {"id": "figura", "image": fig_asset[0], "opacity": 1, "mesh": mesh},
            *patches.values(),
            *[{k: d[k] for k in ("id", "image", "opacity")} for d in pose_cover],
            *flips,
            *front,
            *[{k: d[k] for k in ("id", "image", "opacity", "mesh") if k in d} for d in pose_hand],
        ],
        "anims": anims,
        "idleMs": cfg.get("idleMs", [300, 600]),
        "weights": {"idle": 0, "gesture": 1},
    }
    if cfg.get("vars"):  # variáveis de estado (sem camadas): só pesam no sorteio dos trechos
        puppet["vars"] = {k: {"max": vv["max"], "layers": []} for k, vv in cfg["vars"].items()}
    if cfg.get("music"):  # o site toca as notas no tempo do gesto (GuildPuppetCanvas -> cue)
        puppet["music"] = arrange(cfg["music"], cfg["bpm"])
        if any(an["beats"] % puppet["music"]["length"] for an in cfg["anims"]):
            raise SystemExit("cada trecho precisa durar um múltiplo da música (senão ela corta no meio)")
    (out_dir / "puppet.json").write_text(json.dumps(puppet, separators=(",", ":")), encoding="utf-8")
    kb = sum(p.stat().st_size for p in out_dir.glob("*.webp")) / 1024
    print(f"[{vid}] marionete em loop: {len(verts)} vértices, {len(tris) // 3} triângulos, imagens {kb:.0f} KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", required=True)
    ap.add_argument("--site", action="store_true", help="copia para o site e liga no hall-life.json")
    args = ap.parse_args()
    v = next(x for x in C.load_manifest()["vignettes"] if x["id"] == args.only)
    st = C.load_state()["vignettes"][args.only]
    build(v, st)
    if args.site:
        RR.install(args.only)


if __name__ == "__main__":
    main()
