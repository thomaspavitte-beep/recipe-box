// Cooking-for-Engineers style grid.
//
// Given a list of operations in the order you perform them, each covering a
// contiguous run of ingredient rows, work out which column each one belongs in.
// The rule: an operation sits one column to the right of the right-most thing it
// consumes. Two operations that touch no common rows can share a column.

export function layoutGrid(ops) {
  const placed = [];
  for (const op of ops) {
    const from = Math.min(op.from, op.to);
    const to = Math.max(op.from, op.to);
    let col = 0;
    for (const p of placed) {
      const overlaps = p.from <= to && p.to >= from;
      if (overlaps) col = Math.max(col, p.col + 1);
    }
    placed.push({ ...op, from, to, col });
  }
  return placed;
}

export function gridColumnCount(placed) {
  return placed.reduce((n, p) => Math.max(n, p.col + 1), 0);
}

// Build the DOM for the diagram. `rows` are the ingredient labels (strings).
export function renderGrid({ rows, ops, prep = [] }) {
  const placed = layoutGrid(ops);
  const cols = gridColumnCount(placed);

  const scroller = el('div', 'grid-scroll');
  const table = el('div', 'rgrid');
  table.style.setProperty('--op-cols', String(cols));

  // Full-width preparation rows across the top.
  prep.forEach((text) => {
    const cell = el('div', 'rgrid-prep', text);
    table.appendChild(cell);
  });

  const body = el('div', 'rgrid-body');
  body.style.setProperty('--rows', String(rows.length));
  body.style.setProperty('--op-cols', String(cols));

  rows.forEach((label, i) => {
    const cell = el('div', 'rgrid-ing', label);
    cell.style.gridRow = `${i + 1} / ${i + 2}`;
    cell.style.gridColumn = '1 / 2';
    body.appendChild(cell);
  });

  placed.forEach((op) => {
    const cell = el('div', 'rgrid-op');
    cell.style.gridRow = `${op.from + 1} / ${op.to + 2}`;
    cell.style.gridColumn = `${op.col + 2} / ${op.col + 3}`;
    op.label.split('\n').forEach((line, i) => {
      cell.appendChild(el('span', i === 0 ? 'op-line op-line-first' : 'op-line', line));
    });
    body.appendChild(cell);
  });

  table.appendChild(body);
  scroller.appendChild(table);
  return scroller;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
