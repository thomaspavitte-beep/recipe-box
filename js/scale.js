// Scale the quantities in an ingredient line by a factor, and write the result
// back as something a human would actually put on a shopping list (½, not 0.5).

const VULGAR = [
  [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [3 / 8, '⅜'], [1 / 2, '½'],
  [5 / 8, '⅝'], [2 / 3, '⅔'], [3 / 4, '¾'], [7 / 8, '⅞'],
];

// A number: "1", "1.5", "1/2", "1 1/2". Guarded so we never touch digits that
// are part of a word ("8x8", "whole30") or a temperature ("180°C").
const NUMBER = /(?<![\w.\/])(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)(?![\w\/]|\s*°)/g;

export function scaleText(text, factor) {
  if (!factor || factor === 1) return text;
  return text.replace(NUMBER, (match) => {
    const value = parseNumber(match);
    if (value == null) return match;
    return formatNumber(value * factor);
  });
}

function parseNumber(token) {
  const mixed = token.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = token.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

function formatNumber(value) {
  if (value >= 10) return String(Math.round(value));

  const whole = Math.floor(value);
  const rest = value - whole;

  if (rest < 0.02) return String(whole);

  for (const [fraction, glyph] of VULGAR) {
    if (Math.abs(rest - fraction) < 0.02) {
      return whole ? `${whole}${glyph}` : glyph;
    }
  }

  const rounded = Math.round(value * 100) / 100;
  return String(rounded);
}
