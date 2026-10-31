# Renders the 1200x630 link-preview images for the checker site.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import sys
W, H = 1200, 630
F = '/usr/share/fonts/truetype/ubuntu/'
bold = lambda s: ImageFont.truetype(F + 'Ubuntu-B.ttf', s)
reg = lambda s: ImageFont.truetype(F + 'Ubuntu-R.ttf', s)

def base():
    img = Image.new('RGB', (W, H))
    px = img.load()
    a, b = (15, 77, 49), (35, 136, 90)
    for y in range(H):
        for x in range(W):
            t = (x / W) * 0.6 + (y / H) * 0.4
            px[x, y] = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((700, -350, 1500, 250), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img = Image.composite(Image.new('RGB', (W, H), (60, 190, 120)), img, glow)
    d = ImageDraw.Draw(img, 'RGBA')
    for y in range(0, H, 26):
        for x in range(0, W, 26):
            d.ellipse((x, y, x + 2, y + 2), fill=(255, 255, 255, 26))
    return img, d

def shield(d, x, y, s):
    pts = [(x + s * px / 24, y + s * py / 24) for px, py in [(12, 2), (4, 5), (4, 11), (5, 15.5), (8, 19.5), (12, 22), (16, 19.5), (19, 15.5), (20, 11), (20, 5)]]
    d.polygon(pts, fill='white')
    d.line([(x + s * 8.2 / 24, y + s * 12.2 / 24), (x + s * 10.8 / 24, y + s * 14.8 / 24), (x + s * 15.8 / 24, y + s * 9.6 / 24)], fill=(31, 122, 77), width=max(3, int(s / 9)), joint='curve')

def brand(d):
    shield(d, 64, 52, 46)
    d.text((122, 58), 'Extension Guardian', font=bold(30), fill='white')

def wrap(d, text, font, width):
    lines, line = [], ''
    for w in text.split():
        t = (line + ' ' + w).strip()
        if d.textlength(t, font=font) > width and line:
            lines.append(line); line = w
        else:
            line = t
    return lines + [line]

def footer(d, text):
    d.text((64, H - 78), text, font=reg(26), fill=(227, 242, 234))

def report(out):
    img, d = base(); brand(d)
    d.text((60, 120), '64%', font=bold(210), fill='white')
    y = 360
    for l in wrap(d, 'of the 150 most popular Chrome extensions can read and change every website you visit', bold(46), 1060):
        d.text((64, y), l, font=bold(46), fill='white'); y += 58
    footer(d, 'We checked their permissions, developers and updates  ·  app.extensionguardian.workers.dev')
    img.save(out, optimize=True)

def default(out):
    img, d = base(); brand(d)
    y = 170
    for l in wrap(d, 'Is this Chrome extension safe?', bold(88), 1060):
        d.text((60, y), l, font=bold(88), fill='white'); y += 100
    y += 36
    for l in wrap(d, 'See who makes it, how many people use it and whether it is still maintained. Free, no sign-up.', reg(38), 1000):
        d.text((64, y), l, font=reg(38), fill=(227, 242, 234)); y += 50
    footer(d, 'app.extensionguardian.workers.dev')
    img.save(out, optimize=True)

report(sys.argv[1] + '/og-report.png'); default(sys.argv[1] + '/og-default.png')
