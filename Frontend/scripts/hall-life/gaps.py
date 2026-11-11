"""Mede o 'salto' entre quadros vizinhos de cada gesto (repouso -> intermediarios -> chave).

  python Frontend/scripts/hall-life/gaps.py            # todos
  python Frontend/scripts/hall-life/gaps.py --only dwarf-crate

Distancia = diferenca media de cor nos pixels onde o gesto se move. O maior salto de cada gesto e
onde um novo intermediario rende mais fluidez.
"""
from __future__ import annotations

import argparse

import numpy as np
from PIL import Image

import common as C


def path_of(v: dict, idx: int) -> list[str]:
    fr = v["frames"][idx]
    t = fr.get("tweens", 0)
    n = len(t) if isinstance(t, list) else int(t)
    start = v["frames"][idx - 1]["name"] if v.get("sequence") == "loop" and idx > 1 else "a"
    return [start] + [f"{fr['name']}_{k}" for k in range(1, n + 1)] + [fr["name"]]


def gaps(vid: str, names: list[str]) -> list[float]:
    imgs = [np.asarray(Image.open(C.EXTRACT / vid / f"{n}.png").convert("RGB"), np.float32) for n in names]
    moving = np.zeros(imgs[0].shape[:2], bool)
    for im in imgs[1:]:
        moving |= np.abs(im - imgs[0]).max(axis=2) > 25
    if not moving.any():
        return [0.0] * (len(imgs) - 1)
    return [float(np.abs(b - a).max(axis=2)[moving].mean()) for a, b in zip(imgs, imgs[1:])]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    args = ap.parse_args()
    for v in C.select(C.load_manifest(), args.only, not args.only):
        for idx in range(1, len(v["frames"])):
            names = path_of(v, idx)
            g = gaps(v["id"], names)
            print(f"{v['id']:16} {v['frames'][idx]['name']}: " + "  ".join(f"{a}>{b} {d:5.1f}" for a, b, d in zip(names, names[1:], g)))


if __name__ == "__main__":
    main()
