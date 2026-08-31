import { RECIPES } from './data/recipes.js';
import { store, subscribe } from './store.js';
import { renderGrid } from './grid.js';
import { scaleText } from './scale.js';

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const filters = {
  q: '',
  favourites: false,
  categories: new Set(),
  tags: new Set(),
  sort: store.pref('sort', 'title'),
};

const ticked = new Map();   // recipe id -> Set of "ing:3" / "step:2"
let wakeLock = null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ------------------------------------------------------------------ *
 * Recipes: built-in + your own
 * ------------------------------------------------------------------ */

function allRecipes() {
  return [...RECIPES, ...store.customRecipes()];
}

function findRecipe(id) {
  return allRecipes().find((r) => r.id === id);
}

function totalMin(r) {
  return (r.prepMin ?? 0) + (r.cookMin ?? 0);
}

function haystack(r) {
  return [
    r.title, r.blurb, r.category, r.method, r.appliance,
    ...(r.tags ?? []),
    ...(r.ingredients ?? []).map((i) => i.text),
    ...(r.steps ?? []),
    store.note(r.id),
  ].join(' ').toLowerCase();
}

/* ------------------------------------------------------------------ *
 * Theme
 * ------------------------------------------------------------------ */

function applyTheme(theme) {
  const resolved = theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = resolved;
  $('meta[name="theme-color"]').content = resolved === 'dark' ? '#171613' : '#fbf7f0';
}

applyTheme(store.pref('theme', null));

$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  store.setPref('theme', next);
  applyTheme(next);
});

/* ------------------------------------------------------------------ *
 * Library
 * ------------------------------------------------------------------ */

function visibleRecipes() {
  const q = filters.q.trim().toLowerCase();
  let list = allRecipes().filter((r) => {
    if (filters.favourites && !store.isFavourite(r.id)) return false;
    if (filters.categories.size && !filters.categories.has(r.category)) return false;
    if (filters.tags.size && ![...filters.tags].every((t) => (r.tags ?? []).includes(t))) return false;
    if (q && !haystack(r).includes(q)) return false;
    return true;
  });

  const by = {
    title: (a, b) => a.title.localeCompare(b.title),
    quick: (a, b) => totalMin(a) - totalMin(b) || a.title.localeCompare(b.title),
    most: (a, b) => store.cookCount(b.id) - store.cookCount(a.id) || a.title.localeCompare(b.title),
    recent: (a, b) => (store.lastCooked(b.id) ?? 0) - (store.lastCooked(a.id) ?? 0) || a.title.localeCompare(b.title),
  };
  list = list.sort(by[filters.sort] ?? by.title);
  return list;
}

function renderFilters() {
  const recipes = allRecipes();

  const quick = $('#filter-quick');
  quick.replaceChildren(
    chip('★ Favourites', filters.favourites, () => {
      filters.favourites = !filters.favourites;
      renderLibrary();
    }, 'chip-star'),
    chip('Instant Pot', filters.tags.has('instant pot'), () => toggleTag('instant pot')),
    chip('Kid friendly', filters.tags.has('kid friendly'), () => toggleTag('kid friendly')),
    chip('Easy', filters.tags.has('easy'), () => toggleTag('easy')),
    chip('Under 30 min', filters.tags.has('quick'), () => toggleTag('quick')),
  );

  const categories = [...new Set(recipes.map((r) => r.category))].sort();
  $('#filter-category').replaceChildren(
    ...categories.map((c) => {
      const n = recipes.filter((r) => r.category === c).length;
      return chip(c, filters.categories.has(c), () => {
        filters.categories.has(c) ? filters.categories.delete(c) : filters.categories.add(c);
        renderLibrary();
      }, '', n);
    }),
  );

  const skip = new Set(['instant pot', 'kid friendly', 'easy', 'quick']);
  const tags = [...new Set(recipes.flatMap((r) => r.tags ?? []))].filter((t) => !skip.has(t)).sort();
  $('#filter-tags').replaceChildren(
    ...tags.map((t) => chip(t, filters.tags.has(t), () => toggleTag(t))),
  );

  const active = filters.favourites || filters.categories.size || filters.tags.size || filters.q;
  $('#clear-filters').hidden = !active;
}

