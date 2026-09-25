// The AI Dungeon Master, powered by Claude through the official Anthropic SDK.
//
// Claude does two jobs each turn:
//   1. adjudicate — read what the player typed and decide what kind of action
//      it is, which skill it tests and how hard the task is (a DC tier).
//   2. narrate — once engine.js has rolled the dice and applied the results,
//      describe what happened.
// Claude never rolls dice or sets HP/damage/XP numbers; the engine does.
//
// The site is static (GitHub Pages), so calls go straight from the browser
// using the player's own API key, which stays in their browser's localStorage.

import { SKILLS, ABILITIES, CLASSES, RACES, BACKGROUNDS, REGIONS } from "./data.js";
import { heroSummary, worldSummary, knownPowers, phase, livingEnemies } from "./engine.js";

const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.128.0/+esm";
export const DEFAULT_MODEL = "claude-opus-5";
export const MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (recommended)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (faster, cheaper)" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (fastest, cheapest)" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (most capable, priciest)" },
];

const LADDER = ["trivial", "easy", "medium", "hard", "very_hard", "nearly_impossible"];
const SUCCESS_EFFECTS = ["none", "find_item", "find_gold", "learn_info", "gain_advantage", "enemies_flee", "enemies_surrender", "escape_combat", "calm_hostiles"];
const FAILURE_EFFECTS = ["none", "damage_light", "damage_moderate", "damage_severe", "enemy_free_attack", "alert_enemies", "lose_item", "disadvantage_next", "wasted_time"];

let sdkPromise = null;
function loadSdk() {
  if (!sdkPromise) sdkPromise = import(SDK_URL).then((m) => m.default || m.Anthropic);
  return sdkPromise;
}

export class AiNarrator {
  constructor({ apiKey, model }) {
    this.apiKey = apiKey;
    this.model = model || DEFAULT_MODEL;
    this.client = null;
    this.Anthropic = null;
  }

