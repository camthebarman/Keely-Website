// UI glue: title screen, character creation, the game log and the sheet.
// Game rules live in engine.js; storytelling in narrator-ai.js / narrator-offline.js.

import { ABILITIES, ABILITY_NAMES, SKILLS, RACES, CLASSES, BACKGROUNDS, HOOKS, XP_TABLE, MAX_LEVEL, POWERS } from "./data.js";
import {
  STANDARD_ARRAY, roll4d6, assignScores, finalScores, mod, fmt, createHero, newGame, resolveTurn, knownPowers,
  canUsePower, maxUses, computeAC, skillBonus, profBonus, phase, livingEnemies, gainXp, applyAsi, spellDC, SAVE_VERSION,
} from "./engine.js";
import { adjudicateOffline, narrateOffline, traitsOffline, openingOffline, suggest } from "./narrator-offline.js";
import { AiNarrator, MODELS, DEFAULT_MODEL } from "./narrator-ai.js";
import { paintPortrait } from "./portrait.js";

// ---------------------------------------------------------------- tiny helpers

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage blocked */ } },
};

const SAVE_KEY = "dicebound.save";
const SETTINGS_KEY = "dicebound.settings";

let settings = { mode: "offline", apiKey: "", model: DEFAULT_MODEL, ...store.get(SETTINGS_KEY, {}) };
let narrator = null;
let state = null;
let busy = false;

function refreshNarrator() {
  narrator = settings.mode === "ai" && settings.apiKey ? new AiNarrator({ apiKey: settings.apiKey, model: settings.model }) : null;
}
refreshNarrator();