function toggleTag(tag) {
  filters.tags.has(tag) ? filters.tags.delete(tag) : filters.tags.add(tag);
  renderLibrary();
}

function chip(label, pressed, onClick, extraClass = '', count) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `chip ${extraClass}`.trim();
  b.setAttribute('aria-pressed', String(Boolean(pressed)));
  b.append(label);
  if (count != null) {
    const c = document.createElement('span');
    c.className = 'chip-count';
    c.textContent = count;
    b.append(' ', c);
  }
  b.addEventListener('click', onClick);
  return b;
}

function renderLibrary() {
  renderFilters();
  const list = visibleRecipes();
  const total = allRecipes().length;

  $('#result-count').textContent =
    list.length === total ? `${total} ${plural(total, 'recipe')}` : `${list.length} of ${total} recipes`;

  $('#cards').replaceChildren(...list.map(card));
  $('#empty').hidden = list.length > 0;
}

function card(r) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = `#/r/${r.id}`;

  const kicker = document.createElement('div');
  kicker.className = 'card-kicker';
  kicker.textContent = `${r.category} · ${r.method}`;

  const h = document.createElement('h2');
  h.className = 'card-title';
  h.textContent = r.title;

  const p = document.createElement('p');
  p.className = 'card-blurb';
  p.textContent = r.highlight || r.blurb || '';

  const tags = document.createElement('div');
  tags.className = 'card-tags';
  (r.tags ?? []).slice(0, 3).forEach((t) => {
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = t;
    tags.append(s);
  });

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.append(metaItem('◷', `${totalMin(r)} min`));
  if (r.servings) meta.append(metaItem('☺', `${r.servings} ${r.servingNoun ?? 'serves'}`));
  const count = store.cookCount(r.id);
  if (count) {
    const c = metaItem('✓', count === 1 ? 'cooked once' : `cooked ${count}×`);
    c.classList.add('cooked-badge');
    meta.append(c);
  }

  const fav = document.createElement('button');
  fav.type = 'button';
  fav.className = 'fav-btn';
  fav.setAttribute('aria-pressed', String(store.isFavourite(r.id)));
  fav.setAttribute('aria-label', `Favourite ${r.title}`);
  fav.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3.6l2.6 5.3 5.9.85-4.25 4.15 1 5.85L12 17l-5.25 2.75 1-5.85L3.5 9.75l5.9-.85z"/></svg>';
  fav.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const on = store.toggleFavourite(r.id);
    fav.setAttribute('aria-pressed', String(on));
    if (filters.favourites) renderLibrary();
  });

  a.append(fav, kicker, h, p, tags, meta);
  return a;
}

function metaItem(icon, text) {
  const s = document.createElement('span');
  s.append(icon + ' ' + text);
  return s;
}

/* ------------------------------------------------------------------ *
 * Recipe page
 * ------------------------------------------------------------------ */

