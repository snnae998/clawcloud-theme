#!/usr/bin/env python3
"""Design the theme preview as our own composition — NOT the old diagonal split.

Layout (3038x1460): deep-navy gradient canvas with a soft blue glow,
header (Clawcloud logo + title + tagline + version pill), two browser
windows side by side (left: light cards view, right: dark map view,
each with traffic-light dots, a URL pill and a mode label), and a bottom
strip of three feature cards.

    python3 design-windows.py --light light.png --dark dark.png \
        --logo public/brand-logo.png --out preview.png [--version v2.1.10]

Inputs are the 2978x1400 captures from capture.mjs (live or mock).
Output is truecolour PNG — the background gradients would band badly
under the 256-colour indexed encoding compose.mjs uses.
"""
import argparse
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 3038, 1460
CJK_BOLD = "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"
CJK_REG = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"


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


def window_image(shot, label):
    """One browser window: 1427x736, dark title bar + screenshot content."""
    ww, wh, bar = 1427, 736, 64
    win = Image.new("RGBA", (ww, wh), (20, 29, 46, 255))
    d = ImageDraw.Draw(win)
    # traffic lights
    for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
        d.ellipse([32 + i * 36 - 11, bar // 2 - 11, 32 + i * 36 + 11, bar // 2 + 11], fill=c)
    # no URL pill: the user does not want the panel address in the image
    # mode label, right
    f_lab = font(CJK_REG, 32)
    d.text((ww - 32 - d.textlength(label, font=f_lab), bar // 2 - 18),
           label, font=f_lab, fill=(199, 211, 234, 255))
    # content
    shot = shot.resize((ww, wh - bar), Image.LANCZOS)
    win.paste(shot, (0, bar))
    win.putalpha(rounded_mask(ww, wh, 28))
    return win


def feature_card(canvas, x, y, w, h, dot, title, lines):
    d = ImageDraw.Draw(canvas, "RGBA")
    d.rounded_rectangle([x, y, x + w, y + h], radius=24,
                        fill=(13, 22, 38, 255), outline=(30, 42, 68, 255), width=2)
    f_t = font(CJK_BOLD, 50)
    f_d = font(CJK_REG, 36)
    d.ellipse([x + 44, y + 78, x + 64, y + 98], fill=dot)
    d.text((x + 88, y + 58), title, font=f_t, fill=(232, 238, 249, 255))
    for i, line in enumerate(lines):
        d.text((x + 44, y + 150 + i * 56), line, font=f_d, fill=(139, 155, 184, 255))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--light", required=True)
    ap.add_argument("--dark", required=True)
    ap.add_argument("--logo", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--version", default="v2.1.10")
    ap.add_argument("--tagline", default="浅色卡片 × 深色地图 · 34 节点实时监控")
    args = ap.parse_args()

    canvas = vgrad((11, 18, 32), (4, 6, 11)).convert("RGBA")

    # soft blue glows, top corners
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-500, -420, 1700, 620], fill=(37, 99, 235, 55))
    gd.ellipse([1500, -460, 3500, 580], fill=(99, 102, 241, 45))
    glow = glow.filter(ImageFilter.GaussianBlur(200))
    canvas.alpha_composite(glow)

    d = ImageDraw.Draw(canvas, "RGBA")
    # header: logo + title + tagline. Keep the lockup modest: the old 96px
    # title + 128px rainbow logo overpowered the windows below. Latin wordmark
    # in DejaVu Bold (cleaner Latin glyphs than Noto CJK's), CJK in Noto Bold,
    # title/tagline ratio ~1.7 instead of 2.4 so the two lines sit together.
    logo = Image.open(args.logo).convert("RGBA").resize((96, 96), Image.LANCZOS)
    canvas.alpha_composite(logo, (64, 72))
    f_lat = font("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 76)
    f_cjk = font(CJK_BOLD, 76)
    tx, ty = 184, 66
    d.text((tx, ty), "Clawcloud", font=f_lat, fill=(255, 255, 255, 255))
    x1 = tx + d.textlength("Clawcloud", font=f_lat)
    d.text((x1, ty), " · ", font=f_cjk, fill=(143, 163, 200, 255))
    x2 = x1 + d.textlength(" · ", font=f_cjk)
    d.text((x2, ty), "星图", font=f_cjk, fill=(255, 255, 255, 255))
    f_tag = font(CJK_REG, 44)
    d.text((186, 168), args.tagline, font=f_tag, fill=(159, 176, 204, 255))
    # version pill, top right
    f_ver = font(CJK_REG, 36)
    ver = args.version
    vw = int(d.textlength(ver, font=f_ver)) + 64
    vx = W - 64 - vw
    d.rounded_rectangle([vx, 84, vx + vw, 144], radius=30,
                        fill=(19, 30, 51, 255), outline=(38, 51, 79, 255), width=2)
    d.text((vx + 32, 92), ver, font=f_ver, fill=(199, 211, 234, 255))

    # windows
    light = Image.open(args.light).convert("RGB")
    dark = Image.open(args.dark).convert("RGB")
    wy = 250
    for x, shot, label in [(64, light, "浅色 · 卡片"), (1547, dark, "深色 · 地图")]:
        shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle([x, wy + 16, x + 1427, wy + 736 + 16], radius=28, fill=(0, 0, 0, 170))
        shadow = shadow.filter(ImageFilter.GaussianBlur(26))
        canvas.alpha_composite(shadow)
        canvas.alpha_composite(window_image(shot, label), (x, wy))

    # feature strip
    fy, fh, gap = 1040, 300, 40
    fw = (W - 128 - 2 * gap) // 3
    feats = [
        ((59, 130, 246), "三档主题", ["跟随系统 / 浅色 / 深色", "页眉一点，整站换肤"]),
        ((34, 197, 94), "三种视图", ["卡片 / 表格 / 地图", "节点总览与全球分布"]),
        ((139, 92, 246), "运营商筛选", ["一键过滤出指定运营商", "离线节点自动沉底"]),
    ]
    for i, (dot, title, lines) in enumerate(feats):
        feature_card(canvas, 64 + i * (fw + gap), fy, fw, fh, dot, title, lines)

    canvas.convert("RGB").save(args.out, optimize=True)
    print(f"{args.out}: {W}x{H}")


if __name__ == "__main__":
    main()
