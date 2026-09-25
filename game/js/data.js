// Static rules content: abilities, skills, races, backgrounds, classes and
// their powers, monsters, loot and the regions the offline narrator draws on.
// Everything numeric in the game comes from here and engine.js — the AI
// narrator only ever picks from these lists, it never invents numbers.

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
export const ABILITY_NAMES = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

export const SKILLS = {
  athletics: { name: "Athletics", ability: "str" },
  acrobatics: { name: "Acrobatics", ability: "dex" },
  sleight_of_hand: { name: "Sleight of Hand", ability: "dex" },
  stealth: { name: "Stealth", ability: "dex" },
  arcana: { name: "Arcana", ability: "int" },
  history: { name: "History", ability: "int" },
  investigation: { name: "Investigation", ability: "int" },
  nature: { name: "Nature", ability: "int" },
  religion: { name: "Religion", ability: "int" },
  animal_handling: { name: "Animal Handling", ability: "wis" },
  insight: { name: "Insight", ability: "wis" },
  medicine: { name: "Medicine", ability: "wis" },
  perception: { name: "Perception", ability: "wis" },
  survival: { name: "Survival", ability: "wis" },
  deception: { name: "Deception", ability: "cha" },
  intimidation: { name: "Intimidation", ability: "cha" },
  performance: { name: "Performance", ability: "cha" },
  persuasion: { name: "Persuasion", ability: "cha" },
};

// Target numbers. The DC describes the task, never the character — a wizard
// and a barbarian face the same DC to force a door; their modifiers differ.
export const DCS = { trivial: 5, easy: 10, medium: 13, hard: 16, very_hard: 19, nearly_impossible: 23 };

export const XP_TABLE = [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200, 4000, 5000];
export const MAX_LEVEL = 12;

export const RACES = {
  human: {
    name: "Human", bonus: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    traits: ["Versatile: +1 to every ability score."], skills: [],
    blurb: "Short-lived, stubborn and everywhere.",
  },
  elf: {
    name: "Elf", bonus: { dex: 2, int: 1 },
    traits: ["Keen Senses: proficient in Perception.", "Darkvision."], skills: ["perception"],
    blurb: "Long memories, sharp eyes, pointed ears.",
  },
  dwarf: {
    name: "Dwarf", bonus: { con: 2, wis: 1 },
    traits: ["Stonecunning: proficient in History.", "Dwarven Toughness: +1 HP per level."], skills: ["history"],
    blurb: "Built like a keg, hard to put down.",
  },
  halfling: {
    name: "Halfling", bonus: { dex: 2, cha: 1 },
    traits: ["Lucky: a natural 1 on a check or attack is rerolled once."], skills: [],
    blurb: "Small, quick and unreasonably fortunate.",
  },
  half_orc: {
    name: "Half-Orc", bonus: { str: 2, con: 1 },
    traits: ["Menacing: proficient in Intimidation.", "Relentless: once per long rest, drop to 1 HP instead of 0."], skills: ["intimidation"],
    blurb: "Tusked, towering, and done being underestimated.",
  },
  tiefling: {
    name: "Tiefling", bonus: { cha: 2, int: 1 },
    traits: ["Infernal Legacy: resistant to fire.", "Darkvision."], skills: [],
    blurb: "Horns, a tail, and a fiend somewhere back in the family tree.",
  },
  dragonborn: {
    name: "Dragonborn", bonus: { str: 2, cha: 1 },
    traits: ["Breath Weapon: exhale elemental fire once per short rest."], skills: [],
    blurb: "Scaled, proud, and carrying a furnace in the chest.",
  },
  gnome: {
    name: "Gnome", bonus: { int: 2, con: 1 },
    traits: ["Gnome Cunning: advantage on Intelligence, Wisdom and Charisma saves."], skills: [],
    blurb: "Tiny, curious and dangerously clever.",
  },
};

export const BACKGROUNDS = {
  soldier: { name: "Soldier", skills: ["athletics", "intimidation"], item: "A tarnished rank insignia" },
  criminal: { name: "Criminal", skills: ["deception", "stealth"], item: "A set of lockpicks" },
  sage: { name: "Sage", skills: ["arcana", "history"], item: "A cracked book of notes" },
  acolyte: { name: "Acolyte", skills: ["insight", "religion"], item: "A holy symbol on a cord" },
  folk_hero: { name: "Folk Hero", skills: ["animal_handling", "survival"], item: "A shovel-worn pair of gloves" },
  noble: { name: "Noble", skills: ["history", "persuasion"], item: "A signet ring" },
  outlander: { name: "Outlander", skills: ["athletics", "survival"], item: "A hunting trap" },
  entertainer: { name: "Entertainer", skills: ["acrobatics", "performance"], item: "A battered lute" },
  urchin: { name: "Urchin", skills: ["sleight_of_hand", "stealth"], item: "A map of city rooftops" },
  hermit: { name: "Hermit", skills: ["medicine", "religion"], item: "A pouch of dried herbs" },
};

