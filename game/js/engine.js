// The rules engine. It owns every number in the game: ability scores, DCs,
// d20 rolls, hit points, damage, XP and levels. The narrator (AI or offline)
// only proposes *what kind* of action the player took and how hard it is;
// this file decides what actually happens.

import {
  ABILITIES, SKILLS, DCS, XP_TABLE, MAX_LEVEL, RACES, BACKGROUNDS, CLASSES, POWERS,
  SLOT_TABLE, MONSTERS, LOOT, HOOKS, REGIONS, TIER_ORDER,
} from "./data.js";
import { d, randInt, pick, chance, rollDice, rollD20, parseDice } from "./dice.js";

export const SAVE_VERSION = 1;
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

// ---------------------------------------------------------------- basics

export const mod = (score) => Math.floor((score - 10) / 2);
export const profBonus = (level) => 2 + Math.floor((level - 1) / 4);
export const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);

export function roll4d6() {
  return Array.from({ length: 6 }, () => {
    const r = [d(6), d(6), d(6), d(6)].sort((a, b) => b - a);
    return r[0] + r[1] + r[2];
  }).sort((a, b) => b - a);
}

// Hands out a sorted score list following the class's priority order.
export function assignScores(clsId, scores) {
  const sorted = [...scores].sort((a, b) => b - a);
  const out = {};
  CLASSES[clsId].primary.forEach((ab, i) => (out[ab] = sorted[i]));
  return out;
}

export function finalScores(base, raceId) {
  const bonus = RACES[raceId].bonus;
  const out = {};
  for (const ab of ABILITIES) out[ab] = Math.min(20, (base[ab] || 10) + (bonus[ab] || 0));
  return out;
}

// ---------------------------------------------------------------- hero

export function createHero({ name, pronouns, raceId, clsId, backgroundId, description, baseScores, chosenSkills, portrait }) {
  const cls = CLASSES[clsId];
  const race = RACES[raceId];
  const bg = BACKGROUNDS[backgroundId];
  const abilities = finalScores(baseScores, raceId);
  const skills = new Set([...chosenSkills, ...bg.skills, ...race.skills]);
  const conMod = mod(abilities.con);
  // Level 1 gets a small heroic cushion so a wizard isn't one goblin from death.
  const maxHp = cls.hd + conMod + 6 + (raceId === "dwarf" ? 1 : 0);
  const hero = {
    name: name.trim() || "Nameless", pronouns: pronouns || "they/them",
    race: raceId, cls: clsId, background: backgroundId, description: description || "",
    abilities, level: 1, xp: 0,
    hp: Math.max(6, maxHp), maxHp: Math.max(6, maxHp), tempHp: 0,
    skills: [...skills], expertise: cls.expertise ? [...cls.expertise] : [],
    saves: [...cls.saves],
    weapon: { ...cls.weapon, bonus: 0 },
    armor: { ...cls.armor },
    gold: 10 + d(10),
    inventory: [
      makeItem({ ...LOOT.potion[0], qty: 2 }),
      makeItem({ name: bg.item, kind: "trinket", value: 2 }),
      makeItem({ name: "Traveler's rations (3 days)", kind: "food" }),
      makeItem({ name: "Torch & tinderbox", kind: "tool" }),
    ],
    resources: {},
    status: {},
    boost: null,
    flags: {},
    portrait: portrait || null,
    pendingAsi: 0,
  };
  resetResources(hero, true);
  return hero;
}

let itemCounter = 0;
export function makeItem(template) {
  itemCounter += 1;
  return { id: `i${Date.now().toString(36)}${itemCounter}`, qty: 1, ...template };
}

export function castMod(hero) {
  const cls = CLASSES[hero.cls];
  return cls.caster ? mod(hero.abilities[cls.caster]) : mod(hero.abilities.wis);
}

export function spellDC(hero) {
  return 8 + profBonus(hero.level) + castMod(hero);
}

export function computeAC(hero) {
  const a = hero.armor;
  const dexMod = mod(hero.abilities.dex);
  let ac = a.base;
  if (a.dex === true) ac += dexMod;
  else if (typeof a.dex === "number") ac += Math.min(dexMod, a.dex);
  if (a.con) ac += mod(hero.abilities.con);
  if (a.wis) ac += mod(hero.abilities.wis);
  ac += a.shield || 0;
  ac += equippedBonus(hero, "ac");
  if (hero.status.shielded) ac += 5;
  return ac;
}

function equippedBonus(hero, field) {
  const total = hero.inventory.filter((i) => i.equipped && i[field]).reduce((s, i) => s + i[field], 0);
  return Math.min(3, total);
}

export function weaponBonus(hero) {
  return hero.inventory.filter((i) => i.kind === "weapon" && i.equipped).reduce((m, i) => Math.max(m, i.bonus || 0), 0);
}

export function knownPowers(hero) {
  const ids = [...CLASSES[hero.cls].powers];
  if (hero.race === "dragonborn") ids.push("breath_weapon");
  return ids.filter((id) => POWERS[id].level <= hero.level).map((id) => ({ id, ...POWERS[id] }));
}

export function maxUses(hero, powerId) {
  const p = POWERS[powerId];
  if (powerId === "rage") return hero.level >= 6 ? 4 : hero.level >= 3 ? 3 : 2;
  if (powerId === "bardic_inspiration") return Math.max(1, mod(hero.abilities.cha));
  return p.cost.n || 1;
}

export function resetResources(hero, long) {
  const cls = CLASSES[hero.cls];
  const r = hero.resources;
  const slotsMax = SLOT_TABLE[cls.slots][hero.level - 1];
  r.slotsMax = slotsMax;
  if (long || cls.slots === "pact" || r.slots === undefined) r.slots = slotsMax;
  if (hero.cls === "monk") { r.kiMax = hero.level; r.ki = r.kiMax; }
  if (hero.cls === "paladin") { r.poolMax = 5 * hero.level; if (long || r.pool === undefined) r.pool = r.poolMax; }
  r.uses = r.uses || {};
  for (const p of knownPowers(hero)) {
    if (p.cost.type === "short" || (p.cost.type === "long" && long) || r.uses[p.id] === undefined) {
      if (p.cost.type === "short" || p.cost.type === "long") r.uses[p.id] = maxUses(hero, p.id);
    }
  }
  if (long) hero.flags.relentlessUsed = false;
}

export function skillBonus(hero, skillOrAbility) {
  const skill = SKILLS[skillOrAbility];
  const ability = skill ? skill.ability : skillOrAbility;
  const parts = [{ label: ABILITIES.includes(ability) ? ability.toUpperCase() : ability, value: mod(hero.abilities[ability] ?? 10) }];
  const pb = profBonus(hero.level);
  if (skill && hero.skills.includes(skillOrAbility)) {
    parts.push({ label: hero.expertise.includes(skillOrAbility) ? "expertise" : "proficient", value: hero.expertise.includes(skillOrAbility) ? pb * 2 : pb });
  } else if (hero.cls === "bard" && hero.level >= 2) {
    parts.push({ label: "jack of all trades", value: Math.floor(pb / 2) });
  }
  return { ability, parts, total: parts.reduce((s, p) => s + p.value, 0) };
}