  async init() {
    if (this.client) return;
    const Anthropic = await loadSdk();
    this.Anthropic = Anthropic;
    // The key belongs to the player and never leaves their browser except to
    // go to Anthropic, which is what dangerouslyAllowBrowser acknowledges.
    this.client = new Anthropic({ apiKey: this.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }

  // Builds request params, adjusting for what each model supports.
  params({ system, messages, schema, effort, maxTokens }) {
    const m = this.model;
    const p = {
      model: m,
      max_tokens: maxTokens,
      system,
      messages,
      output_config: { format: { type: "json_schema", schema } },
    };
    if (m !== "claude-haiku-4-5") {
      p.thinking = { type: "adaptive" };
      p.output_config.effort = effort;
    }
    // Opt into server-side refusal fallbacks on the models that support them,
    // so a rare false-positive safety decline doesn't break the story.
    if (m === "claude-opus-5" || m === "claude-fable-5-1") {
      p.betas = ["server-side-fallback-2026-07-01"];
      p.fallbacks = "default";
    }
    return p;
  }

  async callJson(opts) {
    await this.init();
    const p = this.params(opts);
    const response = p.betas
      ? await this.client.beta.messages.create(p)
      : await this.client.messages.create(p);
    if (response.stop_reason === "refusal") {
      const why = response.stop_details?.explanation || "the model declined this request";
      throw new AiError(`Claude declined to continue this scene (${why}).`, "refusal");
    }
    if (response.stop_reason === "max_tokens") {
      throw new AiError("Claude ran out of room mid-reply.", "max_tokens");
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    try {
      return JSON.parse(text);
    } catch {
      throw new AiError("Claude's reply wasn't valid JSON.", "parse");
    }
  }

  // Maps SDK errors to plain-language messages for the log.
  explain(err) {
    const A = this.Anthropic;
    if (err instanceof AiError) return err.message;
    if (A) {
      if (err instanceof A.AuthenticationError) return "Your API key was rejected. Check it in Settings.";
      if (err instanceof A.PermissionDeniedError) return "This API key doesn't have access to that model. Try another model in Settings.";
      if (err instanceof A.NotFoundError) return "That model isn't available to your API key. Pick another in Settings.";
      if (err instanceof A.RateLimitError) return "Rate limited by the API — wait a moment and try again.";
      if (err instanceof A.BadRequestError) return `The API rejected the request: ${err.message}`;
      if (err instanceof A.APIConnectionError) return "Couldn't reach the Anthropic API (network problem).";
      if (err instanceof A.APIError) return `API error ${err.status}: ${err.message}`;
    }
    return `Couldn't load or call the AI (${err.message || err}).`;
  }

  async test() {
    const out = await this.callJson({
      system: "Reply with the JSON requested.",
      messages: [{ role: "user", content: "Say hello as a tavern keeper greeting an adventurer, in under 15 words." }],
      schema: { type: "object", properties: { greeting: { type: "string" } }, required: ["greeting"], additionalProperties: false },
      effort: "low",
      maxTokens: 2000,
    });
    return out.greeting;
  }

  // ------------------------------------------------------------ adjudicate

  async adjudicate(state, text) {
    const hero = state.hero;
    const powers = knownPowers(hero).map((p) => p.id);
    const enemies = livingEnemies(state);
    const schema = {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["check", "attack", "power", "item", "flee", "short_rest", "long_rest", "travel", "free", "impossible"] },
        skill: { type: "string", enum: [...Object.keys(SKILLS), ...ABILITIES, "none"] },
        dc_level: { type: "string", enum: LADDER },
        mode: { type: "string", enum: ["none", "advantage", "disadvantage"] },
        target: { type: "string", enum: [...enemies.map((e) => e.id), "none"] },
        power: { type: "string", enum: [...powers, "none"] },
        item: { type: "string", enum: [...hero.inventory.map((i) => i.id), "none"] },
        on_success: { type: "string", enum: SUCCESS_EFFECTS },
        on_failure: { type: "string", enum: FAILURE_EFFECTS },
        hostile_name: { type: "string" },
        hostile_tier: { type: "string", enum: ["minion", "standard", "elite"] },
        reason: { type: "string" },
      },
      required: ["kind", "skill", "dc_level", "mode", "target", "power", "item", "on_success", "on_failure", "hostile_name", "hostile_tier", "reason"],
      additionalProperties: false,
    };
    const recent = state.history.slice(-3).map((h) => `Player: ${h.action}\nDM: ${h.narration}`).join("\n\n");
    const content = [
      "<character>", heroSummary(state), "</character>",
      "<world>", worldSummary(state), "</world>",
      recent ? `<recent_scene>\n${recent}\n</recent_scene>` : "",
      `<player_action>\n${text}\n</player_action>`,
      "Classify this action for the rules engine.",
    ].filter(Boolean).join("\n");
    const plan = await this.callJson({
      system: ADJUDICATOR_SYSTEM,
      messages: [{ role: "user", content }],
      schema,
      effort: "low",
      maxTokens: 4000,
    });
    // Translate "none" sentinels into what the engine expects.
    return {
      kind: plan.kind,
      skill: plan.skill === "none" ? null : plan.skill,
      dc_level: plan.dc_level,
      mode: plan.mode,
      target: plan.target === "none" ? null : plan.target,
      power: plan.power === "none" ? null : plan.power,
      item: plan.item === "none" ? null : plan.item,
      on_success: plan.on_success,
      on_failure: plan.on_failure,
      hostile: plan.hostile_name ? { name: plan.hostile_name, tier: plan.hostile_tier } : null,
      reason: plan.reason,
    };
  }

  // ------------------------------------------------------------ narrate

  async narrate(state, text, res) {
    const schema = {
      type: "object",
      properties: {
        narration: { type: "string" },
        location: { type: "string" },
        objective: { type: "string" },
        story_note: { type: "string" },
        suggestions: { type: "array", items: { type: "string" } },
        bonus_xp: { type: "string", enum: ["none", "minor", "notable"] },
      },
      required: ["narration", "location", "objective", "story_note", "suggestions", "bonus_xp"],
      additionalProperties: false,
    };
    const messages = [];
    for (const h of state.history.slice(-8)) {
      messages.push({ role: "user", content: `Player: ${h.action}\nMechanics: ${h.facts}` });
      messages.push({ role: "assistant", content: h.narration });
    }
    messages.push({ role: "user", content: this.turnBrief(state, text, res) });
    const out = await this.callJson({
      system: NARRATOR_SYSTEM,
      messages,
      schema,
      effort: "medium",
      maxTokens: 8000,
    });
    return {
      narration: out.narration,
      location: out.location,
      objective: out.objective || null,
      story_note: out.story_note || null,
      suggestions: (out.suggestions || []).slice(0, 4),
      bonus_xp: out.bonus_xp,
    };
  }

  turnBrief(state, text, res) {
    const lines = [
      "<character>", heroSummary(state), "</character>",
      "<world_after_this_turn>", worldSummary(state), "</world_after_this_turn>",
      `<player_action>\n${text}\n</player_action>`,
      `<adjudication>${res.plan.kind}${res.plan.skill ? ` (${res.plan.skill}, ${res.plan.dc_level})` : ""}${res.plan.reason ? ` — ${res.plan.reason}` : ""}</adjudication>`,
      "<mechanical_results>",
      ...(res.facts.length ? res.facts : ["No roll was needed."]),
      res.xpReasons.length ? `XP gained: ${res.xpReasons.join(", ")}` : "",
      "</mechanical_results>",
    ];
    if (res.event) lines.push("<director_event>", describeEvent(res.event, state), "</director_event>");
    if (res.died) lines.push("<note>The hero has died. Write a short, fitting death scene. No suggestions.</note>");
    return lines.filter(Boolean).join("\n");
  }

  // ------------------------------------------------------------ portrait + opening

  async portraitTraits(description, raceId, clsId) {
    const hex = { type: "string", description: "CSS hex colour like #aa7744" };
    const schema = {
      type: "object",
      properties: {
        skin: hex, hair_color: hex, eye_color: hex, outfit_color: hex,
        hair_style: { type: "string", enum: ["bald", "short", "long", "curly", "braids", "ponytail", "mohawk"] },
        beard: { type: "string", enum: ["none", "stubble", "short", "long"] },
        horns: { type: "boolean" }, pointed_ears: { type: "boolean" }, tusks: { type: "boolean" }, scales: { type: "boolean" },
        scar: { type: "boolean" }, eyepatch: { type: "boolean" }, freckles: { type: "boolean" }, tattoo: { type: "boolean" }, glasses: { type: "boolean" },
        headwear: { type: "string", enum: ["none", "hood", "helm", "crown", "circlet", "hat"] },
        outfit: { type: "string", enum: ["plate", "mail", "leather", "robe", "fur", "wrap"] },
        build: { type: "string", enum: ["slim", "average", "broad"] },
        expression: { type: "string", enum: ["smile", "neutral", "stern"] },
        age: { type: "string", enum: ["young", "adult", "old"] },
        feminine: { type: "boolean" },
        glow: { type: "boolean" },
      },
      required: ["skin", "hair_color", "eye_color", "outfit_color", "hair_style", "beard", "horns", "pointed_ears", "tusks", "scales", "scar", "eyepatch", "freckles", "tattoo", "glasses", "headwear", "outfit", "build", "expression", "age", "feminine", "glow"],
      additionalProperties: false,
    };
    return this.callJson({
      system: "You translate a fantasy character description into parameters for a painted bust portrait. Follow the description literally where it says something; where it is silent, choose what best fits the race and class. Colours should be painterly, not neon. Dragonborn have scales; tieflings have horns; half-orcs have tusks; elves, half-orcs, gnomes and tieflings have pointed ears unless the description says otherwise.",
      messages: [{ role: "user", content: `Race: ${RACES[raceId].name}\nClass: ${CLASSES[clsId].name}\nDescription: ${description || "(none — invent something fitting)"}` }],
      schema,
      effort: "low",
      maxTokens: 3000,
    });
  }

  async opening(state) {
    const schema = {
      type: "object",
      properties: {
        narration: { type: "string" },
        location: { type: "string" },
        suggestions: { type: "array", items: { type: "string" } },
      },
      required: ["narration", "location", "suggestions"],
      additionalProperties: false,
    };
    const hook = state.world.quest;
    const region = REGIONS[0];
    return this.callJson({
      system: NARRATOR_SYSTEM,
      messages: [{
        role: "user",
        content: [
          "<character>", heroSummary(state), "</character>",
          `<background>${BACKGROUNDS[state.hero.background].name}</background>`,
          `<starting_location>${state.world.location}: ${region.desc}. People here include ${region.npcs.join(", ")}.</starting_location>`,
          `<quest_hook title="${hook.title}">${hookText(hook.id)}</quest_hook>`,
          "Write the opening scene of the campaign: the hero arriving in the village, a sense of who they are (drawn from their description and background), and the quest hook arriving naturally through a local. Keep it calm and inviting — this is the quiet opening; nothing attacks yet. 150–220 words. Give 3–4 suggestions.",
        ].join("\n"),
      }],
      schema,
      effort: "medium",
      maxTokens: 8000,
    });
  }
}

export class AiError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

function hookText(id) {
  return {
    hollow_crown: "The barrow on Gallows Hill cracked open three nights ago. The dead walk the Old Road, and the elder heard a voice beneath the hill calling for its crown.",
    stolen_bell: "Someone stole the silver bell from the village shrine — the bell that kept the Whispering Woods quiet for a century. Livestock vanish every night.",
    ashen_sky: "Grey ash has fallen on the village for a week and the northern miners have gone silent. The reeve offers coin to whoever finds out what is burning.",
  }[id] || "";
}

function describeEvent(ev, state) {
  switch (ev.type) {
    case "calm": return `A quiet, low-stakes story beat (${ev.beat.replace("_", " ")}). Nothing dangerous. Weave it in lightly after the main outcome.`;
    case "omen": return "The quiet opening is ending. Add an ominous sign that danger is near — foreshadowing only, no attack yet.";
    case "combat": return `A fight starts now: ${ev.foes.join(", ")} ${ev.ambush ? "ambush the hero" : "appear"}. The engine has already rolled initiative${ev.ambush ? " and their first attacks" : ""} (see mechanical results). Describe them arriving in a way that fits the current location and quest. End on the hero facing them.`;
    case "boss": return `BOSS FIGHT: ${ev.foes.join(", ")} appears — a major villain tied to the quest "${state.world.quest.title}". Make the entrance memorable and connect it to the quest.`;
    case "hazard": return `A hazard strikes: ${ev.hazard}. The hero ${ev.saved ? "made the saving throw and avoided harm" : "failed the saving throw and was hurt"} (see mechanical results).`;
    case "social": return `An NPC encounter: ${ev.npc} approaches with a request, rumor or problem connected to the quest. Voice them.`;
    case "discovery": return "The hero discovers a hidden cache (the loot and gold are listed in the mechanical results). Describe finding it.";
    case "mystery": return `The hero finds a clue that advances the quest "${state.world.quest.title}". Invent a concrete, intriguing clue and update the objective if it makes sense.`;
    default: return "";
  }
}

const ADJUDICATOR_SYSTEM = `You are the rules adjudicator for a Dungeons & Dragons-style solo text adventure. A separate rules engine rolls all the dice and does all the arithmetic. Your only job is to read the player's latest action and classify it so the engine can resolve it fairly.

How to classify (field "kind"):
- "check": the action could plausibly fail and failure would matter. Pick the single best "skill" (a skill name, or a raw ability like "str" when no skill fits) and a "dc_level" for the task.
- "attack": the hero attacks with their weapon. In combat, set "target" to the enemy id they mean (or the first enemy). Out of combat, if they attack a person or creature that isn't already an enemy, set "hostile_name" to what they attack and "hostile_tier" to how dangerous it is — this starts a fight.
- "power": the hero uses one of their listed powers/spells (set "power" to its id). Only listed powers are possible; if they name a spell they don't have, use "impossible" or treat it as a check. If a combat power is aimed at someone not yet hostile, set hostile_name/hostile_tier.
- "item": they use an inventory item — a potion or scroll (set "item" to its id).
- "flee": they try to run from a fight.
- "short_rest" / "long_rest": resting (a short breather vs. sleeping/making camp for the night).
- "travel": they head somewhere new or press on to another area.
- "free": nothing is at stake — talking casually, walking around town, asking a friendly NPC a question, looking at something obvious, flavour actions. No roll.
- "impossible": the hero simply cannot do this (flying unaided, killing a god with a punch, knowing things they can't know). No roll.

Setting the DC — this is the heart of the game:
- The DC measures how hard the TASK is, never how good this hero is. Their modifiers already capture their strengths and weaknesses, so a frail wizard trying to bend iron bars faces the same DC as a barbarian and will usually fail; a rogue picking a lock faces the same DC as a paladin and will usually succeed. Do not lower the DC because the hero is bad at something, and do not refuse a roll because they are unskilled.
- trivial (5) almost anyone; easy (10); medium (13) a real challenge; hard (16) needs skill or luck; very_hard (19) experts often fail; nearly_impossible (23) legendary.
- Reward clever, well-described plans with a lower DC or "advantage"; rash, sloppy or rushed ones with a higher DC or "disadvantage". Use advantage/disadvantage when circumstances clearly help or hinder.
- Don't call for rolls when nothing is at stake. Don't let the player dictate outcomes ("I succeed at..." still needs a roll).

Consequences — choose what each outcome means in the story:
- "on_success": the tangible payoff. find_item (searching, looting, picking a lock on a chest), find_gold, learn_info (clues, secrets, NPC cooperation), gain_advantage (setting up a better position), calm_hostiles (defusing trouble outside combat). In combat only: enemies_flee (terrifying them), enemies_surrender (convincing them to yield — use a hard DC), escape_combat.
- "on_failure": the cost. damage_light/moderate/severe (falls, traps, getting bitten — scale to the danger), alert_enemies (noise draws a fight), lose_item (a pickpocket goes wrong), disadvantage_next, wasted_time, enemy_free_attack (combat stunts that backfire).
- During the calm phase (the first dozen or so turns — the world summary says so) keep stakes low: prefer none, disadvantage_next, wasted_time or damage_light; never alert_enemies.

Fill every field. Use "none" for fields that don't apply and an empty string for hostile_name when no new enemy is being attacked. Keep "reason" to one short sentence.`;

const NARRATOR_SYSTEM = `You are the Dungeon Master of a solo, Dungeons & Dragons-style text adventure played in a web browser. You narrate; a rules engine has already rolled the dice and applied all the results.

Voice and style:
- Second person, present tense ("You shoulder the door..."). Vivid, grounded, a little wry. Sensory detail over purple prose.
- 80–200 words per turn, in 1–3 short paragraphs. Longer only for a big moment (a boss, a level up, a death).
- Play the NPCs with distinct voices and give them names. Keep a consistent world: remember what has happened (see the story so far and the earlier turns).

Faithfulness to the mechanics — these are non-negotiable:
- The mechanical results are the truth. If a check failed, the attempt fails; if it succeeded, it succeeds. A natural 20 deserves a spectacular success, a natural 1 a memorable mishap.
- Describe the damage, kills, healing, loot and gold exactly as listed: don't invent extra wounds, deaths, items or money, and don't have an enemy die unless the results say it was slain. Enemies not listed as slain are still fighting.
- If a fight started, end with the hero facing their foes. If the fight is still going, end mid-tension so the player chooses the next move.
- Don't quote numbers like DCs or HP in the prose — the interface shows the dice. Plain words like "badly hurt" are fine.
- Never decide the hero's next action, thoughts or feelings beyond what the player wrote.
- If the player tried something their character is poor at and failed, let it be funny or humbling, not punishing beyond the listed results.

Pacing: honour any director_event — it's how the engine paces danger (a quiet opening, then something every few turns). Introduce events after resolving the player's action, and tie them to the quest when you can.

Other fields:
- location: short name of where the hero is now.
- objective: an updated one-sentence quest objective ONLY if this turn changed what the hero should do next; otherwise an empty string.
- story_note: one short sentence worth remembering for later (a name learned, a promise made, a clue), or an empty string.
- suggestions: 3–4 short, varied next actions (under 8 words each) that fit the scene — include at least one that plays to this hero's class.
- bonus_xp: "minor" or "notable" only for genuinely clever, brave or in-character roleplay this turn; usually "none".`;