// Power cost types:
//   atwill — free; slot — spell slot (long rest; warlock: short rest);
//   short/long — N uses per rest; ki — monk points; pool — lay on hands HP pool.
// Power kinds are interpreted by engine.js usePower().
const P = (o) => ({ level: 1, cost: { type: "atwill" }, combatOnly: false, ...o });

export const POWERS = {
  // Fighter
  second_wind: P({ name: "Second Wind", cost: { type: "short", n: 1 }, kind: "heal", dice: "1d10", addLevel: true, desc: "Catch your breath and heal 1d10 + level." }),
  action_surge: P({ name: "Action Surge", level: 2, cost: { type: "short", n: 1 }, kind: "extra_attack", attacks: 2, combatOnly: true, desc: "Push past your limits: make two extra weapon attacks this turn." }),
  // Barbarian
  rage: P({ name: "Rage", cost: { type: "long", n: 2 }, kind: "buff", status: "rage", combatOnly: true, desc: "Advantage on Strength, +2 melee damage, take half damage until the fight ends." }),
  reckless_attack: P({ name: "Reckless Attack", level: 2, kind: "weapon_adv", combatOnly: true, desc: "Attack with advantage — enemies get advantage on you this round." }),
  // Rogue
  cunning_action: P({ name: "Cunning Action", kind: "escape", desc: "Dash, disengage or hide as a flicker: advantage on escaping or hiding." }),
  uncanny_dodge: P({ name: "Uncanny Dodge", level: 5, cost: { type: "short", n: 1 }, kind: "buff", status: "dodge", combatOnly: true, desc: "Halve the damage of the next hit that lands on you." }),
  // Ranger
  hunters_mark: P({ name: "Hunter's Mark", level: 2, cost: { type: "slot" }, kind: "buff", status: "marked", combatOnly: true, desc: "Mark your quarry: +1d6 damage on every hit this fight." }),
  ranger_cure: P({ name: "Cure Wounds", level: 2, cost: { type: "slot" }, kind: "heal", dice: "1d8", addMod: true, desc: "Heal 1d8 + Wisdom." }),
  // Paladin
  lay_on_hands: P({ name: "Lay on Hands", cost: { type: "pool" }, kind: "heal_pool", desc: "Draw from a healing pool of 5 HP per level." }),
  divine_smite: P({ name: "Divine Smite", level: 2, cost: { type: "slot" }, kind: "smite", dice: "2d8", combatOnly: true, desc: "Weapon attack; on a hit, add 2d8 radiant damage." }),
  divine_sense: P({ name: "Divine Sense", kind: "check_boost", advantage: true, desc: "Sense the holy and unholy nearby: advantage on your next check to find or understand it." }),
  // Cleric
  sacred_flame: P({ name: "Sacred Flame", addMod: true, kind: "save", save: "dex", dice: "1d8", scale: true, combatOnly: true, desc: "Radiant fire falls on a foe (Dexterity save, 1d8 + Wisdom)." }),
  guidance: P({ name: "Guidance", kind: "check_boost", bonus: "1d4", desc: "Add 1d4 to your next ability check." }),
  cure_wounds: P({ name: "Cure Wounds", cost: { type: "slot" }, kind: "heal", dice: "1d8", addMod: true, upcast: true, desc: "Heal 1d8 + Wisdom (more at higher level)." }),
  guiding_bolt: P({ name: "Guiding Bolt", cost: { type: "slot" }, kind: "attack", dice: "4d6", combatOnly: true, desc: "A flash of light: spell attack for 4d6 radiant." }),
  bless: P({ name: "Bless", cost: { type: "slot" }, kind: "buff", status: "blessed", desc: "+1d4 to attacks and saves for the rest of the fight." }),
  turn_undead: P({ name: "Turn Undead", level: 2, cost: { type: "short", n: 1 }, kind: "save", save: "wis", dice: "0d0", rider: "flee_undead", aoe: true, combatOnly: true, desc: "Undead that fail a Wisdom save flee from you." }),
  spiritual_weapon: P({ name: "Spiritual Weapon", level: 3, cost: { type: "slot" }, kind: "attack", dice: "2d8", addMod: true, combatOnly: true, desc: "A spectral weapon strikes for 2d8 + Wisdom." }),
  // Wizard / Sorcerer
  fire_bolt: P({ name: "Fire Bolt", addMod: true, kind: "attack", dice: "1d10", scale: true, combatOnly: true, desc: "Hurl a mote of fire: spell attack, 1d10 + Intelligence." }),
  magic_missile: P({ name: "Magic Missile", cost: { type: "slot" }, kind: "auto", count: 3, dice: "1d4", flat: 1, combatOnly: true, desc: "Three darts that never miss, 1d4+1 each." }),
  shield: P({ name: "Shield", cost: { type: "slot" }, kind: "buff", status: "shielded", combatOnly: true, desc: "+5 AC until your next turn." }),
  sleep: P({ name: "Sleep", cost: { type: "slot" }, kind: "control", save: "wis", status: "asleep", combatOnly: true, desc: "A foe that fails a Wisdom save drops asleep." }),
  minor_illusion: P({ name: "Minor Illusion", kind: "check_boost", advantage: true, desc: "Conjure a sound or image: advantage on your next Deception or Stealth check." }),
  detect_magic: P({ name: "Detect Magic", kind: "check_boost", advantage: true, desc: "Sense magic: advantage on your next Arcana or Investigation check." }),
  scorching_ray: P({ name: "Scorching Ray", level: 3, cost: { type: "slot" }, kind: "attack", dice: "2d6", hits: 3, combatOnly: true, desc: "Three rays of fire, each a spell attack for 2d6." }),
  fireball: P({ name: "Fireball", level: 5, cost: { type: "slot" }, kind: "save", save: "dex", dice: "8d6", aoe: true, half: true, combatOnly: true, desc: "Every foe makes a Dexterity save: 8d6 fire, half on a success." }),
  chromatic_orb: P({ name: "Chromatic Orb", cost: { type: "slot" }, kind: "attack", dice: "3d8", combatOnly: true, desc: "An orb of raw element: spell attack, 3d8." }),
  charm_person: P({ name: "Charm Person", cost: { type: "slot" }, kind: "check_boost", advantage: true, desc: "Befriend someone: advantage on your next Charisma check with them." }),
  // Warlock
  eldritch_blast: P({ name: "Eldritch Blast", addMod: true, kind: "attack", dice: "1d10", beams: true, combatOnly: true, desc: "A crackling beam of force, 1d10 + Charisma (more beams as you level)." }),
  hex: P({ name: "Hex", cost: { type: "slot" }, kind: "buff", status: "hexing", combatOnly: true, desc: "Curse a foe: +1d6 necrotic on every hit this fight." }),
  armor_of_agathys: P({ name: "Armor of Agathys", level: 2, cost: { type: "slot" }, kind: "temp_hp", amount: 5, perLevel: true, desc: "Frost armor grants temporary HP (5 per spell level)." }),
  // Druid
  produce_flame: P({ name: "Produce Flame", addMod: true, kind: "attack", dice: "1d8", scale: true, combatOnly: true, desc: "Throw a handful of flame: spell attack, 1d8 + Wisdom." }),
  healing_word: P({ name: "Healing Word", cost: { type: "slot" }, kind: "heal", dice: "1d4", addMod: true, upcast: true, desc: "A quick word of healing: 1d4 + casting modifier." }),
  entangle: P({ name: "Entangle", cost: { type: "slot" }, kind: "control", save: "str", status: "restrained", aoe: true, combatOnly: true, desc: "Grasping vines: foes that fail a Strength save are restrained." }),
  wild_shape: P({ name: "Wild Shape", level: 2, cost: { type: "short", n: 1 }, kind: "temp_hp", amount: 4, perCharLevel: true, desc: "Become a beast: gain 4 temporary HP per level." }),
  thunderwave: P({ name: "Thunderwave", level: 3, cost: { type: "slot" }, kind: "save", save: "con", dice: "2d8", aoe: true, half: true, combatOnly: true, desc: "A wave of thunder: Constitution save, 2d8, half on a success." }),
  // Monk
  flurry_of_blows: P({ name: "Flurry of Blows", cost: { type: "ki", n: 1 }, kind: "extra_attack", attacks: 2, combatOnly: true, desc: "Spend 1 ki: two extra unarmed strikes." }),
  patient_defense: P({ name: "Patient Defense", cost: { type: "ki", n: 1 }, kind: "buff", status: "dodging", combatOnly: true, desc: "Spend 1 ki: attacks against you have disadvantage this round." }),
  step_of_the_wind: P({ name: "Step of the Wind", cost: { type: "ki", n: 1 }, kind: "escape", desc: "Spend 1 ki: advantage on escaping, leaping or climbing." }),
  stunning_strike: P({ name: "Stunning Strike", level: 5, cost: { type: "ki", n: 1 }, kind: "control", save: "con", status: "stunned", combatOnly: true, desc: "Spend 1 ki: a foe that fails a Constitution save is stunned." }),
  // Bard
  vicious_mockery: P({ name: "Vicious Mockery", addMod: true, kind: "save", save: "wis", dice: "1d6", scale: true, rider: "disadvantage", combatOnly: true, desc: "A cutting insult: Wisdom save, 1d6 + Charisma psychic and disadvantage on its next attack." }),
  bardic_inspiration: P({ name: "Bardic Inspiration", cost: { type: "long", n: 3 }, kind: "check_boost", bonus: "1d6", desc: "Add 1d6 to your next roll." }),
  dissonant_whispers: P({ name: "Dissonant Whispers", cost: { type: "slot" }, kind: "save", save: "wis", dice: "3d6", half: true, combatOnly: true, desc: "Wisdom save, 3d6 psychic, half on a success." }),
  // Racial
  breath_weapon: P({ name: "Breath Weapon", cost: { type: "short", n: 1 }, kind: "save", save: "dex", dice: "2d6", aoe: true, half: true, combatOnly: true, desc: "Exhale fire over every foe: Dexterity save, 2d6, half on a success." }),
};

