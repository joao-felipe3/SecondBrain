"""Utilidades compartilhadas do pipeline hall-life (vida no Saguão da Guilda)."""
from __future__ import annotations

import base64
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]  # raiz do monorepo
FRONTEND = ROOT / "Frontend"

SCENE = FRONTEND / "public" / "imagens" / "Entrada-expandida.png"
MANIFEST = HERE / "vignettes.json"

WORK = HERE / "work"  # tudo aqui e regeneravel (ignorado no git)
COMPOSITE = WORK / "composite.png"  # cena + frame A das vinhetas ja aprovadas
STATE = WORK / "state.json"  # retangulos das placas, variacao escolhida etc.
PLATES = WORK / "plates"
RAW = WORK / "raw"
EXTRACT = WORK / "extract"
PREVIEWS = WORK / "previews"
PS_DIR = WORK / "photoshop"

PUBLIC_OUT = FRONTEND / "public" / "vfx" / "hall-life"
DATA_OUT = FRONTEND / "assets" / "data" / "hall-life.json"

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"

# proporcoes aceitas pelo imageConfig.aspectRatio dos modelos de imagem do Gemini
ASPECTS = {
    "1:1": 1.0,
    "5:4": 1.25,
    "4:3": 4 / 3,
    "3:2": 1.5,
    "16:9": 16 / 9,
    "21:9": 21 / 9,
    "4:5": 0.8,
    "3:4": 0.75,
    "2:3": 2 / 3,
    "9:16": 9 / 16,
}


def ensure_dirs() -> None:
    for d in (WORK, PLATES, RAW, EXTRACT, PREVIEWS, PS_DIR, PUBLIC_OUT):
        d.mkdir(parents=True, exist_ok=True)


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def load_state() -> dict:
    if STATE.exists():
        return json.loads(STATE.read_text(encoding="utf-8"))
    return {"vignettes": {}}


def save_state(state: dict) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def select(manifest: dict, ids: list[str] | None, all_: bool) -> list[dict]:
    items = manifest["vignettes"]
    if ids:
        wanted = set(ids)
        items = [v for v in items if v["id"] in wanted]
        missing = wanted - {v["id"] for v in items}
        if missing:
            sys.exit(f"ids desconhecidos: {sorted(missing)}")
    elif not all_:
        sys.exit("informe --only <ids> ou --all")
    return items


def load_env_key() -> str:
    key = os.environ.get("GEMINI_API_KEY")
    if key:
        return key
    for line in (ROOT / "Backend" / ".env").read_text(encoding="utf-8", errors="ignore").splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("GEMINI_API_KEY nao encontrada (env ou Backend/.env)")


def img_to_b64_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def call_gemini_edit(
    key: str,
    model: str,
    prompt: str,
    images: list[Image.Image],
    aspect: str,
    image_size: str | None = "2K",
) -> bytes:
    """Edicao de imagem: prompt + imagens de entrada -> 1 imagem (bytes PNG/JPEG)."""
    gen_cfg: dict = {"responseModalities": ["IMAGE"], "imageConfig": {"aspectRatio": aspect}}
    if image_size:
        gen_cfg["imageConfig"]["imageSize"] = image_size
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}]
                + [{"inline_data": {"mime_type": "image/png", "data": img_to_b64_png(i)}} for i in images],
            }
        ],
        "generationConfig": gen_cfg,
    }
    url = API.format(model=model, key=key)
    data = None
    for attempt in range(4):
        req = urllib.request.Request(
            url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=300) as resp:
                data = json.load(resp)
            break
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors="ignore")
            cfg = body["generationConfig"]
            if e.code == 400 and "imageSize" in msg and "imageSize" in cfg["imageConfig"]:
                cfg["imageConfig"].pop("imageSize")  # modelo nao suporta imageSize
                continue
            if e.code == 400 and "odalit" in msg and cfg["responseModalities"] == ["IMAGE"]:
                cfg["responseModalities"] = ["TEXT", "IMAGE"]
                continue
            if e.code in (429, 500, 503) and attempt < 3:
                time.sleep(10 * (attempt + 1))
                continue
            sys.exit(f"Gemini HTTP {e.code}: {msg[:800]}")
        except (urllib.error.URLError, TimeoutError) as e:
            if attempt < 3:
                time.sleep(10 * (attempt + 1))
                continue
            sys.exit(f"Gemini rede: {e}")
    if data is None:
        sys.exit("Gemini: sem resposta")
    for cand in data.get("candidates", []):
        for part in cand.get("content", {}).get("parts", []):
            inline = part.get("inlineData") or part.get("inline_data")
            if inline and inline.get("data"):
                return base64.b64decode(inline["data"])
    sys.exit(f"Gemini nao devolveu imagem: {json.dumps(data)[:800]}")


def snap_rect_to_aspect(
    rect: tuple[int, int, int, int], bounds: tuple[int, int]
) -> tuple[tuple[int, int, int, int], str]:
    """Expande o retangulo (x0,y0,x1,y1) ate a proporcao aceita mais proxima, sem sair da imagem."""
    x0, y0, x1, y1 = rect
    w, h = x1 - x0, y1 - y0
    r = w / h
    name, target = min(ASPECTS.items(), key=lambda kv: abs(kv[1] - r) / kv[1])
    if r < target:  # largo de menos: aumenta largura
        nw, nh = round(h * target), h
    else:
        nw, nh = w, round(w / target)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    W, H = bounds
    nx0 = int(round(cx - nw / 2))
    ny0 = int(round(cy - nh / 2))
    nx0 = max(0, min(W - nw, nx0))
    ny0 = max(0, min(H - nh, ny0))
    return (nx0, ny0, nx0 + nw, ny0 + nh), name


def checker(img: Image.Image, cell: int = 24) -> Image.Image:
    """Compoe uma imagem RGBA sobre xadrez (para inspecionar transparencia)."""
    img = img.convert("RGBA")
    w, h = img.size
    bg = Image.new("RGBA", (w, h), (205, 205, 205, 255))
    from PIL import ImageDraw

    d = ImageDraw.Draw(bg)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2 == 0:
                d.rectangle([x, y, x + cell - 1, y + cell - 1], fill=(150, 150, 150, 255))
    bg.alpha_composite(img)
    return bg
