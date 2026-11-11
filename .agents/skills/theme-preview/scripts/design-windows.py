#!/usr/bin/env python3
"""Design the theme preview — our own layout, following the reference the
user gave (2026-11-11): centred header, flowing light ribbons, glowing
browser windows, icon feature cards. No version pill.

Layout (3038x1460): deep-navy gradient canvas with a blue ribbon sweeping
the top and a purple ribbon along the bottom; centred header (Clawcloud logo
+ title, tagline flanked by rules); two browser windows side by side with
glow borders (left blue, right violet), each with traffic-light dots and a
mode label, no URL pill and no address bar; bottom strip of three feature
cards, each with a circular icon, a title and a one-line description.

    python3 design-windows.py --light light.png --dark dark.png \
        --logo public/brand-logo.png --out preview.png

Inputs are the 2978x1400 captures from capture.mjs (live or mock) — the
windows always show the real screenshots, never mock UI text.
Output is truecolour PNG — the background gradients and glows would band
badly under 256-colour indexed encoding.
"""
import argparse
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 3038, 1460
CJK_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
CJK_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
LATIN_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def vgrad(top, bottom):
    grad = Image.new("RGB", (1, 256))
    px = grad.load()
    for y in range(256):
        t = y / 255
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return grad.resize((W, H), Image.BICUBIC)