// armor: { base, dex: true|number(max)|false, shield }
export const CLASSES = {
  fighter: {
    name: "Fighter", hd: 10, primary: ["str", "con", "dex", "wis", "cha", "int"], caster: null, slots: "none",
    saves: ["str", "con"], skillChoices: ["acrobatics", "animal_handling", "athletics", "history", "insight", "intimidation", "perception", "survival"], numSkills: 2,
    armor: { name: "Chain mail & shield", base: 16, dex: false, shield: 2 },
    weapon: { name: "Longsword", dice: "1d8", ability: "str" },
    powers: ["second_wind", "action_surge"],
    features: { 1: "Fighting Style: +1 to hit with weapons.", 5: "Extra Attack: attack twice.", 9: "Indomitable: reroll one failed save per rest." },
    blurb: "Trained killer. Great in a fight, dependable everywhere else.",
  },
  barbarian: {
    name: "Barbarian", hd: 12, primary: ["str", "con", "dex", "wis", "cha", "int"], caster: null, slots: "none",
    saves: ["str", "con"], skillChoices: ["animal_handling", "athletics", "intimidation", "nature", "perception", "survival"], numSkills: 2,
    armor: { name: "Unarmored (Dex + Con)", base: 10, dex: true, con: true, shield: 0 },
    weapon: { name: "Greataxe", dice: "1d12", ability: "str" },
    powers: ["rage", "reckless_attack"],
    features: { 5: "Extra Attack: attack twice.", 9: "Brutal Critical: one extra die on critical hits." },
    blurb: "Fury given a body. Hits hardest, thinks with fists.",
  },
  rogue: {
    name: "Rogue", hd: 8, primary: ["dex", "con", "int", "cha", "wis", "str"], caster: null, slots: "none",
    saves: ["dex", "int"], skillChoices: ["acrobatics", "athletics", "deception", "insight", "intimidation", "investigation", "perception", "performance", "persuasion", "sleight_of_hand", "stealth"], numSkills: 4,
    expertise: ["stealth", "sleight_of_hand"],
    armor: { name: "Studded leather", base: 12, dex: true, shield: 0 },
    weapon: { name: "Rapier", dice: "1d8", ability: "dex" },
    powers: ["cunning_action", "uncanny_dodge"],
    features: { 1: "Sneak Attack: extra damage on every hit, plus an extra die when you strike first or with advantage. Expertise in Stealth and Sleight of Hand.", 7: "Evasion: take no damage on successful Dexterity saves." },
    blurb: "Locks, lies and knives. The best at skills.",
  },
  ranger: {
    name: "Ranger", hd: 10, primary: ["dex", "wis", "con", "str", "int", "cha"], caster: "wis", slots: "half",
    saves: ["str", "dex"], skillChoices: ["animal_handling", "athletics", "insight", "investigation", "nature", "perception", "stealth", "survival"], numSkills: 3,
    armor: { name: "Studded leather", base: 12, dex: true, shield: 0 },
    weapon: { name: "Longbow", dice: "1d8", ability: "dex" },
    powers: ["hunters_mark", "ranger_cure"],
    features: { 1: "Natural Explorer: advantage on Survival checks.", 5: "Extra Attack: attack twice." },
    blurb: "Tracker and archer. At home where the road ends.",
  },
  paladin: {
    name: "Paladin", hd: 10, primary: ["str", "cha", "con", "wis", "dex", "int"], caster: "cha", slots: "half",
    saves: ["wis", "cha"], skillChoices: ["athletics", "insight", "intimidation", "medicine", "persuasion", "religion"], numSkills: 2,
    armor: { name: "Chain mail & shield", base: 16, dex: false, shield: 2 },
    weapon: { name: "Longsword", dice: "1d8", ability: "str" },
    powers: ["lay_on_hands", "divine_sense", "divine_smite"],
    features: { 5: "Extra Attack: attack twice.", 6: "Aura of Protection: add Charisma to your saves." },
    blurb: "Holy warrior sworn to an oath. Heals, smites, persuades.",
  },
  cleric: {
    name: "Cleric", hd: 8, primary: ["wis", "con", "str", "cha", "dex", "int"], caster: "wis", slots: "full",
    saves: ["wis", "cha"], skillChoices: ["history", "insight", "medicine", "persuasion", "religion"], numSkills: 2,
    armor: { name: "Scale mail & shield", base: 14, dex: 2, shield: 2 },
    weapon: { name: "Mace", dice: "1d6", ability: "str" },
    powers: ["sacred_flame", "guidance", "cure_wounds", "guiding_bolt", "bless", "turn_undead", "spiritual_weapon"],
    features: {},
    blurb: "A god's hands in the world. The best healer, sturdier than they look.",
  },
  wizard: {
    name: "Wizard", hd: 6, primary: ["int", "con", "dex", "wis", "cha", "str"], caster: "int", slots: "full",
    saves: ["int", "wis"], skillChoices: ["arcana", "history", "insight", "investigation", "medicine", "religion"], numSkills: 2,
    armor: { name: "Robes & mage armor", base: 13, dex: true, shield: 0 },
    weapon: { name: "Quarterstaff", dice: "1d6", ability: "str" },
    powers: ["fire_bolt", "magic_missile", "shield", "sleep", "minor_illusion", "detect_magic", "scorching_ray", "fireball"],
    features: {},
    blurb: "Scholar of the arcane. Devastating spells, fragile body.",
  },
  sorcerer: {
    name: "Sorcerer", hd: 6, primary: ["cha", "con", "dex", "wis", "int", "str"], caster: "cha", slots: "full",
    saves: ["con", "cha"], skillChoices: ["arcana", "deception", "insight", "intimidation", "persuasion", "religion"], numSkills: 2,
    armor: { name: "Draconic resilience", base: 13, dex: true, shield: 0 },
    weapon: { name: "Dagger", dice: "1d4", ability: "dex" },
    powers: ["fire_bolt", "chromatic_orb", "shield", "charm_person", "scorching_ray", "fireball"],
    features: {},
    blurb: "Magic in the blood. Raw power, a talent for charm.",
  },
  warlock: {
    name: "Warlock", hd: 8, primary: ["cha", "con", "dex", "wis", "int", "str"], caster: "cha", slots: "pact",
    saves: ["wis", "cha"], skillChoices: ["arcana", "deception", "history", "intimidation", "investigation", "nature", "religion"], numSkills: 2,
    armor: { name: "Studded leather", base: 12, dex: true, shield: 0 },
    weapon: { name: "Dagger", dice: "1d4", ability: "dex" },
    powers: ["eldritch_blast", "hex", "minor_illusion", "armor_of_agathys"],
    features: { 1: "Otherworldly Patron: your spell slots return on a short rest." },
    blurb: "Power borrowed from something that wants it back.",
  },
  druid: {
    name: "Druid", hd: 8, primary: ["wis", "con", "dex", "int", "cha", "str"], caster: "wis", slots: "full",
    saves: ["int", "wis"], skillChoices: ["arcana", "animal_handling", "insight", "medicine", "nature", "perception", "religion", "survival"], numSkills: 2,
    armor: { name: "Hide armor & wooden shield", base: 12, dex: 2, shield: 2 },
    weapon: { name: "Scimitar", dice: "1d6", ability: "dex" },
    powers: ["produce_flame", "guidance", "healing_word", "entangle", "wild_shape", "thunderwave"],
    features: {},
    blurb: "Voice of the wild. Heals, shapeshifts, calls on storms.",
  },
  monk: {
    name: "Monk", hd: 8, primary: ["dex", "wis", "con", "str", "int", "cha"], caster: null, slots: "none",
    saves: ["str", "dex"], skillChoices: ["acrobatics", "athletics", "history", "insight", "religion", "stealth"], numSkills: 2,
    armor: { name: "Unarmored (Dex + Wis)", base: 10, dex: true, wis: true, shield: 0 },
    weapon: { name: "Unarmed strike", dice: "1d6", ability: "dex" },
    powers: ["flurry_of_blows", "patient_defense", "step_of_the_wind", "stunning_strike"],
    features: { 1: "Ki: points equal to your level, back on a short rest.", 5: "Extra Attack: attack twice." },
    blurb: "Disciplined body, quick hands, unnervingly calm.",
  },
  bard: {
    name: "Bard", hd: 8, primary: ["cha", "dex", "con", "wis", "int", "str"], caster: "cha", slots: "full",
    saves: ["dex", "cha"], skillChoices: Object.keys(SKILLS), numSkills: 3,
    armor: { name: "Studded leather", base: 12, dex: true, shield: 0 },
    weapon: { name: "Rapier", dice: "1d8", ability: "dex" },
    powers: ["vicious_mockery", "bardic_inspiration", "healing_word", "dissonant_whispers", "charm_person"],
    features: { 2: "Jack of All Trades: add half proficiency to checks you aren't proficient in." },
    blurb: "Talker, charmer, dabbler in everything.",
  },
};