function showScreen(id) {
  $$(".screen").forEach((s) => (s.hidden = s.id !== id));
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- title

function initTitle() {
  const save = store.get(SAVE_KEY);
  const cont = $('[data-action="continue"]');
  if (save && save.hero && !save.dead && save.version === SAVE_VERSION) {
    cont.hidden = false;
    $("[data-continue-name]").textContent = `as ${save.hero.name} (level ${save.hero.level})`;
  } else {
    cont.hidden = true;
  }
  $("[data-dm-status]").textContent = narrator
    ? `Dungeon Master: Claude (${modelLabel(settings.model)})`
    : "Dungeon Master: offline. Add an Anthropic API key in settings to have Claude run the game.";
  showScreen("screen-title");
}

function modelLabel(id) {
  return (MODELS.find((m) => m.id === id) || { label: id }).label.replace(/ \(.*\)$/, "");
}

// ---------------------------------------------------------------- creation

const draft = {
  raceId: "human", clsId: "fighter", backgroundId: "soldier", method: "array", rolled: null,
  base: {}, swapSel: null, skills: new Set(), hookId: HOOKS[0].id,
  traits: null, traitsKey: "", seed: String(Math.random()).slice(2, 8),
};

function startCreation() {
  const form = $("#create-form");
  form.reset();
  Object.assign(draft, { raceId: "human", clsId: "fighter", backgroundId: "soldier", method: "array", rolled: null, swapSel: null, skills: new Set(), hookId: HOOKS[Math.floor(Math.random() * HOOKS.length)].id, traits: null, traitsKey: "" });
  draft.base = assignScores(draft.clsId, STANDARD_ARRAY);
  renderCreation();
  showScreen("screen-create");
  paintDraft(false);
}

function renderCreation() {
  renderRaces();
  renderClasses();
  renderBackgrounds();
  renderScores();
  renderSkillPick();
  renderHooks();
  renderSummary();
}

function choiceButton({ key, name, meta, blurb, pressed }) {
  return `<button type="button" class="choice" data-key="${key}" aria-pressed="${pressed}">
    <span class="choice__name">${esc(name)}</span>
    ${meta ? `<span class="choice__meta">${esc(meta)}</span>` : ""}
    <span class="choice__blurb">${esc(blurb)}</span></button>`;
}

function renderRaces() {
  $("[data-race-grid]").innerHTML = Object.entries(RACES).map(([k, r]) => choiceButton({
    key: k, name: r.name, pressed: k === draft.raceId,
    meta: Object.entries(r.bonus).map(([a, v]) => `${a.toUpperCase()} +${v}`).join(" "),
    blurb: r.blurb,
  })).join("");
}

function renderClasses() {
  $("[data-class-grid]").innerHTML = Object.entries(CLASSES).map(([k, c]) => choiceButton({
    key: k, name: c.name, pressed: k === draft.clsId,
    meta: `d${c.hd} HP · ${c.primary[0].toUpperCase()}${c.caster ? " · spells" : ""}`,
    blurb: c.blurb,
  })).join("");
}

function renderBackgrounds() {
  const sel = $("[data-background]");
  sel.innerHTML = Object.entries(BACKGROUNDS).map(([k, b]) => `<option value="${k}" ${k === draft.backgroundId ? "selected" : ""}>${esc(b.name)}</option>`).join("");
  const bg = BACKGROUNDS[draft.backgroundId];
  $("[data-background-note]").textContent = `Grants ${bg.skills.map((s) => SKILLS[s].name).join(" and ")}, plus: ${bg.item.toLowerCase()}.`;
}

function renderScores() {
  const final = finalScores(draft.base, draft.raceId);
  const bonus = RACES[draft.raceId].bonus;
  $("[data-score-grid]").innerHTML = ABILITIES.map((ab) => `
    <button type="button" class="score" data-ab="${ab}" aria-pressed="${draft.swapSel === ab}" title="${ABILITY_NAMES[ab]}">
      <div class="score__ab">${ab.toUpperCase()}</div>
      <div class="score__val">${final[ab]}</div>
      <div class="score__mod">${fmt(mod(final[ab]))}</div>
      <div class="score__bonus">${bonus[ab] ? `+${bonus[ab]} ${esc(RACES[draft.raceId].name)}` : ""}</div>
    </button>`).join("");
  $('[data-action="reroll"]').hidden = draft.method !== "roll";
}

function grantedSkills() {
  return new Set([...BACKGROUNDS[draft.backgroundId].skills, ...RACES[draft.raceId].skills]);
}

function renderSkillPick() {
  const cls = CLASSES[draft.clsId];
  const granted = grantedSkills();
  for (const s of [...draft.skills]) if (granted.has(s) || !cls.skillChoices.includes(s)) draft.skills.delete(s);
  const full = draft.skills.size >= cls.numSkills;
  const final = finalScores(draft.base, draft.raceId);
  $("[data-skill-note]").textContent = `Choose ${cls.numSkills} class skill${cls.numSkills > 1 ? "s" : ""} (${draft.skills.size}/${cls.numSkills}). Green skills come free from your ancestry and background. Proficiency adds +2 to those rolls.`;
  $("[data-skill-grid]").innerHTML = Object.entries(SKILLS).map(([k, s]) => {
    const isGranted = granted.has(k);
    const allowed = cls.skillChoices.includes(k);
    const checked = isGranted || draft.skills.has(k);
    const disabled = isGranted || !allowed || (!checked && full);
    const bonus = mod(final[s.ability]) + (checked ? 2 : 0);
    return `<label class="${isGranted ? "granted" : disabled ? "disabled" : ""}">
      <input type="checkbox" value="${k}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}>
      ${esc(s.name)} <small>${s.ability.toUpperCase()} ${fmt(bonus)}</small></label>`;
  }).join("");
}

function renderHooks() {
  $("[data-hook-list]").innerHTML = HOOKS.map((h) => choiceButton({ key: h.id, name: h.title, blurb: h.text, pressed: h.id === draft.hookId })).join("");
}

function renderSummary() {
  const f = $("#create-form");
  const name = f.elements.name.value.trim() || "Your hero";
  const race = RACES[draft.raceId], cls = CLASSES[draft.clsId];
  const final = finalScores(draft.base, draft.raceId);
  const hp = Math.max(6, cls.hd + mod(final.con) + 6 + (draft.raceId === "dwarf" ? 1 : 0));
  const powers = cls.powers.filter((p) => POWERS[p].level === 1).map((p) => POWERS[p].name);
  if (draft.raceId === "dragonborn") powers.push("Breath Weapon");
  $("[data-create-summary]").innerHTML = `
    <h3>${esc(name)}</h3>
    <p>${esc(race.name)} ${esc(cls.name)} · ${esc(BACKGROUNDS[draft.backgroundId].name)}</p>
    <p><b>${hp}</b> HP · weapon: ${esc(cls.weapon.name)} · armor: ${esc(cls.armor.name)}</p>
    <p>Starting powers: ${esc(powers.join(", ") || "none")}</p>
    <p>${race.traits.map(esc).join(" ")}</p>`;
}

let paintTimer = null;
function schedulePaint() {
  clearTimeout(paintTimer);
  paintTimer = setTimeout(() => paintDraft(false), 350);
}

function draftKey() {
  return `${$("#create-form").elements.description.value.trim()}|${draft.raceId}|${draft.clsId}`;
}

// useAi: ask Claude to read the description (on the Paint button). Otherwise keywords.
async function paintDraft(useAi) {
  const canvas = $("[data-create-portrait]");
  const desc = $("#create-form").elements.description.value.trim();
  const key = draftKey();
  const note = $("[data-portrait-note]");
  if (useAi && narrator) {
    $("[data-portrait-busy]").hidden = false;
    try {
      draft.traits = await narrator.portraitTraits(desc, draft.raceId, draft.clsId);
      draft.traitsKey = key;
      note.textContent = "Painted from Claude's reading of your description.";
    } catch (err) {
      note.textContent = `${narrator.explain(err)} Painted from keywords instead.`;
      draft.traits = traitsOffline(desc, draft.raceId, draft.clsId);
      draft.traitsKey = key;
    } finally {
      $("[data-portrait-busy]").hidden = true;
    }
  } else if (draft.traitsKey !== key || !draft.traits) {
    draft.traits = traitsOffline(desc, draft.raceId, draft.clsId);
    draft.traitsKey = key;
    note.textContent = narrator
      ? "Rough sketch from keywords — press Paint portrait to have Claude read your description."
      : "Painted from keywords in your description (hair, skin, eyes, clothes, scars, hoods…).";
  }
  paintPortrait(canvas, draft.traits, { raceId: draft.raceId, clsId: draft.clsId, seed: draft.seed });
}

function wireCreation() {
  const form = $("#create-form");
  $("[data-race-grid]").addEventListener("click", (e) => {
    const b = e.target.closest(".choice"); if (!b) return;
    draft.raceId = b.dataset.key;
    renderRaces(); renderScores(); renderSkillPick(); renderSummary(); schedulePaint();
  });
  $("[data-class-grid]").addEventListener("click", (e) => {
    const b = e.target.closest(".choice"); if (!b) return;
    draft.clsId = b.dataset.key;
    draft.base = assignScores(draft.clsId, draft.method === "roll" && draft.rolled ? draft.rolled : STANDARD_ARRAY);
    draft.swapSel = null;
    renderClasses(); renderScores(); renderSkillPick(); renderSummary(); schedulePaint();
  });
  $("[data-background]").addEventListener("change", (e) => {
    draft.backgroundId = e.target.value;
    renderBackgrounds(); renderSkillPick(); renderSummary();
  });
  $("[data-hook-list]").addEventListener("click", (e) => {
    const b = e.target.closest(".choice"); if (!b) return;
    draft.hookId = b.dataset.key; renderHooks();
  });
  form.addEventListener("change", (e) => {
    if (e.target.name === "scoreMethod") {
      draft.method = e.target.value;
      if (draft.method === "roll" && !draft.rolled) draft.rolled = roll4d6();
      draft.base = assignScores(draft.clsId, draft.method === "roll" ? draft.rolled : STANDARD_ARRAY);
      renderScores(); renderSkillPick(); renderSummary();
    }
    if (e.target.closest("[data-skill-grid]")) {
      const v = e.target.value;
      if (e.target.checked) draft.skills.add(v); else draft.skills.delete(v);
      renderSkillPick();
    }
  });
  $('[data-action="reroll"]').addEventListener("click", () => {
    draft.rolled = roll4d6();
    draft.base = assignScores(draft.clsId, draft.rolled);
    renderScores(); renderSkillPick(); renderSummary();
  });
  $("[data-score-grid]").addEventListener("click", (e) => {
    const b = e.target.closest(".score"); if (!b) return;
    const ab = b.dataset.ab;
    if (!draft.swapSel) draft.swapSel = ab;
    else if (draft.swapSel === ab) draft.swapSel = null;
    else {
      [draft.base[ab], draft.base[draft.swapSel]] = [draft.base[draft.swapSel], draft.base[ab]];
      draft.swapSel = null;
    }
    renderScores(); renderSkillPick(); renderSummary();
  });
  form.elements.name.addEventListener("input", renderSummary);
  form.elements.description.addEventListener("input", schedulePaint);
  $('[data-action="paint"]').addEventListener("click", () => paintDraft(true));
  $('[data-action="repaint"]').addEventListener("click", () => {
    draft.seed = String(Math.random()).slice(2, 8);
    paintDraft(false);
  });
  $('[data-action="back-title"]').addEventListener("click", initTitle);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("[data-create-error]");
    const name = form.elements.name.value.trim();
    const cls = CLASSES[draft.clsId];
    if (!name) { err.textContent = "Your hero needs a name."; form.elements.name.focus(); return; }
    if (draft.skills.size < cls.numSkills) { err.textContent = `Pick ${cls.numSkills - draft.skills.size} more skill${cls.numSkills - draft.skills.size > 1 ? "s" : ""}.`; $("[data-skill-grid]").scrollIntoView({ block: "center" }); return; }
    err.textContent = "";
    const hero = createHero({
      name, pronouns: form.elements.pronouns.value, raceId: draft.raceId, clsId: draft.clsId, backgroundId: draft.backgroundId,
      description: form.elements.description.value.trim(), baseScores: draft.base, chosenSkills: [...draft.skills],
      portrait: { traits: draft.traits || traitsOffline("", draft.raceId, draft.clsId), seed: draft.seed },
    });
    state = newGame(hero, draft.hookId);
    beginGame();
  });
}

