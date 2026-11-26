# Draws the app icons (PNG) from the same shapes as favicon.svg, for the web app manifest and iOS.
# Usage: python tools/build-icons.py   (needs Pillow)
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "icons"
BG = "#323437"
FG = "#e2b714"
SS = 4  # supersampling

# favicon.svg, in its 32x32 units (the glyph group is shifted down by 1.4)
STEM = [(11.74, 5.6), (25.84, 3.2), (25.84, 19.97), (23.74, 19.97), (23.74, 7.16), (13.84, 8.84), (13.84, 22.47), (11.74, 22.47)]
HEADS = [((9.65, 23), (10, 23)), ((21.65, 20.5), (22, 20.5))]  # (center, rotation pivot)
RX, RY, ANGLE = 4.3, 3.1, -20
DY = 1.4


def ellipse(center, pivot, steps=180):
    cx, cy = center
    px, py = pivot
    a = math.radians(ANGLE)
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x, y = cx + RX * math.cos(t), cy + RY * math.sin(t)
        # rotate around the pivot, like SVG's rotate(angle px py)
        dx, dy = x - px, y - py
        pts.append((px + dx * math.cos(a) - dy * math.sin(a), py + dx * math.sin(a) + dy * math.cos(a)))
    return pts


def glyph_points():
    shapes = [STEM] + [ellipse(c, p) for c, p in HEADS]
    return [[(x, y + DY) for x, y in s] for s in shapes]


def draw(size, *, rounded, glyph_scale=1.0):
    """rounded: the favicon's rounded square on a transparent canvas; else a full-bleed square.
    glyph_scale shrinks the glyph around the center (for the maskable safe zone)."""
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=big * 7 / 32, fill=BG)
    else:
        d.rectangle([0, 0, big, big], fill=BG)
    unit = big / 32
    for shape in glyph_points():
        pts = [((16 + (x - 16) * glyph_scale) * unit, (16 + (y - 16) * glyph_scale) * unit) for x, y in shape]
        d.polygon(pts, fill=FG)
    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    draw(192, rounded=True).save(OUT / "icon-192.png", optimize=True)
    draw(512, rounded=True).save(OUT / "icon-512.png", optimize=True)
    # maskable: launchers crop to their own shape, keeping only the central 80% circle
    draw(512, rounded=False, glyph_scale=0.72).save(OUT / "maskable-512.png", optimize=True)
    # iOS home screen: opaque, it rounds the corners itself
    draw(180, rounded=False, glyph_scale=0.9).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    print("icons written to", OUT)


if __name__ == "__main__":
    main()