// Spell slots by character level (index 0 = level 1).
export const SLOT_TABLE = {
  full: [3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9],
  half: [0, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6],
  pact: [2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4],
  none: Array(12).fill(0),
};

// Monster stat blocks at level 1. engine.scaleMonster() grows them with the hero.
// tags feed special rules (undead → Turn Undead).
export const MONSTERS = {
  minion: [
    { name: "Giant Rat", hp: 6, ac: 12, atk: 3, dmg: "1d4+1", xp: 15, save: 1, tags: ["beast"] },
    { name: "Goblin Sneak", hp: 7, ac: 13, atk: 4, dmg: "1d6+1", xp: 25, save: 1, tags: [] },
    { name: "Kobold Scrapper", hp: 5, ac: 12, atk: 4, dmg: "1d4+1", xp: 20, save: 0, tags: [] },
    { name: "Bandit Cutpurse", hp: 9, ac: 12, atk: 3, dmg: "1d6", xp: 25, save: 1, tags: ["humanoid"] },
    { name: "Rattling Skeleton", hp: 10, ac: 13, atk: 4, dmg: "1d6+1", xp: 30, save: 0, tags: ["undead"] },
    { name: "Grey Wolf", hp: 11, ac: 13, atk: 4, dmg: "2d4", xp: 30, save: 1, tags: ["beast"] },
    { name: "Hooded Cultist", hp: 9, ac: 12, atk: 3, dmg: "1d6", xp: 25, save: 2, tags: ["humanoid"] },
    { name: "Cave Spider", hp: 8, ac: 13, atk: 4, dmg: "1d6", xp: 25, save: 1, tags: ["beast"] },
  ],
  standard: [
    { name: "Orc Raider", hp: 15, ac: 13, atk: 5, dmg: "1d10+2", xp: 60, save: 2, tags: ["humanoid"] },
    { name: "Hobgoblin Soldier", hp: 14, ac: 16, atk: 4, dmg: "1d8+1", xp: 55, save: 1, tags: ["humanoid"] },
    { name: "Ghoul", hp: 18, ac: 12, atk: 4, dmg: "2d4+2", xp: 70, save: 2, tags: ["undead"] },
    { name: "Dire Wolf", hp: 20, ac: 14, atk: 5, dmg: "2d6+1", xp: 70, save: 2, tags: ["beast"] },
    { name: "Bugbear Brute", hp: 22, ac: 14, atk: 4, dmg: "2d6+1", xp: 80, save: 2, tags: [] },
    { name: "Harpy", hp: 16, ac: 11, atk: 3, dmg: "2d4", xp: 55, save: 1, tags: [] },
    { name: "Animated Armor", hp: 22, ac: 17, atk: 4, dmg: "1d6+2", xp: 80, save: 2, tags: ["construct"] },
    { name: "Bandit Captain", hp: 22, ac: 15, atk: 5, dmg: "1d8+2", xp: 85, save: 3, tags: ["humanoid"] },
  ],
  elite: [
    { name: "Ogre", hp: 34, ac: 11, atk: 5, dmg: "2d6+3", xp: 180, save: 2, tags: ["giant"] },
    { name: "Barrow Wight", hp: 30, ac: 14, atk: 5, dmg: "1d8+3", xp: 200, save: 3, tags: ["undead"] },
    { name: "Owlbear", hp: 36, ac: 13, atk: 5, dmg: "2d6+3", xp: 220, save: 3, tags: ["beast"] },
    { name: "Young Troll", hp: 38, ac: 14, atk: 5, dmg: "2d6+2", xp: 240, save: 3, tags: ["giant"] },
    { name: "Wraith", hp: 30, ac: 13, atk: 5, dmg: "2d6+3", xp: 230, save: 3, tags: ["undead"] },
    { name: "Minotaur", hp: 40, ac: 14, atk: 5, dmg: "2d8+2", xp: 260, save: 3, tags: [] },
  ],
  boss: [
    { name: "Ashen Drake", hp: 42, ac: 15, atk: 5, dmg: "2d6+2", xp: 450, save: 4, tags: ["dragon"] },
    { name: "The Barrow King", hp: 40, ac: 16, atk: 5, dmg: "2d6+2", xp: 450, save: 4, tags: ["undead"] },
    { name: "Mother Thornwick, Night Hag", hp: 38, ac: 15, atk: 6, dmg: "2d6+1", xp: 430, save: 5, tags: ["fiend"] },
    { name: "Iron Colossus", hp: 48, ac: 16, atk: 5, dmg: "2d6+2", xp: 500, save: 3, tags: ["construct"] },
  ],
};