export function saveBonus(hero, ability) {
  const parts = [{ label: ability.toUpperCase(), value: mod(hero.abilities[ability]) }];
  if (hero.saves.includes(ability)) parts.push({ label: "proficient", value: profBonus(hero.level) });
  if (hero.cls === "paladin" && hero.level >= 6) parts.push({ label: "aura", value: Math.max(1, mod(hero.abilities.cha)) });
  return { parts, total: parts.reduce((s, p) => s + p.value, 0) };
}

// ---------------------------------------------------------------- d20 tests

function combineMode(a, b) {
  if (!a || a === "none") return b || "none";
  if (!b || b === "none") return a;
  return a === b ? a : "none"; // advantage + disadvantage cancel
}

// Core d20 test. Consumes hero.boost (Guidance, Bardic Inspiration, etc.).
function d20Test(hero, { label, parts, target, targetLabel = "DC", mode = "none", useBoost = true }) {
  let finalMode = mode;
  const allParts = [...parts];
  if (useBoost && hero.boost) {
    if (hero.boost.mode) finalMode = combineMode(finalMode, hero.boost.mode);
    if (hero.boost.bonus) {
      const b = rollDice(hero.boost.bonus);
      allParts.push({ label: hero.boost.source || "boost", value: b.total });
    }
    hero.boost = null;
  }
  if (hero.status.blessed && targetLabel !== "DC") {
    allParts.push({ label: "bless", value: d(4) });
  }
  let r = rollD20(finalMode);
  let rerolled = false;
  if (r.natural === 1 && hero.race === "halfling") {
    rerolled = true;
    r = rollD20("none");
  }
  const bonus = allParts.reduce((s, p) => s + p.value, 0);
  const total = r.natural + bonus;
  const crit = r.natural === 20;
  const fumble = r.natural === 1;
  const success = crit ? true : fumble ? false : total >= target;
  return {
    type: "d20", label, dice: r.dice, natural: r.natural, parts: allParts, bonus, total,
    target, targetLabel, mode: finalMode, success, crit, fumble, rerolled,
  };
}

// ---------------------------------------------------------------- monsters

export function scaleMonster(base, level, tier) {
  const lv = Math.max(1, level);
  // Bosses are built for level 3+, so they grow from there.
  const steps = Math.max(0, lv - ({ boss: 4, elite: 4 }[tier] || 1));
  const hpMult = 1 + 0.13 * steps;
  const dmg = parseDice(base.dmg);
  const dmgBonus = dmg.bonus + Math.floor(steps / 3);
  const hp = Math.max(1, Math.round(base.hp * hpMult));
  return {
    name: base.name, tier, tags: base.tags,
    hp, maxHp: hp,
    ac: base.ac + Math.floor(steps / 5),
    atk: base.atk + Math.floor(steps / 4),
    dmg: `${dmg.count}d${dmg.sides}${dmgBonus >= 0 ? "+" : ""}${dmgBonus}`,
    xp: Math.round(base.xp * (1 + 0.15 * (lv - 1))),
    save: base.save + Math.floor((lv - 1) / 3),
    status: {},
  };
}

function findMonsterByName(name) {
  const n = String(name || "").toLowerCase();
  for (const tier of TIER_ORDER) {
    const m = MONSTERS[tier].find((x) => n.includes(x.name.toLowerCase()) || x.name.toLowerCase().includes(n));
    if (m) return { base: m, tier };
  }
  return null;
}

// A named creature the narrator wants to fight, clamped to a sane tier.
function spawnNamed(name, tier, level, maxTier) {
  const allowed = TIER_ORDER.slice(0, TIER_ORDER.indexOf(maxTier) + 1);
  let t = allowed.includes(tier) ? tier : allowed[allowed.length - 1];
  const found = findMonsterByName(name);
  let base;
  if (found && allowed.includes(found.tier)) { base = found.base; t = found.tier; }
  else base = { ...pick(MONSTERS[t]), name: titleCase(name) || pick(MONSTERS[t]).name };
  return scaleMonster(base, level, t);
}

function titleCase(s) {
  return String(s || "").trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);
}

export function buildEncounter(level, { first = false, boss = false } = {}) {
  const pickT = (t) => scaleMonster(pick(MONSTERS[t]), level, t);
  if (boss) {
    const list = [scaleMonster(pick(MONSTERS.boss), level, "boss")];
    if (level >= 6) list.push(pickT("minion"));
    if (level >= 9) list.push(pickT("standard"));
    return list;
  }
  if (first) return [pickT("minion")];
  const r = Math.random();
  if (level <= 1) return r < 0.6 ? [pickT("minion")] : [pickT("minion"), pickT("minion")];
  if (level === 2) return r < 0.4 ? [pickT("minion")] : r < 0.75 ? [pickT("minion"), pickT("minion")] : [pickT("standard")];
  if (level === 3) return r < 0.35 ? [pickT("minion"), pickT("minion")] : r < 0.7 ? [pickT("standard")] : [pickT("standard"), pickT("minion")];
  if (level === 4) return r < 0.35 ? [pickT("standard"), pickT("minion")] : r < 0.7 ? [pickT("minion"), pickT("minion"), pickT("minion")] : [pickT("standard"), pickT("standard")];
  if (level <= 7) return r < 0.4 ? [pickT("elite")] : r < 0.75 ? [pickT("standard"), pickT("standard"), pickT("minion")] : [pickT("elite"), pickT("minion")];
  return r < 0.5 ? [pickT("elite"), pickT("standard")] : [pickT("elite"), pickT("elite")];
}

function labelEnemies(list) {
  const counts = {};
  list.forEach((e) => (counts[e.name] = (counts[e.name] || 0) + 1));
  const seen = {};
  list.forEach((e, i) => {
    e.id = `e${i + 1}`;
    if (counts[e.name] > 1) {
      seen[e.name] = (seen[e.name] || 0) + 1;
      e.name = `${e.name} ${String.fromCharCode(64 + seen[e.name])}`;
    }
  });
  return list;
}

// ---------------------------------------------------------------- state

export function newGame(hero, hookId) {
  const hook = HOOKS.find((h) => h.id === hookId) || pick(HOOKS);
  return {
    version: SAVE_VERSION,
    hero,
    world: {
      turn: 0,
      location: hook.start,
      regionIndex: 0,
      quest: { id: hook.id, title: hook.title, objective: hook.objective, stage: 0 },
      notes: [],
      calmUntil: randInt(10, 15),
      nextEventTurn: 0,
      eventsSeen: 0,
      bossesBeaten: [],
      lastLongRestTurn: 0,
      shortRestsSinceEvent: 0,
      suggestions: [],
    },
    combat: null,
    log: [],
    history: [],
    dead: false,
    createdAt: Date.now(),
  };
}

export function phase(state) {
  if (state.combat) return "combat";
  return state.world.turn <= state.world.calmUntil ? "calm" : "adventure";
}

export function livingEnemies(state) {
  return state.combat ? state.combat.enemies.filter((e) => e.hp > 0 && !e.fled) : [];
}

function startCombat(state, enemies, res, { ambush = false } = {}) {
  const hero = state.hero;
  state.combat = { enemies: labelEnemies(enemies), round: 1, firstStrike: true, defeated: [] };
  res.combatStarted = true;
  res.facts.push(`Combat begins against: ${enemies.map((e) => e.name).join(", ")}.`);
  let init = null;
  if (!ambush) {
    init = d20Test(hero, { label: "Initiative", parts: [{ label: "DEX", value: mod(hero.abilities.dex) }], target: 10 + Math.max(...enemies.map((e) => e.save)), mode: "none", useBoost: false });
    init.targetLabel = "vs";
    res.rolls.push(init);
  }
  if (ambush || !init.success) {
    res.facts.push("The enemies are quicker and strike first.");
    state.combat.firstStrike = false;
    enemyPhase(state, res);
  } else {
    res.facts.push("The hero wins initiative.");
  }
}