function renderRecipe(r) {
  const view = $('#view-recipe');
  const page = document.createElement('div');
  page.className = 'page';

  const mode = { tab: 'steps', scale: 1, cook: false };

  const back = document.createElement('a');
  back.className = 'back-link';
  back.href = '#/';
  back.textContent = '← All recipes';

  // --- head ---------------------------------------------------------
  const head = document.createElement('header');
  head.className = 'recipe-head';

  const kicker = document.createElement('div');
  kicker.className = 'card-kicker';
  kicker.textContent = `${r.category} · ${r.appliance ?? r.method}`;

  const h1 = document.createElement('h1');
  h1.textContent = r.title;

  const blurb = document.createElement('p');
  blurb.className = 'recipe-blurb';
  blurb.textContent = r.blurb ?? '';

  const facts = document.createElement('div');
  facts.className = 'recipe-facts';
  const servingsFact = fact(String(r.servings ?? '—'), r.servingNoun ?? 'serves');
  facts.append(
    fact(`${totalMin(r)} min`, 'total'),
    fact(`${r.prepMin ?? 0} min`, 'prep'),
    fact(`${r.cookMin ?? 0} min`, 'cook'),
    servingsFact,
  );

  const tags = document.createElement('div');
  tags.className = 'card-tags';
  (r.tags ?? []).forEach((t) => {
    const s = document.createElement('span');
    s.className = 'tag';
    s.textContent = t;
    tags.append(s);
  });

  head.append(kicker, h1, blurb, facts, tags);

  // --- tools --------------------------------------------------------
  const tools = document.createElement('div');
  tools.className = 'recipe-tools';

  const tabs = segmented(
    [
      { value: 'steps', label: 'Steps' },
      { value: 'grid', label: 'Grid view' },
    ],
    mode.tab,
    (v) => { mode.tab = v; paint(); },
  );

  const scaler = segmented(
    [
      { value: 0.5, label: '½×' },
      { value: 1, label: '1×' },
      { value: 2, label: '2×' },
      { value: 3, label: '3×' },
    ],
    mode.scale,
    (v) => { mode.scale = Number(v); paint(); },
  );

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'btn';
  const paintFav = () => {
    const on = store.isFavourite(r.id);
    favBtn.textContent = on ? '★ Favourite' : '☆ Favourite';
    favBtn.style.color = on ? 'var(--flag)' : '';
  };
  favBtn.addEventListener('click', () => { store.toggleFavourite(r.id); paintFav(); });
  paintFav();

  const cookedBtn = document.createElement('button');
  cookedBtn.type = 'button';
  cookedBtn.className = 'btn';
  const paintCooked = () => {
    const n = store.cookCount(r.id);
    const last = store.lastCooked(r.id);
    cookedBtn.textContent = n ? `Cooked ${n}× · ${relativeDate(last)}` : '+ I cooked this';
  };
  cookedBtn.addEventListener('click', () => {
    store.logCook(r.id);
    paintCooked();
    toast('Logged. Nice one.');
  });
  paintCooked();

  const cookModeBtn = document.createElement('button');
  cookModeBtn.type = 'button';
  cookModeBtn.className = 'btn';
  cookModeBtn.textContent = 'Cook mode';
  cookModeBtn.addEventListener('click', () => {
    mode.cook = !mode.cook;
    cookModeBtn.classList.toggle('btn-primary', mode.cook);
    cookModeBtn.textContent = mode.cook ? 'Cook mode on' : 'Cook mode';
    document.body.classList.toggle('cook-mode', mode.cook);
    mode.cook ? requestWakeLock() : releaseWakeLock();
  });

  const printBtn = document.createElement('button');
  printBtn.type = 'button';
  printBtn.className = 'btn';
  printBtn.textContent = 'Print';
  printBtn.addEventListener('click', () => window.print());

  const spacer = document.createElement('div');
  spacer.className = 'spacer';

  tools.append(tabs, scaler, spacer, favBtn, cookedBtn, cookModeBtn, printBtn);

  if (r.custom) {
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openRecipeDialog(r));
    tools.append(editBtn);
  }

  // --- body ---------------------------------------------------------
  const body = document.createElement('div');
  body.className = 'recipe-body';

  const paint = () => {
    body.replaceChildren();
    if (mode.tab === 'grid') {
      body.style.gridTemplateColumns = '1fr';
      body.append(gridPanel(r, mode.scale));
    } else {
      body.style.gridTemplateColumns = '';
      body.append(ingredientsPanel(r, mode.scale), methodPanel(r));
    }
    $$('[data-tab]', tabs).forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === mode.tab)));
  };

  page.append(back, head, tools, body, notesPanel(r));
  view.replaceChildren(page);
  paint();
}

function fact(value, label) {
  const d = document.createElement('div');
  d.className = 'fact';
  const b = document.createElement('b');
  b.textContent = value;
  const s = document.createElement('span');
  s.textContent = label;
  d.append(b, s);
  return d;
}

function segmented(options, current, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'segmented';
  options.forEach((o) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.tab = o.value;
    b.textContent = o.label;
    b.setAttribute('aria-selected', String(o.value === current));
    b.addEventListener('click', () => {
      $$('button', wrap).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      onChange(o.value);
    });
    wrap.append(b);
  });
  return wrap;
}

