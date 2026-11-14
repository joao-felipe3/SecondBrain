"""
Quadros intermediários entre as cabeças (repouso <-> olhar) para o giro da cabeça ficar contínuo.

O repouso é o "centro" de todos os olhares (a cabeça sempre passa por ele), então cada giro é uma
ponta repouso -> variante. Entre as duas, dois jeitos de ganhar quadros:

  flow  (de graça)  metamorfose por fluxo óptico (DIS) nos dois sentidos, como a do rig.py: serve
                    quando as duas cabeças se parecem (perfil, cabeça levantada)
  gen   (Gemini)    o modelo vê o repouso e a variante e desenha a pose do MEIO (como inbetween.py), com a
                    mesma checagem: o quadro tem que ficar longe dos dois e no caminho entre eles. Gasta
                    crédito: use onde o fluxo mostrar duas cabeças sobrepostas (ex.: virar a nuca)
  rife              (recomendado) quadros q25/q75 pela rede RIFE (rife-anime): uma cabeça limpa, sem duplo contorno
  quarters          com o quadro do meio, o fluxo faz só o meio de cada metade (q25 e q75): vizinhas próximas
  sheet             folha de revisão: repouso | intermediários | variante

  python Frontend/scripts/hall-life/head_tween.py flow  --only board-readers --names orc_esq orc_dir ... [--ts 0.33 0.67]
  python Frontend/scripts/hall-life/head_tween.py gen   --only board-readers --names orc_dir --change "..." [--pct 50]
  python Frontend/scripts/hall-life/head_tween.py gen   --only board-readers --names orc_dir --to orc_dir_m50 --tag g25 --change "..."  # q25 limpo
  python Frontend/scripts/hall-life/head_tween.py quarters --only board-readers --names orc_esq ...
  python Frontend/scripts/hall-life/head_tween.py sheet --only board-readers --names orc_esq orc_dir ...

Saídas (work/raw/<id>/): overlay_<nome>_f33.png (fluxo, t=0,33), overlay_<nome>_m50.png (Gemini, meio).
Depois é só ligar como `patches` no vignettes.json (ver README).
"""
from __future__ import annotations

import argparse
import io
import shutil

import cv2
import numpy as np
from PIL import Image, ImageDraw

import common as C
import rig as RG

# caixa (px do quadro bruto) em volta de cada cabeça; mexe só ali
BOXES = {"orc": (500, 620, 820, 980), "hob": (1090, 1210, 1440, 1520)}


def box_of(name: str, margin: int = 0):
    x0, y0, x1, y1 = BOXES[name.split("_")[0]]
    return x0 - margin, y0 - margin, x1 + margin, y1 + margin


def load(v: dict, st: dict, path):
    a = RG.load_rest(v, st)
    return a, RG.load_like(path, a)


def person_mask(v: dict, shape, box) -> np.ndarray:
    """Silhueta do personagem (união dos quadros, da extração) no quadro bruto, recortada na caixa; 0..1."""
    import json
    import extract as X
    meta = json.loads((C.EXTRACT / v["id"] / "meta.json").read_text(encoding="utf-8"))
    union = np.asarray(Image.open(C.EXTRACT / v["id"] / "mask-union.png"), np.float32) / 255
    plate = X.to_np(Image.open(C.PLATES / f"{v['id']}.png"))
    ph, pw = plate.shape[:2]
    cx0, cy0, cx1, cy1 = meta["crop_in_plate"]
    full = np.zeros((ph, pw), np.float32)
    full[cy0:cy1, cx0:cx1] = cv2.resize(union, (cx1 - cx0, cy1 - cy0))
    big = cv2.resize(full, (shape[1], shape[0]), interpolation=cv2.INTER_LINEAR)
    x0, y0, x1, y1 = box
    return big[y0:y1, x0:x1]


def _outline(rgb: np.ndarray) -> np.ndarray:
    """Mapa suave do contorno (distância ao traço escuro): o fluxo segue o DESENHO, não o brilho do sombreado."""
    g = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    dist = cv2.distanceTransform(1 - (g < 70).astype(np.uint8), cv2.DIST_L2, 3)
    return np.clip(255 - dist * 6, 0, 255).astype(np.uint8)


