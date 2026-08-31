// Everything personal — notes, favourites, cook log, and any recipes you add
// yourself — lives in this browser under one key. Nothing leaves the machine.
// Use Export from the ⚙ menu to take a copy with you.

const KEY = 'recipe-box.v1';

const EMPTY = {
  version: 1,
  notes: {},        // id -> { text, updated }
  favourites: [],   // [id]
  cooked: {},       // id -> { count, last }
  custom: [],       // user-added recipe objects
  prefs: {},        // theme, view, sort…
};

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    return { ...structuredClone(EMPTY), ...JSON.parse(raw) };
  } catch (err) {
    console.warn('Could not read saved data, starting fresh.', err);
    return structuredClone(EMPTY);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save.', err);
  }
  listeners.forEach((fn) => fn(state));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const store = {
  get all() {
    return state;
  },

  // --- notes ---------------------------------------------------------------
  note(id) {
    return state.notes[id]?.text ?? '';
  },
  noteUpdated(id) {
    return state.notes[id]?.updated ?? null;
  },
  setNote(id, text) {
    if (text.trim()) state.notes[id] = { text, updated: Date.now() };
    else delete state.notes[id];
    persist();
  },

  // --- favourites ----------------------------------------------------------
  isFavourite(id) {
    return state.favourites.includes(id);
  },
  toggleFavourite(id) {
    const i = state.favourites.indexOf(id);
    if (i === -1) state.favourites.push(id);
    else state.favourites.splice(i, 1);
    persist();
    return this.isFavourite(id);
  },

  // --- cook log ------------------------------------------------------------
  cookCount(id) {
    return state.cooked[id]?.count ?? 0;
  },
  lastCooked(id) {
    return state.cooked[id]?.last ?? null;
  },
  logCook(id) {
    const entry = state.cooked[id] ?? { count: 0, last: null };
    entry.count += 1;
    entry.last = Date.now();
    state.cooked[id] = entry;
    persist();
    return entry;
  },
  undoCook(id) {
    const entry = state.cooked[id];
    if (!entry) return;
    entry.count = Math.max(0, entry.count - 1);
    if (entry.count === 0) delete state.cooked[id];
    persist();
  },

  // --- custom recipes ------------------------------------------------------
  customRecipes() {
    return state.custom;
  },
  addCustom(recipe) {
    const existing = state.custom.findIndex((r) => r.id === recipe.id);
    if (existing >= 0) state.custom[existing] = recipe;
    else state.custom.push(recipe);
    persist();
  },
  removeCustom(id) {
    state.custom = state.custom.filter((r) => r.id !== id);
    delete state.notes[id];
    delete state.cooked[id];
    state.favourites = state.favourites.filter((f) => f !== id);
    persist();
  },

  // --- prefs ---------------------------------------------------------------
  pref(key, fallback) {
    return state.prefs[key] ?? fallback;
  },
  setPref(key, value) {
    state.prefs[key] = value;
    persist();
  },

  // --- backup --------------------------------------------------------------
  export() {
    return JSON.stringify(state, null, 2);
  },
  import(json, { merge = true } = {}) {
    const incoming = JSON.parse(json);
    if (!incoming || typeof incoming !== 'object') throw new Error('Not a recipe box backup.');
    if (!merge) {
      state = { ...structuredClone(EMPTY), ...incoming };
    } else {
      state.notes = { ...state.notes, ...(incoming.notes ?? {}) };
      state.cooked = { ...state.cooked, ...(incoming.cooked ?? {}) };
      state.favourites = [...new Set([...state.favourites, ...(incoming.favourites ?? [])])];
      state.prefs = { ...state.prefs, ...(incoming.prefs ?? {}) };
      const byId = new Map(state.custom.map((r) => [r.id, r]));
      (incoming.custom ?? []).forEach((r) => byId.set(r.id, r));
      state.custom = [...byId.values()];
    }
    persist();
  },
};
