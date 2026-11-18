"""
Etapa 5: acabamento no Photoshop local via ExtendScript.

  # monta/atualiza work/photoshop/Hall-Life.psd com as vinhetas extraidas
  python Frontend/scripts/hall-life/run_photoshop.py build --only dwarf-crate

  # depois de retocar a mao no PSD, exporta os frames de volta (work/photoshop/export/<id>/)
  python Frontend/scripts/hall-life/run_photoshop.py export --only dwarf-crate

Funciona passando um .jsx para o Photoshop.exe; o script grava o resultado num .txt que lemos.
Abrir o PSD grande leva ~1 min. Se o Photoshop nao abrir, confira o espaco livre no disco C.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
from pathlib import Path

import common as C

PHOTOSHOP = Path(r"C:\Program Files\Adobe\Adobe Photoshop 2026\Photoshop.exe")
PSD = C.PS_DIR / "Hall-Life.psd"
# o PSD de trabalho cobre so a uniao das janelas visiveis (16:9 e 21:9) + margem, para caber no disco
VISIBLE = (0.14, 0.30, 0.94, 0.86)  # u0, v0, u1, v1


def crop_px() -> list[int]:
    W, H = 5056, 3392
    u0, v0, u1, v1 = VISIBLE
    return [round(u0 * W), round(v0 * H), round(u1 * W), round(v1 * H)]
EXPORT_DIR = C.PS_DIR / "export"
JSX_DIR = C.HERE / "photoshop"


def posix(p: Path) -> str:
    return str(p).replace("\\", "/")


def run_jsx(template: str, cfg: dict, timeout: int = 900, min_free_gb: float = 3.5) -> str:
    free_gb = shutil.disk_usage("C:\\").free / 1e9
    if free_gb < min_free_gb:
        raise SystemExit(f"pouco espaco no C: ({free_gb:.1f} GB). O Photoshop precisa de disco de rascunho.")
    result = C.PS_DIR / f"{template}.result.txt"
    result.unlink(missing_ok=True)
    cfg = {**cfg, "result": posix(result)}
    script = C.PS_DIR / f"{template}.run.jsx"
    body = (JSX_DIR / f"{template}.jsx").read_text(encoding="utf-8")
    script.write_text(f"var CFG = {json.dumps(cfg)};\n{body}", encoding="utf-8")
    subprocess.Popen([str(PHOTOSHOP), str(script)])
    t0 = time.time()
    while time.time() - t0 < timeout:
        if result.exists():
            text = result.read_text(encoding="utf-8", errors="ignore")
            if "OK" in text.splitlines()[-1:] or "ERRO" in text:
                return text
        time.sleep(3)
    raise SystemExit(f"Photoshop nao respondeu em {timeout}s ({result})")


def cmd_build(args, manifest, state):
    vignettes = []
    for v in sorted(C.select(manifest, args.only, args.all), key=lambda x: x["order"]):
        meta_p = C.EXTRACT / v["id"] / "meta.json"
        if not meta_p.exists():
            print(f"[{v['id']}] sem extracao, pulando")
            continue
        meta = json.loads(meta_p.read_text(encoding="utf-8"))
        x, y, _, _ = meta["rect"]
        frames = [{"name": n, "path": posix(C.EXTRACT / v["id"] / f"{n}.png")} for n in meta["frames"]]
        # Photoshop empilha o ultimo adicionado em cima: frames em ordem reversa deixam o 'a' por cima
        vignettes.append({"id": v["id"], "x": x, "y": y, "frames": list(reversed(frames))})
    C.PS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Photoshop: montando {PSD.name} com {[v['id'] for v in vignettes]} ...")
    print(run_jsx("build_psd", {"psd": posix(PSD), "scene": posix(C.SCENE), "crop": crop_px(), "vignettes": vignettes}))


def cmd_export(args, manifest, state):
    ids = [v["id"] for v in C.select(manifest, args.only, args.all)]
    frames = {v["id"]: [f["name"] for f in v["frames"]] for v in manifest["vignettes"] if v["id"] in ids}
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    for vid in ids:  # limpa exportacao anterior da vinheta
        for old in (EXPORT_DIR / vid).glob("*.png"):
            old.unlink()
    print(f"Photoshop: exportando {ids} de {PSD.name} ...")
    cfg = {"psd": posix(PSD), "outDir": posix(EXPORT_DIR), "crop": crop_px(), "ids": ids, "frames": frames}
    print(run_jsx("export_psd", cfg))
    exported = json.loads((EXPORT_DIR / "export.json").read_text(encoding="utf-8"))
    for vid, info in exported.items():
        state["vignettes"].setdefault(vid, {})["photoshop_export"] = info
        print(f"[{vid}] exportado do PSD: rect {info['rect']} frames {info['frames']}")
    C.save_state(state)


def cmd_close(args, manifest, state):
    # espera o PSD parar de crescer (gravacao em andamento) antes de encerrar o Photoshop
    if PSD.exists():
        last = -1
        for _ in range(20):
            size = PSD.stat().st_size
            if size == last:
                break
            last = size
            time.sleep(3)
    # fechar nao precisa de disco de rascunho; encerra o Photoshop para liberar memoria
    print(run_jsx("close_all", {"quit": True}, timeout=300, min_free_gb=0))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("close")
    for name in ("build", "export"):
        p = sub.add_parser(name)
        p.add_argument("--only", nargs="*")
        p.add_argument("--all", action="store_true")
    args = ap.parse_args()
    C.ensure_dirs()
    manifest, state = C.load_manifest(), C.load_state()
    {"build": cmd_build, "export": cmd_export, "close": cmd_close}[args.cmd](args, manifest, state)


if __name__ == "__main__":
    main()