function ingredientsPanel(r, scale) {
  const wrap = document.createElement('section');
  const title = document.createElement('h2');
  title.className = 'panel-title';
  title.textContent = 'Ingredients';

  const ul = document.createElement('ul');
  ul.className = 'ing-list';
  (r.ingredients ?? []).forEach((ing, i) => {
    const li = document.createElement('li');
    li.textContent = scaleText(ing.text, scale);
    const key = `ing:${i}`;
    if (isTicked(r.id, key)) li.classList.add('done');
    li.addEventListener('click', () => {
      li.classList.toggle('done', tick(r.id, key));
    });
    ul.append(li);
  });

  wrap.append(title, ul);

  if (scale !== 1) {
    const note = document.createElement('p');
    note.className = 'scale-note';
    note.textContent = `Quantities scaled ${scale}× — pan sizes and cooking times are unchanged.`;
    wrap.append(note);
  }

  if (r.tips?.length) {
    const tips = document.createElement('aside');
    tips.className = 'tips';
    const h = document.createElement('h3');
    h.textContent = 'Worth knowing';
    const ul2 = document.createElement('ul');
    r.tips.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      ul2.append(li);
    });
    tips.append(h, ul2);
    wrap.append(tips);
  }

  return wrap;
}

function methodPanel(r) {
  const wrap = document.createElement('section');
  const title = document.createElement('h2');
  title.className = 'panel-title';
  title.textContent = 'Method';

  const ol = document.createElement('ol');
  ol.className = 'step-list';
  (r.steps ?? []).forEach((step, i) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = step;
    li.append(span);
    const key = `step:${i}`;
    if (isTicked(r.id, key)) li.classList.add('done');
    li.addEventListener('click', () => {
      li.classList.toggle('done', tick(r.id, key));
    });
    ol.append(li);
  });

  wrap.append(title, ol);
  return wrap;
}

function gridPanel(r, scale) {
  const wrap = document.createElement('section');
  const title = document.createElement('h2');
  title.className = 'panel-title';
  title.textContent = 'The whole recipe at a glance';

  const intro = document.createElement('p');
  intro.className = 'grid-intro';
  intro.textContent =
    'Ingredients run down the left. Read left to right: each box takes everything to its left and does one thing to it.';

  wrap.append(title, intro);

  if (!r.grid?.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = 'No grid for this one yet.';
    wrap.append(p);
    if (r.custom) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = 'Add one';
      b.addEventListener('click', () => openRecipeDialog(r));
      p.append(document.createElement('br'), b);
    }
    return wrap;
  }

  const rows = (r.ingredients ?? []).map((i) => scaleText(i.short ?? i.text, scale));
  wrap.append(renderGrid({ rows, ops: r.grid, prep: r.prep ?? [] }));
  return wrap;
}

function notesPanel(r) {
  const wrap = document.createElement('section');
  wrap.className = 'notes';

  const head = document.createElement('div');
  head.className = 'notes-head';
  const title = document.createElement('h2');
  title.className = 'panel-title';
  title.style.marginBottom = '0';
  title.textContent = 'My notes';
  const saved = document.createElement('span');
  saved.className = 'notes-saved';
  const paintSaved = () => {
    const t = store.noteUpdated(r.id);
    saved.textContent = t ? `saved ${relativeDate(t)}` : '';
  };
  paintSaved();
  head.append(title, saved);

  const ta = document.createElement('textarea');
  ta.placeholder = 'What you changed, what the kids thought, what to do differently next time…';
  ta.value = store.note(r.id);
  let timer;
  ta.addEventListener('input', () => {
    clearTimeout(timer);
    saved.textContent = 'saving…';
    timer = setTimeout(() => {
      store.setNote(r.id, ta.value);
      paintSaved();
    }, 500);
  });
  ta.addEventListener('blur', () => {
    clearTimeout(timer);
    store.setNote(r.id, ta.value);
    paintSaved();
  });

  wrap.append(head, ta);
  return wrap;
}

function isTicked(id, key) {
  return ticked.get(id)?.has(key) ?? false;
}

function tick(id, key) {
  if (!ticked.has(id)) ticked.set(id, new Set());
  const set = ticked.get(id);
  if (set.has(key)) { set.delete(key); return false; }
  set.add(key);
  return true;
}

/* ------------------------------------------------------------------ *
 * Wake lock — stops the screen dimming mid-recipe
 * ------------------------------------------------------------------ */

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch { /* not supported, or denied — no harm done */ }
}