// Loot. Weapons replace your weapon if better; armor adds to AC; potions heal.
export const LOOT = {
  potion: [
    { name: "Potion of Healing", kind: "potion", heal: "2d4+2", rarity: "common" },
    { name: "Potion of Greater Healing", kind: "potion", heal: "4d4+4", rarity: "uncommon" },
    { name: "Potion of Superior Healing", kind: "potion", heal: "8d4+8", rarity: "rare" },
  ],
  weapon: [
    { name: "Fine Blade", kind: "weapon", bonus: 1, rarity: "uncommon" },
    { name: "Runed Weapon +1", kind: "weapon", bonus: 1, rarity: "uncommon" },
    { name: "Stormforged Weapon +2", kind: "weapon", bonus: 2, rarity: "rare" },
  ],
  armor: [
    { name: "Ring of Protection", kind: "armor", ac: 1, rarity: "uncommon" },
    { name: "Cloak of the Watchful", kind: "armor", ac: 1, rarity: "uncommon" },
    { name: "Mithral Weave", kind: "armor", ac: 2, rarity: "rare" },
  ],
  trinket: [
    { name: "Silver locket with a stranger's portrait", kind: "trinket", value: 15 },
    { name: "Carved bone die that always feels warm", kind: "trinket", value: 5 },
    { name: "Map fragment marked with a red X", kind: "trinket", value: 10 },
    { name: "Old signet ring of a fallen house", kind: "trinket", value: 25 },
    { name: "Vial of glowing blue sand", kind: "trinket", value: 20 },
    { name: "Iron key with a skull bow", kind: "trinket", value: 5 },
    { name: "Letter sealed in black wax", kind: "trinket", value: 5 },
  ],
  scroll: [
    { name: "Scroll of Luck", kind: "scroll", effect: "advantage", rarity: "uncommon" },
    { name: "Scroll of Mending Light", kind: "scroll", effect: "heal", heal: "3d8", rarity: "uncommon" },
  ],
};

