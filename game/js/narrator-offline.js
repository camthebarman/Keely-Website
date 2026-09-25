// The offline narrator. Used when there's no API key, or when an AI call
// fails. It reads the player's words with keyword rules, turns them into a
// plan for the engine, then writes the result from templates. Less clever
// than Claude, but the rules underneath are identical.

import { SKILLS, REGIONS, CLASSES, RACES, POWERS } from "./data.js";
import { knownPowers, livingEnemies, phase } from "./engine.js";
import { pick } from "./dice.js";

// ---------------------------------------------------------------- reading intent

const RULES = [
  // [regex, plan fields]
  [/\b(short rest|catch my breath|take a (quick )?break|rest a (bit|moment|while))\b/, { kind: "short_rest" }],
  [/\b(long rest|sleep|make camp|set up camp|camp for the night|rest for the night|go to bed|get a room)\b/, { kind: "long_rest" }],
  [/\b(drink|quaff|swig|use (a |my |the )?(healing )?potion|read (the |a )?scroll)\b/, { kind: "item" }],
  [/\b(flee|run away|retreat|escape|disengage|get away|bolt for)\b/, { kind: "flee" }],
  [/\b(attack|hit|stab|slash|strike|shoot|fire at|swing|punch|kick|smash|cleave|charge at|fight|kill|behead|lunge)\b/, { kind: "attack" }],
  [/\b(pick the lock|pick a lock|lockpick|disarm|pickpocket|steal|palm|swipe|lift (his|her|their) purse|sleight)\b/, { kind: "check", skill: "sleight_of_hand", dc_level: "medium", on_success: "find_item", on_failure: "alert_enemies" }],
  [/\b(sneak|hide|stealth|creep|tiptoe|slip past|stay hidden|shadows)\b/, { kind: "check", skill: "stealth", dc_level: "medium", on_success: "gain_advantage", on_failure: "alert_enemies" }],
  [/\b(climb|scale|jump|leap|swim|lift|push|shove|force|break down|bash|bend|haul|drag|wrestle|grapple|arm ?wrestle)\b/, { kind: "check", skill: "athletics", dc_level: "medium", on_success: "gain_advantage", on_failure: "damage_light" }],
  [/\b(balance|tumble|dodge|flip|cartwheel|squeeze through|dive|roll under|swing from)\b/, { kind: "check", skill: "acrobatics", dc_level: "medium", on_success: "gain_advantage", on_failure: "damage_light" }],
  [/\b(lie|bluff|deceive|trick|disguise|pretend|con |fool|forge)\b/, { kind: "check", skill: "deception", dc_level: "medium", on_success: "learn_info", on_failure: "disadvantage_next" }],
  [/\b(threaten|intimidate|scare|menace|glare|growl|demand)\b/, { kind: "check", skill: "intimidation", dc_level: "medium", on_success: "learn_info", on_failure: "disadvantage_next" }],
  [/\b(persuade|convince|negotiate|haggle|barter|plead|charm|flirt|befriend|reason with|bribe|ask .* for help)\b/, { kind: "check", skill: "persuasion", dc_level: "medium", on_success: "learn_info", on_failure: "none" }],
  [/\b(sing|perform|play (a |my )?(song|lute|music)|dance|juggle|tell a (story|joke)|entertain)\b/, { kind: "check", skill: "performance", dc_level: "easy", on_success: "find_gold", on_failure: "none" }],
  [/\b(heal|bandage|treat|tend|first aid|stitch|diagnose|examine (the )?(wound|body|corpse))\b/, { kind: "check", skill: "medicine", dc_level: "medium", on_success: "learn_info", on_failure: "none" }],
  [/\b(track|follow the (tracks|trail)|forage|hunt|navigate|find (a |the )?path|find water)\b/, { kind: "check", skill: "survival", dc_level: "medium", on_success: "learn_info", on_failure: "wasted_time" }],
  [/\b(calm|tame|soothe|ride|pet|feed) (the |a )?(horse|dog|wolf|animal|beast|creature|bird|cat|mule)\b/, { kind: "check", skill: "animal_handling", dc_level: "medium", on_success: "calm_hostiles", on_failure: "damage_light" }],
  [/\b(read (his|her|their) (face|intent|mood)|is (he|she|they) lying|sense motive|insight|size (him|her|them) up|trust)\b/, { kind: "check", skill: "insight", dc_level: "medium", on_success: "learn_info", on_failure: "none" }],
  [/\b(search|investigate|inspect|examine|study|rummage|look for|check for traps|decipher|puzzle)\b/, { kind: "check", skill: "investigation", dc_level: "medium", on_success: "find_item", on_failure: "wasted_time" }],
  [/\b(look around|listen|watch|scan|keep watch|spot|notice|survey|peer|scout)\b/, { kind: "check", skill: "perception", dc_level: "easy", on_success: "learn_info", on_failure: "none" }],
  [/\b(magic|arcane|rune|sigil|enchant|spell ?book|ward|glyph)\b/, { kind: "check", skill: "arcana", dc_level: "medium", on_success: "learn_info", on_failure: "none" }],
  [/\b(pray|holy|shrine|altar|god|goddess|temple|undead lore|ritual)\b/, { kind: "check", skill: "religion", dc_level: "medium", on_success: "learn_info", on_failure: "none" }],
  [/\b(recall|remember|history|legend|lore|who (built|was|were))\b/, { kind: "check", skill: "history", dc_level: "medium", on_success: "learn_info", on_failure: "none" }],
  [/\b(plant|herb|mushroom|weather|terrain|nature|identify (the )?(beast|creature|plant))\b/, { kind: "check", skill: "nature", dc_level: "medium", on_success: "learn_info", on_failure: "none" }],
  [/\b(go|walk|head|travel|continue|move on|press on|explore|journey|leave|set out|follow the road|enter|descend|go deeper)\b/, { kind: "travel" }],
  [/\b(fly|teleport|become a god|kill everyone|summon an army|resurrect|turn into a dragon|wish)\b/, { kind: "impossible" }],
];