function releaseWakeLock() {
  wakeLock?.release?.();
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && document.body.classList.contains('cook-mode')) requestWakeLock();
});

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

const dialog = $('#dialog');

function openDialog(build) {
  const inner = document.createElement('div');
  inner.className = 'dialog-inner';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'icon-btn dialog-close';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  close.addEventListener('click', () => dialog.close());

  build(inner, () => dialog.close());
  dialog.replaceChildren(close, inner);
  dialog.showModal();
}

function openSettings() {
  openDialog((root, close) => {
    root.innerHTML = '';
    const h = document.createElement('h2');
    h.textContent = 'Your recipe box';
    const sub = document.createElement('p');
    sub.className = 'dialog-sub';
    sub.textContent = 'Notes, favourites and anything you have added live in this browser only.';

    const data = store.all;
    const cooks = Object.values(data.cooked).reduce((n, c) => n + c.count, 0);
    const stats = document.createElement('div');
    stats.className = 'stat-line';
    stats.innerHTML =
      `<span><b>${allRecipes().length}</b> ${plural(allRecipes().length, 'recipe')}</span>` +
      `<span><b>${data.custom.length}</b> added by you</span>` +
      `<span><b>${Object.keys(data.notes).length}</b> with notes</span>` +
      `<span><b>${data.favourites.length}</b> ${plural(data.favourites.length, 'favourite')}</span>` +
      `<span><b>${cooks}</b> ${plural(cooks, 'cook')} logged</span>`;

    root.append(h, sub, stats);

    root.append(settingsBlock(
      'Back it up',
      'Downloads a JSON file with your notes, favourites, cook log and added recipes.',
      [button('Export backup', 'btn-primary', exportBackup), button('Import backup', '', importBackup)],
    ));

    root.append(settingsBlock(
      'Print the whole book',
      'Opens the print dialog for whatever is on screen — a recipe page prints as a clean card.',
      [button('Print this page', '', () => { close(); setTimeout(() => window.print(), 150); })],
    ));

    const customs = store.customRecipes();
    if (customs.length) {
      const list = document.createElement('div');
      customs.forEach((c) => {
        const row = document.createElement('p');
        row.style.cssText = 'display:flex;justify-content:space-between;gap:1rem;align-items:center;margin:.2rem 0';
        const name = document.createElement('span');
        name.textContent = c.title;
        const del = button('Delete', '', () => {
          if (confirm(`Delete “${c.title}” and its notes? This cannot be undone.`)) {
            store.removeCustom(c.id);
            close();
            location.hash = '#/';
            renderLibrary();
            toast('Deleted.');
          }
        });
        del.classList.add('btn-compact');
        row.append(name, del);
        list.append(row);
      });
      const block = settingsBlock('Recipes you added', '', []);
      block.append(list);
      root.append(block);
    }
  });
}

function settingsBlock(title, text, buttons) {
  const b = document.createElement('div');
  b.className = 'settings-block';
  const h = document.createElement('h3');
  h.textContent = title;
  b.append(h);
  if (text) {
    const p = document.createElement('p');
    p.textContent = text;
    b.append(p);
  }
  if (buttons.length) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:.5rem;flex-wrap:wrap';
    row.append(...buttons);
    b.append(row);
  }
  return b;
}

function button(label, cls, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn ${cls}`.trim();
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function exportBackup() {
  const blob = new Blob([store.export()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `recipe-box-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Backup downloaded.');
}

function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      store.import(await file.text(), { merge: true });
      dialog.close();
      renderLibrary();
      toast('Backup merged in.');
    } catch (err) {
      alert(`That file did not look like a recipe box backup.\n\n${err.message}`);
    }
  });
  input.click();
}

/* --- add / edit a recipe ------------------------------------------- */

