#!/usr/bin/env python3
"""Makes the website's images from the app's own artwork in assets/.

Run it again only when the app icon or the photos change; its output is committed, so the site
build (scripts/build-website.mjs) needs nothing but Node.

    python3 website/tools/make-images.py

Needs Pillow 11+ (AVIF support built in). Writes:
  website/assets/img/   photos as AVIF, WebP and JPEG at three widths, and the header logo
  website/src/images.json  what the build needs to write <picture> tags (sizes, formats)
  website/static/       favicon.ico (16/32/48), favicon-16.png, favicon-32.png,
                        apple-touch-icon.png (180), icon-192.png, icon-512.png,
                        icon-maskable-512.png and og-image.png (1200x630)
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, features

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "assets"
IMG = ROOT / "website" / "assets" / "img"
STATIC = ROOT / "website" / "static"
MANIFEST = ROOT / "website" / "src" / "images.json"

FOREST = (12, 33, 24)        # #0c2118, the app's Green theme background
APP_DARK = (11, 16, 20)      # #0b1014, the icon's background
MIST = (166, 195, 179)       # #a6c3b3
LEAF = (47, 212, 122)        # #2fd47a

# name: (source, crop box in source pixels (4:5), output widths)
PHOTOS = {
    "church": ("auth-church.jpg", (0, 430, 1080, 1780), (400, 600, 800)),
    "bible": ("auth-bible.jpg", (0, 420, 1080, 1770), (400, 600, 800)),
    "desk": ("auth-desk.jpg", (0, 760, 1080, 2110), (400, 600, 800)),
}

SERIF_BOLD = [
    "/usr/share/fonts/X11/Type1/c0632bt_.pfb",  # Bitstream Charter Bold (Linux)
    "/System/Library/Fonts/Supplemental/Charter.ttc",
    "/Library/Fonts/Charter.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
]
SANS = [
    "/usr/share/fonts/opentype/inter/Inter-Medium.otf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def font(paths, size, index=0):
    for p in paths:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size, index=index)
            except OSError:
                continue
    return ImageFont.load_default(size=size)


def photos():
    IMG.mkdir(parents=True, exist_ok=True)
    has_avif = features.check("avif")
    manifest = {}
    for name, (src, box, widths) in PHOTOS.items():
        im = Image.open(SRC / src).convert("RGB").crop(box)
        manifest[name] = {
            "widths": list(widths),
            "formats": (["avif"] if has_avif else []) + ["webp", "jpg"],
            "aspect": [im.width, im.height],
        }
        for w in widths:
            h = round(w * im.height / im.width)
            r = im.resize((w, h), Image.LANCZOS)
            r.save(IMG / f"{name}-{w}.jpg", "JPEG", quality=70, optimize=True, progressive=True)
            r.save(IMG / f"{name}-{w}.webp", "WEBP", quality=62, method=6)
            if has_avif:
                r.save(IMG / f"{name}-{w}.avif", "AVIF", quality=42, speed=4)
    print("photos:", ", ".join(PHOTOS), "(AVIF)" if has_avif else "(no AVIF support in this Pillow)")
    return manifest


def logo_mark():
    """The white flame-and-Bible mark, trimmed to its edges."""
    lw = Image.open(SRC / "logo-white.png").convert("RGBA")
    return lw.crop(lw.getbbox())


def header_logo():
    mark = logo_mark()
    for h in (36, 72):
        w = round(mark.width * h / mark.height)
        mark.resize((w, h), Image.LANCZOS).save(IMG / f"logo-{h}.png", optimize=True)
    return {"width": round(mark.width * 36 / mark.height), "height": 36}


def rounded_tile(size, radius_ratio, mark_ratio, bg=APP_DARK):
    """The mark centred on a dark tile. radius_ratio 0 gives a full square."""
    scale = 4
    S = size * scale
    tile = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * radius_ratio), fill=255)
    tile.paste(Image.new("RGBA", (S, S), bg + (255,)), (0, 0), mask)
    mark = logo_mark()
    mh = int(S * mark_ratio)
    mw = int(mark.width * mh / mark.height)
    if mw > S * mark_ratio:
        mw = int(S * mark_ratio)
        mh = int(mark.height * mw / mark.width)
    m = mark.resize((mw, mh), Image.LANCZOS)
    tile.alpha_composite(m, ((S - mw) // 2, (S - mh) // 2 + int(S * 0.01)))
    return tile.resize((size, size), Image.LANCZOS)


def icons():
    STATIC.mkdir(parents=True, exist_ok=True)
    # Tab icons: the mark fills more of the tile so it still reads at 16px.
    small = {s: rounded_tile(s, 0.22, 0.80) for s in (16, 32, 48)}
    small[16].save(STATIC / "favicon-16.png", optimize=True)
    small[32].save(STATIC / "favicon-32.png", optimize=True)
    small[48].save(STATIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)],
                   append_images=[small[16], small[32]])
    # Home-screen icons: the app icon itself, opaque (iOS and Android round the corners).
    icon = Image.open(SRC / "icon.png").convert("RGB")
    icon.resize((180, 180), Image.LANCZOS).save(STATIC / "apple-touch-icon.png", optimize=True)
    icon.resize((192, 192), Image.LANCZOS).save(STATIC / "icon-192.png", optimize=True)
    icon.resize((512, 512), Image.LANCZOS).save(STATIC / "icon-512.png", optimize=True)
    # Maskable: the mark kept inside the central safe circle.
    rounded_tile(512, 0, 0.50).convert("RGB").save(STATIC / "icon-maskable-512.png", optimize=True)
    print("icons: favicon.ico, 16, 32, 180, 192, 512, maskable 512")


def og_image():
    W, H = 1200, 630
    og = Image.new("RGB", (W, H), FOREST)

    # The app's sign-in window of light, on the right, fading into the green.
    bg = Image.open(SRC / "auth-bg.jpg").convert("RGB")
    pw = 560
    ph = round(bg.height * pw / bg.width)
    window = bg.resize((pw, ph), Image.LANCZOS).crop((0, 0, pw, H))
    fade = Image.new("L", (pw, H), 255)
    d = ImageDraw.Draw(fade)
    for x in range(220):
        d.line([(x, 0), (x, H)], fill=int(255 * (x / 220) ** 1.6))
    og.paste(window, (W - pw, 0), fade)

    draw = ImageDraw.Draw(og)
    # App icon, rounded like on the home screen.
    s = 132
    icon = Image.open(SRC / "icon.png").convert("RGBA").resize((s, s), Image.LANCZOS)
    m = Image.new("L", (s * 4, s * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, s * 4 - 1, s * 4 - 1), radius=s * 4 * 0.225, fill=255)
    m = m.resize((s, s), Image.LANCZOS)
    x0, y0 = 88, 120
    shadow = Image.new("L", (s + 60, s + 60), 0)
    ImageDraw.Draw(shadow).rounded_rectangle((30, 36, 30 + s, 36 + s), radius=30, fill=110)
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    og.paste(Image.new("RGB", shadow.size, (3, 12, 8)), (x0 - 30, y0 - 30), shadow)
    og.paste(icon, (x0, y0), m)
    # Thin green edge so the dark icon separates from the dark green.
    ImageDraw.Draw(og).rounded_rectangle((x0 - 1, y0 - 1, x0 + s, y0 + s), radius=30, outline=(39, 74, 57), width=2)

    title = font(SERIF_BOLD, 104)
    sub = font(SANS, 36)
    draw.text((86, 300), "Community", font=title, fill=(255, 255, 255))
    draw.text((90, 430), "The social app for the", font=sub, fill=MIST)
    draw.text((90, 476), "Adventist church family", font=sub, fill=MIST)
    draw.rounded_rectangle((90, 548, 90 + 64, 552), radius=2, fill=LEAF)

    og.save(STATIC / "og-image.png", optimize=True)
    print("og-image.png", (STATIC / "og-image.png").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    data = {"photos": photos(), "logo": header_logo()}
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n")
    icons()
    og_image()