// Opening hooks. One is chosen at the start and drives the main quest.
export const HOOKS = [
  {
    id: "hollow_crown", title: "The Hollow Crown",
    start: "Thornwick Village",
    text: "The barrow on Gallows Hill cracked open three nights ago. Since then the dead have been walking the Old Road, and the village elder swears she heard a voice beneath the hill calling for its crown.",
    objective: "Find out what woke the barrow on Gallows Hill.",
  },
  {
    id: "stolen_bell", title: "The Stolen Bell",
    start: "Thornwick Village",
    text: "Someone stole the silver bell from Thornwick's shrine — the bell that has kept the Whispering Woods quiet for a hundred years. Now the woods are whispering again, and livestock go missing every night.",
    objective: "Recover the silver bell before the woods swallow the village.",
  },
  {
    id: "ashen_sky", title: "Ash on the Wind",
    start: "Thornwick Village",
    text: "Grey ash has been falling on Thornwick for a week, and the miners in the northern hills have stopped sending word. The reeve is offering good coin to anyone brave enough to find out what is burning.",
    objective: "Travel north and find the source of the falling ash.",
  },
];

// Regions the offline narrator walks the story through, in rough order.
export const REGIONS = [
  {
    name: "Thornwick Village", tier: 0,
    desc: "a huddle of thatch roofs around a muddy green, with a leaning shrine, a smoky inn called the Crooked Lantern, and far too many locked shutters",
    features: ["the inn's scarred bar", "the shrine's cracked altar", "a well with a rusted chain", "the notice board by the green", "a blacksmith's cooling forge"],
    npcs: ["Old Maren the innkeeper", "a nervous young priest", "a one-eyed blacksmith", "a pair of gossiping farmers"],
  },
  {
    name: "The Old Road", tier: 1,
    desc: "a rutted cart track running between hedgerows gone wild, milestones half sunk in the mud",
    features: ["an overturned cart", "a roadside shrine", "fresh tracks in the mud", "a crow-picked scarecrow", "a collapsed toll booth"],
    npcs: ["a tinker with a squeaking wagon", "a lost shepherd boy", "a road warden with a limp"],
  },
  {
    name: "The Whispering Woods", tier: 1,
    desc: "old trees packed close enough to swallow the light, their branches creaking as though talking among themselves",
    features: ["a ring of pale mushrooms", "a hollow oak big enough to stand in", "a stream running the wrong way", "claw marks high on a trunk", "a hunter's abandoned snare line"],
    npcs: ["a hermit who speaks to crows", "a wounded woodcutter", "a fox that watches too closely"],
  },
  {
    name: "The Ruined Watchtower", tier: 2,
    desc: "a broken stone tower on a hill, one wall fallen, ivy strangling its arrow slits",
    features: ["a spiral stair missing half its steps", "a rusted portcullis", "old bloodstains on the flagstones", "a collapsed signal brazier", "a trapdoor under rubble"],
    npcs: ["a deserter hiding in the cellar", "a ghostly sentry who does not know he's dead"],
  },
  {
    name: "Blackwater Marsh", tier: 2,
    desc: "a flat grey fen where the ground shivers underfoot and lights drift over the water at dusk",
    features: ["a sunken boat", "a stilt hut on rotten legs", "a causeway of slick stones", "a bubbling black pool", "reeds tied into strange knots"],
    npcs: ["an eel-catcher with webbed fingers", "a witch's apprentice gathering reeds"],
  },
  {
    name: "Gallows Hill Barrow", tier: 3,
    desc: "a grassy mound split open like a wound, a stair of cold stone leading down into dark that smells of old earth",
    features: ["burial niches cut into the walls", "a sealed door carved with a crowned skull", "piles of grave goods", "a draft carrying whispers", "a pit of bones"],
    npcs: ["the restless ghost of a queen's handmaiden"],
  },
  {
    name: "The Northern Mines", tier: 3,
    desc: "timber-braced tunnels choked with ash, rail tracks vanishing into a red glow deep below",
    features: ["an abandoned ore cart", "a collapsed shaft", "scorched pickaxes", "a flooded gallery", "a vein of glittering crystal"],
    npcs: ["a trapped miner", "a foreman who will not stop coughing"],
  },
  {
    name: "The Sunken Cathedral", tier: 4,
    desc: "a vast drowned cathedral whose spires break the surface of a black lake, its nave echoing with dripping water",
    features: ["a stained-glass window of a burning saint", "pews floating in black water", "a choir loft thick with webs", "a relic vault behind a gate", "an organ that plays by itself"],
    npcs: ["a blind archivist", "a knight bound to guard the vault"],
  },
];

export const TIER_ORDER = ["minion", "standard", "elite", "boss"];