function openRecipeDialog(existing = null) {
  openDialog((root) => {
    const h = document.createElement('h2');
    h.textContent = existing ? 'Edit recipe' : 'Add a recipe';
    const sub = document.createElement('p');
    sub.className = 'dialog-sub';
    sub.textContent = 'Paste it in — one ingredient or step per line.';
    root.append(h, sub);

    const form = document.createElement('form');
    form.append(
      field('Title', input('title', existing?.title ?? '', { required: true })),
      row(
        field('Category', input('category', existing?.category ?? '', { list: 'categories' })),
        field('Method / appliance', input('method', existing?.method ?? '', { list: 'methods' })),
      ),
      field('One-line description', input('blurb', existing?.blurb ?? '')),
      row(
        field('Serves', input('servings', existing?.servings ?? 4, { type: 'number', min: 1 })),
        field('Prep (min)', input('prepMin', existing?.prepMin ?? 10, { type: 'number', min: 0 })),
        field('Cook (min)', input('cookMin', existing?.cookMin ?? 20, { type: 'number', min: 0 })),
      ),
      field('Tags', input('tags', (existing?.tags ?? []).join(', '), { placeholder: 'instant pot, kid friendly, easy' }),
        'Comma separated. These become the filter chips.'),
      field('Ingredients', textarea('ingredients', (existing?.ingredients ?? []).map((i) => i.text).join('\n'),
        '1 tbsp olive oil\n1 brown onion, diced\n…'), 'One per line, in the order you use them.'),
      field('Method', textarea('steps', (existing?.steps ?? []).join('\n'), 'Sauté the onion for 4 minutes…'),
        'One step per line.'),
      field('Grid view (optional)', textarea('grid', (existing?.grid ?? []).map((g) => `${g.label.replace(/\n/g, ' / ')} | ${g.from + 1}-${g.to + 1}`).join('\n'),
        'sauté 4 min | 1-3\nstir 1 min | 1-6\npressure cook 15 min | 1-10'),
        'One operation per line, in the order you do them: label | first-last ingredient number. Use / for a line break inside a label. Leave blank to skip.'),
      field('Prep notes above the grid (optional)', input('prep', (existing?.prep ?? []).join(' | '), { placeholder: 'Preheat oven to 180°C | Line two trays' }),
        'Separated by |'),
    );

    const datalists = document.createElement('div');
    datalists.innerHTML =
      `<datalist id="categories">${[...new Set(allRecipes().map((r) => r.category))].map((c) => `<option value="${c}">`).join('')}</datalist>` +
      `<datalist id="methods">${[...new Set(allRecipes().map((r) => r.method))].map((c) => `<option value="${c}">`).join('')}</datalist>`;

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    actions.append(
      button('Cancel', '', () => dialog.close()),
      button(existing ? 'Save changes' : 'Add to the box', 'btn-primary', () => {
        const recipe = readRecipeForm(form, existing);
        if (!recipe) return;
        store.addCustom(recipe);
        dialog.close();
        renderLibrary();
        location.hash = `#/r/${recipe.id}`;
        route();
        toast(existing ? 'Saved.' : 'Added to the box.');
      }),
    );

    form.addEventListener('submit', (e) => e.preventDefault());
    root.append(form, datalists, actions);
  });
}

function readRecipeForm(form, existing) {
  const get = (name) => form.elements[name]?.value.trim() ?? '';
  const title = get('title');
  if (!title) {
    alert('A title would help.');
    return null;
  }

  const ingredients = get('ingredients').split('\n').map((l) => l.replace(/^[-*•]\s*/, '').trim()).filter(Boolean)
    .map((text) => ({ text }));
  const steps = get('steps').split('\n').map((l) => l.replace(/^\d+[.)]\s*/, '').trim()).filter(Boolean);

  const grid = [];
  const gridErrors = [];
  get('grid').split('\n').map((l) => l.trim()).filter(Boolean).forEach((line, n) => {
    const m = line.match(/^(.*?)\s*\|\s*(\d+)\s*(?:-|to|–)\s*(\d+)\s*$/i) || line.match(/^(.*?)\s*\|\s*(\d+)()\s*$/);
    if (!m) { gridErrors.push(`Line ${n + 1}: expected  label | 1-4`); return; }
    const from = Number(m[2]) - 1;
    const to = (m[3] === '' ? Number(m[2]) : Number(m[3])) - 1;
    if (from < 0 || to >= ingredients.length) {
      gridErrors.push(`Line ${n + 1}: ingredient numbers must be between 1 and ${ingredients.length}`);
      return;
    }
    grid.push({ label: m[1].replace(/\s*\/\s*/g, '\n'), from, to });
  });
  if (gridErrors.length) {
    alert(`The grid needs a tweak:\n\n${gridErrors.join('\n')}`);
    return null;
  }

  const method = get('method') || 'Stovetop';
  return {
    id: existing?.id ?? slug(title),
    custom: true,
    title,
    blurb: get('blurb'),
    highlight: get('blurb'),
    category: get('category') || 'Mains',
    method,
    appliance: method,
    tags: get('tags').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    servings: Number(get('servings')) || undefined,
    prepMin: Number(get('prepMin')) || 0,
    cookMin: Number(get('cookMin')) || 0,
    ingredients,
    steps,
    grid,
    prep: get('prep').split('|').map((s) => s.trim()).filter(Boolean),
    tips: existing?.tips ?? [],
  };
}

