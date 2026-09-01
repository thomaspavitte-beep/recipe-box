#!/usr/bin/env python3
"""Turn the artwork in IMAGES/ into web-sized WebP for the site.

The originals are 1200-1400px PNGs at roughly 2 MB each — lovely, but far too
heavy to send to a phone. This makes two WebP sizes per recipe and samples each
picture's own border colour, which the site uses as the backdrop behind it so
the artwork never has to be cropped.

    python3 tools/build-images.py

Writes img/<recipe-id>-card.webp and -hero.webp, then prints the `image:` block
to paste into js/data/recipes.js. Originals are left untouched.
"""

from pathlib import Path
from PIL import Image
import statistics

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'IMAGES'
OUT = ROOT / 'img'

# Artwork file -> recipe id in js/data/recipes.js
MAPPING = {
    'Pot Roast Dinner.png':     'ip-beef-pot-roast',
    'Chicken Noodle Soup.png':  'ip-chicken-noodle-soup',
    'Lentil Soup.png':          'lentil-soup',
    'Banana Pancakes.png':      'banana-pancakes',
    'Banana Waffles.png':       'banana-waffles',
    'Oatmeal biscuits.png':     'oatmeal-cookies',
    'Flat bread.png':           'flatbread',
    'Yoghurt Flatbread.png':    'yoghurt-flatbread',
}

CARD_WIDTH = 720     # cards render ~300-420 CSS px, so this covers retina
HERO_WIDTH = 1200
QUALITY = 80


def edge_tone(im):
    """Median colour of the outer 3% border — the artwork's own background."""
    small = im.resize((80, 80), Image.LANCZOS)
    px = small.load()
    band = 3
    edge = [px[x, y] for x in range(80) for y in range(80)
            if x < band or y < band or x >= 80 - band or y >= 80 - band]
    return tuple(int(statistics.median(c[i] for c in edge)) for i in range(3))


def resize_to(im, width):
    if im.width <= width:
        return im.copy()
    height = round(im.height * width / im.width)
    return im.resize((width, height), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    entries = []
    seen = set()

    for name, recipe_id in MAPPING.items():
        path = SOURCE / name
        if not path.exists():
            print(f'  ! missing {name}')
            continue
        seen.add(name)

        im = Image.open(path).convert('RGB')
        tone = edge_tone(im)

        sizes = {}
        for suffix, width in (('card', CARD_WIDTH), ('hero', HERO_WIDTH)):
            out = OUT / f'{recipe_id}-{suffix}.webp'
            resize_to(im, width).save(out, 'WEBP', quality=QUALITY, method=6)
            sizes[suffix] = out.stat().st_size

        print(f'  {recipe_id:24s} {im.width}x{im.height} -> '
              f'card {sizes["card"]//1024} KB, hero {sizes["hero"]//1024} KB, '
              f'tone #{tone[0]:02x}{tone[1]:02x}{tone[2]:02x}')

        entries.append((recipe_id, im.width / im.height, tone))

    for extra in sorted(set(f.name for f in SOURCE.glob('*.png')) - seen):
        print(f'  ! {extra} is not in MAPPING — no images built for it')

    print('\nPaste into each recipe in js/data/recipes.js:\n')
    for recipe_id, ratio, tone in entries:
        print(f"  // {recipe_id}\n"
              f"  image: {{ src: '{recipe_id}', ratio: {ratio:.3f}, "
              f"tone: '#{tone[0]:02x}{tone[1]:02x}{tone[2]:02x}' }},")


if __name__ == '__main__':
    main()
