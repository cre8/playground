/**
 * EUDIMON game data and battle rules, shared by the browser and the server.
 * The server referees the arena battles with these rules, the browser uses the
 * same data for the lab, the move menu and the animations.
 *
 * Loosely Gen 1: the damage formula, stat stages, type effectiveness and
 * Leech Seed. Gary's EUDIMON knows the two moves a starter has at level 5 plus
 * a type move that is super effective against yours, so attacking alone rarely
 * wins; weakening Gary with status moves first does.
 */

export type EudimonType = 'Normal' | 'Fire' | 'Water' | 'Grass' | 'Poison' | 'Electric';

/** How a move is animated in the arena */
export type MoveFx =
  | 'scratch'
  | 'tackle'
  | 'ember'
  | 'bubble'
  | 'water'
  | 'vine'
  | 'seed'
  | 'thunder'
  | 'growl'
  | 'leer'
  | 'tailwhip';

/** What a status move does to its target */
export type MoveEffect = 'attack-down' | 'defense-down' | 'seed';

export interface Move {
  name: string;
  type: EudimonType;
  /** 0 for status moves */
  power: number;
  pp: number;
  fx: MoveFx;
  effect?: MoveEffect;
}

// Values as in Red/Blue (Gen 1)
export const MOVES: Record<string, Move> = {
  Scratch: { name: 'Scratch', type: 'Normal', power: 40, pp: 35, fx: 'scratch' },
  Tackle: { name: 'Tackle', type: 'Normal', power: 35, pp: 35, fx: 'tackle' },
  'Quick Attack': { name: 'Quick Attack', type: 'Normal', power: 40, pp: 30, fx: 'tackle' },
  Growl: { name: 'Growl', type: 'Normal', power: 0, pp: 40, fx: 'growl', effect: 'attack-down' },
  Leer: { name: 'Leer', type: 'Normal', power: 0, pp: 30, fx: 'leer', effect: 'defense-down' },
  'Tail Whip': {
    name: 'Tail Whip',
    type: 'Normal',
    power: 0,
    pp: 30,
    fx: 'tailwhip',
    effect: 'defense-down',
  },
  Ember: { name: 'Ember', type: 'Fire', power: 40, pp: 25, fx: 'ember' },
  Bubble: { name: 'Bubble', type: 'Water', power: 20, pp: 30, fx: 'bubble' },
  'Water Gun': { name: 'Water Gun', type: 'Water', power: 40, pp: 25, fx: 'water' },
  'Vine Whip': { name: 'Vine Whip', type: 'Grass', power: 35, pp: 10, fx: 'vine' },
  'Leech Seed': { name: 'Leech Seed', type: 'Grass', power: 0, pp: 10, fx: 'seed', effect: 'seed' },
  'Thunder Shock': { name: 'Thunder Shock', type: 'Electric', power: 40, pp: 30, fx: 'thunder' },
};

export type StarterId = 'bulbasaur' | 'charmander' | 'squirtle';
export type EudimonId = StarterId | 'pikachu';

export interface Eudimon {
  id: EudimonId;
  name: string;
  dex: number;
  types: EudimonType[];
  /** Move 1 to 4 of the credential */
  moves: [string, string, string, string];
  /** Gary picks the starter with the type advantage, like the rival in Red/Blue */
  rival: StarterId;
  /** HP at level 5 */
  hp: number;
}

export interface Starter extends Eudimon {
  id: StarterId;
}

export const STARTER_LEVEL = 5;

/** The starters of Professor Oak's lab, the first two moves are the ones they know at level 5 */
export const STARTERS: Starter[] = [
  {
    id: 'bulbasaur',
    name: 'Bulbasaur',
    dex: 1,
    types: ['Grass', 'Poison'],
    moves: ['Tackle', 'Growl', 'Leech Seed', 'Vine Whip'],
    rival: 'charmander',
    hp: 21,
  },
  {
    id: 'charmander',
    name: 'Charmander',
    dex: 4,
    types: ['Fire'],
    moves: ['Scratch', 'Growl', 'Ember', 'Leer'],
    rival: 'squirtle',
    hp: 20,
  },
  {
    id: 'squirtle',
    name: 'Squirtle',
    dex: 7,
    types: ['Water'],
    moves: ['Tackle', 'Tail Whip', 'Bubble', 'Water Gun'],
    rival: 'bulbasaur',
    hp: 20,
  },
];

