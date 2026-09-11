"""Genera las imagenes de img/ a partir de las fotos originales.

Uso:  pip install pillow
      python tools/prep-img.py <carpeta-con-las-fotos>

Espera encontrar ahi estacionamiento_1.jpeg (apaisada, la entrada completa)
y estacionamiento_2.jpeg (vertical, el sector del porton).
"""

import os
import sys

from PIL import Image, ImageOps

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "img")


def save(im, name, width, quality=74):
    """Redimensiona a lo ancho y guarda en JPEG progresivo."""
    im = im.convert("RGB")
    height = round(im.height * width / im.width)
    im = im.resize((width, height), Image.LANCZOS)
    path = os.path.join(OUT, name)
    im.save(path, "JPEG", quality=quality, optimize=True, progressive=True)
    print(f"{name:16s} {im.size}  {os.path.getsize(path) / 1024:.0f} KB")


def main():
    os.makedirs(OUT, exist_ok=True)
    p1 = ImageOps.exif_transpose(Image.open(os.path.join(SRC, "estacionamiento_1.jpeg")))
    p2 = ImageOps.exif_transpose(Image.open(os.path.join(SRC, "estacionamiento_2.jpeg")))

    w1, h1 = p1.size
    w2, h2 = p2.size

    # Login: la entrada completa, recortada a 16:9
    top = int(h1 * 0.10)
    save(p1.crop((0, top, w1, top + int(w1 * 9 / 16))), "entrada.jpg", 1500)

    # Cochera 1: zoom a la parcela izquierda. No hay una foto solo de ese
    # lugar, asi que se recorta el sector que va de la pared izquierda a la
    # columna central, que es justo el limite de la parcela.
    left, cw = int(w1 * 0.04), int(w1 * 0.46)
    top = int(h1 * 0.46)
    save(p1.crop((left, top, left + cw, top + int(cw * 9 / 16))), "cochera-1.jpg", 760)

    # Cochera 2: sector del porton y la reja
    top = int(h2 * 0.34)
    save(p2.crop((0, top, w2, top + int(w2 * 9 / 16))), "cochera-2.jpg", 760)


if __name__ == "__main__":
    main()