// ---------------------------------------------------------------- XP & levels

export function gainXp(state, amount, reason, res) {
  if (amount <= 0) return;
  const hero = state.hero;
  hero.xp += amount;
  res.xp += amount;
  if (reason) res.xpReasons.push(`${reason} (+${amount})`);
  while (hero.level < MAX_LEVEL && hero.xp >= XP_TABLE[hero.level]) {
    levelUp(state, res);
  }
}

function levelUp(state, res) {
  const hero = state.hero;
  const cls = CLASSES[hero.cls];
  const before = new Set(knownPowers(hero).map((p) => p.id));
  hero.level += 1;
  // average hit die + Con, plus a small heroic bonus to keep solo play survivable
  const gain = Math.max(2, Math.floor(cls.hd / 2) + 2 + mod(hero.abilities.con) + (hero.race === "dwarf" ? 1 : 0));
  hero.maxHp += gain;
  hero.hp += gain;
  resetResources(hero, true);
  const newPowers = knownPowers(hero).filter((p) => !before.has(p.id)).map((p) => p.name);
  const feature = cls.features[hero.level];
  const asi = [4, 8, 12].includes(hero.level);
  if (asi) hero.pendingAsi += 2;
  const lu = { level: hero.level, hpGain: gain, newPowers, feature, asi, prof: profBonus(hero.level) };
  res.levelUps.push(lu);
  res.facts.push(`LEVEL UP: the hero reaches level ${hero.level}.`);
}

export function applyAsi(hero, ability) {
  if (hero.pendingAsi <= 0 || hero.abilities[ability] >= 20) return false;
  const oldCon = mod(hero.abilities.con);
  hero.abilities[ability] += 1;
  hero.pendingAsi -= 1;
  if (ability === "con" && mod(hero.abilities.con) > oldCon) { hero.maxHp += hero.level; hero.hp += hero.level; }
  return true;
}

// ---------------------------------------------------------------- damage & healing

function heal(hero, amount) {
  const before = hero.hp;
  hero.hp = Math.min(hero.maxHp, hero.hp + amount);
  return hero.hp - before;
}

function damageHero(state, amount, res, source) {
  const hero = state.hero;
  let dmg = amount;
  if (hero.status.rage) dmg = Math.floor(dmg / 2);
  if (hero.status.dodge) { dmg = Math.floor(dmg / 2); delete hero.status.dodge; }
  if (hero.tempHp > 0) {
    const absorbed = Math.min(hero.tempHp, dmg);
    hero.tempHp -= absorbed;
    dmg -= absorbed;
  }
  hero.hp -= dmg;
  res.damageTaken += dmg;
  if (hero.hp <= 0) {
    if (hero.race === "half_orc" && !hero.flags.relentlessUsed) {
      hero.flags.relentlessUsed = true;
      hero.hp = 1;
      res.facts.push(`Relentless Endurance: the hero refuses to fall and stays up at 1 HP (hit by ${source}).`);
      return dmg;
    }
    hero.hp = 0;
    res.heroDown = true;
  }
  return dmg;
}

// Called whenever the hero hits 0. Rolls the death saves in one tense sequence.
function resolveDowned(state, res) {
  const hero = state.hero;
  let s = 0, f = 0;
  const saves = [];
  while (s < 3 && f < 3) {
    const n = d(20);
    saves.push(n);
    if (n === 20) { s = 3; hero.hp = 1; break; }
    if (n === 1) f += 2; else if (n >= 10) s += 1; else f += 1;
  }
  res.rolls.push({ type: "death", label: "Death saves", dice: saves, successes: Math.min(3, s), failures: Math.min(3, f), survived: s >= 3 });
  if (s >= 3) {
    hero.hp = Math.max(1, hero.hp);
    const lost = Math.floor(hero.gold / 2);
    hero.gold -= lost;
    res.facts.push(saves.includes(20)
      ? "The hero drops, then surges back to their feet on a natural 20 death save with 1 HP."
      : `The hero falls unconscious but stabilises. They wake later with 1 HP; the enemies left them for dead${lost ? ` and took ${lost} gold` : ""}.`);
    if (state.combat && !saves.includes(20)) endCombat(state, res, "left_for_dead");
  } else {
    state.dead = true;
    res.died = true;
    res.facts.push("The hero fails their death saves and dies.");
    state.combat = null;
  }
  res.heroDown = false;
  res.wasDowned = true;
}

function hazardDamage(level, severity, calm) {
  const table = { light: "1d4", moderate: "2d6", severe: "3d8" };
  const sev = calm ? "light" : severity;
  const r = rollDice(table[sev] || "1d4");
  const scale = 1 + (level - 1) * 0.2;
  return { ...r, total: Math.max(1, Math.round(r.total * scale)) };
}

// ---------------------------------------------------------------- combat

function heroAttack(state, target, res, { mode = "none", smite = false, label = "Attack" } = {}) {
  const hero = state.hero;
  const w = hero.weapon;
  const abMod = mod(hero.abilities[w.ability]);
  const wb = weaponBonus(hero);
  const parts = [{ label: w.ability.toUpperCase(), value: abMod }, { label: "proficient", value: profBonus(hero.level) }];
  if (hero.cls === "fighter") parts.push({ label: "fighting style", value: 1 });
  if (wb) parts.push({ label: "magic weapon", value: wb });
  let m = mode;
  if (hero.status.rage && w.ability === "str") m = combineMode(m, "advantage");
  if (target.status.restrained || target.status.stunned || target.status.asleep) m = combineMode(m, "advantage");
  const roll = d20Test(hero, { label: `${label}: ${w.name} vs ${target.name}`, parts, target: target.ac, targetLabel: "AC", mode: m });
  res.rolls.push(roll);
  if (!roll.success) {
    res.facts.push(`The hero's ${w.name} attack misses ${target.name}.`);
    return 0;
  }
  let dmgBonus = abMod + wb;
  if (hero.status.rage && w.ability === "str") dmgBonus += 2;
  const dmg = rollDice(w.dice, { crit: roll.crit, extraBonus: dmgBonus });
  let total = dmg.total;
  const extra = [];
  if (hero.cls === "barbarian" && hero.level >= 9 && roll.crit) { const b = rollDice(w.dice); total += b.total; extra.push(`brutal critical ${b.total}`); }
  if (hero.cls === "rogue") {
    // Solo-friendly sneak attack: always on, full strength when striking first or with advantage.
    const full = state.combat.firstStrike || roll.mode === "advantage";
    const dice = full ? Math.ceil(hero.level / 2) + 1 : Math.ceil(hero.level / 2);
    const sa = rollDice(`${dice}d6`, { crit: roll.crit });
    total += sa.total; extra.push(`sneak attack ${sa.total}`);
  }
  if (hero.status.marked) { const b = rollDice("1d6", { crit: roll.crit }); total += b.total; extra.push(`hunter's mark ${b.total}`); }
  if (hero.status.hexing) { const b = rollDice("1d6", { crit: roll.crit }); total += b.total; extra.push(`hex ${b.total}`); }
  if (smite) { const b = rollDice("2d8", { crit: roll.crit }); total += b.total; extra.push(`divine smite ${b.total}`); }
  roll.damage = { expr: w.dice, rolls: dmg.rolls, total, extra };
  hurtEnemy(state, target, total, res, roll.crit ? "critical hit" : "hit");
  return total;
}