/** Gary's reward for beating him in the arena. Grass resists Electric, so he sends out Bulbasaur */
export const PIKACHU: Eudimon = {
  id: 'pikachu',
  name: 'Pikachu',
  dex: 25,
  types: ['Electric'],
  moves: ['Thunder Shock', 'Growl', 'Tail Whip', 'Quick Attack'],
  rival: 'bulbasaur',
  hp: 19,
};

export const EUDIMON: Eudimon[] = [...STARTERS, PIKACHU];

export function getStarter(id: StarterId): Starter {
  return STARTERS.find((s) => s.id === id)!;
}

export function getEudimon(id: EudimonId): Eudimon {
  return EUDIMON.find((e) => e.id === id)!;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Looks up a starter by its species name, case-insensitive */
export function findStarter(species: string): Starter | undefined {
  return STARTERS.find((s) => normalize(s.name) === normalize(species));
}

/** Looks up any EUDIMON by its id or species name, case-insensitive */
export function findEudimon(value: string): Eudimon | undefined {
  return EUDIMON.find((e) => e.id === normalize(value) || normalize(e.name) === normalize(value));
}

/** Moves that are not in the table (e.g. hand-crafted claims) act like a plain hit */
export function findMove(name: string): Move {
  const known = Object.values(MOVES).find((m) => normalize(m.name) === normalize(name));
  return known ?? { name, type: 'Normal', power: 35, pp: 35, fx: 'tackle' };
}

// Gen 1 type chart, reduced to the types of the EUDIMON above
const EFFECTIVENESS: Partial<Record<EudimonType, Partial<Record<EudimonType, number>>>> = {
  Fire: { Grass: 2, Fire: 0.5, Water: 0.5 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5 },
  Grass: { Water: 2, Fire: 0.5, Grass: 0.5, Poison: 0.5 },
  Poison: { Grass: 2, Poison: 0.5 },
  Electric: { Water: 2, Grass: 0.5, Electric: 0.5 },
};

export function effectiveness(moveType: EudimonType, defender: EudimonType[]): number {
  return defender.reduce((factor, type) => factor * (EFFECTIVENESS[moveType]?.[type] ?? 1), 1);
}

export function upper(value: string): string {
  return value.toUpperCase();
}

// --- Battle --------------------------------------------------------------------------

/** With this scale a battle is over after four to eight turns */
const DAMAGE_SCALE = 1;
const MIN_STAGE = -6;

/** Gen 1 gives a starter about two HP per level */
const HP_PER_LEVEL = 2;

/**
 * Gary's EUDIMON per EUDIMON you send out: its type move, how often he uses it
 * and its level. Tuned per matchup: with status moves first a starter wins
 * about two thirds of the battles, by attacking with move 1 alone a third at
 * most. Against Pikachu Gary sends a trained Bulbasaur that resists Thunder
 * Shock: Pikachu wins almost always, but only with all its moves revealed.
 */
const GARYS_EUDIMON: Record<EudimonId, { typeMove: string; chance: number; level: number }> = {
  bulbasaur: { typeMove: 'Ember', chance: 0.2, level: STARTER_LEVEL },
  charmander: { typeMove: 'Water Gun', chance: 0.3, level: STARTER_LEVEL },
  squirtle: { typeMove: 'Vine Whip', chance: 0.1, level: STARTER_LEVEL },
  pikachu: { typeMove: 'Vine Whip', chance: 0.7, level: 7 },
};
const GARYS_STATUS_CHANCE = 0.1;

export type Side = 'you' | 'foe';

export interface Fighter {
  /** Name as shown in battle texts */
  name: string;
  level: number;
  types: EudimonType[];
  hp: number;
  maxHp: number;
  attackStage: number;
  defenseStage: number;
  seeded: boolean;
}

export interface KnownMove {
  slot: number;
  name: string;
}

/** What the wallet disclosed when the EUDIMON was sent out */
export interface PlayerEudimon {
  species: string;
  nickname: string;
  level: number;
  eudimonId?: EudimonId;
}

export interface Battle {
  player: PlayerEudimon;
  rivalId: StarterId;
  you: Fighter;
  foe: Fighter;
  knownMoves: KnownMove[];
  turn: number;
  outcome?: 'won' | 'lost';
}

export type BattleEvent =
  | { type: 'use'; side: Side; move: Move; text: string }
  | { type: 'hp'; side: Side; hp: number; maxHp: number }
  | { type: 'text'; text: string }
  | { type: 'faint'; side: Side; text: string };

export function createBattle(player: PlayerEudimon): Battle {
  const eudimon = player.eudimonId ? getEudimon(player.eudimonId) : undefined;
  const rival = eudimon
    ? getStarter(eudimon.rival)
    : STARTERS[Math.floor(Math.random() * STARTERS.length)];
  const level = eudimon ? GARYS_EUDIMON[eudimon.id].level : STARTER_LEVEL;
  return {
    player,
    rivalId: rival.id,
    // Your EUDIMON fights at level 5 whatever the credential says, so a
    // hand-crafted level 100 credential gets no advantage
    you: fighter(player.nickname, STARTER_LEVEL, eudimon?.types ?? ['Normal'], eudimon?.hp ?? 20),
    foe: fighter(
      `Enemy ${upper(rival.name)}`,
      level,
      rival.types,
      rival.hp + (level - STARTER_LEVEL) * HP_PER_LEVEL
    ),
    knownMoves: [],
    turn: 1,
  };
}

function fighter(name: string, level: number, types: EudimonType[], hp: number): Fighter {
  return { name, level, types, hp, maxHp: hp, attackStage: 0, defenseStage: 0, seeded: false };
}

/** Gen 1 stat stage multiplier */
function stageFactor(stage: number): number {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

function damage(
  move: Move,
  attacker: Fighter,
  defender: Fighter
): { amount: number; factor: number } {
  const base = Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * move.power) / 50) + 2;
  const stab = attacker.types.includes(move.type) ? 1.5 : 1;
  const factor = effectiveness(move.type, defender.types);
  const stats = stageFactor(attacker.attackStage) / stageFactor(defender.defenseStage);
  // Gen 1 random factor between 217/255 and 1
  const random = (217 + Math.random() * 38) / 255;
  return {
    amount: Math.max(1, Math.floor(base * stab * factor * stats * random * DAMAGE_SCALE)),
    factor,
  };
}

