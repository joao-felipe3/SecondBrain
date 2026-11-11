"""
Mais intermediarios onde o movimento ainda "pula": acha os maiores saltos de cada gesto (gaps.py)
e desenha um quadro no MEIO de cada um, com o Gemini vendo os dois vizinhos.

Como os vizinhos ja sao proximos, o modelo consegue desenhar a pose do meio (com repouso e gesto
final distantes ele copiava a pose final). Cada resultado passa por uma checagem: tem que ficar
longe dos dois vizinhos e no caminho entre eles; senao tenta de novo (ate 3x) ou desiste.

  # gera (pode rodar uma vinheta por processo, em paralelo)
  python Frontend/scripts/hall-life/inbetween.py gen --only dwarf-crate [--threshold 40] [--max 2]
  # aplica no manifesto e renumera os arquivos (b_1, b_2, ...) — rodar uma vez, depois de todos
  python Frontend/scripts/hall-life/inbetween.py apply
  # descarta um intermediario ruim (renumera os outros)
  python Frontend/scripts/hall-life/inbetween.py drop --only planners-table --names d_3
"""
from __future__ import annotations

import argparse
import io
import json
import shutil

import cv2
import numpy as np
from PIL import Image

import common as C
from extract import align, color_match, to_np
from gaps import gaps, path_of
from generate import FRAME_N, TWEEN

PLANS = C.WORK / "inbetween"


def raw_path(v: dict, st: dict, name: str):
    return C.RAW / v["id"] / (f"a-{st['picked']}.png" if name == "a" else f"{name}.png")