// ---------------------------------------------------------------- game: start/continue

async function beginGame() {
  enterGameScreen();
  addLog({ type: "event", text: `Chapter One — ${state.world.quest.title}` });
  setBusy(true);
  const thinking = showThinking("The Dungeon Master sets the scene…");
  let opening;
  if (narrator) {
    try { opening = await narrator.opening(state); } catch (err) { addLog({ type: "error", text: `${narrator.explain(err)} The offline DM will open the story.` }); }
  }
  if (!opening) opening = openingOffline(state);
  thinking.remove();
  if (opening.location) state.world.location = opening.location;
  addLog({ type: "narration", text: opening.narration });
  state.history.push({ action: "(the adventure begins)", facts: "Opening scene.", narration: opening.narration });
  state.world.suggestions = opening.suggestions || [];
  setBusy(false);
  renderGame();
  saveGame();
}

function continueGame() {
  const save = store.get(SAVE_KEY);
  if (!save) return initTitle();
  state = save;
  enterGameScreen();
  if (state.dead) showDeath();
}

function enterGameScreen() {
  showScreen("screen-game");
  $("[data-log]").innerHTML = "";
  for (const entry of state.log) renderEntry(entry, false);
  renderGame();
  paintPortrait($("[data-sheet-portrait]"), state.hero.portrait.traits, { raceId: state.hero.race, clsId: state.hero.cls, seed: state.hero.portrait.seed });
  scrollLog();
  $("[data-input]").focus();
}

function saveGame() {
  if (!state) return;
  if (state.log.length > 500) state.log = state.log.slice(-500);
  if (state.history.length > 40) state.history = state.history.slice(-40);
  if (!store.set(SAVE_KEY, state)) addLog({ type: "error", text: "Couldn't save to this browser's storage — use Menu → Download save file to keep your progress." });
}

// ---------------------------------------------------------------- the turn