def morph(a: np.ndarray, b: np.ndarray, box, ts, alphas=None, mask=None) -> list[np.ndarray]:
    """Quadros em t (0 = a, 1 = b) por fluxo óptico nos dois sentidos; devolve quadros inteiros (só a caixa muda).

    `ts`: quanto cada ponto anda do caminho de a até b (a forma). `alphas`: quanto da mistura é b (padrão = t):
    com alpha menor que t uma imagem domina e a outra só entra aos poucos (sem o duplo contorno de a 50%).
    O fluxo (DIS fino) é calculado primeiro nos CONTORNOS (distância ao traço) e refinado no brilho; com `mask`
    (silhueta do personagem) só ela se deforma e o fundo fica parado (sem rabiscos no cenário)."""
    x0, y0, x1, y1 = box
    ca, cb = a[y0:y1, x0:x1], b[y0:y1, x0:x1]
    g = lambda im: cv2.cvtColor(im, cv2.COLOR_RGB2GRAY)  # noqa: E731

    def dis(src, dst):
        d = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        d.setFinestScale(0)
        d.setPatchSize(12)
        d.setPatchStride(3)
        d.setGradientDescentIterations(40)
        d.setVariationalRefinementIterations(12)
        return d.calc(dst, src, None)  # dst(x) ~ src(x + F)

    h, w = ca.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    rm = lambda im, fl, k: cv2.remap(im, gx + k * fl[..., 0], gy + k * fl[..., 1], cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)  # noqa: E731
    F = dis(_outline(ca), _outline(cb))
    G = dis(_outline(cb), _outline(ca))
    F = F + dis(g(rm(ca, F, 1.0)), g(cb))
    G = G + dis(g(rm(cb, G, 1.0)), g(ca))
    if mask is not None:
        pm = np.clip(cv2.GaussianBlur(cv2.dilate(mask, np.ones((25, 25), np.uint8)), (0, 0), 6), 0, 1)[..., None]
        F, G = F * pm, G * pm
    out = []
    for i, t in enumerate(ts):
        al = t if alphas is None else alphas[i]
        mix = rm(ca, F, t).astype(np.float32) * (1 - al) + rm(cb, G, 1 - t).astype(np.float32) * al
        full = a.copy()
        full[y0:y1, x0:x1] = np.clip(mix, 0, 255).round().astype(np.uint8)
        out.append(full)
    return out


RIFE_DIR = C.WORK / "tools" / "rife"  # rife-ncnn-vulkan.exe + modelo rife-anime (ver README); ignorado pelo git


def rife_mid(a: np.ndarray, b: np.ndarray, box, flags=()) -> np.ndarray:
    """Quadro do MEIO entre `a` e `b` pela rede RIFE (modelo rife-anime, feito para desenho animado). Só a
    caixa da cabeça passa pela rede; o resto do quadro é o de `a`. Devolve o quadro inteiro."""
    import subprocess
    import tempfile
    from pathlib import Path

    exe = RIFE_DIR / "rife-ncnn-vulkan.exe"
    if not exe.exists():
        raise SystemExit(f"RIFE não instalado em {RIFE_DIR} (ver README: 'RIFE')")
    x0, y0, x1, y1 = box
    x1 -= (x1 - x0) % 2  # a rede pede dimensões pares
    y1 -= (y1 - y0) % 2
    with tempfile.TemporaryDirectory() as td:
        t = Path(td)
        Image.fromarray(a[y0:y1, x0:x1]).save(t / "a.png")
        Image.fromarray(b[y0:y1, x0:x1]).save(t / "b.png")
        r = subprocess.run([str(exe), "-0", str(t / "a.png"), "-1", str(t / "b.png"), "-o", str(t / "m.png"),
                            "-m", str(RIFE_DIR / "rife-anime"), "-g", "0", *flags], capture_output=True, text=True)
        if not (t / "m.png").exists():
            raise SystemExit(f"RIFE falhou: {r.stderr[-400:]}")
        mid = np.asarray(Image.open(t / "m.png").convert("RGB"))
    full = a.copy()
    full[y0:y1, x0:x1] = mid
    return full