function spellAttack(state, target, power, res) {
  const hero = state.hero;
  const hits = power.hits || (power.beams ? cantripMult(hero) : 1);
  let dealt = 0;
  for (let i = 0; i < hits; i++) {
    const t = i === 0 ? target : livingEnemies(state)[0];
    if (!t) break;
    const parts = [{ label: (CLASSES[hero.cls].caster || "wis").toUpperCase(), value: castMod(hero) }, { label: "proficient", value: profBonus(hero.level) }];
    let m = "none";
    if (t.status.restrained || t.status.stunned || t.status.asleep) m = "advantage";
    const roll = d20Test(hero, { label: `${power.name}${hits > 1 ? ` #${i + 1}` : ""} vs ${t.name}`, parts, target: t.ac, targetLabel: "AC", mode: m });
    res.rolls.push(roll);
    if (!roll.success) { res.facts.push(`${power.name} misses ${t.name}.`); continue; }
    let dice = power.dice;
    if (power.scale) dice = scaleDice(dice, cantripMult(hero));
    const dmg = rollDice(dice, { crit: roll.crit, extraBonus: power.addMod ? castMod(hero) : 0 });
    let total = dmg.total;
    if (hero.status.hexing) total += d(6);
    roll.damage = { expr: dice, rolls: dmg.rolls, total, extra: [] };
    dealt += total;
    hurtEnemy(state, t, total, res, roll.crit ? "critical hit" : "hit");
  }
  return dealt;
}

const cantripMult = (hero) => 1 + (hero.level >= 5 ? 1 : 0) + (hero.level >= 11 ? 1 : 0);
function scaleDice(expr, mult) {
  const p = parseDice(expr);
  return `${p.count * mult}d${p.sides}${p.bonus ? (p.bonus > 0 ? "+" : "") + p.bonus : ""}`;
}

function enemySave(state, enemy, ability, res, label) {
  const dc = spellDC(state.hero);
  const n = d(20);
  const total = n + enemy.save;
  const saved = n !== 1 && (n === 20 || total >= dc);
  res.rolls.push({ type: "enemy_save", label: `${enemy.name} ${ability.toUpperCase()} save vs ${label}`, dice: [n], natural: n, total, target: dc, success: saved });
  return saved;
}

function hurtEnemy(state, enemy, amount, res, how) {
  enemy.hp = Math.max(0, enemy.hp - amount);
  delete enemy.status.asleep;
  if (enemy.hp <= 0) {
    res.facts.push(`${enemy.name} takes ${amount} damage (${how}) and is slain.`);
    res.kills.push(enemy.name);
    state.combat.defeated.push(enemy);
  } else {
    const pct = enemy.hp / enemy.maxHp;
    const cond = pct > 0.75 ? "barely scratched" : pct > 0.4 ? "wounded" : "badly hurt";
    res.facts.push(`${enemy.name} takes ${amount} damage (${how}) and is ${cond}.`);
  }
}

function enemyPhase(state, res) {
  const hero = state.hero;
  for (const e of livingEnemies(state)) {
    if (state.dead || hero.hp <= 0) break;
    if (e.status.asleep) { res.facts.push(`${e.name} is asleep.`); continue; }
    if (e.status.stunned) { res.facts.push(`${e.name} is stunned and can't act.`); delete e.status.stunned; continue; }
    if (e.status.turned) {
      e.fled = true;
      res.facts.push(`${e.name} flees in terror from the hero's holy presence.`);
      continue;
    }
    // Morale: the weak and the hurt sometimes break and run.
    if (e.tier !== "boss" && e.tier !== "elite" && e.hp / e.maxHp < 0.25 && chance(0.3)) {
      e.fled = true;
      res.facts.push(`${e.name} breaks and flees.`);
      continue;
    }
    let m = "none";
    if (hero.status.dodging) m = combineMode(m, "disadvantage");
    if (e.status.disadvantage) { m = combineMode(m, "disadvantage"); delete e.status.disadvantage; }
    if (e.status.restrained) m = combineMode(m, "disadvantage");
    if (hero.status.reckless) m = combineMode(m, "advantage");
    const ac = computeAC(hero);
    const r = rollD20(m);
    const total = r.natural + e.atk;
    const hit = r.natural === 20 || (r.natural !== 1 && total >= ac);
    const roll = { type: "enemy_attack", label: `${e.name} attacks`, dice: r.dice, natural: r.natural, bonus: e.atk, total, target: ac, targetLabel: "your AC", mode: m, success: hit, crit: r.natural === 20 };
    res.rolls.push(roll);
    if (hit) {
      const dmg = rollDice(e.dmg, { crit: r.natural === 20 });
      const taken = damageHero(state, dmg.total, res, e.name);
      roll.damage = { expr: e.dmg, rolls: dmg.rolls, total: taken };
      res.facts.push(`${e.name} ${r.natural === 20 ? "lands a critical hit" : "hits"} the hero for ${taken} damage.`);
      if (res.heroDown) { resolveDowned(state, res); return; }
    } else {
      res.facts.push(`${e.name} attacks but misses.`);
    }
  }
  delete hero.status.shielded;
  delete hero.status.dodging;
  delete hero.status.reckless;
  if (state.combat) state.combat.round += 1;
}

function checkCombatOver(state, res) {
  if (!state.combat) return;
  if (livingEnemies(state).length === 0) {
    const fled = state.combat.enemies.some((e) => e.fled);
    endCombat(state, res, fled && state.combat.defeated.length === 0 ? "enemies_fled" : "victory");
  }
}

function endCombat(state, res, how) {
  const c = state.combat;
  if (!c) return;
  const hero = state.hero;
  let xp = 0;
  for (const e of c.enemies) {
    if (e.hp <= 0 || e.surrendered) xp += e.xp;
    else if (e.fled && how !== "hero_fled" && how !== "left_for_dead") xp += Math.floor(e.xp / 2);
  }
  const bosses = c.enemies.filter((e) => e.tier === "boss" && (e.hp <= 0 || e.surrendered));
  state.combat = null;
  hero.status = {};
  hero.tempHp = 0;
  res.combatEnded = how;
  res.facts.push({
    victory: "The fight is won.", enemies_fled: "The remaining enemies flee.", surrender: "The enemies surrender.",
    hero_fled: "The hero escapes the fight.", left_for_dead: "The fight ends with the hero unconscious.",
  }[how] || "The fight ends.");
  if (xp && how !== "left_for_dead") gainXp(state, xp, "Enemies defeated", res);
  if (how === "victory" || how === "surrender") {
    const tierMax = Math.max(...c.enemies.map((e) => TIER_ORDER.indexOf(e.tier)));
    const gold = rollDice(`${tierMax + 1}d${6 + 4 * tierMax}`).total + hero.level * 2;
    hero.gold += gold;
    res.gold += gold;
    const lootChance = [0.25, 0.45, 0.7, 1][tierMax];
    if (chance(lootChance)) grantLoot(state, res, tierMax >= 2 ? "rare" : tierMax === 1 ? "uncommon" : "common");
  }
  for (const b of bosses) {
    state.world.bossesBeaten.push(b.name);
    res.facts.push(`BOSS DEFEATED: ${b.name}. A major chapter of the quest is complete.`);
    state.world.quest.stage += 1;
  }
  state.world.shortRestsSinceEvent = 0;
}

// ---------------------------------------------------------------- loot

export function grantLoot(state, res, rarity = "common") {
  const hero = state.hero;
  const pool = rarity === "rare"
    ? [...LOOT.potion.slice(1), ...LOOT.weapon, ...LOOT.armor]
    : rarity === "uncommon"
      ? [...LOOT.potion.slice(0, 2), LOOT.weapon[0], LOOT.weapon[1], LOOT.armor[0], LOOT.armor[1], ...LOOT.scroll]
      : [LOOT.potion[0], LOOT.potion[0], ...LOOT.trinket];
  const item = makeItem(pick(pool));
  if (item.kind === "weapon") {
    const current = weaponBonus(hero);
    item.name = `${item.name.replace("Weapon", hero.weapon.name).replace("Blade", hero.weapon.name)}`;
    if ((item.bonus || 0) > current) {
      hero.inventory.forEach((i) => { if (i.kind === "weapon") i.equipped = false; });
      item.equipped = true;
    }
  }
  if (item.kind === "armor") item.equipped = true;
  hero.inventory.push(item);
  res.loot.push(item.name);
  res.facts.push(`Loot found: ${item.name}${item.equipped ? " (equipped)" : ""}.`);
  return item;
}

// ---------------------------------------------------------------- powers

function payCost(hero, power) {
  const r = hero.resources;
  switch (power.cost.type) {
    case "atwill": return true;
    case "slot": if (r.slots > 0) { r.slots -= 1; return true; } return false;
    case "short": case "long": if ((r.uses[power.id] || 0) > 0) { r.uses[power.id] -= 1; return true; } return false;
    case "ki": if (r.ki >= power.cost.n) { r.ki -= power.cost.n; return true; } return false;
    case "pool": return r.pool > 0;
    default: return false;
  }
}

export function canUsePower(hero, power) {
  const r = hero.resources;
  switch (power.cost.type) {
    case "atwill": return true;
    case "slot": return r.slots > 0;
    case "short": case "long": return (r.uses[power.id] || 0) > 0;
    case "ki": return r.ki >= power.cost.n;
    case "pool": return r.pool > 0;
    default: return false;
  }
}

function usePower(state, powerId, targetId, res, plan) {
  const hero = state.hero;
  const known = knownPowers(hero).find((p) => p.id === powerId);
  if (!known) {
    res.facts.push(`The hero tries to use an ability they don't have (${powerId}); nothing happens.`);
    res.outcome = "failure";
    return;
  }
  if (known.combatOnly && !state.combat) {
    if (plan.hostile && plan.hostile.name) {
      startCombat(state, [spawnNamed(plan.hostile.name, plan.hostile.tier, hero.level, maxTierFor(state))], res);
      if (state.dead || !state.combat) return;
    } else {
      res.facts.push(`${known.name} has no target here, so the hero holds it back (no resources spent).`);
      res.outcome = "none";
      return;
    }
  }
  if (!canUsePower(hero, known)) {
    res.facts.push(`The hero reaches for ${known.name}, but has nothing left to fuel it (out of uses). The moment is wasted.`);
    res.outcome = "failure";
    return;
  }
  payCost(hero, known);
  res.powerUsed = known.name;
  const target = pickTarget(state, targetId);
  switch (known.kind) {
    case "heal": {
      let dice = known.dice;
      if (known.upcast) dice = scaleDice(dice, 1 + Math.floor((hero.level - 1) / 4));
      const r = rollDice(dice, { extraBonus: (known.addMod ? castMod(hero) : 0) + (known.addLevel ? hero.level : 0) });
      const healed = heal(hero, r.total);
      res.rolls.push({ type: "effect", label: known.name, dice: r.rolls, total: r.total, note: `healed ${healed}` });
      res.facts.push(`${known.name} heals the hero for ${healed} HP.`);
      break;
    }
    case "heal_pool": {
      const need = hero.maxHp - hero.hp;
      const amount = Math.min(need, hero.resources.pool);
      hero.resources.pool -= amount;
      heal(hero, amount);
      res.facts.push(`Lay on Hands restores ${amount} HP.`);
      break;
    }
    case "temp_hp": {
      const amount = known.perCharLevel ? known.amount * hero.level : known.amount * (1 + Math.floor((hero.level - 1) / 2));
      hero.tempHp = Math.max(hero.tempHp, amount);
      res.facts.push(`${known.name} grants ${amount} temporary HP.`);
      break;
    }
    case "buff":
      hero.status[known.status] = true;
      if (known.status === "reckless") hero.status.reckless = true;
      res.facts.push(`${known.name} takes effect.`);
      break;
    case "check_boost":
      hero.boost = known.advantage ? { mode: "advantage", source: known.name } : { bonus: known.bonus, source: known.name };
      res.facts.push(`${known.name}: the hero's next roll is empowered.`);
      break;
    case "escape":
      hero.boost = { mode: "advantage", source: known.name };
      if (state.combat) return flee(state, res, "advantage");
      res.facts.push(`${known.name}: the hero moves with uncanny speed (advantage on the next check).`);
      break;
    case "extra_attack": {
      const n = known.attacks || 2;
      for (let i = 0; i < n; i++) {
        const t = livingEnemies(state)[0] && (i === 0 ? target : livingEnemies(state)[0]);
        if (!t) break;
        heroAttack(state, t, res, { label: known.name });
      }
      break;
    }
    case "weapon_adv":
      hero.status.reckless = true;
      if (target) heroAttack(state, target, res, { mode: "advantage", label: "Reckless attack" });
      break;
    case "smite":
      if (target) heroAttack(state, target, res, { smite: true, label: "Smite" });
      break;
    case "attack":
      if (target) spellAttack(state, target, known, res);
      break;
    case "auto": {
      if (!target) break;
      let total = 0;
      const rolls = [];
      const count = known.count + Math.floor((hero.level - 1) / 4);
      for (let i = 0; i < count; i++) { const r = rollDice(known.dice, { extraBonus: known.flat || 0 }); total += r.total; rolls.push(...r.rolls); }
      res.rolls.push({ type: "effect", label: `${known.name} → ${target.name}`, dice: rolls, total, note: "never misses" });
      hurtEnemy(state, target, total, res, known.name);
      break;
    }
    case "save": {
      const targets = known.aoe ? livingEnemies(state) : target ? [target] : [];
      let dice = known.dice;
      if (known.scale) dice = scaleDice(dice, cantripMult(hero));
      const r = dice !== "0d0" ? rollDice(dice, { extraBonus: known.addMod ? castMod(hero) : 0 }) : { total: 0, rolls: [] };
      if (dice !== "0d0") res.rolls.push({ type: "effect", label: `${known.name} damage`, dice: r.rolls, total: r.total });
      for (const t of targets) {
        if (known.rider === "flee_undead" && !t.tags.includes("undead")) { res.facts.push(`${t.name} is not undead and ignores ${known.name}.`); continue; }
        const saved = enemySave(state, t, known.save, res, known.name);
        let amount = saved ? (known.half ? Math.floor(r.total / 2) : 0) : r.total;
        if (amount > 0) hurtEnemy(state, t, amount, res, known.name);
        else if (saved) res.facts.push(`${t.name} resists ${known.name}.`);
        if (!saved && t.hp > 0) {
          if (known.rider === "disadvantage") t.status.disadvantage = true;
          if (known.rider === "flee_undead") { t.status.turned = true; res.facts.push(`${t.name} is turned and will flee.`); }
        }
      }
      break;
    }
    case "control": {
      const targets = known.aoe ? livingEnemies(state) : target ? [target] : [];
      for (const t of targets) {
        const saved = enemySave(state, t, known.save, res, known.name);
        if (!saved) { t.status[known.status] = true; res.facts.push(`${t.name} is ${known.status} by ${known.name}.`); }
        else res.facts.push(`${t.name} shrugs off ${known.name}.`);
      }
      break;
    }
    default:
      res.facts.push(`${known.name} is used.`);
  }
  res.outcome = res.outcome || "success";
}

function pickTarget(state, targetId) {
  const alive = livingEnemies(state);
  if (!alive.length) return null;
  if (targetId) {
    const t = alive.find((e) => e.id === targetId || e.name.toLowerCase() === String(targetId).toLowerCase());
    if (t) return t;
  }
  return alive[0];
}

function flee(state, res, mode = "none") {
  const hero = state.hero;
  const skill = skillBonus(hero, mod(hero.abilities.dex) >= mod(hero.abilities.str) ? "acrobatics" : "athletics");
  const dc = 8 + Math.max(...livingEnemies(state).map((e) => e.save)) + livingEnemies(state).length;
  const roll = d20Test(hero, { label: `Escape (${SKILLS[skill.ability === "dex" ? "acrobatics" : "athletics"].name})`, parts: skill.parts, target: dc, mode });
  res.rolls.push(roll);
  if (roll.success) {
    res.outcome = "success";
    endCombat(state, res, "hero_fled");
  } else {
    res.outcome = "failure";
    res.facts.push("The hero tries to break away but the enemies cut them off.");
  }
}

function maxTierFor(state) {
  if (phase(state) === "calm") return "minion";
  const lv = state.hero.level;
  return lv <= 2 ? "standard" : lv <= 5 ? "elite" : "elite";
}

// ---------------------------------------------------------------- outcomes

const SUCCESS_XP = { trivial: 0, easy: 5, medium: 10, hard: 20, very_hard: 35, nearly_impossible: 60 };

function applySuccessEffect(state, effect, res, crit) {
  const hero = state.hero;
  switch (effect) {
    case "find_item": grantLoot(state, res, crit ? "uncommon" : "common"); break;
    case "find_gold": { const g = rollDice(`${1 + Math.floor(hero.level / 2)}d10`).total; hero.gold += g; res.gold += g; res.facts.push(`Found ${g} gold.`); break; }
    case "learn_info": res.facts.push("The hero learns something useful."); gainXp(state, 5, "Uncovered a clue", res); break;
    case "gain_advantage": hero.boost = { mode: "advantage", source: "the upper hand" }; res.facts.push("The hero gains the upper hand: advantage on the next roll."); break;
    case "enemies_flee":
      if (state.combat) { livingEnemies(state).forEach((e) => (e.fled = true)); endCombat(state, res, "enemies_fled"); }
      break;
    case "enemies_surrender":
      if (state.combat) { livingEnemies(state).forEach((e) => (e.surrendered = true)); endCombat(state, res, "surrender"); }
      break;
    case "escape_combat": if (state.combat) endCombat(state, res, "hero_fled"); break;
    case "calm_hostiles": state.world.nextEventTurn += 2; res.facts.push("Danger is put off for a little while."); break;
    default: break;
  }
}

function applyFailureEffect(state, effect, res, fumble) {
  const hero = state.hero;
  const calm = phase(state) === "calm";
  switch (effect) {
    case "damage_light": case "damage_moderate": case "damage_severe": {
      const sev = effect.replace("damage_", "");
      const bump = fumble && sev === "light" ? "moderate" : fumble && sev === "moderate" ? "severe" : sev;
      const r = hazardDamage(hero.level, bump, calm);
      let amount = r.total;
      if (calm) amount = Math.min(amount, Math.max(0, hero.hp - 1)); // the calm opening never kills
      res.rolls.push({ type: "effect", label: "Damage taken", dice: r.rolls, total: amount });
      damageHero(state, amount, res, "the mishap");
      res.facts.push(`The hero takes ${amount} damage from the failure.`);
      if (res.heroDown) resolveDowned(state, res);
      break;
    }
    case "enemy_free_attack":
      if (state.combat) res.facts.push("The failure leaves the hero exposed.");
      break;
    case "alert_enemies":
      if (!state.combat && !calm) {
        res.facts.push("The noise draws hostile attention.");
        startCombat(state, buildEncounter(hero.level), res, { ambush: fumble });
      } else if (!state.combat) {
        hero.boost = { mode: "disadvantage", source: "unwanted attention" };
        res.facts.push("Someone noticed — the hero is on the back foot (disadvantage on the next roll).");
      }
      break;
    case "lose_item": {
      const trinkets = hero.inventory.filter((i) => i.kind === "trinket" || i.kind === "food");
      if (trinkets.length && chance(0.5)) {
        const it = pick(trinkets);
        hero.inventory = hero.inventory.filter((i) => i !== it);
        res.facts.push(`The hero loses ${it.name}.`);
      } else if (hero.gold > 0) {
        const g = Math.min(hero.gold, randInt(2, 6 + hero.level * 2));
        hero.gold -= g;
        res.gold -= g;
        res.facts.push(`The hero loses ${g} gold.`);
      }
      break;
    }
    case "disadvantage_next": hero.boost = { mode: "disadvantage", source: "setback" }; res.facts.push("Setback: disadvantage on the next roll."); break;
    case "wasted_time": state.world.nextEventTurn = Math.max(state.world.turn + 1, state.world.nextEventTurn - 1); res.facts.push("Time is lost; danger draws closer."); break;
    default: break;
  }
}

// ---------------------------------------------------------------- the turn

function newResolution(plan) {
  return {
    kind: plan.kind, plan, rolls: [], facts: [], outcome: null, xp: 0, xpReasons: [], gold: 0, loot: [],
    levelUps: [], kills: [], damageTaken: 0, combatStarted: false, combatEnded: null, heroDown: false, died: false,
    event: null, powerUsed: null,
  };
}

// plan comes from the adjudicator (AI or offline). See narrator-*.js for its shape.
export function resolveTurn(state, plan) {
  const hero = state.hero;
  const res = newResolution(plan);
  const wasInCombat = !!state.combat;
  state.world.turn += 1;

  switch (plan.kind) {
    case "check": {
      const skill = SKILLS[plan.skill] || ABILITIES.includes(plan.skill) ? plan.skill : "perception";
      const sb = skillBonus(hero, skill);
      const dcKey = DCS[plan.dc_level] !== undefined ? plan.dc_level : "medium";
      let mode = plan.mode || "none";
      if (skill === "survival" && hero.cls === "ranger") mode = combineMode(mode, "advantage");
      if (hero.status.rage && sb.ability === "str") mode = combineMode(mode, "advantage");
      const name = SKILLS[skill] ? SKILLS[skill].name : `${skill.toUpperCase()} check`;
      const roll = d20Test(hero, { label: name, parts: sb.parts, target: DCS[dcKey], mode });
      roll.dcLevel = dcKey;
      res.rolls.push(roll);
      res.outcome = roll.crit ? "crit_success" : roll.fumble ? "crit_failure" : roll.success ? "success" : "failure";
      res.facts.push(`${name} check (DC ${DCS[dcKey]}, ${dcKey.replace("_", " ")}): ${roll.success ? "SUCCESS" : "FAILURE"} with ${roll.total}${roll.crit ? " — natural 20!" : roll.fumble ? " — natural 1!" : ""}.`);
      if (roll.success) {
        gainXp(state, SUCCESS_XP[dcKey] + (roll.crit ? 5 : 0), `${name} success`, res);
        applySuccessEffect(state, plan.on_success, res, roll.crit);
      } else {
        if (DCS[dcKey] >= DCS.hard) gainXp(state, 2, "Learned from failure", res);
        applyFailureEffect(state, plan.on_failure, res, roll.fumble);
      }
      break;
    }
    case "attack": {
      if (!state.combat) {
        if (plan.hostile && plan.hostile.name) {
          startCombat(state, [spawnNamed(plan.hostile.name, plan.hostile.tier, hero.level, maxTierFor(state))], res);
          if (state.dead || !state.combat) break;
        } else {
          res.facts.push("There is nothing hostile here to attack. The hero swings at shadows.");
          res.outcome = "none";
          break;
        }
      }
      const target = pickTarget(state, plan.target);
      if (!target) break;
      const attacks = (["fighter", "barbarian", "paladin", "ranger", "monk"].includes(hero.cls) && hero.level >= 5) ? 2 : 1;
      for (let i = 0; i < attacks; i++) {
        const t = i === 0 ? target : pickTarget(state, plan.target);
        if (!t) break;
        heroAttack(state, t, res, { mode: plan.mode || "none" });
      }
      res.outcome = res.rolls.some((r) => r.type === "d20" && r.success && r.label.includes("vs")) ? "success" : "failure";
      break;
    }
    case "power":
      usePower(state, plan.power, plan.target, res, plan);
      break;
    case "item": {
      const it = hero.inventory.find((i) => i.id === plan.item || i.name.toLowerCase() === String(plan.item || "").toLowerCase())
        || hero.inventory.find((i) => i.kind === "potion" && /potion|heal|drink/i.test(String(plan.item || "potion")));
      if (!it) { res.facts.push("The hero searches their pack but doesn't have that."); res.outcome = "none"; break; }
      if (it.kind === "potion" || (it.kind === "scroll" && it.effect === "heal")) {
        const r = rollDice(it.heal);
        const healed = heal(hero, r.total);
        res.rolls.push({ type: "effect", label: it.name, dice: r.rolls, total: r.total, note: `healed ${healed}` });
        res.facts.push(`The hero uses ${it.name} and recovers ${healed} HP.`);
        consume(hero, it);
      } else if (it.kind === "scroll") {
        hero.boost = { mode: "advantage", source: it.name };
        res.facts.push(`The hero reads ${it.name}: advantage on the next roll.`);
        consume(hero, it);
      } else {
        res.facts.push(`The hero uses ${it.name}.`);
      }
      res.outcome = "success";
      break;
    }
    case "flee":
      if (state.combat) flee(state, res, plan.mode || "none");
      else { res.facts.push("The hero hurries onward."); res.outcome = "none"; }
      break;
    case "short_rest":
      if (state.combat) { res.facts.push("There is no resting with enemies at hand."); res.outcome = "failure"; break; }
      if (state.world.shortRestsSinceEvent >= 2) { res.facts.push("The hero has already rested and can't recover more until something happens."); res.outcome = "failure"; break; }
      {
        const healed = heal(hero, Math.ceil(hero.maxHp / 2));
        resetResources(hero, false);
        if (hero.resources.slots < hero.resources.slotsMax) hero.resources.slots += 1;
        state.world.shortRestsSinceEvent += 1;
        res.facts.push(`Short rest: recovered ${healed} HP and short-rest abilities.`);
        res.outcome = "success";
      }
      break;
    case "long_rest": {
      if (state.combat) { res.facts.push("There is no resting with enemies at hand."); res.outcome = "failure"; break; }
      const since = state.world.turn - state.world.lastLongRestTurn;
      if (since < 6) {
        // Too soon to sleep — take a breather instead so the turn isn't wasted.
        const healed = state.world.shortRestsSinceEvent < 2 ? heal(hero, Math.ceil(hero.maxHp / 4)) : 0;
        if (healed) state.world.shortRestsSinceEvent += 1;
        res.facts.push(`The hero is too restless to sleep yet (possible in ${6 - since} turns)${healed ? `, but a breather restores ${healed} HP` : ""}.`);
        res.outcome = "failure";
        break;
      }
      if (phase(state) !== "calm" && chance(0.2)) {
        res.facts.push("The camp is attacked in the night before the hero gets a full rest!");
        heal(hero, Math.ceil(hero.maxHp / 2));
        startCombat(state, buildEncounter(hero.level), res);
        res.outcome = "failure";
        break;
      }
      hero.hp = hero.maxHp;
      resetResources(hero, true);
      state.world.lastLongRestTurn = state.world.turn;
      state.world.shortRestsSinceEvent = 0;
      res.facts.push("Long rest: fully healed, all spells and abilities restored.");
      res.outcome = "success";
      break;
    }
    case "travel":
      if (state.combat) { flee(state, res, plan.mode || "none"); break; } // leaving mid-fight means running
      res.outcome = "none";
      res.travel = true;
      break;
    case "impossible":
      res.outcome = "impossible";
      res.facts.push("That is beyond what the hero can do; no roll is possible.");
      break;
    default:
      res.outcome = "none";
  }

  // Enemies act after anything the hero does in a fight (unless it ended).
  if (state.combat && !state.dead && hero.hp > 0) {
    checkCombatOver(state, res);
    if (state.combat) {
      state.combat.firstStrike = false;
      const failEffect = plan.kind === "check" && res.outcome && res.outcome.includes("failure") && plan.on_failure === "enemy_free_attack";
      enemyPhase(state, res);
      if (failEffect && state.combat && !state.dead) { res.facts.push("Enemies press the advantage."); enemyPhase(state, res); }
      checkCombatOver(state, res);
    }
  }

  // The director only speaks outside combat.
  if (!state.dead && !state.combat && !res.combatStarted && !wasInCombat) {
    res.event = directorTick(state, res);
  } else if (!state.dead && !state.combat && wasInCombat) {
    // a breather after a fight
    state.world.nextEventTurn = Math.max(state.world.nextEventTurn, state.world.turn + randInt(3, 5));
  }

  return res;
}

function consume(hero, it) {
  it.qty -= 1;
  if (it.qty <= 0) hero.inventory = hero.inventory.filter((i) => i !== it);
}

// ---------------------------------------------------------------- the director
// Mild for the first 10–15 turns, then something happens every 2–4 turns.

const MILESTONES = [4, 7, 10];

function directorTick(state, res) {
  const w = state.world;
  const hero = state.hero;
  const t = w.turn;
  if (t <= w.calmUntil) {
    if (t === w.calmUntil) return { type: "omen", text: "A sign that danger is coming: the calm is ending." };
    if (res.travel || chance(0.3)) {
      const beats = ["friendly_traveler", "small_find", "weather", "rumor", "local_color"];
      const type = pick(beats);
      if (type === "small_find" && chance(0.5)) {
        const g = randInt(1, 6);
        hero.gold += g; res.gold += g;
        res.facts.push(`Found ${g} gold lying about.`);
      }
      if (res.travel) moveRegion(state, res, true);
      return { type: "calm", beat: type };
    }
    if (res.travel) moveRegion(state, res, true);
    return null;
  }
  if (w.nextEventTurn === 0) w.nextEventTurn = t; // first event right after the calm
  if (res.travel) {
    moveRegion(state, res, false);
    if (t < w.nextEventTurn && chance(0.5)) w.nextEventTurn = t;
  }
  if (t < w.nextEventTurn) return null;

  w.nextEventTurn = t + randInt(2, 4);
  w.eventsSeen += 1;
  w.shortRestsSinceEvent = 0;

  // Mercy rule: the director doesn't start fights while the hero is badly hurt.
  const hurt = hero.hp < hero.maxHp * 0.4;

  // A boss shows up once per milestone level (4, 7, 10), and only when the hero is fit for it.
  const milestoneDue = MILESTONES.find((m) => hero.level >= m && !(w.bossesSpawned || []).includes(m));
  if (milestoneDue && hero.hp >= hero.maxHp * 0.7 && chance(0.6)) {
    w.bossesSpawned = [...(w.bossesSpawned || []), milestoneDue];
    const enemies = buildEncounter(hero.level, { boss: true });
    startCombat(state, enemies, res);
    return { type: "boss", foes: enemies.map((e) => e.name) };
  }

  const first = w.eventsSeen === 1;
  const roll = Math.random();
  let type = first ? "combat" : roll < 0.42 ? "combat" : roll < 0.57 ? "hazard" : roll < 0.74 ? "social" : roll < 0.89 ? "discovery" : "mystery";
  if (hurt && (type === "combat" || type === "hazard")) type = pick(["social", "discovery", "mystery"]);

  if (type === "combat") {
    const enemies = buildEncounter(hero.level, { first });
    const ambush = !first && chance(0.25);
    startCombat(state, enemies, res, { ambush });
    return { type: "combat", ambush, foes: enemies.map((e) => e.name) };
  }
  if (type === "hazard") {
    const hz = pick([
      { ability: "dex", what: "a collapsing floor / falling rocks / a triggered dart trap" },
      { ability: "con", what: "a cloud of choking spores or poison gas" },
      { ability: "wis", what: "a wave of unnatural dread or a luring illusion" },
      { ability: "str", what: "a sudden rush of water, a snapping rope or a crushing weight" },
    ]);
    const dc = 11 + Math.floor(hero.level / 2);
    const sb = saveBonus(hero, hz.ability);
    let mode = "none";
    if (hero.race === "gnome" && ["int", "wis", "cha"].includes(hz.ability)) mode = "advantage";
    const roll = d20Test(hero, { label: `${hz.ability.toUpperCase()} saving throw`, parts: sb.parts, target: dc, mode });
    res.rolls.push(roll);
    if (roll.success) {
      if (hero.cls === "rogue" && hero.level >= 7 && hz.ability === "dex") res.facts.push("Evasion: the hero takes no damage.");
      gainXp(state, 10 + hero.level * 2, "Survived a hazard", res);
    } else {
      const r = hazardDamage(hero.level, roll.fumble ? "severe" : "moderate", false);
      res.rolls.push({ type: "effect", label: "Hazard damage", dice: r.rolls, total: r.total });
      damageHero(state, r.total, res, "the hazard");
      if (res.heroDown) resolveDowned(state, res);
    }
    return { type: "hazard", hazard: hz.what, saved: roll.success };
  }
  if (type === "discovery") {
    grantLoot(state, res, hero.level >= 5 ? "uncommon" : chance(0.4) ? "uncommon" : "common");
    const g = rollDice(`${1 + Math.floor(hero.level / 2)}d8`).total;
    hero.gold += g; res.gold += g;
    return { type: "discovery", gold: g };
  }
  if (type === "social") {
    const region = REGIONS[w.regionIndex] || REGIONS[0];
    return { type: "social", npc: pick(region.npcs) };
  }
  w.quest.stage += 0.5;
  gainXp(state, 15, "Found a piece of the mystery", res);
  return { type: "mystery" };
}

function moveRegion(state, res, calm) {
  const w = state.world;
  const hero = state.hero;
  // The story drifts toward tougher regions as the hero levels.
  const maxTier = calm ? 1 : Math.min(4, 1 + Math.floor(hero.level / 2));
  const options = REGIONS.map((r, i) => ({ r, i })).filter(({ r, i }) => r.tier <= maxTier && i !== w.regionIndex);
  const next = pick(options.length ? options : REGIONS.map((r, i) => ({ r, i })));
  w.regionIndex = next.i;
  w.location = next.r.name;
  res.facts.push(`The hero travels to ${next.r.name}.`);
}

// ---------------------------------------------------------------- summary for narrators

export function heroSummary(state) {
  const h = state.hero;
  const race = RACES[h.race].name;
  const cls = CLASSES[h.cls].name;
  const scores = ABILITIES.map((a) => `${a.toUpperCase()} ${h.abilities[a]} (${fmt(mod(h.abilities[a]))})`).join(", ");
  const skills = h.skills.map((s) => SKILLS[s].name).join(", ");
  const powers = knownPowers(h).map((p) => `${p.id} [${p.name}${canUsePower(h, p) ? "" : ", EXHAUSTED"}]`).join("; ");
  const inv = h.inventory.map((i) => `${i.id}: ${i.name}${i.qty > 1 ? ` x${i.qty}` : ""}`).join("; ");
  return [
    `Hero: ${h.name} (${h.pronouns}), level ${h.level} ${race} ${cls}, ${BACKGROUNDS[h.background].name} background.`,
    `Look & personality (player-written): ${h.description || "(none given)"}`,
    `Scores: ${scores}. Proficient skills: ${skills}.`,
    `HP ${h.hp}/${h.maxHp}${h.tempHp ? ` (+${h.tempHp} temp)` : ""}, AC ${computeAC(h)}, weapon ${h.weapon.name}. Gold ${h.gold}.`,
    `Powers: ${powers || "none"}.`,
    `Inventory: ${inv || "empty"}.`,
  ].join("\n");
}

export function worldSummary(state) {
  const w = state.world;
  const lines = [
    `Location: ${w.location}. Turn ${w.turn}. Phase: ${phase(state)}${phase(state) === "calm" ? ` (quiet opening until turn ${w.calmUntil}: no real threats yet)` : ""}.`,
    `Quest: "${w.quest.title}" — current objective: ${w.quest.objective}`,
  ];
  if (w.notes.length) lines.push(`Story so far: ${w.notes.slice(-14).join(" | ")}`);
  if (state.combat) {
    lines.push(`IN COMBAT (round ${state.combat.round}). Enemies: ${state.combat.enemies.map((e) => `${e.id} ${e.name} [${e.tier}] ${e.hp <= 0 ? "DEAD" : e.fled ? "FLED" : `${Math.round((100 * e.hp) / e.maxHp)}% HP${Object.keys(e.status).length ? ", " + Object.keys(e.status).join("/") : ""}`}`).join("; ")}.`);
  }
  return lines.join("\n");
}