async function takeTurn(text, presetPlan = null) {
  if (busy || !state || state.dead) return;
  text = text.trim();
  if (!text) return;
  setBusy(true);
  addLog({ type: "player", text });
  $("[data-suggestions]").innerHTML = "";

  let thinking = showThinking("The Dungeon Master considers…");
  let plan = presetPlan;
  let aiFailed = false;
  if (!plan && narrator) {
    try { plan = await narrator.adjudicate(state, text); } catch (err) {
      aiFailed = true;
      addLog({ type: "error", text: `${narrator.explain(err)} The offline DM is covering this turn.` });
    }
  }
  if (!plan) plan = adjudicateOffline(state, text);
  plan = sanitizePlan(plan);

  const res = resolveTurn(state, plan);
  thinking.remove();

  if (res.rolls.length) await addRolls(res.rolls);
  if (res.combatStarted && res.event && ["combat", "boss"].includes(res.event.type)) {
    addLog({ type: "event", text: res.event.type === "boss" ? "Boss fight" : res.event.ambush ? "Ambush!" : "Combat" });
  }

  thinking = showThinking(state.dead ? "…" : "The story unfolds…");
  let narr = null;
  if (narrator && !aiFailed) {
    try { narr = await narrator.narrate(state, text, res); } catch (err) {
      addLog({ type: "error", text: `${narrator.explain(err)} The offline DM is narrating this turn.` });
    }
  }
  if (!narr) narr = narrateOffline(state, text, res);
  thinking.remove();

  addLog({ type: "narration", text: narr.narration });

  // Narrator extras (the engine still owns the numbers).
  if (narr.location && narr.location.length < 60) state.world.location = narr.location;
  if (narr.objective && narr.objective.length > 8) {
    state.world.quest.objective = narr.objective;
    addLog({ type: "note", text: `New objective: ${narr.objective}` });
  }
  if (narr.story_note) { state.world.notes.push(narr.story_note); if (state.world.notes.length > 40) state.world.notes.shift(); }
  if (narr.bonus_xp && narr.bonus_xp !== "none" && !state.dead) {
    const amount = narr.bonus_xp === "notable" ? 25 + 5 * state.hero.level : 10 + 2 * state.hero.level;
    gainXp(state, amount, narr.bonus_xp === "notable" ? "Great roleplay" : "Good roleplay", res);
  }
  state.world.suggestions = narr.suggestions && narr.suggestions.length ? narr.suggestions : suggest(state);
  state.history.push({ action: text, facts: res.facts.join(" ").slice(0, 700), narration: narr.narration });

  const chips = [];
  if (res.xp) chips.push({ cls: "xp", text: `+${res.xp} XP` });
  if (res.gold > 0) chips.push({ cls: "gold", text: `+${res.gold} gold` });
  if (res.gold < 0) chips.push({ cls: "bad", text: `${res.gold} gold` });
  for (const l of res.loot) chips.push({ cls: "loot", text: l });
  if (res.damageTaken) chips.push({ cls: "bad", text: `−${res.damageTaken} HP` });
  if (res.combatEnded === "victory" || res.combatEnded === "surrender") chips.push({ cls: "good", text: "Victory" });
  if (res.combatEnded === "hero_fled") chips.push({ cls: "good", text: "Escaped" });
  if (chips.length) addLog({ type: "system", chips });

  renderGame();
  saveGame();
  setBusy(false);

  if (res.levelUps.length) await showLevelUps(res.levelUps);
  if (state.dead) showDeath();
  else if (!matchMedia("(pointer: coarse)").matches) $("[data-input]").focus();
}

function sanitizePlan(plan) {
  const p = { mode: "none", on_success: "none", on_failure: "none", ...plan };
  if (p.kind === "power" && !p.power) p.kind = state.combat ? "attack" : "free";
  if (p.kind === "check" && !p.skill) p.skill = "perception";
  if (p.kind === "item" && !p.item) p.item = "potion";
  return p;
}

function setBusy(on) {
  busy = on;
  $("[data-send]").disabled = on;
  $("[data-input]").setAttribute("aria-busy", on ? "true" : "false");
}

// ---------------------------------------------------------------- log

function addLog(entry) {
  state.log.push(entry);
  renderEntry(entry, true);
  scrollLog();
}

function scrollLog() {
  const log = $("[data-log]");
  requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
}

function showThinking(text) {
  const el = document.createElement("div");
  el.className = "entry thinking";
  el.innerHTML = `<span class="die die--rolling" aria-hidden="true">?</span><span>${esc(text)}</span>`;
  $("[data-log]").appendChild(el);
  scrollLog();
  if (!reduceMotion) {
    const die = el.querySelector(".die");
    el._spin = setInterval(() => {
      die.textContent = 1 + Math.floor(Math.random() * 20);
      die.classList.remove("die--rolling"); void die.offsetWidth; die.classList.add("die--rolling");
    }, 650);
    const remove = el.remove.bind(el);
    el.remove = () => { clearInterval(el._spin); remove(); };
  }
  return el;
}

function renderEntry(entry, animate) {
  const log = $("[data-log]");
  const el = document.createElement("div");
  el.className = `entry entry--${entry.type}`;
  if (!animate) el.style.animation = "none";
  switch (entry.type) {
    case "narration":
      el.innerHTML = entry.text.split(/\n{2,}|\n/).filter((p) => p.trim()).map((p) => `<p>${esc(p)}</p>`).join("");
      break;
    case "player":
    case "event":
    case "note":
    case "error":
      el.textContent = entry.text;
      break;
    case "system":
      el.innerHTML = entry.chips.map((c) => `<span class="chip chip--${c.cls}">${esc(c.text)}</span>`).join("");
      break;
    case "rolls":
      el.innerHTML = `<div class="rolls">${entry.rolls.map((r) => rollHtml(r, false)).join("")}</div>`;
      break;
    default:
      el.textContent = entry.text || "";
  }
  log.appendChild(el);
  return el;
}

