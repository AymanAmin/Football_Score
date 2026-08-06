from pathlib import Path
from math import cos, pi, sin

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parent / "icons"


def polygon(cx, cy, radius, sides=5, rotation=-pi / 2):
    return [
        (cx + cos(rotation + index * 2 * pi / sides) * radius,
         cy + sin(rotation + index * 2 * pi / sides) * radius)
        for index in range(sides)
    ]


def make_icon(output_name, size, maskable=False):
    scale = 4
    canvas_size = size * scale
    image = Image.new("RGBA", (canvas_size, canvas_size), "#0c2b24")
    draw = ImageDraw.Draw(image)

    if not maskable:
        corner = int(canvas_size * 0.225)
        mask = Image.new("L", (canvas_size, canvas_size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, canvas_size, canvas_size), radius=corner, fill=255)
        image.putalpha(mask)

    line = int(canvas_size * 0.014)
    draw.line((canvas_size * .11, canvas_size * .5, canvas_size * .89, canvas_size * .5), fill=(255, 255, 255, 30), width=line)
    draw.line((canvas_size * .5, canvas_size * .11, canvas_size * .5, canvas_size * .89), fill=(255, 255, 255, 30), width=line)

    cx = cy = canvas_size * .5
    ball_r = canvas_size * (.245 if maskable else .258)
    draw.ellipse((cx - ball_r, cy - ball_r, cx + ball_r, cy + ball_r), fill="#f7faf7")
    pentagon_r = ball_r * .37
    points = polygon(cx, cy - ball_r * .02, pentagon_r)
    draw.polygon(points, fill="#0c2b24")
    spoke_width = int(canvas_size * .038)
    anchors = [
        (cx, cy - ball_r),
        (cx + ball_r * .96, cy - ball_r * .3),
        (cx + ball_r * .6, cy + ball_r * .82),
        (cx - ball_r * .6, cy + ball_r * .82),
        (cx - ball_r * .96, cy - ball_r * .3),
    ]
    for point, anchor in zip(points, anchors):
        draw.line((point[0], point[1], anchor[0], anchor[1]), fill="#0c2b24", width=spoke_width)

    plus_x = canvas_size * (.77 if maskable else .79)
    plus_y = canvas_size * (.235 if maskable else .21)
    plus_r = canvas_size * .09
    draw.ellipse((plus_x - plus_r, plus_y - plus_r, plus_x + plus_r, plus_y + plus_r), fill="#d8ff53")
    plus_width = int(canvas_size * .021)
    arm = plus_r * .45
    draw.line((plus_x - arm, plus_y, plus_x + arm, plus_y), fill="#0c2b24", width=plus_width)
    draw.line((plus_x, plus_y - arm, plus_x, plus_y + arm), fill="#0c2b24", width=plus_width)

    image = image.resize((size, size), Image.Resampling.LANCZOS)
    image.save(ROOT / output_name, optimize=True)


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    make_icon("icon-192.png", 192)
    make_icon("icon-512.png", 512)
    make_icon("icon-maskable-512.png", 512, maskable=True)