def cmd_rife(args):
    """Quadros intermediários pela rede RIFE: q25 (entre o repouso e o meio) e q75 (entre o meio e o final), e o
    próprio meio (m50) quando `--make-mid` (quando não há um meio desenhado pelo Gemini)."""
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    d = RG.raw_dir(v)
    for name in args.names:
        box = box_of(name, 20)
        a, fin = load(v, st, d / f"overlay_{name}.png")
        mid_path = d / f"overlay_{name}_m50.png"
        if args.make_mid or not mid_path.exists():
            Image.fromarray(rife_mid(a, fin, box)).save(mid_path)
            print(f"[{v['id']}] {name}: m50 por RIFE")
        _, m = load(v, st, mid_path)
        if args.deep:
            # 7 quadros p1..p7 entre o repouso e o final, por recursão: passos de 1/8 do caminho. O RIFE erra bem
            # menos quando as duas imagens estão próximas (a mancha clara do rosto, a nuvem sobre a cabeça)
            fl = ["-x"]  # TTA espacial: bordas um pouco mais limpas
            q25, q75 = rife_mid(a, m, box, fl), rife_mid(m, fin, box, fl)
            pts = {0: a, 2: q25, 4: m, 6: q75, 8: fin}
            for k in (1, 3, 5, 7):
                pts[k] = rife_mid(pts[k - 1], pts[k + 1], box, fl)
            for k in range(1, 8):
                Image.fromarray(pts[k]).save(d / f"overlay_{name}_p{k}.png")
            print(f"[{v['id']}] {name}: p1..p7 por RIFE (passos de 1/8)")
            continue
        Image.fromarray(rife_mid(a, m, box)).save(d / f"overlay_{name}_q25.png")
        Image.fromarray(rife_mid(m, fin, box)).save(d / f"overlay_{name}_q75.png")
        print(f"[{v['id']}] {name}: q25 e q75 por RIFE")


def cmd_flow(args):
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    for name in args.names:
        a, b = load(v, st, RG.raw_dir(v) / f"overlay_{name}.png")
        box = box_of(name, 20)
        frames = morph(a, b, box, args.ts, mask=person_mask(v, a.shape, box))
        for t, f in zip(args.ts, frames):
            Image.fromarray(f).save(RG.raw_dir(v) / f"overlay_{name}_f{int(round(t * 100))}.png")
        print(f"[{v['id']}] {name}: {len(frames)} intermediários por fluxo (t = {', '.join(str(t) for t in args.ts)})")


def cmd_quarters(args):
    """Com o quadro do meio (Gemini), o fluxo faz só o meio de cada metade: repouso -> meio (q25) e meio -> final (q75).
    Vizinhas bem próximas: o fluxo não duplica contornos como fazia direto repouso -> final."""
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    d = RG.raw_dir(v)
    for name in args.names:
        mid = d / f"overlay_{name}_m50.png"
        if not mid.exists():
            print(f"[{v['id']}] {name}: sem quadro do meio (gen); pulando")
            continue
        a, m = load(v, st, mid)
        _, x = load(v, st, d / f"overlay_{name}.png")
        box = box_of(name, 20)
        # q25: pontos a meio caminho do repouso ao meio, mas a mistura é dominada pelo repouso (alpha 0,3): nítido
        for tag, (p0, p1, al) in (("q25", (a, m, 0.3)), ("q75", (m, x, 0.5))):
            Image.fromarray(morph(p0, p1, box, [0.5], [al], person_mask(v, a.shape, box))[0]).save(d / f"overlay_{name}_{tag}.png")
        print(f"[{v['id']}] {name}: q25 e q75 por fluxo entre vizinhas")