function other(side: Side): Side {
  return side === 'you' ? 'foe' : 'you';
}

/** One side uses a move on the other */
export function useMove(battle: Battle, side: Side, move: Move): BattleEvent[] {
  const attacker = battle[side];
  const targetSide = other(side);
  const target = battle[targetSide];
  const events: BattleEvent[] = [
    { type: 'use', side, move, text: `${attacker.name} used ${upper(move.name)}!` },
  ];

  if (move.power > 0) {
    const { amount, factor } = damage(move, attacker, target);
    target.hp = Math.max(0, target.hp - amount);
    events.push({ type: 'hp', side: targetSide, hp: target.hp, maxHp: target.maxHp });
    if (factor > 1) {
      events.push({ type: 'text', text: "It's super effective!" });
    } else if (factor < 1) {
      events.push({ type: 'text', text: "It's not very effective..." });
    }
  } else if (move.effect === 'attack-down' || move.effect === 'defense-down') {
    const stat = move.effect === 'attack-down' ? 'attackStage' : 'defenseStage';
    const label = move.effect === 'attack-down' ? 'ATTACK' : 'DEFENSE';
    if (target[stat] <= MIN_STAGE) {
      events.push({ type: 'text', text: 'Nothing happened!' });
    } else {
      target[stat]--;
      events.push({ type: 'text', text: `${target.name}'s ${label} fell!` });
    }
  } else if (move.effect === 'seed') {
    if (target.types.includes('Grass')) {
      events.push({ type: 'text', text: `It doesn't affect ${target.name}!` });
    } else if (target.seeded) {
      events.push({ type: 'text', text: `${target.name} is already seeded!` });
    } else {
      target.seeded = true;
      events.push({ type: 'text', text: `${target.name} was seeded!` });
    }
  }

  events.push(...faintCheck(battle, targetSide));
  return events;
}

