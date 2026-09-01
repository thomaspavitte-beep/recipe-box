# The Recipe Box

**Live: https://thomaspavitte-beep.github.io/recipe-box/**

A small home for the recipes we actually cook. Plain HTML, CSS and JavaScript —
no build step, no dependencies, nothing leaves the machine.

To run it locally:

```bash
node server/serve-recipes.js
```

Then open **http://localhost:4660**. Any static server will do — the site is
just files, which is why it runs unchanged on GitHub Pages.

---

## What it does

- **Artwork** — each recipe has its own illustration, on the card and as a hero
  on the recipe page. Each picture carries `tone`, a colour sampled from its own
  border, which is painted behind it — so the artwork is letterboxed onto a
  backdrop it already matches instead of being cropped to a common shape. That
  is how the dark flat-lays and the pale watercolours share one grid.
- **Library** — search across titles, ingredients, steps *and your own notes*.
  Filter by favourites, Instant Pot, kid friendly, easy, under 30 min, category
  and any tag. Sort A–Z, recently cooked, most cooked or quickest first.
- **Grid view** — every recipe also renders as a *Cooking for Engineers* style
  diagram: ingredients down the left, each box takes everything to its left and
  does one thing to it. Toggle it with the **Steps / Grid view** switch.
- **Scaling** — ½×, 1×, 2×, 3× rewrites the quantities (and turns 0.5 back into
  ½). Times and pan sizes are deliberately left alone.
- **Notes** — a notebook panel on every recipe, saved as you type.
- **Cook log** — hit *I cooked this* and the card remembers how many times and
  when. Feeds the "recently cooked" and "most cooked" sorts.
- **Cook mode** — bigger type, and it asks the screen not to sleep. Tap any
  ingredient or step to tick it off (works in either mode).
- **Print** — a recipe prints as a clean card, no chrome.
- **Add recipe** — paste a recipe in from anywhere. Yours are stored in the
  browser; export a JSON backup any time from the ⚙ menu.

Keyboard: `/` jumps to search, `Esc` clears it.

---

## Adding a recipe permanently

Recipes added through the **+ Add recipe** button live in the browser's local
storage — good for quick captures, but tied to that browser. To make one part of
the collection proper, add it to [`js/data/recipes.js`](js/data/recipes.js):

```js
{
  id: 'sausage-pasta-bake',          // unique, used in the URL
  title: 'Sausage Pasta Bake',
  blurb: 'One sentence about it.',
  category: 'Mains',                  // becomes a filter chip
  method: 'Oven',
  appliance: 'Oven (200°C)',
  highlight: 'What shows on the card',
  tags: ['kid friendly', 'easy'],     // become filter chips too
  servings: 4,
  prepMin: 15,
  cookMin: 35,
  ingredients: [
    { text: '400 g pasta' },
    { text: '6 pork sausages, skins removed', short: '6 sausages, skins off' },
  ],
  prep: ['Preheat oven to 200°C'],    // full-width rows above the grid
  grid: [ /* see below */ ],
  steps: ['Boil the pasta…'],
  tips: ['Anything worth knowing next time.'],
}
```

`short` is optional — the grid uses it instead of `text` when the full line is
too long to read in a narrow cell.

### The grid

List the operations **in the order you actually do them**. Each one names the
run of ingredients it swallows, counting from 0:

```js
grid: [
  { label: 'sauté 4 min',                 from: 0, to: 3 },
  { label: 'stir 1 min\nuntil fragrant',  from: 0, to: 6 },
  { label: 'pressure cook (High)\n15 min', from: 0, to: 10 },
]
```

Columns are worked out for you: an operation always lands one column to the
right of everything it consumes, and two operations that share no ingredients
share a column (that is how "beat the butter" and "whisk the dry" sit side by
side). `\n` breaks a line inside a label — the first line is emphasised.

Rules of thumb that keep them readable: put the ingredients in the order the
grid needs them, cover every ingredient with at least one operation, and try to
stay under six columns by merging small steps ("knead 3–4 min, then rest").

In the **Add recipe** form the same thing is written one per line, numbering
ingredients from 1:

```
sauté 4 min | 1-4
stir 1 min / until fragrant | 1-7
pressure cook 15 min | 1-11
```

---

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The shell — top bar, library section, recipe section |
| `css/app.css` | Everything visual, light and dark, plus print styles |
| `js/data/recipes.js` | The recipes |
| `img/` | Web-sized WebP artwork (built — do not edit by hand) |
| `tools/build-images.py` | Turns `IMAGES/*.png` into `img/*.webp` |
| `js/grid.js` | Column solver + grid renderer |
| `js/scale.js` | Quantity scaling and fraction formatting |
| `js/store.js` | Notes, favourites, cook log, custom recipes (localStorage) |
| `js/app.js` | Routing, library, recipe page, dialogs |
| `server/serve-recipes.js` | Static file server on port 4660 |
| `Favourite Recent Recipes Collection.txt` | The original source text, untouched |

## Artwork

Full-size originals live in `IMAGES/` — around 2 MB each, which is far too heavy
to send to a phone, so they are **not committed**. The site uses WebP built from
them:

```bash
python3 tools/build-images.py
```

That writes `img/<recipe-id>-card.webp` (720 px) and `-hero.webp` (1200 px),
samples each picture's border colour, and prints the `image:` block to paste
into `js/data/recipes.js`. Add a new picture to `IMAGES/`, add a line to
`MAPPING` at the top of the script, and re-run it.

Artwork is hidden when printing — a near-black flat-lay is not worth the toner.

## A note on where things are kept

Notes, favourites, the cook log and any recipes added in the app live in this
browser's local storage under `recipe-box.v1`. Clearing site data for
`localhost:4660` wipes them, so take an occasional **Export backup** from the ⚙
menu — importing merges rather than replaces.
