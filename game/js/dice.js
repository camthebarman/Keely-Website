// Dice. Every roll in the game goes through here so the log can show it.

export function d(sides) {
  // crypto-backed so nobody can argue the dice are rigged
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % sides) + 1;
}

export function randInt(min, max) {
  return min + d(max - min + 1) - 1;
}

export function pick(list) {
  return list[d(list.length) - 1];
}

export function chance(p) {
  return d(10000) <= p * 10000;
}

// "2d6+3" → { count: 2, sides: 6, bonus: 3 }
export function parseDice(expr) {
  const m = String(expr).replace(/\s/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!m) return { count: 0, sides: 0, bonus: parseInt(expr, 10) || 0 };
  return { count: m[1] === "" ? 1 : parseInt(m[1], 10), sides: parseInt(m[2], 10), bonus: m[3] ? parseInt(m[3], 10) : 0 };
}

// Rolls a dice expression. crit doubles the dice, not the bonus.
export function rollDice(expr, { crit = false, extraBonus = 0 } = {}) {
  const { count, sides, bonus } = parseDice(expr);
  const n = crit ? count * 2 : count;
  const rolls = [];
  for (let i = 0; i < n; i++) rolls.push(d(sides));
  const total = Math.max(0, rolls.reduce((a, b) => a + b, 0) + bonus + extraBonus);
  return { expr, rolls, bonus: bonus + extraBonus, total };
}

// A d20 test with advantage/disadvantage. Returns both dice for the log.
export function rollD20(mode = "none") {
  const a = d(20);
  if (mode === "none") return { dice: [a], natural: a };
  const b = d(20);
  const natural = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
  return { dice: [a, b], natural };
}

// Deterministic RNG for the portrait painter, seeded from text.
export function seededRng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let s = h >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
