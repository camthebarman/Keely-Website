// Paints a rough, painterly bust portrait on a <canvas> from a set of traits.
// Every shape is filled with a base coat and then worked over with hundreds of
// small, jittered brush dabs so it reads as painted rather than drawn.
// A seeded RNG keeps the same description producing the same painting.

import { seededRng } from "./dice.js";

const W = 400, H = 500;

// ---------------------------------------------------------------- colour helpers

function hexToRgb(hex) {
  const h = String(hex || "#888").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
function shade(hex, amt) {
  // amt -1..1: negative darkens toward a cool shadow, positive lightens toward warm light
  const [r, g, b] = hexToRgb(hex);
  if (amt < 0) return `rgb(${clamp(r * (1 + amt) + 10 * -amt)},${clamp(g * (1 + amt) + 5 * -amt)},${clamp(b * (1 + amt) + 25 * -amt)})`;
  return `rgb(${clamp(r + (255 - r) * amt)},${clamp(g + (245 - g) * amt)},${clamp(b + (225 - b) * amt)})`;
}
function mix(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return "#" + [0, 1, 2].map((i) => clamp(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, "0")).join("");
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function validHex(h, fallback) {
  return /^#?[0-9a-f]{6}$/i.test(String(h || "")) ? (h.startsWith("#") ? h : `#${h}`) : fallback;
}

// ---------------------------------------------------------------- brush

class Brush {
  constructor(ctx, rng) { this.ctx = ctx; this.rng = rng; }
  r(a = 0, b = 1) { return a + this.rng() * (b - a); }

  dab(x, y, len, width, angle, color, alpha) {
    const c = this.ctx;
    c.save();
    c.translate(x, y);
    c.rotate(angle);
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.beginPath();
    c.ellipse(0, 0, len, width, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  // Loose line stroke with a wobble, like a brush dragged across canvas.
  stroke(points, color, width, alpha = 0.9) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.strokeStyle = color;
    c.lineCap = "round";
    c.lineJoin = "round";
    for (let pass = 0; pass < 2; pass++) {
      c.lineWidth = width * (pass ? 0.55 : 1);
      c.beginPath();
      points.forEach(([x, y], i) => {
        const jx = x + this.r(-1.2, 1.2), jy = y + this.r(-1.2, 1.2);
        if (i === 0) c.moveTo(jx, jy);
        else c.lineTo(jx, jy);
      });
      c.stroke();
    }
    c.restore();
  }

  // Fill a path, then work it over with dabs following a light direction.
  paint(pathFn, base, { dabs = 260, size = 9, flow = 0.4, light = [-0.6, -0.8], bounds, outline = true, texture = 1 } = {}) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    pathFn(c);
    c.fillStyle = base;
    c.fill();
    c.clip();
    const [x0, y0, x1, y1] = bounds || [0, 0, W, H];
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const span = Math.max(x1 - x0, y1 - y0) / 2;
    for (let i = 0; i < dabs; i++) {
      const x = this.r(x0, x1), y = this.r(y0, y1);
      // lit side lighter, far side darker
      const lx = (x - cx) / span, ly = (y - cy) / span;
      const lit = -(lx * light[0] + ly * light[1]);
      const tone = lit * 0.35 + this.r(-0.12, 0.12) * texture;
      const col = shade(base, Math.max(-0.6, Math.min(0.5, tone)));
      const ang = flow + this.r(-0.5, 0.5);
      this.dab(x, y, size * this.r(0.6, 1.6), size * this.r(0.18, 0.45), ang, col, this.r(0.25, 0.55));
    }
    c.restore();
    if (outline) {
      c.save();
      c.beginPath();
      pathFn(c);
      c.globalAlpha = 0.45;
      c.strokeStyle = shade(base, -0.55);
      c.lineWidth = 2.2;
      c.stroke();
      c.restore();
    }
  }
}

// ---------------------------------------------------------------- the painter

const CLASS_BG = {
  fighter: ["#5b4a3a", "#2a2320"], barbarian: ["#7a3a22", "#2a1a14"], rogue: ["#2f3440", "#121418"],
  ranger: ["#3f5a3a", "#1a2418"], paladin: ["#8a7a4a", "#2e2818"], cleric: ["#8f8a70", "#34301f"],
  wizard: ["#2f3a6a", "#12162a"], sorcerer: ["#6a2a4a", "#221020"], warlock: ["#3a2350", "#120a1a"],
  druid: ["#4a6a30", "#18220f"], monk: ["#8a5a2a", "#2a1a0e"], bard: ["#7a3050", "#24101a"],
};

export function paintPortrait(canvas, traits, { raceId, clsId, seed = "" } = {}) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const rng = seededRng(`${seed}|${raceId}|${clsId}|${JSON.stringify(traits)}`);
  const b = new Brush(ctx, rng);
  const t = normalize(traits, raceId, clsId);

  background(b, ctx, t, clsId);
  body(b, ctx, t);
  hairBack(b, ctx, t);
  ears(b, ctx, t, "back");
  head(b, ctx, t);
  ears(b, ctx, t, "front");
  face(b, ctx, t);
  beard(b, ctx, t);
  hairFront(b, ctx, t);
  horns(b, ctx, t);
  headwear(b, ctx, t);
  finish(b, ctx, t);
}

function normalize(tr, raceId, clsId) {
  const t = { ...tr };
  t.skin = validHex(t.skin, "#d9a882");
  t.hair_color = validHex(t.hair_color, "#3a2a1a");
  t.eye_color = validHex(t.eye_color, "#4a6a8a");
  t.outfit_color = validHex(t.outfit_color, "#555555");
  if (t.age === "old") t.hair_color = mix(t.hair_color, "#d8d6d0", 0.6);
  t.raceId = raceId;
  t.clsId = clsId;
  // geometry
  const small = raceId === "halfling" || raceId === "gnome";
  t.hx = 200;
  t.hy = small ? 218 : 205;
  t.hrx = raceId === "dwarf" || raceId === "half_orc" ? 78 : small ? 70 : t.feminine ? 64 : 68;
  t.hry = small ? 82 : 92;
  t.jaw = t.feminine ? 0.72 : t.build === "broad" || raceId === "half_orc" || raceId === "dwarf" ? 0.95 : 0.82;
  t.shoulder = t.build === "broad" ? 175 : t.build === "slim" ? 128 : 150;
  if (raceId === "dwarf" || raceId === "half_orc") t.shoulder += 18;
  return t;
}

function background(b, ctx, t, clsId) {
  const [c1, c2] = CLASS_BG[clsId] || ["#555", "#222"];
  const g = ctx.createRadialGradient(150, 150, 30, 200, 250, 360);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // big loose strokes
  for (let i = 0; i < 140; i++) {
    const x = b.r(-20, W + 20), y = b.r(-20, H + 20);
    const col = b.rng() < 0.5 ? shade(c1, b.r(-0.3, 0.25)) : shade(c2, b.r(-0.1, 0.35));
    b.dab(x, y, b.r(25, 70), b.r(4, 12), b.r(-0.9, -0.4), col, b.r(0.08, 0.22));
  }
  // halo of light behind the head
  const halo = ctx.createRadialGradient(t.hx - 20, t.hy - 30, 10, t.hx, t.hy, 230);
  halo.addColorStop(0, "rgba(255,235,200,0.28)");
  halo.addColorStop(1, "rgba(255,235,200,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);
}

function body(b, ctx, t) {
  const sw = t.shoulder;
  const top = t.hy + t.hry * 0.9;
  const neckW = t.hrx * (t.raceId === "dragonborn" ? 0.62 : 0.48);
  // neck
  b.paint((c) => {
    c.moveTo(t.hx - neckW, top - 30);
    c.lineTo(t.hx - neckW - 6, top + 50);
    c.lineTo(t.hx + neckW + 6, top + 50);
    c.lineTo(t.hx + neckW, top - 30);
    c.closePath();
  }, shade(t.skin, -0.12), { bounds: [t.hx - 60, top - 30, t.hx + 60, top + 50], dabs: 90, size: 6, flow: 1.4 });
  if (t.scales) scalePattern(b, t.hx - neckW, top - 20, neckW * 2, 60, t.skin);

  const col = t.outfit_color;
  const path = (c) => {
    c.moveTo(t.hx - sw - 20, H + 5);
    c.bezierCurveTo(t.hx - sw - 18, top + 70, t.hx - sw + 10, top + 40, t.hx - neckW - 10, top + 30);
    c.quadraticCurveTo(t.hx, top + (t.outfit === "robe" ? 95 : 55), t.hx + neckW + 10, top + 30);
    c.bezierCurveTo(t.hx + sw - 10, top + 40, t.hx + sw + 18, top + 70, t.hx + sw + 20, H + 5);
    c.closePath();
  };
  const base = t.outfit === "plate" ? mix(col, "#b8bcc4", 0.5) : t.outfit === "mail" ? mix(col, "#8a8e96", 0.6) : t.outfit === "fur" ? mix(col, "#6a4a2e", 0.5) : col;
  b.paint(path, base, { bounds: [t.hx - sw - 20, top + 20, t.hx + sw + 20, H], dabs: 420, size: 12, flow: 1.2, texture: t.outfit === "fur" ? 2 : 1 });

  ctx.save();
  ctx.beginPath(); path(ctx); ctx.clip();
  if (t.outfit === "plate") {
    // pauldrons with highlights
    for (const side of [-1, 1]) {
      const px = t.hx + side * (sw - 30), py = top + 70;
      b.paint((c) => c.ellipse(px, py, 62, 40, side * 0.35, 0, Math.PI * 2), mix(base, "#dfe3ea", 0.2), { bounds: [px - 62, py - 40, px + 62, py + 40], dabs: 120, size: 8, flow: side * 0.4 });
      b.stroke([[px - 40 * side, py - 18], [px, py - 30], [px + 30 * side, py - 10]], "rgba(255,255,255,0.8)", 3, 0.6);
      for (let k = -1; k <= 1; k++) b.dab(px + k * 20, py + 22, 3, 3, 0, shade(base, -0.5), 0.8);
    }
    b.stroke([[t.hx, top + 60], [t.hx, H]], shade(base, -0.4), 4, 0.5);
  } else if (t.outfit === "mail") {
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = shade(base, -0.5);
    ctx.lineWidth = 1.4;
    for (let y = top + 40; y < H; y += 9) {
      for (let x = t.hx - sw - 20; x < t.hx + sw + 20; x += 10) {
        ctx.beginPath();
        ctx.arc(x + ((y / 9) % 2) * 5, y, 5, 0, Math.PI);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // tabard strip in the outfit colour
    b.paint((c) => c.rect(t.hx - 38, top + 60, 76, H), col, { bounds: [t.hx - 38, top + 60, t.hx + 38, H], dabs: 80, size: 8, flow: 1.5 });
  } else if (t.outfit === "robe") {
    for (let i = 0; i < 6; i++) {
      const x = t.hx + b.r(-sw, sw);
      b.stroke([[x, top + 70], [x + b.r(-15, 15), H]], shade(base, -0.45), b.r(2, 5), 0.35);
    }
    // trim along the V-neck
    b.stroke([[t.hx - neckW - 10, top + 30], [t.hx, top + 95], [t.hx + neckW + 10, top + 30]], "#d8b460", 5, 0.8);
  } else if (t.outfit === "leather") {
    b.stroke([[t.hx - sw + 20, top + 40], [t.hx + sw - 40, H]], shade(base, -0.5), 10, 0.7);
    for (let k = 0; k < 4; k++) b.dab(t.hx - sw + 60 + k * 45, top + 70 + k * 45, 5, 4, 0, "#c9a052", 0.9);
    b.stroke([[t.hx - 20, top + 50], [t.hx - 25, H]], shade(base, -0.35), 2, 0.5);
  } else if (t.outfit === "fur") {
    for (let i = 0; i < 260; i++) {
      const side = b.rng() < 0.5 ? -1 : 1;
      const x = t.hx + side * b.r(neckW, sw + 10), y = top + b.r(25, 100);
      b.dab(x, y, b.r(5, 12), b.r(1.5, 3), b.r(1, 2.2), shade("#8a6a4a", b.r(-0.5, 0.4)), 0.6);
    }
  } else if (t.outfit === "wrap") {
    b.stroke([[t.hx - sw + 10, top + 50], [t.hx + 40, H]], shade(base, -0.4), 6, 0.6);
    b.stroke([[t.hx + sw - 10, top + 50], [t.hx - 40, H]], shade(base, -0.3), 6, 0.6);
    b.paint((c) => c.rect(t.hx - sw - 20, H - 60, (sw + 20) * 2, 18), "#2a2a2a", { bounds: [t.hx - sw, H - 60, t.hx + sw, H - 42], dabs: 40, size: 6, outline: false });
  }
  // class accent: a clasp or holy symbol
  if (["cleric", "paladin"].includes(t.clsId)) {
    b.dab(t.hx, top + 110, 11, 11, 0, "#e0c070", 0.9);
    b.stroke([[t.hx, top + 100], [t.hx, top + 120]], "#7a5a20", 2, 0.9);
    b.stroke([[t.hx - 7, top + 108], [t.hx + 7, top + 108]], "#7a5a20", 2, 0.9);
  } else if (["wizard", "sorcerer", "warlock", "druid"].includes(t.clsId)) {
    const gem = { wizard: "#6fa8ff", sorcerer: "#ff6f8f", warlock: "#b06fff", druid: "#7fdf6f" }[t.clsId];
    b.dab(t.hx, top + 70, 9, 9, 0, gem, 0.9);
    b.dab(t.hx - 3, top + 67, 3, 3, 0, "#ffffff", 0.8);
  }
  ctx.restore();
  // cape/hood edge behind shoulders for rogues & rangers
}

function scalePattern(b, x, y, w, h, base) {
  const ctx = b.ctx;
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.strokeStyle = shade(base, -0.45);
  ctx.lineWidth = 1.2;
  for (let yy = y; yy < y + h; yy += 8) {
    for (let xx = x; xx < x + w; xx += 9) {
      ctx.beginPath();
      ctx.arc(xx + ((yy / 8) % 2) * 4.5, yy, 4.5, 0.1, Math.PI - 0.1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function headPath(t) {
  const { hx, hy, hrx, hry, jaw } = t;
  if (t.raceId === "dragonborn") {
    return (c) => {
      c.moveTo(hx - hrx * 0.95, hy - hry * 0.2);
      c.bezierCurveTo(hx - hrx * 1.0, hy - hry * 1.1, hx + hrx * 1.0, hy - hry * 1.1, hx + hrx * 0.95, hy - hry * 0.2);
      c.bezierCurveTo(hx + hrx * 0.95, hy + hry * 0.4, hx + hrx * 0.6, hy + hry * 1.05, hx, hy + hry * 1.08);
      c.bezierCurveTo(hx - hrx * 0.6, hy + hry * 1.05, hx - hrx * 0.95, hy + hry * 0.4, hx - hrx * 0.95, hy - hry * 0.2);
      c.closePath();
    };
  }
  return (c) => {
    c.moveTo(hx - hrx, hy - hry * 0.05);
    c.bezierCurveTo(hx - hrx * 1.02, hy - hry * 1.25, hx + hrx * 1.02, hy - hry * 1.25, hx + hrx, hy - hry * 0.05);
    c.bezierCurveTo(hx + hrx * 0.98, hy + hry * 0.45, hx + hrx * jaw * 0.7, hy + hry * 0.95, hx, hy + hry);
    c.bezierCurveTo(hx - hrx * jaw * 0.7, hy + hry * 0.95, hx - hrx * 0.98, hy + hry * 0.45, hx - hrx, hy - hry * 0.05);
    c.closePath();
  };
}

function head(b, ctx, t) {
  const { hx, hy, hrx, hry } = t;
  b.paint(headPath(t), t.skin, { bounds: [hx - hrx, hy - hry, hx + hrx, hy + hry], dabs: 520, size: 7, flow: 1.1 });
  ctx.save();
  ctx.beginPath(); headPath(t)(ctx); ctx.clip();
  // cheek warmth and a jaw shadow
  for (const side of [-1, 1]) {
    const g = ctx.createRadialGradient(hx + side * hrx * 0.5, hy + hry * 0.3, 2, hx + side * hrx * 0.5, hy + hry * 0.3, hrx * 0.4);
    g.addColorStop(0, "rgba(200,70,60,0.18)");
    g.addColorStop(1, "rgba(200,70,60,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const sh = ctx.createLinearGradient(hx - hrx, 0, hx + hrx, 0);
  sh.addColorStop(0, "rgba(0,0,0,0)");
  sh.addColorStop(0.7, "rgba(0,0,0,0)");
  sh.addColorStop(1, "rgba(20,10,30,0.28)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, W, H);
  if (t.scales) scalePattern(b, hx - hrx, hy - hry * 0.4, hrx * 2, hry * 1.5, t.skin);
  if (t.freckles) {
    for (let i = 0; i < 40; i++) {
      const side = b.rng() < 0.5 ? -1 : 1;
      b.dab(hx + side * b.r(10, hrx * 0.6), hy + b.r(5, hry * 0.35), 1.4, 1.2, 0, shade(t.skin, -0.35), 0.6);
    }
  }
  if (t.tattoo) {
    const ink = t.clsId === "barbarian" ? "#2a4f9a" : "#2a2a3a";
    b.stroke([[hx - hrx * 0.62, hy - hry * 0.05], [hx - hrx * 0.42, hy + hry * 0.25], [hx - hrx * 0.52, hy + hry * 0.5]], ink, 4, 0.55);
    b.stroke([[hx - hrx * 0.5, hy - hry * 0.05], [hx - hrx * 0.3, hy + hry * 0.2]], ink, 3, 0.5);
    b.stroke([[hx - 12, hy - hry * 0.62], [hx, hy - hry * 0.48], [hx + 12, hy - hry * 0.62]], ink, 3, 0.45);
  }
  if (t.age === "old") {
    for (const side of [-1, 1]) {
      b.stroke([[hx + side * hrx * 0.72, hy - 12], [hx + side * hrx * 0.82, hy - 4]], shade(t.skin, -0.4), 1.4, 0.5);
      b.stroke([[hx + side * hrx * 0.72, hy - 6], [hx + side * hrx * 0.84, hy + 2]], shade(t.skin, -0.4), 1.4, 0.5);
      b.stroke([[hx + side * 22, hy + hry * 0.3], [hx + side * 30, hy + hry * 0.55]], shade(t.skin, -0.35), 1.6, 0.5);
    }
    b.stroke([[hx - 25, hy - hry * 0.5], [hx + 25, hy - hry * 0.5]], shade(t.skin, -0.3), 1.2, 0.4);
  }
  ctx.restore();
}

function ears(b, ctx, t, layer) {
  if (layer !== "back") return;
  const { hx, hy, hrx } = t;
  if (t.raceId === "dragonborn") {
    // frills instead of ears
    for (const side of [-1, 1]) {
      b.paint((c) => {
        c.moveTo(hx + side * hrx * 0.85, hy - 30);
        c.lineTo(hx + side * (hrx + 38), hy - 60);
        c.lineTo(hx + side * (hrx + 22), hy - 20);
        c.lineTo(hx + side * (hrx + 40), hy - 5);
        c.lineTo(hx + side * hrx * 0.9, hy + 20);
        c.closePath();
      }, shade(t.skin, -0.2), { bounds: [hx + side * hrx - 45, hy - 60, hx + side * hrx + 45, hy + 20], dabs: 60, size: 5 });
    }
    return;
  }
  for (const side of [-1, 1]) {
    const ex = hx + side * hrx * 0.96, ey = hy + 5;
    const pointed = t.pointed_ears;
    const long = t.raceId === "elf" ? 46 : t.raceId === "gnome" ? 30 : 24;
    b.paint((c) => {
      c.moveTo(ex, ey - 22);
      if (pointed) {
        c.quadraticCurveTo(ex + side * 18, ey - 30, ex + side * long, ey - 42);
        c.quadraticCurveTo(ex + side * 22, ey + 5, ex + side * 4, ey + 22);
      } else {
        c.quadraticCurveTo(ex + side * 20, ey - 26, ex + side * 16, ey);
        c.quadraticCurveTo(ex + side * 14, ey + 20, ex, ey + 22);
      }
      c.closePath();
    }, shade(t.skin, -0.06), { bounds: [ex - 50, ey - 45, ex + 50, ey + 25], dabs: 50, size: 5 });
    b.stroke([[ex + side * 5, ey - 10], [ex + side * 10, ey + 5]], shade(t.skin, -0.4), 1.5, 0.5);
  }
}

function face(b, ctx, t) {
  const { hx, hy, hrx, hry } = t;
  const dragon = t.raceId === "dragonborn";
  const eyeY = hy + (dragon ? -hry * 0.22 : -hry * 0.02);
  const eyeDx = hrx * (dragon ? 0.5 : 0.4);
  const eyeR = t.raceId === "gnome" || t.raceId === "halfling" ? 10 : 8.5;
  const stern = t.expression === "stern";
  const smile = t.expression === "smile";

  for (const side of [-1, 1]) {
    const ex = hx + side * eyeDx;
    if (t.eyepatch && side === 1) continue;
    // socket shadow
    b.dab(ex, eyeY - 2, eyeR * 1.8, eyeR * 1.05, 0, shade(t.skin, -0.3), 0.35);
    // white
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeR * 1.35, eyeR * (dragon ? 0.8 : 0.7), 0, 0, Math.PI * 2);
    ctx.fillStyle = dragon ? "#e8d27a" : "#f2ece2";
    ctx.fill();
    ctx.clip();
    // iris
    ctx.fillStyle = dragon ? t.eye_color : t.eye_color;
    ctx.beginPath();
    ctx.arc(ex + side * -1, eyeY, eyeR * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shade(t.eye_color, -0.4);
    ctx.beginPath();
    ctx.arc(ex + side * -1, eyeY, eyeR * 0.72, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = shade(t.eye_color, -0.5);
    ctx.stroke();
    // pupil
    ctx.fillStyle = "#0e0a0a";
    ctx.beginPath();
    if (dragon || t.raceId === "tiefling") ctx.ellipse(ex - side, eyeY, eyeR * 0.14, eyeR * 0.6, 0, 0, Math.PI * 2);
    else ctx.arc(ex - side, eyeY, eyeR * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // lid shadow
    ctx.fillStyle = "rgba(40,20,20,0.25)";
    ctx.fillRect(ex - eyeR * 2, eyeY - eyeR, eyeR * 4, eyeR * 0.45);
    ctx.restore();
    // catchlight
    b.dab(ex - side * 1 - 2.5, eyeY - 2.5, 2, 2, 0, "#ffffff", 0.9);
    // upper lid line
    b.stroke([[ex - eyeR * 1.45, eyeY + 1], [ex, eyeY - eyeR * 0.85], [ex + eyeR * 1.45, eyeY + 1]], "#2a1a14", 2.2, 0.8);
    if (t.glow) {
      const g = ctx.createRadialGradient(ex, eyeY, 1, ex, eyeY, eyeR * 3.5);
      g.addColorStop(0, rgba(t.eye_color, 0.7));
      g.addColorStop(1, rgba(t.eye_color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(ex - 40, eyeY - 40, 80, 80);
    }
    // brow
    const browY = eyeY - eyeR * 2.1;
    const tilt = stern ? 6 : smile ? -2 : 0;
    const thick = t.raceId === "dwarf" || t.raceId === "half_orc" ? 6 : t.feminine ? 3 : 4.5;
    b.stroke([[ex - side * eyeR * 1.6, browY + (side === -1 ? 0 : 0) - tilt * 0.2], [ex + side * eyeR * 0.2, browY - 3], [ex + side * eyeR * 1.6, browY + 2 - tilt * -0.4]]
      .map(([x, y], i) => [x, i === 0 ? y + tilt : y]), dragon ? shade(t.skin, -0.45) : shade(t.hair_color, -0.1), thick, 0.85);
  }

  if (t.eyepatch) {
    const ex = hx + eyeDx;
    b.paint((c) => c.ellipse(ex, eyeY, eyeR * 1.7, eyeR * 1.3, 0.1, 0, Math.PI * 2), "#1c1714", { bounds: [ex - 20, eyeY - 16, ex + 20, eyeY + 16], dabs: 30, size: 4 });
    b.stroke([[hx - hrx, eyeY - 30], [ex - 10, eyeY - 8]], "#1c1714", 3, 0.9);
    b.stroke([[ex + 12, eyeY - 8], [hx + hrx, eyeY - 18]], "#1c1714", 3, 0.9);
  }

  // nose
  if (dragon) {
    b.dab(hx - 10, hy + hry * 0.55, 3, 2, 0.3, "#1a0e0a", 0.8);
    b.dab(hx + 10, hy + hry * 0.55, 3, 2, -0.3, "#1a0e0a", 0.8);
    b.stroke([[hx - hrx * 0.6, hy + hry * 0.78], [hx, hy + hry * 0.86], [hx + hrx * 0.6, hy + hry * 0.78]], "#2a140e", 3, 0.8);
    if (smile) b.stroke([[hx + hrx * 0.5, hy + hry * 0.8], [hx + hrx * 0.62, hy + hry * 0.7]], "#2a140e", 2, 0.7);
  } else {
    const noseW = t.raceId === "half_orc" ? 14 : t.raceId === "gnome" ? 12 : 9;
    const noseY = hy + hry * 0.32;
    b.stroke([[hx + 2, eyeY + 6], [hx + 5, noseY - 6], [hx + noseW * 0.4, noseY]], shade(t.skin, -0.3), 2.2, 0.55);
    b.dab(hx, noseY + 2, noseW * 1.1, 4, 0, shade(t.skin, -0.2), 0.4);
    b.dab(hx - noseW * 0.5, noseY + 2, 2.5, 1.8, 0.3, shade(t.skin, -0.55), 0.7);
    b.dab(hx + noseW * 0.5, noseY + 2, 2.5, 1.8, -0.3, shade(t.skin, -0.55), 0.7);
    b.dab(hx - 3, noseY - 10, 2, 7, 0, shade(t.skin, 0.35), 0.35);

    // mouth
    const my = hy + hry * 0.58;
    const mw = t.feminine ? 18 : 21;
    const curve = smile ? 7 : stern ? -3 : 1.5;
    const lip = t.feminine ? mix(t.skin, "#a83a3a", 0.45) : mix(t.skin, "#8a3a30", 0.28);
    b.paint((c) => {
      c.moveTo(hx - mw, my);
      c.quadraticCurveTo(hx, my + curve + (t.feminine ? 9 : 6), hx + mw, my);
      c.quadraticCurveTo(hx, my + curve * 0.4 + 1, hx - mw, my);
    }, lip, { bounds: [hx - mw, my - 4, hx + mw, my + 14], dabs: 24, size: 4, outline: false });
    b.stroke([[hx - mw, my], [hx - mw * 0.4, my + curve * 0.5 + 1], [hx + mw * 0.4, my + curve * 0.5 + 1], [hx + mw, my]], "#3a1a16", 2, 0.75);
    if (t.tusks) {
      for (const side of [-1, 1]) {
        b.paint((c) => {
          c.moveTo(hx + side * (mw - 6), my + 4);
          c.lineTo(hx + side * (mw - 1), my - 13);
          c.lineTo(hx + side * (mw + 4), my + 3);
          c.closePath();
        }, "#efe6cf", { bounds: [hx + side * mw - 8, my - 14, hx + side * mw + 8, my + 5], dabs: 10, size: 3 });
      }
    }
  }

  if (t.scar) {
    const sx = hx - eyeDx;
    b.stroke([[sx - 6, eyeY - 26], [sx + 2, eyeY - 5], [sx + 9, eyeY + 22]], mix(t.skin, "#e6b0a8", 0.5), 3.2, 0.9);
    b.stroke([[sx - 6, eyeY - 26], [sx + 2, eyeY - 5], [sx + 9, eyeY + 22]], shade(t.skin, -0.45), 1, 0.6);
  }

  if (t.glasses) {
    ctx.save();
    ctx.strokeStyle = "#c9a052";
    ctx.lineWidth = 2.5;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(hx + side * eyeDx, eyeY, eyeR * 1.9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(220,235,255,0.12)";
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(hx - eyeDx + eyeR * 1.9, eyeY);
    ctx.quadraticCurveTo(hx, eyeY - 6, hx + eyeDx - eyeR * 1.9, eyeY);
    ctx.stroke();
    ctx.restore();
  }
}

function hairBack(b, ctx, t) {
  if (t.raceId === "dragonborn" || t.hair_style === "bald" || t.headwear === "helm") return;
  const { hx, hy, hrx, hry } = t;
  const col = t.hair_color;
  if (t.hair_style === "long" || t.hair_style === "curly" || (t.feminine && t.hair_style !== "short" && t.hair_style !== "mohawk")) {
    const len = t.hair_style === "curly" ? 150 : 210;
    const puff = t.hair_style === "curly" ? 34 : 14;
    b.paint((c) => {
      c.moveTo(hx - hrx - puff, hy - 20);
      c.bezierCurveTo(hx - hrx - puff - 10, hy - hry - 40, hx + hrx + puff + 10, hy - hry - 40, hx + hrx + puff, hy - 20);
      c.bezierCurveTo(hx + hrx + puff + 8, hy + len * 0.5, hx + hrx + 10, hy + len * 0.8, hx + hrx - 10, hy + len);
      c.lineTo(hx - hrx + 10, hy + len);
      c.bezierCurveTo(hx - hrx - 10, hy + len * 0.8, hx - hrx - puff - 8, hy + len * 0.5, hx - hrx - puff, hy - 20);
      c.closePath();
    }, shade(col, -0.18), { bounds: [hx - hrx - puff - 10, hy - hry - 40, hx + hrx + puff + 10, hy + len], dabs: 380, size: t.hair_style === "curly" ? 6 : 10, flow: 1.5, texture: 1.6 });
    hairStrands(b, t, hx - hrx - puff * 0.6, hx + hrx + puff * 0.6, hy - hry * 0.3, hy + len - 10, col);
  }
  if (t.hair_style === "braids") {
    for (const side of [-1, 1]) {
      let x = hx + side * (hrx + 6), y = hy - 10;
      for (let k = 0; k < 9; k++) {
        b.paint((c) => c.ellipse(x, y, 11, 14, side * 0.3, 0, Math.PI * 2), shade(col, (k % 2 ? -0.1 : 0.05)), { bounds: [x - 11, y - 14, x + 11, y + 14], dabs: 16, size: 4 });
        y += 22; x += side * 1.5;
      }
      b.dab(x, y - 6, 6, 4, 0, "#c9a052", 0.9);
    }
  }
  if (t.hair_style === "ponytail") {
    b.paint((c) => {
      c.moveTo(hx + hrx * 0.4, hy - hry * 0.9);
      c.quadraticCurveTo(hx + hrx + 50, hy - hry * 0.6, hx + hrx + 30, hy + 90);
      c.quadraticCurveTo(hx + hrx + 10, hy, hx + hrx * 0.6, hy - hry * 0.5);
      c.closePath();
    }, shade(col, -0.1), { bounds: [hx, hy - hry, hx + hrx + 60, hy + 90], dabs: 120, size: 8, flow: 1.3 });
  }
}

function hairStrands(b, t, x0, x1, y0, y1, col) {
  for (let i = 0; i < 40; i++) {
    const x = b.r(x0, x1);
    const pts = [];
    for (let y = y0; y < y1; y += 18) pts.push([x + Math.sin(y / 20 + i) * 3, y]);
    b.stroke(pts, b.rng() < 0.5 ? shade(col, 0.25) : shade(col, -0.35), b.r(0.8, 1.8), 0.35);
  }
}

function hairFront(b, ctx, t) {
  if (t.raceId === "dragonborn") return;
  const { hx, hy, hrx, hry } = t;
  const col = t.hair_color;
  const top = hy - hry;
  if (t.headwear === "helm" || t.headwear === "hood") return;
  if (t.hair_style === "bald") {
    b.dab(hx - 20, top + 30, 26, 10, -0.3, "rgba(255,255,255,1)", 0.12);
    return;
  }
  if (t.hair_style === "mohawk") {
    b.paint((c) => {
      c.moveTo(hx - 16, top + 40);
      c.quadraticCurveTo(hx - 20, top - 45, hx, top - 55);
      c.quadraticCurveTo(hx + 20, top - 45, hx + 16, top + 40);
      c.closePath();
    }, col, { bounds: [hx - 22, top - 55, hx + 22, top + 40], dabs: 90, size: 6, flow: 1.6, texture: 1.6 });
    // shaved sides
    for (let i = 0; i < 80; i++) b.dab(hx + b.r(-hrx * 0.8, hrx * 0.8), top + b.r(15, 55), 1.2, 1.2, 0, shade(col, -0.2), 0.3);
    return;
  }
  // cap of hair over the skull with a fringe
  const fringe = t.hair_style === "short" ? 0.42 : t.hair_style === "curly" ? 0.5 : 0.38;
  const puff = t.hair_style === "curly" ? 22 : t.hair_style === "short" ? 4 : 10;
  b.paint((c) => {
    c.moveTo(hx - hrx - puff * 0.6, hy - hry * 0.05);
    c.bezierCurveTo(hx - hrx - puff, top - puff * 1.6, hx + hrx + puff, top - puff * 1.6, hx + hrx + puff * 0.6, hy - hry * 0.05);
    c.quadraticCurveTo(hx + hrx * 0.85, hy - hry * fringe - 10, hx + hrx * 0.45, hy - hry * fringe);
    c.quadraticCurveTo(hx + 10, hy - hry * (fringe + 0.2), hx - hrx * 0.2, hy - hry * fringe + 6);
    c.quadraticCurveTo(hx - hrx * 0.7, hy - hry * (fringe + 0.1), hx - hrx * 0.88, hy - hry * 0.02);
    c.closePath();
  }, col, { bounds: [hx - hrx - puff, top - puff * 1.6, hx + hrx + puff, hy], dabs: 340, size: t.hair_style === "curly" ? 5 : 8, flow: 0.4, texture: 1.6 });
  if (t.hair_style === "curly") {
    for (let i = 0; i < 90; i++) {
      const a = b.r(Math.PI * 1.05, Math.PI * 1.95);
      const rr = b.r(0.9, 1.15);
      const x = hx + Math.cos(a) * (hrx + 10) * rr, y = hy - 10 + Math.sin(a) * (hry + 10) * rr;
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = b.rng() < 0.5 ? shade(col, 0.25) : shade(col, -0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, b.r(3, 6), 0, Math.PI * 1.6);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    for (let i = 0; i < 26; i++) {
      const x = hx + b.r(-hrx, hrx);
      b.stroke([[x * 0.9 + hx * 0.1, top - 4], [x, hy - hry * fringe]], b.rng() < 0.5 ? shade(col, 0.3) : shade(col, -0.35), b.r(1, 2), 0.4);
    }
  }
}

function beard(b, ctx, t) {
  if (t.beard === "none" || t.raceId === "dragonborn") return;
  const { hx, hy, hrx, hry } = t;
  const col = t.hair_color;
  if (t.beard === "stubble") {
    for (let i = 0; i < 380; i++) {
      const a = b.r(0.15, Math.PI - 0.15);
      const rr = b.r(0.62, 0.98);
      const x = hx + Math.cos(a) * hrx * 0.9 * rr, y = hy + hry * 0.2 + Math.sin(a) * hry * 0.78 * rr;
      if (Math.abs(x - hx) < 24 && y < hy + hry * 0.66 && y > hy + hry * 0.5) continue;
      b.dab(x, y, 1.1, 0.8, 0, shade(col, -0.2), 0.35);
    }
    return;
  }
  const len = t.beard === "long" ? 120 : 45;
  b.paint((c) => {
    c.moveTo(hx - hrx * 0.95, hy + 5);
    c.quadraticCurveTo(hx - hrx * 0.95, hy + hry * 0.8, hx - hrx * 0.5, hy + hry * 0.8 + len * 0.6);
    c.quadraticCurveTo(hx, hy + hry + len, hx + hrx * 0.5, hy + hry * 0.8 + len * 0.6);
    c.quadraticCurveTo(hx + hrx * 0.95, hy + hry * 0.8, hx + hrx * 0.95, hy + 5);
    c.quadraticCurveTo(hx + hrx * 0.7, hy + hry * 0.45, hx + 26, hy + hry * 0.5);
    // leave room for the mouth
    c.quadraticCurveTo(hx, hy + hry * 0.72, hx - 26, hy + hry * 0.5);
    c.quadraticCurveTo(hx - hrx * 0.7, hy + hry * 0.45, hx - hrx * 0.95, hy + 5);
    c.closePath();
  }, col, { bounds: [hx - hrx, hy, hx + hrx, hy + hry + len], dabs: 360, size: 7, flow: 1.5, texture: 1.6 });
  // moustache
  b.paint((c) => {
    c.moveTo(hx - 30, hy + hry * 0.6);
    c.quadraticCurveTo(hx, hy + hry * 0.42, hx + 30, hy + hry * 0.6);
    c.quadraticCurveTo(hx, hy + hry * 0.52, hx - 30, hy + hry * 0.6);
  }, shade(col, -0.05), { bounds: [hx - 30, hy + hry * 0.42, hx + 30, hy + hry * 0.62], dabs: 40, size: 4, flow: 0 });
  hairStrands(b, t, hx - hrx * 0.6, hx + hrx * 0.6, hy + hry * 0.8, hy + hry + len * 0.8, col);
  if (t.beard === "long" && t.raceId === "dwarf") {
    b.dab(hx, hy + hry + len * 0.55, 7, 5, 0, "#c9a052", 0.9);
    b.dab(hx, hy + hry + len * 0.55 + 12, 7, 5, 0, "#c9a052", 0.9);
  }
}

function horns(b, ctx, t) {
  if (!t.horns) return;
  const { hx, hy, hrx, hry } = t;
  const col = t.raceId === "tiefling" ? "#2a1a1e" : "#4a3a2a";
  for (const side of [-1, 1]) {
    const bx = hx + side * hrx * 0.45, by = hy - hry * 0.8;
    b.paint((c) => {
      c.moveTo(bx - side * 12, by + 8);
      c.bezierCurveTo(bx + side * 10, by - 55, bx + side * 65, by - 60, bx + side * 70, by - 10);
      c.bezierCurveTo(bx + side * 55, by - 40, bx + side * 20, by - 30, bx + side * 12, by + 12);
      c.closePath();
    }, col, { bounds: side > 0 ? [bx - 20, by - 65, bx + 75, by + 15] : [bx - 75, by - 65, bx + 20, by + 15], dabs: 90, size: 5, flow: side * -0.8 });
    for (let k = 1; k < 5; k++) b.stroke([[bx + side * (k * 12), by - 30 - k * 3], [bx + side * (k * 12 + 4), by - 16 - k * 2]], shade(col, 0.4), 1.2, 0.5);
  }
}

function headwear(b, ctx, t) {
  const { hx, hy, hrx, hry } = t;
  const top = hy - hry;
  const col = t.outfit_color;
  switch (t.headwear) {
    case "hood":
      b.paint((c) => {
        c.moveTo(hx - hrx - 34, hy + hry + 40);
        c.bezierCurveTo(hx - hrx - 50, top - 20, hx - 30, top - 55, hx, top - 50);
        c.bezierCurveTo(hx + 30, top - 55, hx + hrx + 50, top - 20, hx + hrx + 34, hy + hry + 40);
        c.lineTo(hx + hrx + 4, hy + hry * 0.6);
        c.bezierCurveTo(hx + hrx + 8, top + 10, hx - hrx - 8, top + 10, hx - hrx - 4, hy + hry * 0.6);
        c.closePath();
      }, shade(col, -0.1), { bounds: [hx - hrx - 50, top - 55, hx + hrx + 50, hy + hry + 40], dabs: 380, size: 11, flow: 1.3 });
      // shadow cast on the forehead
      ctx.save();
      ctx.beginPath(); headPath(t)(ctx); ctx.clip();
      const g = ctx.createLinearGradient(0, top, 0, hy);
      g.addColorStop(0, "rgba(10,5,15,0.65)");
      g.addColorStop(1, "rgba(10,5,15,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      break;
    case "helm": {
      const steel = "#9aa0a8";
      b.paint((c) => {
        c.moveTo(hx - hrx - 8, hy - 5);
        c.bezierCurveTo(hx - hrx - 12, top - 40, hx + hrx + 12, top - 40, hx + hrx + 8, hy - 5);
        c.lineTo(hx + hrx * 0.75, hy - hry * 0.3);
        c.lineTo(hx - hrx * 0.75, hy - hry * 0.3);
        c.closePath();
      }, steel, { bounds: [hx - hrx - 12, top - 40, hx + hrx + 12, hy], dabs: 220, size: 8 });
      b.paint((c) => c.rect(hx - 6, hy - hry * 0.32, 12, hry * 0.62), steel, { bounds: [hx - 6, hy - hry * 0.32, hx + 6, hy + hry * 0.3], dabs: 20, size: 3 });
      b.stroke([[hx - hrx * 0.4, top - 20], [hx - 5, top - 34]], "rgba(255,255,255,0.9)", 3, 0.6);
      b.stroke([[hx - hrx - 6, hy - hry * 0.3], [hx + hrx + 6, hy - hry * 0.3]], shade(steel, -0.4), 5, 0.8);
      break;
    }
    case "crown":
      b.paint((c) => {
        const y = top + 8;
        c.moveTo(hx - hrx * 0.8, y + 22);
        for (let k = 0; k <= 4; k++) {
          const x = hx - hrx * 0.8 + (k * hrx * 1.6) / 4;
          c.lineTo(x, y - 18);
          if (k < 4) c.lineTo(x + (hrx * 1.6) / 8, y);
        }
        c.lineTo(hx + hrx * 0.8, y + 22);
        c.closePath();
      }, "#d9a83a", { bounds: [hx - hrx, top - 12, hx + hrx, top + 30], dabs: 120, size: 5 });
      for (let k = 0; k < 3; k++) b.dab(hx - 30 + k * 30, top + 20, 4, 4, 0, ["#c0302a", "#3a6fd0", "#2f9f5a"][k], 0.95);
      break;
    case "circlet":
      b.stroke([[hx - hrx * 0.95, hy - hry * 0.35], [hx, hy - hry * 0.5], [hx + hrx * 0.95, hy - hry * 0.35]], "#d9c27a", 4, 0.95);
      b.dab(hx, hy - hry * 0.48, 6, 6, 0, "#6fb8ff", 0.95);
      break;
    case "hat": {
      const c1 = shade(col, -0.25);
      if (["wizard", "sorcerer", "warlock"].includes(t.clsId)) {
        b.paint((c) => {
          c.moveTo(hx - hrx - 20, top + 30);
          c.quadraticCurveTo(hx - 10, top - 60, hx + 45, top - 130);
          c.quadraticCurveTo(hx + 20, top - 40, hx + hrx + 20, top + 30);
          c.closePath();
        }, c1, { bounds: [hx - hrx - 20, top - 130, hx + hrx + 20, top + 30], dabs: 200, size: 9 });
      } else {
        b.paint((c) => { c.rect(hx - hrx * 0.8, top - 35, hrx * 1.6, 55); }, c1, { bounds: [hx - hrx, top - 35, hx + hrx, top + 20], dabs: 120, size: 8 });
      }
      b.paint((c) => c.ellipse(hx, top + 26, hrx + 55, 16, 0, 0, Math.PI * 2), shade(col, -0.35), { bounds: [hx - hrx - 55, top + 10, hx + hrx + 55, top + 42], dabs: 120, size: 8 });
      break;
    }
    default:
      break;
  }
}

function finish(b, ctx, t) {
  // canvas grain
  const img = ctx.getImageData(0, 0, W, H);
  const data = img.data;
  for (let i = 0; i < data.length; i += 4) {
    const px = (i / 4) % W, py = Math.floor(i / 4 / W);
    const weave = ((px % 4 === 0) || (py % 4 === 0)) ? -6 : 0;
    const n = (b.rng() - 0.5) * 18 + weave;
    data[i] = clamp(data[i] + n);
    data[i + 1] = clamp(data[i + 1] + n);
    data[i + 2] = clamp(data[i + 2] + n * 0.9);
  }
  ctx.putImageData(img, 0, 0);
  // vignette
  const g = ctx.createRadialGradient(W / 2, H / 2 - 20, 120, W / 2, H / 2, 340);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(10,6,4,0.62)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // warm varnish
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "rgba(255,200,120,0.18)";
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
}
