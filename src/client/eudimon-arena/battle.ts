/**
 * Battle rules and state of the EUDIMON arena. Pure game logic: the UI plays
 * the returned events one after the other.
 *
 * Loosely Gen 1: the damage formula at level 5 (scaled, so a battle takes a
 * few turns), stat stages, type effectiveness and Leech Seed. Gary's EUDIMON
 * only knows the two moves a starter has at level 5.
 */

import {
  STARTERS,
  STARTER_LEVEL,
  type EudimonType,
  type Move,
  type StarterId,
  effectiveness,
  findMove,
  getStarter,
  upper,
} from '../shared/eudimon';

/** Damage is scaled up, so a battle is over after three to five turns */
const DAMAGE_SCALE = 2;
const MIN_STAGE = -6;
const STORAGE_KEY = 'eudimon-arena-battle';
const STORAGE_VERSION = 1;

export type Side = 'you' | 'foe';

export interface Fighter {
  /** Name as shown in battle texts */
  name: string;
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
  starterId?: StarterId;
}

/** A wallet request: sending out the EUDIMON, or one move slot */
export type RequestKind = { kind: 'send-out' } | { kind: 'move'; slot: number };

export interface LogEntry {
  turn: number;
  title: string;
  configId?: string;
  method: string;
  sessionId?: string;
  requested: string[];
  received: [string, string][];
  meta: [string, string][];
  note?: string;
}

export interface BattleState {
  version: number;
  player: PlayerEudimon;
  rivalId: StarterId;
  you: Fighter;
  foe: Fighter;
  knownMoves: KnownMove[];
  turn: number;
  log: LogEntry[];
  /** Wallet request in flight, kept across the same-device redirect */
  pending?: RequestKind & { sessionId: string };
  /** Sessions that were already applied to this battle */
  handled: string[];
  outcome?: 'won' | 'lost';
}

export type BattleEvent =
  | { type: 'use'; side: Side; move: Move; text: string }
  | { type: 'hp'; side: Side; hp: number; maxHp: number }
  | { type: 'text'; text: string }
  | { type: 'faint'; side: Side; text: string };

export function createBattle(player: PlayerEudimon): BattleState {
  const starter = player.starterId ? getStarter(player.starterId) : undefined;
  // Like the rival in Red/Blue, Gary picks the starter with the type advantage
  const rival = starter
    ? getStarter(starter.rival)
    : STARTERS[Math.floor(Math.random() * STARTERS.length)];
  return {
    version: STORAGE_VERSION,
    player,
    rivalId: rival.id,
    you: fighter(player.nickname, starter?.types ?? ['Normal'], starter?.hp ?? 20),
    foe: fighter(`Enemy ${upper(rival.name)}`, rival.types, rival.hp),
    knownMoves: [],
    turn: 1,
    log: [],
    handled: [],
  };
}

function fighter(name: string, types: EudimonType[], hp: number): Fighter {
  return { name, types, hp, maxHp: hp, attackStage: 0, defenseStage: 0, seeded: false };
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
  const base = Math.floor((Math.floor((2 * STARTER_LEVEL) / 5 + 2) * move.power) / 50) + 2;
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
export function useMove(state: BattleState, side: Side, move: Move): BattleEvent[] {
  const attacker = state[side];
  const targetSide = other(side);
  const target = state[targetSide];
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

  events.push(...faintCheck(state, targetSide));
  return events;
}

/** Leech Seed drains 1/16 of the max HP at the end of every turn */
export function endTurn(state: BattleState): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (const side of ['you', 'foe'] as Side[]) {
    const seeded = state[side];
    const seeder = state[other(side)];
    if (!seeded.seeded || state.outcome || seeded.hp === 0 || seeder.hp === 0) {
      continue;
    }
    const drain = Math.min(seeded.hp, Math.max(1, Math.floor(seeded.maxHp / 16)));
    seeded.hp -= drain;
    seeder.hp = Math.min(seeder.maxHp, seeder.hp + drain);
    events.push(
      { type: 'text', text: `LEECH SEED saps ${seeded.name}!` },
      { type: 'hp', side, hp: seeded.hp, maxHp: seeded.maxHp },
      { type: 'hp', side: other(side), hp: seeder.hp, maxHp: seeder.maxHp },
      ...faintCheck(state, side)
    );
  }
  state.turn++;
  return events;
}

function faintCheck(state: BattleState, side: Side): BattleEvent[] {
  if (state[side].hp > 0 || state.outcome) {
    return [];
  }
  state.outcome = side === 'foe' ? 'won' : 'lost';
  return [{ type: 'faint', side, text: `${state[side].name} fainted!` }];
}

/** Gary mostly attacks, sometimes he uses his status move while it still works */
export function garysMove(state: BattleState): Move {
  const rival = getStarter(state.rivalId);
  const [attack, status] = rival.moves.slice(0, 2).map(findMove);
  const stat = status.effect === 'attack-down' ? state.you.attackStage : state.you.defenseStage;
  return stat > MIN_STAGE && Math.random() < 0.3 ? status : attack;
}

export function knownMove(state: BattleState, slot: number): KnownMove | undefined {
  return state.knownMoves.find((move) => move.slot === slot);
}

// --- Persistence (survives the redirect back from the wallet) --------------------

export function saveBattle(state: BattleState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode), a same-device redirect starts a new battle
  }
}

export function loadBattle(): BattleState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = raw ? (JSON.parse(raw) as BattleState) : null;
    return state?.version === STORAGE_VERSION ? state : null;
  } catch {
    return null;
  }
}

export function clearBattle(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