function slug(title) {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'recipe';
  let id = base;
  let n = 2;
  while (allRecipes().some((r) => r.id === id)) id = `${base}-${n++}`;
  return id;
}

function field(label, control, hint) {
  const wrap = document.createElement('div');
  wrap.className = 'field';
  const l = document.createElement('label');
  l.textContent = label;
  l.htmlFor = control.id;
  wrap.append(l, control);
  if (hint) {
    const h = document.createElement('span');
    h.className = 'field-hint';
    h.textContent = hint;
    wrap.append(h);
  }
  return wrap;
}

function row(...fields) {
  const r = document.createElement('div');
  r.className = 'field-row';
  r.append(...fields);
  return r;
}

function input(name, value, attrs = {}) {
  const i = document.createElement('input');
  i.name = name;
  i.id = `f-${name}`;
  i.value = value ?? '';
  Object.entries(attrs).forEach(([k, v]) => i.setAttribute(k === 'list' ? 'list' : k, v));
  return i;
}

function textarea(name, value, placeholder) {
  const t = document.createElement('textarea');
  t.name = name;
  t.id = `f-${name}`;
  t.value = value ?? '';
  if (placeholder) t.placeholder = placeholder;
  return t;
}

/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

let toastTimer;
function toast(message) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = message;
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

function plural(n, word) {
  return n === 1 ? word : `${word}s`;
}

function relativeDate(ts) {
  if (!ts) return '';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/* ------------------------------------------------------------------ *
 * Routing
 * ------------------------------------------------------------------ */

function route() {
  const match = location.hash.match(/^#\/r\/(.+)$/);
  document.body.classList.remove('cook-mode');
  releaseWakeLock();

  if (match) {
    const recipe = findRecipe(decodeURIComponent(match[1]));
    if (recipe) {
      $('#view-library').hidden = true;
      $('#view-recipe').hidden = false;
      renderRecipe(recipe);
      document.title = `${recipe.title} · The Recipe Box`;
      window.scrollTo(0, 0);
      return;
    }
  }

  $('#view-recipe').hidden = true;
  $('#view-recipe').replaceChildren();
  $('#view-library').hidden = false;
  document.title = 'The Recipe Box';
  renderLibrary();
}

window.addEventListener('hashchange', route);

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

$('#search').addEventListener('input', (e) => {
  filters.q = e.target.value;
  if (!location.hash.startsWith('#/r/')) renderLibrary();
});

$('#sort').value = filters.sort;
$('#sort').addEventListener('change', (e) => {
  filters.sort = e.target.value;
  store.setPref('sort', filters.sort);
  renderLibrary();
});

const clearAll = () => {
  filters.q = '';
  filters.favourites = false;
  filters.categories.clear();
  filters.tags.clear();
  $('#search').value = '';
  renderLibrary();
};
$('#clear-filters').addEventListener('click', clearAll);
$('[data-clear]').addEventListener('click', clearAll);

$('#add-recipe').addEventListener('click', () => openRecipeDialog());
$('#settings').addEventListener('click', openSettings);
$('[data-open-settings]').addEventListener('click', openSettings);

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
    e.preventDefault();
    location.hash = '#/';
    $('#search').focus();
  }
  if (e.key === 'Escape' && document.activeElement === $('#search')) {
    clearAll();
    $('#search').blur();
  }
});

subscribe(() => {
  if (!$('#view-library').hidden) renderLibrary();
});

route();
