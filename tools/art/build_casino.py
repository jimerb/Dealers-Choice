"""Build the casino art set from the source PNGs.

    python3 -I tools/art/build_casino.py                    (run from the repo root)
    python3 -I tools/art/build_casino.py --pull DIR         first copy new PNGs from DIR into the sources

Reads   art/casino/source/{chips,dice,roulette,tables,props,slots,video,keno,bank,chooser}/*.png
Writes  web/public/assets/art/tokens/chip-5000.webp, chip-25000.webp
        web/public/assets/art/casino/<group>/<name>.webp
        art/casino/proof/casino.png                         contact sheet of the built output

--pull DIR copies DIR/<group>/*.png into the sources, then DIR/<group>-v02/, -v03/ ... in order, so a
revision folder that holds only the redrawn files replaces just those. Rerun after dropping a redo in.

Magenta (#FF00FF) windows are cut to transparency (with a small grow so no pink fringe survives the
resize); resizing is done premultiplied so transparent edges don't pick up a coloured halo. Sizes follow
the casino art brief.
"""
import io
import os
import shutil
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = os.getcwd()
SRC = os.path.join(ROOT, 'art/casino/source')
PROOF = os.path.join(ROOT, 'art/casino/proof')
ART = os.path.join(ROOT, 'web/public/assets/art')
CASINO = os.path.join(ART, 'casino')
GROUPS = ['chips', 'dice', 'roulette', 'tables', 'props', 'slots', 'video', 'keno', 'bank', 'chooser']
TIERS = ['brass', 'silver', 'gold', 'emerald', 'sapphire', 'onyx']

written = []