/** Leech Seed drains 1/16 of the max HP at the end of every turn */
export function endTurn(battle: Battle): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const side of ['you', 'foe'] as Side[]) {
    const seeded = battle[side];
    const seeder = battle[other(side)];
    if (!seeded.seeded || battle.outcome || seeded.hp === 0 || seeder.hp === 0) {
      continue;
    }
    const drain = Math.min(seeded.hp, Math.max(1, Math.floor(seeded.maxHp / 16)));
    seeded.hp -= drain;
    seeder.hp = Math.min(seeder.maxHp, seeder.hp + drain);
    events.push(
      { type: 'text', text: `LEECH SEED saps ${seeded.name}!` },
      { type: 'hp', side, hp: seeded.hp, maxHp: seeded.maxHp },
      { type: 'hp', side: other(side), hp: seeder.hp, maxHp: seeder.maxHp },
      ...faintCheck(battle, side)
    );
  }
  battle.turn++;
  return events;
}

function faintCheck(battle: Battle, side: Side): BattleEvent[] {
  if (battle[side].hp > 0 || battle.outcome) {
    return [];
  }
  battle.outcome = side === 'foe' ? 'won' : 'lost';
  return [{ type: 'faint', side, text: `${battle[side].name} fainted!` }];
}

/**
 * Gary mostly attacks, sometimes with his type move, and now and then he uses
 * his status move while it still works
 */
export function garysMove(battle: Battle): Move {
  const rival = getStarter(battle.rivalId);
  const [attack, status] = rival.moves.slice(0, 2).map(findMove);
  const garys = battle.player.eudimonId ? GARYS_EUDIMON[battle.player.eudimonId] : undefined;
  const stat = status.effect === 'attack-down' ? battle.you.attackStage : battle.you.defenseStage;
  const roll = Math.random();
  const chance = garys?.chance ?? 0;
  if (garys && roll < chance) {
    return findMove(garys.typeMove);
  }
  return stat > MIN_STAGE && roll < chance + GARYS_STATUS_CHANCE ? status : attack;
}

export function knownMove(battle: Battle, slot: number): KnownMove | undefined {
  return battle.knownMoves.find((move) => move.slot === slot);
}

/** A full turn: your move first, then Gary's, then Leech Seed */
export function playTurn(battle: Battle, move: Move): BattleEvent[] {
  const events = useMove(battle, 'you', move);
  if (!battle.outcome) {
    events.push(...useMove(battle, 'foe', garysMove(battle)));
  }
  if (!battle.outcome) {
    events.push(...endTurn(battle));
  }
  return events;
}

// --- Arena requests --------------------------------------------------------------------
// Presentation configs in eudiplo-config/playground/presentation/eudimon-*.json. Wallets
// answer with the first matching option, and a winner holds a starter and Pikachu, so
// Pikachu has requests of its own and the player picks on the page.

/** Which EUDIMON the player sends out: any starter, or Gary's Pikachu */
export type SendOutChoice = 'starter' | 'pikachu';

export const SEND_OUT_CONFIGS: Record<SendOutChoice, string> = {
  starter: 'eudimon-battle',
  pikachu: 'eudimon-battle-pikachu',
};

/** The move request matching the EUDIMON in battle */
export function moveConfig(eudimonId: EudimonId | undefined, slot: number): string {
  return eudimonId === PIKACHU.id ? `eudimon-pikachu-move-${slot}` : `eudimon-move-${slot}`;
}