const HARDER = /\b(quickly|in one (move|go)|heavy|huge|massive|iron|sheer|slick|guarded|master|impossible|all at once|without (anyone )?noticing|while running|blindfolded|backflip)\b/;
const EASIER = /\b(carefully|slowly|patiently|gently|take my time|with (a |the )?rope|politely|small|simple|help from)\b/;
const LADDER = ["trivial", "easy", "medium", "hard", "very_hard", "nearly_impossible"];

export function adjudicateOffline(state, text) {
  const t = ` ${text.toLowerCase()} `;
  const hero = state.hero;
  const inCombat = !!state.combat;

  // Named powers first: "cast fire bolt", "I use second wind", "rage!"
  for (const p of knownPowers(hero)) {
    const name = p.name.toLowerCase();
    const loose = name.replace(/'/g, "");
    if (t.includes(name) || t.includes(loose) || t.includes(p.id.replace(/_/g, " "))) {
      return { kind: "power", power: p.id, target: findTarget(state, t), hostile: !inCombat ? guessHostile(t) : null, reason: `Uses ${p.name}.` };
    }
  }
  if (/\b(cast|spell)\b/.test(t)) {
    const attackPower = knownPowers(hero).find((p) => ["attack", "save", "auto"].includes(p.kind) && p.cost.type === "atwill");
    if (attackPower && inCombat) return { kind: "power", power: attackPower.id, target: findTarget(state, t), reason: "Casts an offensive spell." };
  }

  for (const [re, fields] of RULES) {
    if (!re.test(t)) continue;
    const plan = { mode: "none", on_success: "none", on_failure: "none", ...fields, reason: "" };
    if (plan.kind === "attack") {
      plan.target = findTarget(state, t);
      if (!inCombat) plan.hostile = guessHostile(t);
      return plan;
    }
    if (plan.kind === "item") { plan.item = /scroll/.test(t) ? "scroll" : "potion"; return plan; }
    if (plan.kind === "check") {
      let idx = LADDER.indexOf(plan.dc_level);
      if (HARDER.test(t)) idx += 1;
      if (EASIER.test(t)) idx -= 1;
      if (phase(state) === "calm") idx = Math.min(idx, 2);
      plan.dc_level = LADDER[Math.max(0, Math.min(LADDER.length - 1, idx))];
      if (inCombat) {
        if (["persuasion", "intimidation", "deception"].includes(plan.skill)) {
          plan.dc_level = "hard";
          plan.on_success = plan.skill === "intimidation" ? "enemies_flee" : "enemies_surrender";
          plan.on_failure = "enemy_free_attack";
        } else if (["athletics", "acrobatics", "stealth"].includes(plan.skill)) {
          plan.on_success = "gain_advantage";
          plan.on_failure = "enemy_free_attack";
        }
      }
      if (phase(state) === "calm" && plan.on_failure === "alert_enemies") plan.on_failure = "disadvantage_next";
    }
    return plan;
  }
  // Quoted speech or plain talk: no roll needed.
  if (inCombat) return { kind: "attack", target: findTarget(state, t), mode: "none", reason: "Presses the attack." };
  return { kind: "free", reason: "No roll needed." };
}

function findTarget(state, t) {
  const alive = livingEnemies(state);
  const hit = alive.find((e) => t.includes(e.name.toLowerCase()) || t.includes(e.name.toLowerCase().split(" ").pop()));
  return hit ? hit.id : alive[0]?.id || null;
}

function guessHostile(t) {
  const m = t.match(/\b(?:attack|hit|stab|punch|kick|shoot|fight|kill|strike|slash|charge at) (?:the |a |that |this )?([a-z' -]{3,30}?)(?: with| using|\.|,|!| and|$)/);
  if (!m) return null;
  const name = m[1].trim();
  if (/^(air|nothing|wall|door|tree|ground|it)$/.test(name)) return null;
  return { name, tier: "minion" };
}

// ---------------------------------------------------------------- writing

const OUTCOME_LINES = {
  athletics: {
    success: ["Muscles burn, but {name} gets it done — the strain gives way and the path opens.", "With a grunt and a heave, {name} forces the issue and wins."],
    failure: ["{name} strains until their arms shake, but it won't budge — and they come away scraped and sore.", "The effort goes badly: a foot slips, a grip fails, and {name} hits the ground hard."],
  },
  acrobatics: {
    success: ["{name} moves like water — a twist, a hop, and they land light on their feet.", "A neat bit of footwork carries {name} through without a scratch."],
    failure: ["{name} misjudges the distance and tumbles, landing in a graceless heap.", "Balance deserts {name} at the worst moment."],
  },
  stealth: {
    success: ["{name} melts into the shadows. Nobody hears a thing.", "Breath held, step by careful step, {name} slips by unseen."],
    failure: ["A loose stone clatters under {name}'s boot. Heads turn.", "{name} is about as quiet as a cart of pans. Someone definitely noticed."],
  },
  sleight_of_hand: {
    success: ["Nimble fingers do their work — click, and it's done before anyone could blink.", "{name}'s hands move faster than the eye; the prize is theirs."],
    failure: ["The pick snaps / the fingers fumble — and the sound carries.", "{name} is clumsy about it, and someone sees exactly what they tried."],
  },
  deception: {
    success: ["The lie lands smoothly. They believe every word.", "{name} spins the tale with a straight face, and it holds."],
    failure: ["Their eyes narrow. Nobody is buying it.", "{name} stumbles over the story, and suspicion settles in."],
  },
  intimidation: {
    success: ["Something in {name}'s stare makes them go pale. They'll talk.", "{name} leans in, and the bravado drains out of them."],
    failure: ["They laugh in {name}'s face. The threat falls flat.", "The glare earns nothing but a sneer."],
  },
  persuasion: {
    success: ["{name} finds the right words, and the mood shifts in their favor.", "Honest, earnest and convincing — they agree."],
    failure: ["They listen, then shake their head. Not today.", "The argument doesn't land. They aren't convinced."],
  },
  performance: {
    success: ["The crowd warms to it — laughter, applause, and a few coins tossed {name}'s way.", "{name} has them in the palm of their hand."],
    failure: ["A string snaps / a line is flubbed. A polite cough is the only applause.", "It's... not {name}'s finest work."],
  },
  medicine: {
    success: ["{name}'s hands are sure. The wound tells its story plainly.", "Careful work pays off; {name} understands exactly what happened here."],
    failure: ["It's a mess, and {name} can't make sense of it.", "Nothing about this is clear to {name}."],
  },
  survival: {
    success: ["The tracks are faint, but {name} reads them like a book.", "{name} finds the way — bent grass, broken twigs, a clear trail."],
    failure: ["The trail goes cold. Time slips away while {name} circles back.", "Every path looks the same, and the light is fading."],
  },
  animal_handling: {
    success: ["The creature calms under {name}'s steady voice.", "A gentle hand and a low word, and the beast settles."],
    failure: ["The animal snaps and bolts — {name} gets a nasty nip for their trouble.", "It rears back, wild-eyed, and lashes out."],
  },
  insight: {
    success: ["{name} catches the flicker in their eyes — they're hiding something.", "Reading between the lines, {name} sees the truth of it."],
    failure: ["Their face gives nothing away.", "{name} can't get a read on them."],
  },
  investigation: {
    success: ["A loose board, a hidden seam — {name} finds what others missed.", "Patient searching turns up something worth having."],
    failure: ["{name} turns the place over and comes up empty-handed.", "Nothing. Or nothing {name} can find, anyway."],
  },
  perception: {
    success: ["{name}'s eyes catch it: movement, a glint, a detail out of place.", "Sharp senses pay off — {name} notices what matters."],
    failure: ["Nothing stands out to {name}.", "If there was anything to notice, {name} missed it."],
  },
  arcana: {
    success: ["The runes resolve in {name}'s mind — old magic, and its purpose is clear.", "{name} recognizes the weave of the spell at once."],
    failure: ["The symbols swim before {name}'s eyes, meaningless.", "Whatever magic this is, it's beyond {name}."],
  },
  religion: {
    success: ["{name} recognizes the rite and the power it calls on.", "The holy signs speak plainly to {name}."],
    failure: ["The symbols mean nothing to {name}.", "{name} can't place the faith or its meaning."],
  },
  history: {
    success: ["A half-remembered tale surfaces in {name}'s mind, and the pieces fit.", "{name} knows this story — and how it ended."],
    failure: ["It's on the tip of {name}'s tongue, but gone.", "{name} draws a blank."],
  },
  nature: {
    success: ["{name} knows this plant, this beast, this sky — and what it means.", "The land tells {name} what it knows."],
    failure: ["{name} can't identify it.", "Nature keeps its secrets from {name} today."],
  },
};

const CALM_BEATS = {
  friendly_traveler: ["A traveler passes, tipping their hat and trading news of the road.", "A peddler with a squeaky cart offers a friendly nod and a rumor about {quest}."],
  small_find: ["Something glints in the grass — a few coins, dropped and forgotten.", "Tucked in a crack in the wall, {name} spots a small, forgotten treasure."],
  weather: ["The wind shifts. Clouds pile up in the west, heavy and grey.", "A thin drizzle starts, the kind that finds its way under every collar."],
  rumor: ["Someone mutters about {quest} — and how nobody who went looking came back the same.", "Overheard: 'They say it started at the old barrow. Mark my words.'"],
  local_color: ["Children chase a goose across the green, shrieking with laughter.", "Smoke curls from a chimney; somewhere, bread is baking."],
};

const EVENT_LINES = {
  omen: ["The birds go silent all at once. The air feels thin, charged — like the breath before a storm. The easy days are over.", "A cold wind rises from nowhere, carrying the smell of old earth. Something out there has noticed {name}."],
  combat: ["Movement! {foes} {verb} out of hiding, weapons ready.", "A snarl, a scrape of steel — {foes} {verb} into {name}'s path."],
  ambush: ["There's no warning — {foes} {verb} out of cover, striking before {name} can draw breath!"],
  boss: ["The ground trembles. {foes} emerges — the dark heart of this whole affair. This is the fight that matters."],
  hazard: ["Without warning: {hazard}!"],
  social: ["{npc} approaches, looking like they've been waiting for someone exactly like {name}.", "{name} is hailed by {npc}, who has a request and a worried look."],
  discovery: ["Half-buried and overlooked, {name} discovers an old cache — someone hid this here on purpose.", "Behind a tumble of stones lies a small hoard, glinting in the light."],
  mystery: ["{name} finds a clue: a torn page, a symbol scratched into stone — it all ties back to {quest}.", "Something here doesn't add up. A mark, a pattern, a name — another piece of the puzzle of {quest}."],
};

function fill(s, vars) {
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ""));
}

export function narrateOffline(state, text, res) {
  const hero = state.hero;
  const region = REGIONS[state.world.regionIndex] || REGIONS[0];
  const vars = {
    name: hero.name,
    quest: state.world.quest.title.toLowerCase().startsWith("the") ? state.world.quest.title : `the ${state.world.quest.title.toLowerCase()}`,
    place: state.world.location,
    feature: pick(region.features),
  };
  const out = [];
  const plan = res.plan;

  if (res.travel) {
    out.push(`${hero.name} sets off. ${capitalize(fill(pick([
      "The path winds on beneath a pale sky, and before long {place} comes into view.",
      "Hours pass on foot. At last {name} arrives at {place}.",
      "The way is long and quiet, until the landscape changes: {place}.",
    ]), vars))} ${capitalize(region.desc)}.`);
  } else if (plan.kind === "check") {
    const skill = plan.skill in OUTCOME_LINES ? plan.skill : "perception";
    const lines = OUTCOME_LINES[skill][res.outcome.includes("success") ? "success" : "failure"];
    let line = fill(pick(lines), vars);
    if (res.outcome === "crit_success") line = `A natural 20! ${line} It couldn't have gone better.`;
    if (res.outcome === "crit_failure") line = `A natural 1. ${line} It couldn't have gone worse.`;
    out.push(`${hero.name} tries to ${summarizeAction(text)}. ${line}`);
  } else if (plan.kind === "flee" || plan.kind === "travel") {
    out.push(res.combatEnded === "hero_fled" ? `${hero.name} breaks away and runs, not stopping until the sounds of pursuit fade.` : `${hero.name} tries to run, but there's no gap to slip through.`);
  } else if (plan.kind === "attack" || plan.kind === "power" || state.combat || res.combatEnded) {
    out.push(combatNarration(res, hero));
  } else if (plan.kind === "short_rest") {
    out.push(res.outcome === "success" ? `${hero.name} sits, drinks, binds a few scrapes. After an hour's quiet, they feel steadier.` : res.facts[0]);
  } else if (plan.kind === "long_rest") {
    out.push(res.outcome === "success" ? `${hero.name} beds down at ${vars.place}. The night passes without incident, and dawn finds them rested and whole.` : res.facts.join(" "));
  } else if (plan.kind === "item") {
    out.push(res.facts.join(" "));
  } else if (plan.kind === "impossible") {
    out.push(`${hero.name} considers it — and reality politely declines. Some things are simply beyond a ${RACES[hero.race].name.toLowerCase()} ${CLASSES[hero.cls].name.toLowerCase()} at level ${hero.level}.`);
  } else {
    out.push(freeNarration(text, hero, vars, region));
  }

  // Loot / level / event bits
  if (res.kills.length) out.push(`${res.kills.join(" and ")} ${res.kills.length > 1 ? "lie" : "lies"} still.`);
  if (res.combatEnded === "victory") out.push("Silence settles. The fight is over.");
  if (res.combatEnded === "surrender") out.push("Weapons clatter to the ground. They yield.");
  if (res.combatEnded === "enemies_fled") out.push("The survivors scatter into the distance.");
  if (res.loot.length) out.push(`Among the spoils: ${res.loot.join(", ")}.`);
  if (res.wasDowned && !res.died) out.push(res.facts.find((f) => f.includes("stabilises") || f.includes("natural 20")) || "");
  if (res.died) out.push(`The world goes grey and quiet. ${hero.name}'s story ends here.`);

  if (res.event) out.push(eventNarration(res.event, state, vars));

  return {
    narration: out.filter(Boolean).join("\n\n"),
    location: state.world.location,
    objective: null,
    story_note: storyNote(text, res),
    suggestions: suggest(state),
    bonus_xp: "none",
  };
}

function combatNarration(res, hero) {
  const lines = [];
  for (const f of res.facts) {
    if (/^(Combat begins|The hero wins initiative|LEVEL UP)/.test(f)) continue;
    lines.push(f.replace(/\bthe hero\b/gi, hero.name).replace(/^The hero's/, `${hero.name}'s`));
  }
  const opener = res.powerUsed ? `${hero.name} calls on ${res.powerUsed}.` : pick([
    `${hero.name} presses the attack.`, `${hero.name} lunges in.`, `Steel flashes as ${hero.name} strikes.`,
  ]);
  return [opener, ...lines].join(" ");
}

function freeNarration(text, hero, vars, region) {
  const quoted = text.match(/["“](.+?)["”]/);
  if (quoted) {
    const npc = pick(region.npcs);
    return `"${quoted[1]}," says ${hero.name}. ${capitalize(npc)} ${pick(["considers this a moment, then nods slowly", "raises an eyebrow but answers readily enough", "glances around nervously before replying in a low voice"])}: "${pick([
      `If you're looking into ${vars.quest}, start near ${vars.feature}.`,
      "Strange days. Keep your blade close and your purse closer.",
      "I've heard things at night I won't repeat. Be careful out there.",
      "Ask around — but not too loudly.",
    ])}"`;
  }
  return `${hero.name} ${summarizeAction(text)}. ${capitalize(pick([
    "Nothing much comes of it, but the moment passes pleasantly enough.",
    `Around them, ${region.desc}.`,
    `Nearby: ${vars.feature}. It might be worth a closer look.`,
    "It's quiet. For now.",
  ]))}`;
}

function eventNarration(ev, state, vars) {
  const foesList = (ev.foes || []);
  const v = { ...vars, foes: joinNames(foesList), verb: foesList.length > 1 ? "burst" : "bursts", hazard: ev.hazard, npc: ev.npc };
  switch (ev.type) {
    case "calm": return fill(pick(CALM_BEATS[ev.beat] || CALM_BEATS.local_color), v);
    case "omen": return fill(pick(EVENT_LINES.omen), v);
    case "combat": return fill(pick(ev.ambush ? EVENT_LINES.ambush : EVENT_LINES.combat), v);
    case "boss": return fill(pick(EVENT_LINES.boss), v);
    case "hazard": return `${fill(pick(EVENT_LINES.hazard), v)} ${ev.saved ? `${vars.name} reacts in time and escapes unharmed.` : `${vars.name} is caught and hurt.`}`;
    case "social": return fill(pick(EVENT_LINES.social), v);
    case "discovery": return fill(pick(EVENT_LINES.discovery), v);
    case "mystery": return fill(pick(EVENT_LINES.mystery), v);
    default: return "";
  }
}

function joinNames(list) {
  if (list.length <= 1) return list[0] || "Something";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function summarizeAction(text) {
  let s = text.trim().replace(/[.!?]+$/, "");
  s = s.replace(/^i\s+(try to|attempt to|want to|will|'ll)\s+/i, "").replace(/^i\s+/i, "");
  s = s.replace(/\bmy\b/gi, "their").replace(/\bme\b/gi, "them").replace(/\bI\b/g, "they");
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function storyNote(text, res) {
  if (res.event && res.event.type === "boss") return `Faced ${res.event.foes[0]}.`;
  if (res.combatEnded === "victory") return `Won a fight (${res.kills.join(", ")}).`;
  if (res.loot.length) return `Found ${res.loot.join(", ")}.`;
  if (res.levelUps.length) return `Reached level ${res.levelUps[res.levelUps.length - 1].level}.`;
  return null;
}

export function suggest(state) {
  const hero = state.hero;
  if (state.dead) return [];
  if (state.combat) {
    const target = livingEnemies(state)[0];
    const out = [`Attack the ${target ? target.name : "enemy"}`];
    const usable = knownPowers(hero).filter((p) => p.kind !== "check_boost" && p.kind !== "escape");
    if (usable.length) out.push(`Use ${pick(usable).name}`);
    if (hero.hp < hero.maxHp / 2 && hero.inventory.some((i) => i.kind === "potion")) out.push("Drink a healing potion");
    else out.push("Try to scare them off");
    out.push("Flee");
    return out.slice(0, 4);
  }
  const region = REGIONS[state.world.regionIndex] || REGIONS[0];
  const opts = [
    `Examine ${pick(region.features)}`,
    `Talk to ${pick(region.npcs)}`,
    "Look around carefully",
    "Press on down the road",
  ];
  if (hero.hp < hero.maxHp * 0.6) opts.splice(2, 1, "Take a short rest");
  return opts;
}

// ---------------------------------------------------------------- portrait traits

const COLOR_WORDS = {
  hair: { black: "#1b1714", raven: "#141015", brown: "#5a3a22", chestnut: "#6e3b1f", auburn: "#8a3a1c", red: "#a33a1a", ginger: "#c0561f", copper: "#b0602a", blonde: "#d8b460", blond: "#d8b460", golden: "#d9a83a", white: "#e8e4dc", silver: "#c7c9cf", grey: "#8d8b88", gray: "#8d8b88", blue: "#3a5fb0", green: "#3f7a45", purple: "#6b3f8f", pink: "#d57aa0", teal: "#2f8f8a" },
  eyes: { blue: "#4a7fc0", green: "#4f8f4a", brown: "#5a3a22", hazel: "#8a6a32", grey: "#8a9096", gray: "#8a9096", gold: "#d9a83a", golden: "#d9a83a", amber: "#d08a2a", red: "#c0302a", violet: "#7a4fb0", purple: "#7a4fb0", black: "#1a1a1a", silver: "#c7c9cf", white: "#eeeeee" },
};

const SKIN_WORDS = {
  pale: "#f1d9c6", fair: "#eccbb0", porcelain: "#f4e2d4", freckled: "#e9c2a2", olive: "#c9a07a", tan: "#c68e62", tanned: "#c68e62",
  bronze: "#a8703f", brown: "#8a5a36", dark: "#5c3a24", ebony: "#3f271a", black: "#3a2518",
  green: "#6f8f4a", grey: "#8a8f8a", gray: "#8a8f8a", red: "#a8443a", crimson: "#8f2a2a", blue: "#4f6f9f", purple: "#6f4a7f", lavender: "#9a86b8",
};

export const RACE_DEFAULT_SKIN = {
  human: "#d9a882", elf: "#ecd2b8", dwarf: "#d49c78", halfling: "#e2b38c", half_orc: "#7f9660",
  tiefling: "#b0473d", dragonborn: "#9c4a2e", gnome: "#e9c0a0",
};

function findColor(t, words, anchor) {
  // looks for "<color> <anchor>" or "<anchor> ... <color>" within a few words
  for (const [w, hex] of Object.entries(words)) {
    const re1 = new RegExp(`\\b${w}(?:ish)?[- ](?:\\w+[- ]){0,2}${anchor}`);
    const re2 = new RegExp(`${anchor}\\w*\\s(?:is |are |of )?(?:\\w+ ){0,2}${w}\\b`);
    if (re1.test(t) || re2.test(t)) return hex;
  }
  return null;
}

// Keyword reader for the portrait: turns a description into painter traits.
export function traitsOffline(description, raceId, clsId) {
  const t = ` ${(description || "").toLowerCase()} `;
  const has = (re) => re.test(t);
  const traits = {
    skin: findColor(t, SKIN_WORDS, "(?:skin|skinned|complexion|scales|scaled)") || (has(/\bpale\b/) ? SKIN_WORDS.pale : null) || (has(/\b(dark[- ]skinned|dark skin)\b/) ? SKIN_WORDS.dark : null) || RACE_DEFAULT_SKIN[raceId],
    hair_color: findColor(t, COLOR_WORDS.hair, "(?:hair|locks|curls|braids?|mane|beard|mohawk|ponytail)") || (has(/\b(redhead)\b/) ? COLOR_WORDS.hair.red : null) || (has(/\bblond(e)?\b/) ? COLOR_WORDS.hair.blonde : null) || pick(["#2a1f18", "#5a3a22", "#8a3a1c", "#d8b460", "#1b1714"]),
    eye_color: findColor(t, COLOR_WORDS.eyes, "(?:eyes?|gaze)") || pick(["#4a7fc0", "#5a3a22", "#4f8f4a", "#8a6a32"]),
    hair_style: has(/\bbald|shaved head|shaven head|hairless\b/) ? "bald"
      : has(/\bmohawk\b/) ? "mohawk"
        : has(/\bbraid/) ? "braids"
          : has(/\bponytail|tied back|top ?knot|bun\b/) ? "ponytail"
            : has(/\bcurl|curly|afro|wild hair|messy|unkempt|shaggy\b/) ? "curly"
              : has(/\blong (\w+ )?hair|flowing|waist[- ]length|shoulder[- ]length\b/) ? "long"
                : has(/\bshort (\w+ )?hair|cropped|buzz|crew cut\b/) ? "short"
                  : raceId === "dwarf" ? "long" : pick(["short", "long", "ponytail"]),
    beard: has(/\bclean[- ]shaven|no beard|beardless\b/) ? "none"
      : has(/\blong beard|braided beard|great beard|flowing beard\b/) ? "long"
        : has(/\bstubble|five o'clock\b/) ? "stubble"
          : has(/\bbeard|goatee|moustache|mustache|whiskers\b/) ? "short"
            : raceId === "dwarf" && !has(/\b(she|her|woman|girl|lady)\b/) ? "long" : "none",
    horns: raceId === "tiefling" || has(/\bhorn/),
    pointed_ears: ["elf", "half_orc", "gnome", "tiefling"].includes(raceId) || has(/\bpointed ears|pointy ears|elf ears\b/),
    tusks: raceId === "half_orc" || has(/\btusk/),
    scales: raceId === "dragonborn",
    scar: has(/\bscar/),
    eyepatch: has(/\beye ?patch|one[- ]eyed|missing (an |one )?eye\b/),
    freckles: has(/\bfreckle/),
    tattoo: has(/\btattoo|war ?paint|markings|runes on (his|her|their) (face|skin)\b/),
    glasses: has(/\bglasses|spectacles|monocle\b/),
    headwear: has(/\bhood|hooded|cloak(ed)? up\b/) ? "hood"
      : has(/\bhelm|helmet\b/) ? "helm"
        : has(/\bcrown|tiara\b/) ? "crown"
          : has(/\bcirclet|diadem\b/) ? "circlet"
            : has(/\bhat\b/) ? "hat" : "none",
    outfit: has(/\bplate|full armor|armored|armoured\b/) ? "plate"
      : has(/\bchain ?mail|mail shirt\b/) ? "mail"
        : has(/\brobe|robes\b/) ? "robe"
          : has(/\bleather\b/) ? "leather"
            : defaultOutfit(clsId),
    outfit_color: findColor(t, { ...COLOR_WORDS.hair, crimson: "#8f2a2a", navy: "#23305a", emerald: "#1f6f4a", violet: "#5a3a8f", scarlet: "#a8201a", yellow: "#c9a52a", orange: "#c0621f" }, "(?:robes?|cloak|coat|armor|armour|tunic|clothes|cape|dress|shirt|hood)") || defaultOutfitColor(clsId),
    build: has(/\bmuscular|burly|broad|huge|stocky|brawny|big\b/) ? "broad" : has(/\bthin|slender|wiry|lanky|slight|gaunt|skinny\b/) ? "slim" : "average",
    expression: has(/\bsmil|cheerful|friendly|kind|warm\b/) ? "smile" : has(/\bgrim|stern|scowl|angry|serious|brooding\b/) ? "stern" : "neutral",
    age: has(/\bold|elderly|aged|grizzled|wrinkled|ancient|grey[- ]haired|gray[- ]haired\b/) ? "old" : has(/\byoung|youthful|teen|kid\b/) ? "young" : "adult",
    feminine: has(/\b(she|her|woman|girl|lady|female|queen|priestess|sorceress|witch)\b/),
    glow: has(/\bglowing eyes|eyes (that )?glow|glowing\b/),
  };
  return traits;
}

function defaultOutfit(clsId) {
  return { fighter: "mail", paladin: "plate", barbarian: "fur", rogue: "leather", ranger: "leather", monk: "wrap", wizard: "robe", sorcerer: "robe", warlock: "robe", cleric: "mail", druid: "fur", bard: "leather" }[clsId] || "leather";
}

function defaultOutfitColor(clsId) {
  return { fighter: "#6d6f73", paladin: "#c9b27a", barbarian: "#6a4a2e", rogue: "#2b2b30", ranger: "#3f5a33", monk: "#b0602a", wizard: "#2f3f8f", sorcerer: "#7a2a4a", warlock: "#3a1f4a", cleric: "#d8d0b8", druid: "#4f6a2e", bard: "#8f2a4a" }[clsId] || "#555";
}

export function openingOffline(state) {
  const h = state.hero;
  const hook = state.world.quest;
  const region = REGIONS[0];
  return {
    narration: `${h.name}, a ${RACES[h.race].name.toLowerCase()} ${CLASSES[h.cls].name.toLowerCase()}, arrives at ${state.world.location}: ${region.desc}.\n\nAt the Crooked Lantern, over a mug of something brown, ${h.name} hears the talk everyone is having in whispers. ${hookText(hook.id)}\n\nOld Maren the innkeeper slides a fresh mug across the bar. "You've the look of someone who can handle themselves," she says. "What'll it be?"`,
    location: state.world.location,
    suggestions: ["Ask Maren about the rumors", "Look around the inn", "Head to the notice board", "Visit the shrine"],
  };
}

function hookText(id) {
  const map = {
    hollow_crown: "The barrow on Gallows Hill cracked open three nights ago, and since then the dead have been seen walking the Old Road.",
    stolen_bell: "Someone stole the silver bell from the village shrine — the bell that kept the Whispering Woods quiet for a hundred years.",
    ashen_sky: "Grey ash has fallen on Thornwick for a week, and the northern miners have gone silent.",
  };
  return map[id] || "";
}

export { POWERS };
