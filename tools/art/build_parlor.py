"""Build the "parlor" skin and art set from the ChatGPT source art.

    python3 -I tools/art/build_parlor.py            (run from the repo root)

Reads   art/parlor/source/{components,cards,backs,tables,tokens,cast,lobby}
Writes  art/parlor/masters/{cards,backs}/          750x1050 print-quality masters
        web/public/assets/skins/parlor/cards/      500x700 faces (AS.png, 10H.png, JK1.png, T21.png, EX.png, CS.png ...)
        web/public/assets/skins/parlor/backs/      500x700 backs
        web/public/assets/skins/parlor/tables/     1024x1024 seamless tiles
        web/public/assets/art/{tokens,cast,lobby,brand}/
        art/parlor/proof/                          contact sheets of the built output

Route A from the art brief: the 52 faces are assembled here from pips, court half-portraits and the
ace emblem, so pip counts and positions are exact and every suit symbol is identical.
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = os.getcwd()
SRC = os.path.join(ROOT, 'art/parlor/source')
MASTER = os.path.join(ROOT, 'art/parlor/masters')
PROOF = os.path.join(ROOT, 'art/parlor/proof')
SKIN = os.path.join(ROOT, 'web/public/assets/skins/parlor')
ART = os.path.join(ROOT, 'web/public/assets/art')

W, H = 750, 1050            # master card size (5:7)
WEB = (500, 700)            # size served to the browser
PAPER = (251, 248, 240)
PARCHMENT = (243, 236, 218)
INK = (27, 27, 27)
RED = (179, 38, 30)
BRASS = (201, 162, 74)
FONT = '/usr/share/fonts/truetype/noto/NotoSerif-Bold.ttf'

SUITS = 'SHDC'
RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
color_of = lambda s: RED if s in 'HD' else INK


def out(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def src(*p):
    return Image.open(os.path.join(SRC, *p))


def trim(im):
    """Crop a transparent image to its visible pixels."""
    return im.crop(im.getchannel('A').getbbox())


def fit(im, w, h):
    """Scale to fit inside w x h, keeping aspect."""
    k = min(w / im.width, h / im.height)
    return im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)


PIPS = {s: trim(src('components', f'pip-{s}.png').convert('RGBA')) for s in SUITS}


def pip(s, h):
    return fit(PIPS[s], h * 2, h)


def paste_c(card, im, cx, cy, flip=False):
    if flip:
        im = im.rotate(180)
    card.alpha_composite(im, (round(cx - im.width / 2), round(cy - im.height / 2)))


def text_img(txt, cap, color, max_w=None):
    """Render text so its cap height is `cap` px; squeeze horizontally to max_w if needed."""
    f = ImageFont.truetype(FONT, int(cap * 1.4))
    l, t, r, b = f.getbbox(txt)
    im = Image.new('RGBA', (r - l + 4, b - t + 4), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((2 - l, 2 - t), txt, font=f, fill=color)
    im = trim(im)
    im = im.resize((im.width, cap), Image.LANCZOS) if im.height != cap else im
    if max_w and im.width > max_w:
        im = im.resize((max_w, im.height), Image.LANCZOS)
    return im


def index(card, label, suit_mark, color, cx=86, top=44, cap=108, pip_h=74):
    """Corner index: rank over suit, top-left, and the same rotated in the bottom-right corner."""
    tile = Image.new('RGBA', (150, cap + pip_h + 26), (0, 0, 0, 0))
    r = text_img(label, cap, color, max_w=130)
    tile.alpha_composite(r, ((150 - r.width) // 2, 0))
    if suit_mark is not None:
        tile.alpha_composite(suit_mark, ((150 - suit_mark.width) // 2, cap + 20))
    card.alpha_composite(tile, (cx - 75, top))
    card.alpha_composite(tile.rotate(180), (W - cx - 75, H - top - tile.height))


def blank(bg=PAPER):
    return Image.new('RGBA', (W, H), bg + (255,))


# ---------- number cards ----------
FIELD_X = (250, 375, 500)   # pip column centres
TOP, BOT = 225, 825         # pip row range
LAYOUT = {                  # (column 0-2, row fraction 0..1)
    '2': [(1, 0), (1, 1)],
    '3': [(1, 0), (1, .5), (1, 1)],
    '4': [(0, 0), (2, 0), (0, 1), (2, 1)],
    '5': [(0, 0), (2, 0), (1, .5), (0, 1), (2, 1)],
    '6': [(0, 0), (2, 0), (0, .5), (2, .5), (0, 1), (2, 1)],
    '7': [(0, 0), (2, 0), (1, .25), (0, .5), (2, .5), (0, 1), (2, 1)],
    '8': [(0, 0), (2, 0), (1, .25), (0, .5), (2, .5), (1, .75), (0, 1), (2, 1)],
    '9': [(0, 0), (2, 0), (0, 1/3), (2, 1/3), (1, .5), (0, 2/3), (2, 2/3), (0, 1), (2, 1)],
    '10': [(0, 0), (2, 0), (1, 1/6), (0, 1/3), (2, 1/3), (0, 2/3), (2, 2/3), (1, 5/6), (0, 1), (2, 1)],
}


def number_card(rank, s):
    card = blank()
    p = pip(s, 118)
    for col, fr in LAYOUT[rank]:
        paste_c(card, p, FIELD_X[col], TOP + (BOT - TOP) * fr, flip=fr > .5)
    index(card, rank, pip(s, 74), color_of(s))
    return card


def ace_card(s):
    card = blank()
    if s == 'S':
        paste_c(card, fit(trim(src('components', 'ace-S.png').convert('RGBA')), 470, 560), W / 2, H / 2)
    else:
        paste_c(card, pip(s, 300), W / 2, H / 2)
    index(card, 'A', pip(s, 74), color_of(s))
    return card


# ---------- court cards (double-ended from a half portrait) ----------
FRAME = (164, 116, W - 164, H - 116)    # x0, y0, x1, y1 of the court field


def court_card(label, s, code):
    card = blank()
    x0, y0, x1, y1 = FRAME
    fw, fh = x1 - x0, (y1 - y0) // 2
    half = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
    fig = trim(src('components', f'court-{code}.png').convert('RGBA'))
    fig = fit(fig, fw, fh - 6)
    half.alpha_composite(fig, ((fw - fig.width) // 2, fh - fig.height))   # figure sits on the centre line
    card.alpha_composite(half, (x0, y0))
    card.alpha_composite(half.rotate(180), (x0, y0 + fh))
    d = ImageDraw.Draw(card)
    d.rectangle(FRAME, outline=color_of(s), width=4)
    d.line([(x0, y0 + fh), (x1, y0 + fh)], fill=color_of(s), width=4)
    index(card, label, pip(s, 74), color_of(s))
    return card


# ---------- full-art cards from ChatGPT (jokers, Excuse, Tarot trumps) ----------
def full_art(name):
    """1024x1536 art -> 750x1050: scale to card width, trim the top and bottom equally."""
    im = src('cards', f'{name}.png').convert('RGBA')
    im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
    cut = (im.height - H) // 2
    return im.crop((0, cut, W, cut + H))


def star(size, color):
    import math
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c, R, r = size / 2, size / 2, size / 5
    pts = [(c + (R if i % 2 == 0 else r) * math.sin(i * math.pi / 5), c - (R if i % 2 == 0 else r) * math.cos(i * math.pi / 5)) for i in range(10)]
    ImageDraw.Draw(im).polygon(pts, fill=color)
    return im


def joker(n, color):
    card = full_art(f'JK{n}')
    col = Image.new('RGBA', (90, 5 * 78), (0, 0, 0, 0))
    for i, ch in enumerate('JOKER'):
        t = text_img(ch, 62, color)
        col.alpha_composite(t, ((90 - t.width) // 2, i * 78))
    card.alpha_composite(col, (34, 44))
    card.alpha_composite(col.rotate(180), (W - 34 - 90, H - 44 - col.height))
    return card


def trump(n):
    card = full_art(f'T{n}')
    t = text_img(str(n), 84, INK, max_w=110)
    if n in (6, 9):                     # underline so 6 and 9 can't be confused upside down
        u = Image.new('RGBA', (t.width, t.height + 16), (0, 0, 0, 0))
        u.alpha_composite(t, (0, 0))
        ImageDraw.Draw(u).rectangle([0, t.height + 8, t.width - 1, t.height + 15], fill=INK)
        t = u
    for x, y, flip in [(40, 40, False), (W - 40 - t.width, 40, False), (40, H - 40 - t.height, True), (W - 40 - t.width, H - 40 - t.height, True)]:
        card.alpha_composite(t.rotate(180) if flip else t, (x, y))
    return card


def excuse():
    card = full_art('EX')
    st = star(96, BRASS)
    for x, y in [(40, 40), (W - 136, 40), (40, H - 136), (W - 136, H - 136)]:
        card.alpha_composite(st, (x, y))
    return card


# ---------- backs ----------
BAND = {'parlor-green': 86, 'parlor-oxblood': 86, 'parlor-midnight': 86, 'botanical': 83}


def back(name):
    """1024x1536 -> 5:7. Bordered backs lose pattern rows right inside the band (no visible seam);
    full-bleed backs are centre-cropped. Both keep 180-degree symmetry."""
    im = src('backs', f'{name}.png').convert('RGB')
    w, h = im.size
    th = round(w * 7 / 5)
    cut = (h - th) // 2
    if name in BAND:
        b = BAND[name]
        top = im.crop((0, 0, w, b))
        mid = im.crop((0, b + cut, w, h - b - cut))
        bot = im.crop((0, h - b, w, h))
        im2 = Image.new('RGB', (w, b * 2 + mid.height))
        im2.paste(top, (0, 0)); im2.paste(mid, (0, b)); im2.paste(bot, (0, b + mid.height))
        im = im2
    else:
        im = im.crop((0, cut, w, cut + th))
    return im.resize((W, H), Image.LANCZOS)


def save_card(img, folder, name):
    img = img.convert('RGB')
    img.save(out(os.path.join(MASTER, folder, name + '.png')), optimize=True)
    img.resize(WEB, Image.LANCZOS).save(out(os.path.join(SKIN, folder, name + '.png')), optimize=True)
    return img


def sheet(images, name, cols, cell):
    rows = (len(images) + cols - 1) // cols
    s = Image.new('RGB', (cols * (cell[0] + 10) + 10, rows * (cell[1] + 10) + 10), (23, 96, 74))
    for i, im in enumerate(images):
        s.paste(im.convert('RGB').resize(cell, Image.LANCZOS), (10 + (i % cols) * (cell[0] + 10), 10 + (i // cols) * (cell[1] + 10)))
    s.save(out(os.path.join(PROOF, name)), optimize=True)


def main():
    built = []
    for s in SUITS:
        for r in RANKS:
            if r == 'A':
                img = ace_card(s)
            elif r in 'JQK':
                img = court_card(r, s, r + s)
            else:
                img = number_card(r, s)
            built.append(save_card(img, 'cards', r + s))
    sheet(built, 'faces-52.png', 13, (150, 210))

    special = [save_card(joker(1, RED), 'cards', 'JK1'), save_card(joker(2, INK), 'cards', 'JK2'), save_card(excuse(), 'cards', 'EX')]
    special += [save_card(court_card('C', s, 'C' + s), 'cards', 'C' + s) for s in SUITS]   # Tarot knights
    special += [save_card(trump(n), 'cards', f'T{n}') for n in range(1, 22)]
    sheet(special, 'specials.png', 7, (150, 210))

    backs = [save_card(back(n), 'backs', n) for n in ['parlor-green', 'parlor-oxblood', 'parlor-midnight', 'deco-fan', 'botanical', 'starfield']]
    sheet(backs, 'backs.png', 6, (150, 210))
    for b, n in zip(backs, ['parlor-green', 'parlor-oxblood', 'parlor-midnight', 'deco-fan', 'botanical', 'starfield']):
        d = ImageChops.difference(b, b.rotate(180)).convert('L')
        print(f'back {n}: mean 180-degree difference {sum(d.getdata()) / (W * H):.2f}')

    # tables: already seamless 1024 tiles
    for f in os.listdir(os.path.join(SRC, 'tables')):
        src('tables', f).convert('RGB').save(out(os.path.join(SKIN, 'tables', f)), optimize=True)

    # tokens
    sizes = {'chip': (256, 256), 'dealer-button': (256, 256), 'peg': (128, 128), 'tray': (900, 9999), 'trump-plaque': (480, 9999)}
    for f in os.listdir(os.path.join(SRC, 'tokens')):
        im = trim(src('tokens', f).convert('RGBA'))
        key = next((k for k in sizes if f.startswith(k)), None)
        if key:
            im = fit(im, *sizes[key])
        im.save(out(os.path.join(ART, 'tokens', f)), optimize=True)

    for f in os.listdir(os.path.join(SRC, 'cast')):
        src('cast', f).convert('RGB').resize((512, 512), Image.LANCZOS).save(out(os.path.join(ART, 'cast', f)), optimize=True)

    for f in os.listdir(os.path.join(SRC, 'lobby')):
        im = src('lobby', f).convert('RGB')
        if f == 'logo-mark.png':
            for px in (512, 180, 64, 32):
                im.resize((px, px), Image.LANCZOS).save(out(os.path.join(ART, 'brand', f'logo-mark-{px}.png')), optimize=True)
            continue
        if f == 'solitaire-banner.png':
            im = im.crop((0, 272, 1536, 752)).resize((1536, 480), Image.LANCZOS)
        else:                                           # 3:2 -> 16:10
            im = im.crop((0, 32, 1536, 992))
            if f.startswith('tile-'):
                im = im.resize((1200, 750), Image.LANCZOS)
        im.save(out(os.path.join(ART, 'lobby', f)), optimize=True)
    print('done')


if __name__ == '__main__':
    main()