def out(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def webp(im, path, quality=90, zero=True):
    """Save as WebP: lossy at `quality` or lossless, whichever is smaller. Fully transparent pixels are
    zeroed first (their colour is invisible but still costs bytes). `path` has no extension."""
    if zero and im.mode == 'RGBA':
        a = im.getchannel('A')
        im = Image.composite(im, Image.new('RGBA', im.size, (0, 0, 0, 0)), a.point(lambda v: 255 if v else 0))
    best = None
    for kw in (dict(quality=quality, method=6, exact=True), dict(lossless=True, quality=100, method=6, exact=True)):
        b = io.BytesIO()
        im.save(b, 'WEBP', **kw)
        if best is None or len(b.getvalue()) < len(best):
            best = b.getvalue()
    p = out(path + '.webp')
    with open(p, 'wb') as f:
        f.write(best)
    written.append((p, len(best), im))


def src(group, name):
    return Image.open(os.path.join(SRC, group, name + '.png'))


def has(group, name):
    return os.path.exists(os.path.join(SRC, group, name + '.png'))


def resize(im, w, h):
    """LANCZOS resize; RGBA is resized premultiplied so transparent edges don't bleed colour."""
    if im.mode == 'RGBA':
        return im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
    return im.resize((w, h), Image.LANCZOS)


def trim(im):
    """Crop a transparent image to its visible pixels."""
    return im.crop(im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox())


def fit(im, w, h):
    """Scale to fit inside w x h, keeping aspect."""
    k = min(w / im.width, h / im.height)
    return resize(im, max(1, round(im.width * k)), max(1, round(im.height * k)))


def pad(im, w, h):
    """Centre on a transparent w x h canvas."""
    c = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    c.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return c


def cut_magenta(im, grow=1):
    """Make the #FF00FF windows transparent. Anti-aliased edge pixels lean pink (red and blue well
    above green), so the key is loose and the mask grows by `grow` px to take the fringe with it."""
    im = im.convert('RGBA')
    r, g, b, a = im.split()
    hi = lambda ch, t: ch.point(lambda v: 255 if v >= t else 0)
    key = ImageChops.multiply(ImageChops.multiply(hi(r, 200), hi(b, 200)), g.point(lambda v: 255 if v < 90 else 0))
    if grow:
        key = key.filter(ImageFilter.MaxFilter(2 * grow + 1))
    im.putalpha(ImageChops.subtract(a, key))
    return im


def art_bbox(im, tol=24):
    """Bounding box of everything that differs from the flat background colour (top-left pixel)."""
    rgb = im.convert('RGB')
    bg = Image.new('RGB', rgb.size, rgb.getpixel((2, 2)))
    return ImageChops.difference(rgb, bg).convert('L').point(lambda v: 255 if v > tol else 0).getbbox()


def tile_crop(im, w=1000, h=625):
    """The chooser tiles: the art is small on a flat 1536x1024 canvas, so crop a 16:10 window centred
    on it. The window is the same for every tile (every game shows at the same scale) except that it
    grows for tall art (the machine cabinets) to keep a margin above and below."""
    x0, y0, x1, y1 = art_bbox(im)
    k = max(1, (y1 - y0) * 1.18 / h, (x1 - x0) * 1.18 / w)
    w, h = round(w * k), round(h * k)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    left = min(max(0, round(cx - w / 2)), im.width - w)
    top = min(max(0, round(cy - h / 2)), im.height - h)
    return im.crop((left, top, left + w, top + h))


def mirror_corners(im, size):
    """Copy the top-left size x size corner into the other three corners, mirrored."""
    im = im.copy()
    c = im.crop((0, 0, size, size))
    W, H = im.size
    im.paste(ImageOps.mirror(c), (W - size, 0))
    im.paste(ImageOps.flip(c), (0, H - size))
    im.paste(ImageOps.flip(ImageOps.mirror(c)), (W - size, H - size))
    return im


# ------------------------------------------------------------------ the groups
def chips():
    """Exactly as build_parlor.py builds the other six chips (plain trim and resize, alpha kept as is),
    so all eight match."""
    for v in (5000, 25000):
        if not has('chips', f'chip-{v}'):
            continue
        im = src('chips', f'chip-{v}').convert('RGBA')
        im = im.crop(im.getchannel('A').getbbox())
        k = min(256 / im.width, 256 / im.height)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
        webp(im, os.path.join(ART, 'tokens', f'chip-{v}'), zero=False)


def dice():
    # whole canvas scaled, so faces, tumbles and pucks keep their relative size
    for n in [f'die-{i}' for i in range(1, 7)] + ['die-tumble-1', 'die-tumble-2', 'puck-on', 'puck-off']:
        webp(resize(src('dice', n).convert('RGBA'), 256, 256), os.path.join(CASINO, 'dice', n))


def roulette():
    webp(src('roulette', 'wheel-bowl').convert('RGBA'), os.path.join(CASINO, 'roulette', 'wheel-bowl'))
    webp(cut_magenta(src('roulette', 'wheel-rotor'), grow=2), os.path.join(CASINO, 'roulette', 'wheel-rotor'))
    webp(resize(src('roulette', 'ball').convert('RGBA'), 96, 96), os.path.join(CASINO, 'roulette', 'ball'))


def tables():
    webp(src('tables', 'rail-leather').convert('RGB'), os.path.join(CASINO, 'tables', 'rail-leather'), quality=85)
    webp(fit(trim(src('tables', 'table-crest').convert('RGBA')), 900, 420), os.path.join(CASINO, 'tables', 'table-crest'))


def props():
    for n in ('shoe', 'discard-tray'):
        webp(fit(trim(src('props', n).convert('RGBA')), 384, 384), os.path.join(CASINO, 'props', n))


def slots():
    webp(resize(cut_magenta(src('slots', 'cabinet-crown')), 800, 1200), os.path.join(CASINO, 'slots', 'cabinet-crown'))
    # every symbol fills the same 80% box (205 px) on a 256 canvas
    for n in ('crown', 'ingot', 'bell', 'horseshoe', 'clover', 'cherries'):
        webp(pad(fit(trim(src('slots', f'crown-{n}').convert('RGBA')), 205, 205), 256, 256), os.path.join(CASINO, 'slots', f'crown-{n}'))


def video():
    webp(resize(cut_magenta(src('video', 'vp-cabinet')), 800, 1200), os.path.join(CASINO, 'video', 'vp-cabinet'))


def keno():
    board = cut_magenta(src('keno', 'keno-board'))
    for xy in ((0, 0), (board.width - 1, 0), (0, board.height - 1), (board.width - 1, board.height - 1)):
        ImageDraw.floodfill(board, xy, (0, 0, 0, 0), thresh=12)   # the flat ground behind the frame, so it sits on any felt
    webp(resize(board, 1200, 800), os.path.join(CASINO, 'keno', 'keno-board'))
    webp(resize(src('keno', 'keno-blower').convert('RGBA'), 512, 512), os.path.join(CASINO, 'keno', 'keno-blower'))
    webp(resize(src('keno', 'keno-ball').convert('RGBA'), 128, 128), os.path.join(CASINO, 'keno', 'keno-ball'))
    webp(src('keno', 'keno-paper').convert('RGB'), os.path.join(CASINO, 'keno', 'keno-paper'), quality=85)


def bank():
    for t in TIERS:
        card = trim(src('bank', f'tier-card-{t}').convert('RGBA'))   # the 1300x820 card
        webp(resize(card, 640, 404), os.path.join(CASINO, 'bank', f'tier-card-{t}'))
        webp(resize(src('bank', f'medal-{t}').convert('RGBA'), 256, 256), os.path.join(CASINO, 'bank', f'medal-{t}'))
    desk = src('bank', 'loan-desk').convert('RGB').crop((0, 32, 1536, 992))
    webp(resize(desk, 1200, 750), os.path.join(CASINO, 'bank', 'loan-desk'), quality=85)
    board = mirror_corners(src('bank', 'hall-board').convert('RGB'), 100)   # the fittings didn't match
    webp(resize(board, 1200, 800), os.path.join(CASINO, 'bank', 'hall-board'), quality=85)
    webp(fit(trim(src('bank', 'hall-plate').convert('RGBA')), 600, 200), os.path.join(CASINO, 'bank', 'hall-plate'))


def chooser():
    for f in sorted(os.listdir(os.path.join(SRC, 'chooser'))):
        name = os.path.splitext(f)[0]
        im = src('chooser', name).convert('RGB')
        if name == 'casino-banner':
            webp(resize(im.crop((0, 272, 1536, 752)), 1536, 480), os.path.join(CASINO, 'chooser', name), quality=85)
        elif name.startswith('tile-'):
            webp(resize(tile_crop(im), 1200, 750), os.path.join(CASINO, 'chooser', name), quality=85)


# ------------------------------------------------------------------ pull, proof, main
def pull(folder):
    """Copy <folder>/<group>/*.png, then <group>-v02, -v03 ... over them, into the sources."""
    folder = os.path.expanduser(folder)
    for g in GROUPS:
        dirs = [g] + sorted((d for d in os.listdir(folder) if d.startswith(g + '-v')), key=lambda d: int(d.split('-v')[-1]))
        for d in dirs:
            p = os.path.join(folder, d)
            if not os.path.isdir(p):
                continue
            for f in sorted(os.listdir(p)):
                if f.endswith('.png'):
                    shutil.copy2(os.path.join(p, f), out(os.path.join(SRC, g, f)))
                    print('pulled', d, f)


def proof():
    cell, cols = 200, 8
    rows = (len(written) + cols - 1) // cols
    s = Image.new('RGBA', (cols * (cell + 10) + 10, rows * (cell + 10) + 10), (23, 96, 74, 255))
    for i, (_, _, im) in enumerate(written):
        t = fit(im.convert('RGBA'), cell, cell)
        s.alpha_composite(t, (10 + (i % cols) * (cell + 10) + (cell - t.width) // 2, 10 + (i // cols) * (cell + 10) + (cell - t.height) // 2))
    s.convert('RGB').save(out(os.path.join(PROOF, 'casino.png')), optimize=True)


def main():
    if '--pull' in sys.argv:
        pull(sys.argv[sys.argv.index('--pull') + 1])
    for step in (chips, dice, roulette, tables, props, slots, video, keno, bank, chooser):
        step()
    proof()
    total = sum(n for _, n, _ in written)
    for p, n, _ in written:
        print(f'{n / 1024:7.1f} KB  {os.path.relpath(p, ROOT)}')
    print(f'{len(written)} files, {total / 1024:.0f} KB')


if __name__ == '__main__':
    main()