// Shows the dice one at a time so each roll gets its moment.
async function addRolls(rolls) {
  state.log.push({ type: "rolls", rolls });
  const el = document.createElement("div");
  el.className = "entry entry--rolls";
  el.innerHTML = `<div class="rolls"></div>`;
  $("[data-log]").appendChild(el);
  const box = el.firstChild;
  for (const r of rolls) {
    box.insertAdjacentHTML("beforeend", rollHtml(r, !reduceMotion));
    scrollLog();
    if (!reduceMotion) await sleep(rolls.length > 6 ? 180 : 380);
  }
}

function dieHtml(n, cls, rolling) {
  return `<span class="die ${cls}${rolling ? " die--rolling" : ""}">${n}</span>`;
}

function partsText(parts) {
  return parts.filter((p) => p.value !== 0 || p.label === "proficient").map((p) => ` ${p.value >= 0 ? "+" : "−"} ${Math.abs(p.value)} <small>${esc(p.label)}</small>`).join("");
}

function rollHtml(r, rolling) {
  if (r.type === "d20") {
    const dropped = r.dice.length === 2 && r.dice[0] !== r.dice[1] ? r.dice.findIndex((x) => x !== r.natural) : -1;
    const dice = r.dice.map((n, i) => dieHtml(n, i === dropped ? "die--dropped" : n === 20 && i !== dropped ? "die--crit" : n === 1 && i !== dropped ? "die--fumble" : "", rolling)).join("");
    const modeNote = r.mode === "advantage" ? " <small>(advantage)</small>" : r.mode === "disadvantage" ? " <small>(disadvantage)</small>" : "";
    const vsText = r.targetLabel === "vs" ? "" : ` vs ${esc(r.targetLabel)} ${r.target}`;
    let verdict, cls;
    if (r.targetLabel === "vs") { verdict = r.success ? "You act first" : "They act first"; cls = r.success ? "success" : "failure"; }
    else if (r.targetLabel === "AC") { verdict = r.crit ? "Critical hit!" : r.success ? "Hit" : r.fumble ? "Fumble" : "Miss"; cls = r.success ? "success" : "failure"; }
    else { verdict = r.crit ? "Natural 20!" : r.fumble ? "Natural 1" : r.success ? "Success" : "Failure"; cls = r.success ? "success" : "failure"; }
    const dmg = r.damage ? `<span class="roll__dmg">${r.damage.total} damage${r.damage.extra && r.damage.extra.length ? ` (incl. ${esc(r.damage.extra.join(", "))})` : ""}</span>` : "";
    return `<div class="roll roll--${cls}">
      <div class="dice">${dice}</div>
      <div><div class="roll__label">${esc(r.label)}${r.rerolled ? " <small>(lucky reroll)</small>" : ""}</div>
      <div class="roll__math">d20 ${r.natural}${partsText(r.parts)} = <b>${r.total}</b>${vsText}${modeNote}</div></div>
      <div class="roll__verdict roll__verdict--${cls}">${verdict}${dmg}</div></div>`;
  }
  if (r.type === "enemy_attack") {
    const dropped = r.dice.length === 2 && r.dice[0] !== r.dice[1] ? r.dice.findIndex((x) => x !== r.natural) : -1;
    const dice = r.dice.map((n, i) => dieHtml(n, `die--enemy${i === dropped ? " die--dropped" : ""}`, rolling)).join("");
    const cls = r.success ? "failure" : "success";
    const dmg = r.damage ? `<span class="roll__dmg">you take ${r.damage.total}</span>` : "";
    return `<div class="roll roll--enemy roll--${cls}">
      <div class="dice">${dice}</div>
      <div><div class="roll__label">${esc(r.label)}</div>
      <div class="roll__math">d20 ${r.natural} + ${r.bonus} = <b>${r.total}</b> vs your AC ${r.target}${r.mode !== "none" ? ` <small>(${r.mode})</small>` : ""}</div></div>
      <div class="roll__verdict roll__verdict--${cls}">${r.crit ? "Critical!" : r.success ? "Hit" : "Miss"}${dmg}</div></div>`;
  }
  if (r.type === "enemy_save") {
    const cls = r.success ? "failure" : "success";
    return `<div class="roll roll--enemy roll--${cls}">
      <div class="dice">${dieHtml(r.natural, "die--enemy", rolling)}</div>
      <div><div class="roll__label">${esc(r.label)}</div>
      <div class="roll__math">d20 ${r.natural} + ${r.total - r.natural} = <b>${r.total}</b> vs your spell DC ${r.target}</div></div>
      <div class="roll__verdict roll__verdict--${cls}">${r.success ? "Resists" : "Fails"}</div></div>`;
  }
  if (r.type === "death") {
    const dice = r.dice.map((n) => dieHtml(n, n === 20 ? "die--crit" : n >= 10 ? "" : "die--fumble", rolling)).join("");
    const cls = r.survived ? "success" : "failure";
    return `<div class="roll roll--${cls}">
      <div class="dice">${dice}</div>
      <div><div class="roll__label">${esc(r.label)}</div>
      <div class="roll__math">${r.successes} success${r.successes === 1 ? "" : "es"}, ${r.failures} failure${r.failures === 1 ? "" : "s"} (10+ succeeds)</div></div>
      <div class="roll__verdict roll__verdict--${cls}">${r.survived ? "Survived" : "Dead"}</div></div>`;
  }
  // effect: damage/heal dice
  const shown = r.dice.slice(0, 10);
  return `<div class="roll">
    <div class="dice">${shown.map((n) => dieHtml(n, "die--small", rolling)).join("")}${r.dice.length > 10 ? "…" : ""}</div>
    <div><div class="roll__label">${esc(r.label)}</div>
    <div class="roll__math">total <b>${r.total}</b>${r.note ? ` · ${esc(r.note)}` : ""}</div></div>
    <div class="roll__verdict roll__verdict--neutral"></div></div>`;
}