def cmd_gen(args):
    """Gemini desenha o meio entre o repouso e a variante (vendo os dois), com checagem de caminho."""
    key = C.load_env_key()
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    from generate import TWEEN
    for name in args.names:
        # `--to`: outro quadro de destino (ex.: o do meio), para desenhar o quarto de caminho entre o repouso e ele
        dest = args.to or name
        tag = args.tag or f"m{args.pct}"
        a, b = load(v, st, RG.raw_dir(v) / f"overlay_{dest}.png")
        x0, y0, x1, y1 = box_of(name, 20)
        best = None
        for attempt in range(1, args.tries + 1):
            png = C.call_gemini_edit(key, manifest["model"], TWEEN.format(change=args.change, pct=args.pct),
                                     [Image.fromarray(a), Image.fromarray(b)], st["aspect"])
            tmp = RG.raw_dir(v) / f"overlay_{name}_{tag}-{attempt}.png"
            Image.open(io.BytesIO(png)).convert("RGB").save(tmp)
            m = RG.load_like(tmp, a)
            d = lambda p, q: float(np.abs(p[y0:y1, x0:x1].astype(np.float32) - q[y0:y1, x0:x1]).mean())  # noqa: E731
            dam, dmb, dab = d(a, m), d(m, b), d(a, b)
            # no caminho entre os dois: longe de ambos, e DENTRO do intervalo (nem mais longe do início que o fim,
            # nem mais longe do fim que o início): sem isso passam quadros que ultrapassam o destino (já aconteceu)
            ok = min(dam, dmb) >= 0.25 * dab and dam + dmb <= 1.9 * dab and dam < dab and dmb < dab
            print(f"[{v['id']}] {name} meio {attempt}: A>M {dam:.1f}  M>B {dmb:.1f}  A>B {dab:.1f}  {'OK' if ok else 'rejeitado'}")
            if ok and (best is None or abs(dam - dmb) < best[0]):
                best = (abs(dam - dmb), tmp)
        if best:
            shutil.copy(best[1], RG.raw_dir(v) / f"overlay_{name}_{tag}.png")
            print(f"[{v['id']}] {name}: escolhido {best[1].name} -> overlay_{name}_{tag}.png")
        else:
            print(f"[{v['id']}] {name}: nenhum meio passou na checagem (use só o fluxo ou mude o `change`)")


def cmd_sheet(args):
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    rows = []
    for name in args.names:
        a = RG.load_rest(v, st)
        x0, y0, x1, y1 = box_of(name)
        parts = [("repouso", a)]
        for tag in ("q25", "m50", "q75", "f33", "f67"):
            p = RG.raw_dir(v) / f"overlay_{name}_{tag}.png"
            if p.exists():
                parts.append((tag, RG.load_like(p, a)))
        parts.append((name, RG.load_like(RG.raw_dir(v) / f"overlay_{name}.png", a)))
        row = []
        for tag, im in parts:
            c = Image.fromarray(im[y0:y1, x0:x1]).resize((220, int(220 * (y1 - y0) / (x1 - x0))))
            ImageDraw.Draw(c).text((4, 4), f"{name} {tag}", fill=(255, 255, 0))
            row.append(c)
        rows.append(row)
    W = max(sum(c.width for c in r) for r in rows)
    H = sum(max(c.height for c in r) for r in rows)
    sheet = Image.new("RGB", (W, H))
    y = 0
    for r in rows:
        x = 0
        for c in r:
            sheet.paste(c, (x, y))
            x += c.width
        y += max(c.height for c in r)
    out = C.PREVIEWS / f"head_tween_{v['id']}.png"
    sheet.save(out)
    print("folha:", out)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    for n in ("flow", "gen", "quarters", "rife", "sheet"):
        p = sub.add_parser(n)
        p.add_argument("--only", required=True)
        p.add_argument("--names", nargs="+", required=True)
        if n == "rife":
            p.add_argument("--make-mid", action="store_true", help="refaz o meio (m50) também por RIFE")
            p.add_argument("--deep", action="store_true", help="7 quadros p1..p7 (passos de 1/8) em vez de q25/q75")
        if n == "flow":
            p.add_argument("--ts", nargs="+", type=float, default=[0.33, 0.67])
        if n == "gen":
            p.add_argument("--change", required=True, help="o movimento entre as duas poses (em inglês)")
            p.add_argument("--pct", type=int, default=50)
            p.add_argument("--tries", type=int, default=2)
            p.add_argument("--to", help="quadro de destino (nome do overlay), em vez do final: ex. orc_esq_m50")
            p.add_argument("--tag", help="sufixo do arquivo de saída (padrão m<pct>): ex. g25")
    args = ap.parse_args()
    {"flow": cmd_flow, "gen": cmd_gen, "quarters": cmd_quarters, "rife": cmd_rife, "sheet": cmd_sheet}[args.cmd](args)


if __name__ == "__main__":
    main()
