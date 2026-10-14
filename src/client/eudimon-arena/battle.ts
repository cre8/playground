/**
 * Battle state of the EUDIMON arena in the browser. The server referees the
 * battle (src/eudimon-arena.ts): the browser sends the session id of every
 * presentation, the server reads the disclosed claims from EUDIPLO, plays the
 * turn and returns the events the UI plays one after the other.
 */

import type { Battle, BattleEvent, SendOutChoice } from '../shared/eudimon';

export {
  type BattleEvent,
  type KnownMove,
  type PlayerEudimon,
  type Side,
  knownMove,
} from '../shared/eudimon';

const STORAGE_KEY = 'eudimon-arena-battle';
const STORAGE_VERSION = 2;

/** A wallet request: sending out the EUDIMON, or one move slot */
export type RequestKind =
  | { kind: 'send-out'; choice: SendOutChoice }
  | { kind: 'move'; slot: number };

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

/** The server's battle plus what only the browser needs */
export interface BattleState extends Battle {
  version: number;
  battleId: string;
  log: LogEntry[];
  /** Wallet request in flight, kept across the same-device redirect */
  pending?: RequestKind & { sessionId: string };
  /** Sessions that were already applied to this battle */
  handled: string[];
}

export interface TurnResult {
  battle: Battle;
  events: BattleEvent[];
  /** The session was already applied, e.g. by another tab */
  duplicate?: boolean;
}

export interface RewardOffer {
  uri: string;
  sessionId: string;
}

/** The referee did not accept a request, `reason` tells why (see Rejection in src/eudimon-arena.ts) */
export class RefereeError extends Error {
  constructor(
    message: string,
    readonly reason?: string
  ) {
    super(message);
    this.name = 'RefereeError';
  }
}

export function isRejected(error: unknown, ...reasons: string[]): error is RefereeError {
  return error instanceof RefereeError && reasons.includes(error.reason ?? '');
}

async function referee<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/eudimon${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new RefereeError(
      data.error ?? `Request failed with status ${response.status}`,
      data.reason
    );
  }
  return data as T;
}

/** Starts a battle from a completed eudimon-battle presentation */
export async function startBattle(sessionId: string): Promise<BattleState> {
  const { battleId, battle } = await referee<{ battleId: string; battle: Battle }>('/battles', {
    sessionId,
  });
  return { ...battle, version: STORAGE_VERSION, battleId, log: [], handled: [sessionId] };
}

/** Uses a move: one Gary already knows, or a new one with the session that disclosed it */
export function takeTurn(battleId: string, slot: number, sessionId?: string): Promise<TurnResult> {
  return referee<TurnResult>(`/battles/${encodeURIComponent(battleId)}/turns`, {
    slot,
    sessionId,
  });
}

/** Gary's Pikachu, only for a battle the server saw won */
export function claimReward(battleId: string): Promise<RewardOffer> {
  return referee<RewardOffer>(`/battles/${encodeURIComponent(battleId)}/reward`, {});
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