// ---------------------------------------------------------------- the sheet

function renderGame() {
  if (!state) return;
  const h = state.hero;
  const ph = phase(state);
  const badge = $("[data-phase-badge]");
  badge.className = `badge badge--${ph}`;
  badge.textContent = ph === "calm" ? "Quiet start" : ph === "combat" ? `Combat · round ${state.combat.round}` : "Adventure";
  $("[data-turn]").textContent = `Turn ${state.world.turn}`;
  $("[data-location]").textContent = state.world.location;
  const dm = $("[data-dm-badge]");
  dm.className = `badge ${narrator ? "badge--ai" : "badge--muted"}`;
  dm.textContent = narrator ? "Claude DM" : "Offline DM";

  $("[data-hero-name]").textContent = h.name;
  $("[data-hero-sub]").textContent = `Level ${h.level} ${RACES[h.race].name} ${CLASSES[h.cls].name}`;
  const hpPct = Math.max(0, Math.min(100, (100 * h.hp) / h.maxHp));
  $("[data-hp-fill]").style.width = `${hpPct}%`;
  $("[data-hp-label]").textContent = `HP ${h.hp} / ${h.maxHp}${h.tempHp ? ` (+${h.tempHp})` : ""}`;
  $(".bar--hp").classList.toggle("bar--temp", h.tempHp > 0);
  const lo = XP_TABLE[h.level - 1], hi = XP_TABLE[h.level] ?? XP_TABLE[MAX_LEVEL - 1];
  $("[data-xp-fill]").style.width = h.level >= MAX_LEVEL ? "100%" : `${Math.min(100, (100 * (h.xp - lo)) / (hi - lo))}%`;
  $("[data-xp-label]").textContent = h.level >= MAX_LEVEL ? `XP ${h.xp} (max level)` : `XP ${h.xp} / ${hi}`;

  const cls = CLASSES[h.cls];
  $("[data-quick-stats]").innerHTML = [
    `<span class="stat-pill">AC <b>${computeAC(h)}</b></span>`,
    `<span class="stat-pill">Prof <b>${fmt(profBonus(h.level))}</b></span>`,
    cls.caster ? `<span class="stat-pill">Spell DC <b>${spellDC(h)}</b></span>` : "",
    `<span class="stat-pill">${esc(h.weapon.name)} <b>${h.weapon.dice}</b></span>`,
    h.boost ? `<span class="stat-pill">Next roll: <b>${esc(h.boost.mode || h.boost.bonus)}</b></span>` : "",
  ].join("");
  $("[data-abilities]").innerHTML = ABILITIES.map((a) => `<div class="ab" title="${ABILITY_NAMES[a]}"><div class="ab__k">${a.toUpperCase()}</div><div class="ab__m">${fmt(mod(h.abilities[a]))}</div><div class="ab__s">${h.abilities[a]}</div></div>`).join("");
  $("[data-quest]").innerHTML = `<b>${esc(state.world.quest.title)}</b><br>${esc(state.world.quest.objective)}`;

  const r = h.resources;
  const resBits = [];
  if (r.slotsMax) resBits.push(`slots ${r.slots}/${r.slotsMax}`);
  if (r.kiMax) resBits.push(`ki ${r.ki}/${r.kiMax}`);
  if (r.poolMax) resBits.push(`healing ${r.pool}/${r.poolMax}`);
  $("[data-resources]").textContent = resBits.join(" · ");
  $("[data-powers]").innerHTML = knownPowers(h).map((p) => {
    const cost = p.cost.type === "atwill" ? "at will" : p.cost.type === "slot" ? "spell slot" : p.cost.type === "ki" ? `${p.cost.n} ki` : p.cost.type === "pool" ? "pool" : `${r.uses[p.id] ?? 0}/${maxUses(h, p.id)} per ${p.cost.type} rest`;
    return `<button type="button" class="power" data-power="${p.id}" data-spent="${!canUsePower(h, p)}">
      <span class="power__name">${esc(p.name)} <span class="power__cost">${esc(cost)}</span></span>
      <span class="power__desc">${esc(p.desc)}</span></button>`;
  }).join("") + `<div class="row"><button type="button" class="btn btn--small" data-rest="short">Short rest</button><button type="button" class="btn btn--small" data-rest="long">Long rest</button></div>`;

  const foes = state.combat ? state.combat.enemies : [];
  $("[data-enemy-sec]").hidden = !foes.length;
  $("[data-enemies]").innerHTML = foes.map((e) => {
    const down = e.hp <= 0 || e.fled;
    const pct = Math.max(0, (100 * e.hp) / e.maxHp);
    const cond = e.hp <= 0 ? "slain" : e.fled ? "fled" : pct > 75 ? "unhurt" : pct > 40 ? "wounded" : "bloodied";
    return `<div class="enemy ${down ? "enemy--down" : ""}">
      <div class="enemy__name"><span>${esc(e.name)}</span><span>${cond}${Object.keys(e.status).length ? " · " + esc(Object.keys(e.status).join(", ")) : ""}</span></div>
      <div class="bar bar--hp"><span class="bar__fill" style="width:${pct}%"></span></div></div>`;
  }).join("");

  $("[data-gold]").textContent = `${h.gold} gold`;
  $("[data-inventory]").innerHTML = h.inventory.map((i) => {
    const usable = i.kind === "potion" || i.kind === "scroll";
    const tag = i.equipped ? "equipped" : i.kind;
    return `<li><span>${esc(i.name)}${i.qty > 1 ? ` ×${i.qty}` : ""} <span class="tag">${esc(tag)}</span></span>${usable ? `<button type="button" class="btn btn--small" data-use="${i.id}">Use</button>` : ""}</li>`;
  }).join("") || "<li>Empty</li>";

  $("[data-skills]").innerHTML = Object.entries(SKILLS).map(([k, s]) => {
    const b = skillBonus(h, k);
    return `<li class="${h.skills.includes(k) ? "prof" : ""}"><span>${esc(s.name)}</span><span>${fmt(b.total)}</span></li>`;
  }).join("");

  const sugg = state.dead ? [] : (state.world.suggestions && state.world.suggestions.length ? state.world.suggestions : suggest(state));
  $("[data-suggestions]").innerHTML = sugg.map((s) => `<button type="button" class="suggestion">${esc(s)}</button>`).join("");
}