def distances(x: Image.Image, m: Image.Image, y: Image.Image, plate: np.ndarray) -> tuple[float, float, float]:
    """Saltos X->M, M->Y e X->Y nos pixels que se movem (imagens alinhadas a placa)."""
    h, w = plate.shape[:2]
    arr = [color_match(align(to_np(i.resize((w, h), Image.LANCZOS)), plate), plate).astype(np.float32) for i in (x, m, y)]
    X, M, Y = arr
    moving = (np.abs(Y - X).max(axis=2) > 25) | (np.abs(M - X).max(axis=2) > 25)
    moving = cv2.dilate(moving.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    if not moving.any():
        return 0.0, 0.0, 0.0
    d = lambda a, b: float(np.abs(a - b).max(axis=2)[moving].mean())  # noqa: E731
    return d(X, M), d(M, Y), d(X, Y)


def cmd_gen(args):
    key = C.load_env_key()
    manifest, state = C.load_manifest(), C.load_state()
    model = manifest["model"]
    PLANS.mkdir(parents=True, exist_ok=True)
    for v in C.select(manifest, args.only, args.all):
        vid = v["id"]
        st = state["vignettes"][vid]
        plate = to_np(Image.open(C.PLATES / f"{vid}.png"))
        plan = {}
        for idx in range(1, len(v["frames"])):
            gesture = v["frames"][idx]["name"]
            names = path_of(v, idx)
            g = gaps(vid, names)
            big = sorted([(d, i) for i, d in enumerate(g) if d >= args.threshold], reverse=True)[: args.max]
            inserts = {}
            for d, i in sorted(big, key=lambda t: t[1]):
                a, b = names[i], names[i + 1]
                x = Image.open(raw_path(v, st, a)).convert("RGB")
                y = Image.open(raw_path(v, st, b)).convert("RGB").resize(x.size, Image.LANCZOS)
                change = v["frames"][idx]["change"]
                ok = None
                for attempt in range(1, 4):
                    print(f"[{vid}] {gesture}: meio de {a}>{b} (salto {d:.0f}) tentativa {attempt}...")
                    png = C.call_gemini_edit(key, model, TWEEN.format(change=change, pct=50), [x, y], st["aspect"])
                    m = Image.open(io.BytesIO(png)).convert("RGB")
                    dxm, dmy, dxy = distances(x, m, y, plate)
                    good = min(dxm, dmy) >= 0.25 * dxy and dxm + dmy <= 1.9 * dxy
                    print(f"[{vid}]   X>M {dxm:.0f}  M>Y {dmy:.0f}  X>Y {dxy:.0f}  {'OK' if good else 'rejeitado'}")
                    if good:
                        ok = m
                        break
                if ok is not None:
                    out = C.RAW / vid / f"ins_{gesture}_{i}.png"
                    ok.save(out)
                    inserts[str(i)] = out.name
            if inserts:
                plan[gesture] = {"path": names, "inserts": inserts}
        (PLANS / f"{vid}.json").write_text(json.dumps(plan, indent=2), encoding="utf-8")
        print(f"[{vid}] plano: {sum(len(p['inserts']) for p in plan.values())} novos intermediarios")


def cmd_apply(args):
    """Junta os quadros novos aos antigos na ordem do caminho e renumera b_1..b_n."""
    manifest = C.load_manifest()
    for plan_file in sorted(PLANS.glob("*.json")):
        vid = plan_file.stem
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
        v = next(x for x in manifest["vignettes"] if x["id"] == vid)
        for fr in v["frames"]:
            p = plan.get(fr["name"])
            if not p:
                continue
            old = fr.get("tweens", [])
            old = old if isinstance(old, list) else [None] * int(old)
            names = p["path"]  # [inicio, g_1..g_n, g]
            # nova sequencia de (arquivo de origem, descricao) entre o inicio e a chave
            seq = []
            for i in range(len(names) - 1):
                if i > 0:  # names[i] e um intermediario antigo g_i
                    seq.append((C.RAW / vid / f"{names[i]}.png", old[i - 1]))
                ins = p["inserts"].get(str(i))
                if isinstance(ins, str):  # meio automatico (gen)
                    seq.append((C.RAW / vid / ins, {"auto": f"{names[i]}>{names[i + 1]}"}))
                elif ins:  # poses descritas em cadeia (describe)
                    seq += [(C.RAW / vid / f, d) for f, d in ins]
            tmp = C.RAW / vid / "_renum"
            tmp.mkdir(exist_ok=True)
            for k, (src, _) in enumerate(seq, 1):
                shutil.copy(src, tmp / f"{fr['name']}_{k}.png")
            for k in range(1, len(seq) + 1):
                shutil.move(tmp / f"{fr['name']}_{k}.png", C.RAW / vid / f"{fr['name']}_{k}.png")
            tmp.rmdir()
            for ins in p["inserts"].values():
                for f in [ins] if isinstance(ins, str) else [f for f, _ in ins]:
                    (C.RAW / vid / f).unlink(missing_ok=True)
            fr["tweens"] = [d for _, d in seq]
            print(f"[{vid}] {fr['name']}: {len(old)} -> {len(seq)} intermediarios")
        plan_file.replace(plan_file.with_suffix(".applied"))
    C.MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def cmd_describe(args):
    """Encaixa poses DESCRITAS logo depois de `--after` (cada uma editada a partir da anterior).

    Para quando o meio automatico falha (o modelo copia um vizinho) ou o caminho tem um buraco:
    ex.: a mao sai do joelho e no quadro seguinte ja esta na barba."""
    key = C.load_env_key()
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    idx = next(i for i, f in enumerate(v["frames"]) if f["name"] == args.gesture)
    names = path_of(v, idx)
    i = names.index(args.after)
    # --from: editar a partir de outro quadro (ex.: o SEGUINTE, pedindo para "baixar" a mao; o modelo
    # mexe pouco quando parte do repouso e pula longe quando a pose pedida e alta)
    base = Image.open(raw_path(v, st, args.src or args.after)).convert("RGB")
    prev = Image.open(raw_path(v, st, args.after)).convert("RGB")
    nxt = Image.open(raw_path(v, st, names[i + 1])).convert("RGB")
    plate = to_np(Image.open(C.PLATES / f"{v['id']}.png"))
    made = []
    for k, desc in enumerate(args.desc, 1):
        print(f"[{v['id']}] {args.gesture}: depois de {args.after}, pose {k}: {desc[:70]}...")
        # varias tentativas: fica a que menos redesenhou o resto (menor salto somado ate os vizinhos)
        best = None
        for t in range(args.variants):
            png = C.call_gemini_edit(key, manifest["model"], FRAME_N.format(change=desc), [base], st["aspect"])
            m = Image.open(io.BytesIO(png)).convert("RGB")
            if args.variants > 1:
                dxm, dmy, _ = distances(prev, m, nxt, plate)
                print(f"[{v['id']}]   variante {t + 1}: {dxm:.0f} + {dmy:.0f}")
                if best is None or dxm + dmy < best[0]:
                    best = (dxm + dmy, m)
            else:
                best = (0, m)
        base = best[1]
        out = f"desc_{args.gesture}_{i}_{k}.png"
        base.save(C.RAW / v["id"] / out)
        made.append([out, desc])
    PLANS.mkdir(parents=True, exist_ok=True)
    plan_file = PLANS / f"{v['id']}.json"
    plan = json.loads(plan_file.read_text(encoding="utf-8")) if plan_file.exists() else {}
    entry = plan.setdefault(args.gesture, {"path": names, "inserts": {}})
    entry["inserts"][str(i)] = made
    plan_file.write_text(json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8")


def cmd_lock(args):
    """Trava partes que NAO deveriam mudar (ex.: o modelo redesenhou a cabeca ao mexer a mao):
    copia essas regioes de um quadro vizinho bom (alinhado) para o quadro bruto `--name`.
    Retangulos em fracoes do quadro bruto: x0 y0 x1 y1 (varios grupos de 4)."""
    manifest, state = C.load_manifest(), C.load_state()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    st = state["vignettes"][v["id"]]
    dst_path = raw_path(v, st, args.name)
    dst = to_np(Image.open(dst_path))
    h, w = dst.shape[:2]
    src = to_np(Image.open(raw_path(v, st, args.src)).convert("RGB").resize((w, h), Image.LANCZOS))
    src = color_match(align(src, dst), dst)
    mask = np.zeros((h, w), np.float32)
    r = args.rect
    for x0, y0, x1, y1 in zip(r[0::4], r[1::4], r[2::4], r[3::4]):
        mask[int(y0 * h) : int(y1 * h), int(x0 * w) : int(x1 * w)] = 1
    mask = cv2.GaussianBlur(mask, (0, 0), args.feather)[..., None]
    out = (dst * (1 - mask) + src * mask).round().astype(np.uint8)
    Image.fromarray(out).save(dst_path)
    print(f"[{v['id']}] {args.name}: {mask.mean() * 100:.1f}% do quadro travado a partir de {args.src}")


def cmd_drop(args):
    """Descarta intermediarios ruins (ex.: fora do caminho) e renumera os restantes."""
    manifest = C.load_manifest()
    v = next(x for x in manifest["vignettes"] if x["id"] == args.only)
    for fr in v["frames"]:
        t = fr.get("tweens")
        if not isinstance(t, list):
            continue
        names = [f"{fr['name']}_{k}" for k in range(1, len(t) + 1)]
        keep = [(n, d) for n, d in zip(names, t) if n not in args.names]
        if len(keep) == len(t):
            continue
        tmp = C.RAW / v["id"] / "_renum"
        tmp.mkdir(exist_ok=True)
        for k, (n, _) in enumerate(keep, 1):
            shutil.copy(C.RAW / v["id"] / f"{n}.png", tmp / f"{fr['name']}_{k}.png")
        for n in names:
            (C.RAW / v["id"] / f"{n}.png").unlink(missing_ok=True)
            (C.EXTRACT / v["id"] / f"{n}.png").unlink(missing_ok=True)
        for k in range(1, len(keep) + 1):
            shutil.move(tmp / f"{fr['name']}_{k}.png", C.RAW / v["id"] / f"{fr['name']}_{k}.png")
        tmp.rmdir()
        fr["tweens"] = [d for _, d in keep]
        if not fr["tweens"]:
            fr.pop("tweens")
        print(f"[{v['id']}] {fr['name']}: {len(t)} -> {len(keep)} intermediarios")
    C.MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("gen")
    g.add_argument("--only", nargs="*")
    g.add_argument("--all", action="store_true")
    g.add_argument("--threshold", type=float, default=40)
    g.add_argument("--max", type=int, default=2)
    sub.add_parser("apply")
    s = sub.add_parser("describe")
    s.add_argument("--only", required=True)
    s.add_argument("--gesture", required=True)
    s.add_argument("--after", required=True)
    s.add_argument("--from", dest="src")
    s.add_argument("--variants", type=int, default=1)
    s.add_argument("--desc", nargs="+", required=True)
    d = sub.add_parser("drop")
    d.add_argument("--only", required=True)
    d.add_argument("--names", nargs="+", required=True)
    lk = sub.add_parser("lock")
    lk.add_argument("--only", required=True)
    lk.add_argument("--name", required=True)
    lk.add_argument("--from", dest="src", required=True)
    lk.add_argument("--rect", type=float, nargs="+", required=True)
    lk.add_argument("--feather", type=float, default=10)
    args = ap.parse_args()
    {"gen": cmd_gen, "apply": cmd_apply, "describe": cmd_describe, "lock": cmd_lock, "drop": cmd_drop}[
        args.cmd
    ](args)


if __name__ == "__main__":
    main()