def rounded_mask(w, h, radius):
    m = Image.new("L", (w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    return m


def ribbon(points, color, width, blur):
    """A glowing curved band on its own layer: thick blurred stroke + thin core."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.line(points, fill=color + (110,), width=width, joint="curve")
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    core = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dc = ImageDraw.Draw(core)
    dc.line(points, fill=color + (200,), width=max(10, width // 7), joint="curve")
    core = core.filter(ImageFilter.GaussianBlur(6))
    layer.alpha_composite(core)
    return layer


def wave_points(x0, x1, y_base, amp, waves, step=24):
    pts = []
    x = x0
    while x <= x1:
        t = (x - x0) / max(1, (x1 - x0))
        pts.append((x, y_base + amp * math.sin(t * math.pi * 2 * waves)))
        x += step
    return pts


def window_image(shot, label):
    """One browser window: 1427x736, dark title bar + screenshot content."""
    ww, wh, bar = 1427, 736, 64
    win = Image.new("RGBA", (ww, wh), (20, 29, 46, 255))
    d = ImageDraw.Draw(win)
    for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse([32 + i * 36 - 11, bar // 2 - 11, 32 + i * 36 + 11, bar // 2 + 11], fill=c)
    # no URL pill: the user does not want the panel address in the image
    f_lab = font(CJK_REG, 32)
    d.text((ww - 32 - d.textlength(label, font=f_lab), bar // 2 - 18),
           label, font=f_lab, fill=(199, 211, 234, 255))
    shot = shot.resize((ww, wh - bar), Image.LANCZOS)
    win.paste(shot, (0, bar))
    win.putalpha(rounded_mask(ww, wh, 28))
    return win


def glow_border(canvas, x, y, w, h, color, light):
    """A coloured glow around a rounded rect, plus a crisp bright outline."""
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dg = ImageDraw.Draw(glow)
    dg.rounded_rectangle([x - 4, y - 4, x + w + 4, y + h + 4], radius=32,
                         outline=color + (255,), width=10)
    glow = glow.filter(ImageFilter.GaussianBlur(18))
    canvas.alpha_composite(glow)
    d = ImageDraw.Draw(canvas, "RGBA")
    d.rounded_rectangle([x - 2, y - 2, x + w + 2, y + h + 2], radius=30,
                        outline=light + (255,), width=3)


def draw_layers_icon(d, cx, cy, s):
    """Three stacked chevrons, white outline."""
    for i in range(3):
        y = cy - 16 + i * 15
        d.line([(cx - s, y), (cx, y - 10), (cx + s, y), (cx, y + 10), (cx - s, y)],
               fill=(255, 255, 255, 255), width=5, joint="curve")


def draw_pin_icon(d, cx, cy):
    """Location pin: white teardrop with a coloured centre dot."""
    d.ellipse([cx - 22, cy - 30, cx + 22, cy + 14], fill=(255, 255, 255, 255))
    d.polygon([(cx - 17, cy + 2), (cx + 17, cy + 2), (cx, cy + 36)], fill=(255, 255, 255, 255))
    d.ellipse([cx - 8, cy - 16, cx + 8, cy], fill=(22, 163, 74, 255))


def draw_sliders_icon(d, cx, cy):
    """Three horizontal lines with a knob on each."""
    for j, kx in enumerate([-12, 12, -2]):
        y = cy - 22 + j * 22
        d.line([(cx - 28, y), (cx + 28, y)], fill=(255, 255, 255, 255), width=5)
        d.ellipse([cx + kx - 8, y - 8, cx + kx + 8, y + 8], fill=(255, 255, 255, 255))


def feature_card(canvas, x, y, w, h, color, icon, title, desc):
    d = ImageDraw.Draw(canvas, "RGBA")
    d.rounded_rectangle([x, y, x + w, y + h], radius=24,
                        fill=(13, 22, 38, 255), outline=(30, 42, 68, 255), width=2)
    # circular icon badge, left
    icx, icy, ir = x + 88, y + h // 2, 48
    d.ellipse([icx - ir, icy - ir, icx + ir, icy + ir], fill=color + (255,))
    if icon == "layers":
        draw_layers_icon(d, icx, icy + 4, 26)
    elif icon == "pin":
        draw_pin_icon(d, icx, icy)
    else:
        draw_sliders_icon(d, icx, icy)
    f_t = font(CJK_BOLD, 48)
    f_d = font(CJK_REG, 32)
    tx = x + 168
    d.text((tx, y + 52), title, font=f_t, fill=(232, 238, 249, 255))
    d.text((tx, y + 128), desc, font=f_d, fill=(139, 155, 184, 255))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--light", required=True)
    ap.add_argument("--dark", required=True)
    ap.add_argument("--logo", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--tagline", default="浅色卡片 · 深色地图 · 实时监控")
    args = ap.parse_args()

    canvas = vgrad((10, 16, 34), (4, 6, 12)).convert("RGBA")

    # flowing light ribbons: blue across the top, purple along the bottom
    canvas.alpha_composite(ribbon(wave_points(-100, 3150, 30, 90, 1.2), (37, 99, 235), 110, 70))
    canvas.alpha_composite(ribbon(wave_points(-100, 3150, 1420, 80, 1.0), (147, 51, 234), 110, 70))

    d = ImageDraw.Draw(canvas, "RGBA")
    # centred header: logo + title on one row, tagline flanked by rules
    logo = Image.open(args.logo).convert("RGBA").resize((96, 96), Image.LANCZOS)
    f_lat = font(LATIN_BOLD, 76)
    f_cjk = font(CJK_BOLD, 76)
    title_w = d.textlength("Clawcloud", font=f_lat) + d.textlength(" · 星图", font=f_cjk)
    group_w = 96 + 24 + title_w
    gx = (W - group_w) // 2
    canvas.alpha_composite(logo, (int(gx), 48))
    tx, ty = int(gx + 120), 58
    d.text((tx, ty), "Clawcloud", font=f_lat, fill=(255, 255, 255, 255))
    x1 = tx + d.textlength("Clawcloud", font=f_lat)
    d.text((x1, ty), " · ", font=f_cjk, fill=(143, 163, 200, 255))
    x2 = x1 + d.textlength(" · ", font=f_cjk)
    d.text((x2, ty), "星图", font=f_cjk, fill=(255, 255, 255, 255))
    # tagline with rules on both sides
    f_tag = font(CJK_REG, 44)
    tag_w = d.textlength(args.tagline, font=f_tag)
    tag_x = (W - tag_w) // 2
    tag_y = 186
    d.text((tag_x, tag_y), args.tagline, font=f_tag, fill=(199, 211, 234, 255))
    rule_y = tag_y + 28
    d.line([(tag_x - 240, rule_y), (tag_x - 40, rule_y)], fill=(61, 78, 107, 255), width=3)
    d.line([(tag_x + tag_w + 40, rule_y), (tag_x + tag_w + 240, rule_y)], fill=(61, 78, 107, 255), width=3)

    # windows with glow borders
    light = Image.open(args.light).convert("RGB")
    dark = Image.open(args.dark).convert("RGB")
    wy = 290
    for x, shot, label, color, light_c in [
        (64, light, "浅色 · 卡片", (59, 130, 246), (96, 165, 250)),
        (1547, dark, "深色 · 地图", (139, 92, 246), (167, 139, 250)),
    ]:
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle([x, wy + 16, x + 1427, wy + 736 + 16], radius=28, fill=(0, 0, 0, 170))
        shadow = shadow.filter(ImageFilter.GaussianBlur(26))
        canvas.alpha_composite(shadow)
        canvas.alpha_composite(window_image(shot, label), (x, wy))
        glow_border(canvas, x, wy, 1427, 736, color, light_c)

    # feature strip: icon + title + one-line description
    fy, fh, gap = 1090, 240, 40
    fw = (W - 128 - 2 * gap) // 3
    feats = [
        ((37, 99, 235), "layers", "三档主题", "跟随系统 / 浅色 / 深色 · 页面一点，整站换肤"),
        ((22, 163, 74), "pin", "三种视图", "卡片 / 表格 / 地图 · 节点总览与全球分布"),
        ((124, 58, 237), "sliders", "运营商筛选", "一键过滤出指定运营商 · 离线节点自动沉底"),
    ]
    for i, (color, icon, title, desc) in enumerate(feats):
        feature_card(canvas, 64 + i * (fw + gap), fy, fw, fh, color, icon, title, desc)

    canvas.convert("RGB").save(args.out, optimize=True)
    print(f"{args.out}: {W}x{H}")


if __name__ == "__main__":
    main()