function wireGame() {
  const input = $("[data-input]");
  const autosize = () => { input.style.height = "auto"; input.style.height = `${Math.min(160, input.scrollHeight)}px`; };
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("[data-input-form]").requestSubmit(); }
  });
  $("[data-input-form]").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value;
    if (!text.trim() || busy) return;
    input.value = "";
    autosize();
    takeTurn(text);
  });
  $("[data-suggestions]").addEventListener("click", (e) => {
    const b = e.target.closest(".suggestion"); if (!b) return;
    takeTurn(b.textContent);
  });
  $("[data-sheet]").addEventListener("click", (e) => {
    const power = e.target.closest("[data-power]");
    if (power) {
      const p = knownPowers(state.hero).find((x) => x.id === power.dataset.power);
      const target = livingEnemies(state)[0];
      closeSheetOnMobile();
      return takeTurn(`I use ${p.name}${target && p.combatOnly ? ` on the ${target.name}` : ""}.`, { kind: "power", power: p.id, target: target?.id || null });
    }
    const use = e.target.closest("[data-use]");
    if (use) {
      const it = state.hero.inventory.find((i) => i.id === use.dataset.use);
      closeSheetOnMobile();
      return takeTurn(`I use my ${it.name}.`, { kind: "item", item: it.id });
    }
    const rest = e.target.closest("[data-rest]");
    if (rest) {
      closeSheetOnMobile();
      return rest.dataset.rest === "short"
        ? takeTurn("I take a short rest to catch my breath.", { kind: "short_rest" })
        : takeTurn("I make camp and take a long rest.", { kind: "long_rest" });
    }
    if (e.target.closest("[data-sheet-portrait]")) showPortraitZoom();
  });
  $('[data-action="toggle-sheet"]').addEventListener("click", () => $("[data-sheet]").classList.toggle("open"));
  $('[data-action="menu"]').addEventListener("click", () => $("#dlg-menu").showModal());
}

function closeSheetOnMobile() { $("[data-sheet]").classList.remove("open"); }

function showPortraitZoom() {
  let dlg = $("#dlg-portrait");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "dlg-portrait";
    dlg.className = "modal";
    dlg.innerHTML = `<form method="dialog" class="modal__body"><canvas class="portrait portrait-zoom"></canvas><p class="hint" style="text-align:center" data-zoom-desc></p><div class="modal__actions"><button class="btn btn--ghost">Close</button></div></form>`;
    document.body.appendChild(dlg);
  }
  const h = state.hero;
  paintPortrait($("canvas", dlg), h.portrait.traits, { raceId: h.race, clsId: h.cls, seed: h.portrait.seed });
  $("[data-zoom-desc]", dlg).textContent = h.description || `${h.name}, ${RACES[h.race].name} ${CLASSES[h.cls].name}`;
  dlg.showModal();
}

// ---------------------------------------------------------------- level up & death

