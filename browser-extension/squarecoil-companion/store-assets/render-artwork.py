"""Generate the local browser icons and Chrome Web Store small promo tile.

This is a development-only artwork script. It needs Pillow; generated PNGs are
committed, and neither Python nor Pillow is included in the extension package.
"""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SCALE = 4


def mix(start, end, amount):
    return tuple(round(a + (b - a) * amount) for a, b in zip(start, end))


def gradient(width, height, top, bottom):
    image = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        draw.line((0, y, width, y), fill=(*mix(top, bottom, y / max(height - 1, 1)), 255))
    return image


def bezier(start, control1, control2, end, steps=16):
    points = []
    for index in range(1, steps + 1):
        t = index / steps
        u = 1 - t
        points.append((
            u**3 * start[0] + 3 * u**2 * t * control1[0] + 3 * u * t**2 * control2[0] + t**3 * end[0],
            u**3 * start[1] + 3 * u**2 * t * control1[1] + 3 * u * t**2 * control2[1] + t**3 * end[1],
        ))
    return points


def icon_canvas():
    size = 128 * SCALE
    tile_mask = Image.new("L", (size, size))
    mask_draw = ImageDraw.Draw(tile_mask)
    mask_draw.rounded_rectangle((16 * SCALE, 16 * SCALE, 112 * SCALE, 112 * SCALE),
                                radius=23 * SCALE, fill=255)
    tile = gradient(size, size, (76, 164, 244), (30, 103, 210))
    tile.putalpha(tile_mask)

    draw = ImageDraw.Draw(tile)
    p = (88, 43)
    points = [p]
    curves = [
        ((67, 42), (54, 42), (48, 46)),
        ((40, 50), (40, 58), (40, 66)),
        ((40, 83), (51, 90), (66, 90)),
        ((82, 90), (89, 81), (89, 70)),
        ((89, 63), (84, 58), (77, 58)),
        ((67, 58), (62, 58), (60, 60)),
        ((55, 63), (55, 71), (60, 75)),
        ((63, 78), (67, 78), (71, 78)),
    ]
    for control1, control2, end in curves:
        points.extend(bezier(p, control1, control2, end))
        p = end
    scaled = [(round(x * SCALE), round(y * SCALE)) for x, y in points]
    draw.line(scaled, fill=(255, 255, 255, 255), width=10 * SCALE, joint="curve")
    for point in (scaled[0], scaled[-1]):
        x, y = point
        radius = 5 * SCALE
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(255, 255, 255, 255))
    return tile


def write_icons():
    output = ROOT / "icons"
    output.mkdir(exist_ok=True)
    master = icon_canvas()
    for size in (16, 32, 48, 128):
        master.resize((size, size), Image.Resampling.LANCZOS).save(output / f"icon-{size}.png", optimize=True)


def write_promo():
    width, height = 440 * SCALE, 280 * SCALE
    image = gradient(width, height, (14, 28, 43), (7, 17, 29))
    draw = ImageDraw.Draw(image, "RGBA")
    draw.rounded_rectangle((24 * SCALE, 24 * SCALE, 416 * SCALE, 256 * SCALE),
                           radius=30 * SCALE, fill=(32, 53, 77, 170),
                           outline=(125, 174, 224, 90), width=1 * SCALE)
    mark = icon_canvas().resize((172 * SCALE, 172 * SCALE), Image.Resampling.LANCZOS)
    image.alpha_composite(mark, (45 * SCALE, 54 * SCALE))
    draw = ImageDraw.Draw(image, "RGBA")
    for top, accent, length in ((62, (112, 199, 251, 255), 102),
                                (112, (120, 222, 172, 255), 82),
                                (162, (237, 184, 107, 255), 112)):
        left, right = 238 * SCALE, 390 * SCALE
        draw.rounded_rectangle((left, top * SCALE, right, (top + 38) * SCALE),
                               radius=11 * SCALE, fill=(12, 27, 42, 225),
                               outline=(153, 190, 225, 75), width=SCALE)
        draw.ellipse(((left + 13 * SCALE), (top + 14) * SCALE,
                      (left + 23 * SCALE), (top + 24) * SCALE), fill=accent)
        draw.rounded_rectangle(((left + 32 * SCALE), (top + 14) * SCALE,
                                (left + (32 + length) * SCALE), (top + 24) * SCALE),
                               radius=5 * SCALE, fill=(210, 227, 242, 190))
    image.resize((440, 280), Image.Resampling.LANCZOS).convert("RGB").save(
        ROOT / "store-assets" / "small-promo-440x280.png", optimize=True
    )


if __name__ == "__main__":
    write_icons()
    write_promo()