async function showLevelUps(list) {
  for (const lu of list) {
    await new Promise((resolve) => {
      const dlg = $("#dlg-levelup");
      const body = $("[data-levelup-body]");
      const render = () => {
        const h = state.hero;
        const needAsi = h.pendingAsi > 0 && lu === list[list.length - 1];
        body.innerHTML = `
          <p class="kicker">You feel stronger</p>
          <h2 class="levelup-banner">Level ${lu.level}</h2>
          <ul class="levelup-list">
            <li>+${lu.hpGain} maximum HP (now ${h.maxHp})</li>
            <li>Proficiency bonus ${fmt(lu.prof)}</li>
            ${lu.newPowers.map((p) => `<li>New power: <b>${esc(p)}</b></li>`).join("")}
            ${lu.feature ? `<li>${esc(lu.feature)}</li>` : ""}
            <li>Spells and abilities restored.</li>
          </ul>
          ${needAsi ? `<p><b>Ability score improvement:</b> spend ${h.pendingAsi} point${h.pendingAsi > 1 ? "s" : ""} (max 20).</p>
            <div class="asi-grid">${ABILITIES.map((a) => `<button type="button" class="btn btn--small" data-asi="${a}" ${h.abilities[a] >= 20 ? "disabled" : ""}>${a.toUpperCase()} ${h.abilities[a]}</button>`).join("")}</div>` : ""}
          <div class="modal__actions"><button class="btn btn--primary" value="ok" ${needAsi ? "disabled" : ""}>Onward</button></div>`;
      };
      render();
      body.onclick = (e) => {
        const b = e.target.closest("[data-asi]");
        if (b) { applyAsi(state.hero, b.dataset.asi); render(); renderGame(); saveGame(); }
      };
      dlg.addEventListener("close", () => { renderGame(); saveGame(); resolve(); }, { once: true });
      dlg.addEventListener("cancel", (e) => { if (state.hero.pendingAsi > 0) e.preventDefault(); }, { once: true });
      dlg.showModal();
    });
  }
}

function showDeath() {
  const h = state.hero;
  $("[data-death-text]").textContent = `${h.name} the ${RACES[h.race].name} ${CLASSES[h.cls].name} fell on turn ${state.world.turn}, at level ${h.level}, somewhere in ${state.world.location}. The dice remember.`;
  store.set(SAVE_KEY, state);
  $("#dlg-death").showModal();
}

// ---------------------------------------------------------------- settings & menu

function openSettings() {
  const dlg = $("#dlg-settings");
  const f = $("[data-settings-form]");
  $("[data-model-select]").innerHTML = MODELS.map((m) => `<option value="${m.id}" ${m.id === settings.model ? "selected" : ""}>${esc(m.label)}</option>`).join("");
  f.elements.apiKey.value = settings.apiKey || "";
  f.elements.dmMode.value = settings.mode;
  $("[data-test-result]").textContent = "";
  $("[data-ai-fields]").hidden = settings.mode !== "ai";
  $("#dlg-menu").open && $("#dlg-menu").close();
  dlg.returnValue = "";
  dlg.showModal();
}

function readSettingsForm() {
  const f = $("[data-settings-form]");
  return { mode: f.elements.dmMode.value, apiKey: f.elements.apiKey.value.trim(), model: f.elements.model.value };
}

function wireSettings() {
  const f = $("[data-settings-form]");
  f.addEventListener("change", (e) => {
    if (e.target.name === "dmMode") $("[data-ai-fields]").hidden = e.target.value !== "ai";
  });
  $('[data-action="test-key"]').addEventListener("click", async () => {
    const out = $("[data-test-result]");
    const s = readSettingsForm();
    if (!s.apiKey) { out.className = "test-result bad"; out.textContent = "Enter a key first."; return; }
    out.className = "test-result";
    out.textContent = "Asking the tavern keeper…";
    const test = new AiNarrator({ apiKey: s.apiKey, model: s.model });
    try {
      const hello = await test.test();
      out.className = "test-result ok";
      out.textContent = `Connected: "${hello}"`;
    } catch (err) {
      out.className = "test-result bad";
      out.textContent = test.explain(err);
    }
  });
  $('[data-action="forget-key"]').addEventListener("click", () => {
    f.elements.apiKey.value = "";
    f.elements.dmMode.value = "offline";
    $("[data-ai-fields]").hidden = true;
  });
  $("#dlg-settings").addEventListener("close", () => {
    if ($("#dlg-settings").returnValue !== "save") return;
    const s = readSettingsForm();
    settings = { ...settings, ...s };
    if (settings.mode === "ai" && !settings.apiKey) settings.mode = "offline";
    store.set(SETTINGS_KEY, settings);
    refreshNarrator();
    if (state && !$("#screen-game").hidden) renderGame();
    if (!$("#screen-title").hidden) initTitle();
  });
}

function wireMenu() {
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-action]");
    if (!a) return;
    switch (a.dataset.action) {
      case "new":
        if ($("#dlg-death").open) $("#dlg-death").close();
        if (state && !state.dead && store.get(SAVE_KEY) && !confirm("Start a new hero? Your current adventure will be replaced.")) return;
        startCreation();
        break;
      case "continue": continueGame(); break;
      case "settings": openSettings(); break;
      case "to-title": $("#dlg-menu").close(); initTitle(); break;
      case "close-death": $("#dlg-death").close(); break;
      case "export": exportSave(); break;
      case "abandon":
        if (confirm("Abandon this hero for good? This deletes the save.")) {
          store.remove(SAVE_KEY);
          state = null;
          $("#dlg-menu").close();
          initTitle();
        }
        break;
      default: break;
    }
  });
  $("[data-import]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data.hero || !data.world || data.version !== SAVE_VERSION) throw new Error("not a Dicebound save");
      state = data;
      store.set(SAVE_KEY, state);
      $("#dlg-menu").close();
      enterGameScreen();
    } catch (err) {
      alert(`Couldn't load that file: ${err.message}`);
    }
    e.target.value = "";
  });
}

function exportSave() {
  if (!state) return;
  const blob = new Blob([JSON.stringify(state, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `dicebound-${state.hero.name.replace(/\W+/g, "-").toLowerCase()}-lvl${state.hero.level}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- boot

wireCreation();
wireGame();
wireSettings();
wireMenu();
initTitle();
