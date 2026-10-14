/**
 * EUDIMON arena referee.
 *
 * The battle runs on the server, the browser only plays the returned events.
 * It sends the session id of every presentation, and the server reads the
 * disclosed claims from EUDIPLO itself: a move counts only if a completed
 * presentation of the matching config disclosed it. Damage and Gary's moves are
 * rolled here, so a manipulated browser can neither win nor claim the reward
 * of a battle it did not win.
 *
 * Battles live in memory: after a restart of the playground running battles
 * are gone, the browser then offers a new one.
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  type Battle,
  type BattleEvent,
  PIKACHU,
  SEND_OUT_CONFIGS,
  STARTER_LEVEL,
  createBattle,
  findEudimon,
  findMove,
  knownMove,
  moveConfig,
  playTurn,
  upper,
} from './shared/eudimon-rules';

const MOVE_SLOTS = [1, 2, 3, 4];

const BATTLE_TTL_MS = 60 * 60 * 1000;
const MAX_BATTLES = 1000;
/** Older presentations are not accepted, they belong to another battle */
const MAX_SESSION_AGE_MS = 15 * 60 * 1000;
const EUDIMON_VCT = /^urn:eudi:eaa:eudimon:([a-z]+):\d+$/;

type Claims = Record<string, unknown>;

/** The parts of an EUDIPLO session the referee reads */
export interface ArenaSession {
  status: string;
  createdAt: string;
  /** Presentation config of the request */
  requestId?: string;
  credentials?: Array<Record<string, unknown>>;
}

export interface ArenaDeps {
  getSession(sessionId: string): Promise<ArenaSession>;
  /** Pre-authorized offer for the eudimon-pikachu credential with these claims */
  createRewardOffer(claims: Claims): Promise<{ uri: string; sessionId: string }>;
}

/** Why the referee did not accept a request, the browser shows a matching text */
export type Rejection =
  | 'session-not-completed'
  | 'wrong-request'
  | 'session-expired'
  | 'session-used'
  | 'not-an-eudimon'
  | 'wrong-eudimon'
  | 'no-move'
  | 'unknown-battle'
  | 'battle-over'
  | 'invalid-move'
  | 'no-reward';

class RefereeError extends Error {
  constructor(
    readonly reason: Rejection,
    message: string,
    readonly status = 409
  ) {
    super(message);
  }
}

interface StoredBattle {
  id: string;
  battle: Battle;
  createdAt: number;
  /** Requests of a battle run one after the other */
  queue: Promise<unknown>;
  reward?: { uri: string; sessionId: string };
}

const battles = new Map<string, StoredBattle>();
/** Every presentation counts once, for one battle */
const usedSessions = new Map<string, { battleId: string; at: number }>();
/** Send-outs in progress, a second request for the same session waits for the first */
const sendOuts = new Map<string, Promise<StoredBattle>>();

function prune(): void {
  const now = Date.now();
  for (const [id, stored] of battles) {
    if (now - stored.createdAt > BATTLE_TTL_MS) {
      battles.delete(id);
    }
  }
  for (const [sessionId, used] of usedSessions) {
    if (now - used.at > BATTLE_TTL_MS) {
      usedSessions.delete(sessionId);
    }
  }
  // Map keeps insertion order, so the oldest battles go first
  for (const id of battles.keys()) {
    if (battles.size <= MAX_BATTLES) {
      break;
    }
    battles.delete(id);
  }
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

/** The EUDIMON claims of a completed presentation of one of the expected configs */
async function presentedEudimon(
  deps: ArenaDeps,
  sessionId: string,
  configIds: string[]
): Promise<Claims> {
  const session = await deps.getSession(sessionId);
  if (session.status !== 'completed') {
    throw new RefereeError('session-not-completed', 'The presentation is not completed yet');
  }
  if (!configIds.includes(session.requestId ?? '')) {
    throw new RefereeError(
      'wrong-request',
      `Expected a presentation of ${configIds.join(' or ')}`,
      400
    );
  }
  if (Date.now() - new Date(session.createdAt).getTime() > MAX_SESSION_AGE_MS) {
    throw new RefereeError('session-expired', 'The presentation is too old for this battle');
  }
  const claims = (session.credentials ?? [])
    .flatMap((credential) => (credential.values as Claims[] | undefined) ?? [])
    .find((values) => EUDIMON_VCT.test(asText(values.vct)));
  if (!claims) {
    throw new RefereeError('not-an-eudimon', 'The wallet did not present an EUDIMON');
  }
  return claims;
}

function claimSession(sessionId: string, battleId: string): void {
  usedSessions.set(sessionId, { battleId, at: Date.now() });
}

/** Runs the requests of one battle one after the other */
function serialize<T>(stored: StoredBattle, action: () => Promise<T>): Promise<T> {
  const run = stored.queue.then(action, action);
  stored.queue = run.catch(() => undefined);
  return run;
}

async function startBattle(deps: ArenaDeps, sessionId: string): Promise<StoredBattle> {
  const used = usedSessions.get(sessionId);
  if (used) {
    // The same-device redirect and the polling tab both report the same session
    return getBattle(used.battleId);
  }
  const claims = await presentedEudimon(deps, sessionId, Object.values(SEND_OUT_CONFIGS));
  const stored: StoredBattle = {
    id: randomUUID(),
    battle: sendOut(claims),
    createdAt: Date.now(),
    queue: Promise.resolve(),
  };
  battles.set(stored.id, stored);
  claimSession(sessionId, stored.id);
  return stored;
}

function getBattle(id: string): StoredBattle {
  const stored = battles.get(id);
  if (!stored) {
    throw new RefereeError('unknown-battle', 'There is no such battle (anymore)', 404);
  }
  return stored;
}

function sendOut(claims: Claims): Battle {
  const species = asText(claims.species);
  // The vct names the species, the claim could be anything in a hand-crafted credential
  const eudimon =
    findEudimon(EUDIMON_VCT.exec(asText(claims.vct))?.[1] ?? '') ?? findEudimon(species);
  return createBattle({
    species,
    nickname: upper(asText(claims.nickname) || species || 'EUDIMON'),
    level: Number(claims.level) || STARTER_LEVEL,
    eudimonId: eudimon?.id,
  });
}

/** Reveals the move of a move presentation, checking it is the EUDIMON in battle */
async function revealMove(
  deps: ArenaDeps,
  stored: StoredBattle,
  slot: number,
  sessionId: string
): Promise<void> {
  const claims = await presentedEudimon(deps, sessionId, [
    moveConfig(stored.battle.player.eudimonId, slot),
  ]);
  // The session is spent even if Gary rejects the EUDIMON, the wallet has to answer anew
  claimSession(sessionId, stored.id);
  const { player } = stored.battle;
  const nickname = upper(asText(claims.nickname) || asText(claims.species) || 'EUDIMON');
  if (nickname !== player.nickname || asText(claims.species) !== player.species) {
    throw new RefereeError(
      'wrong-eudimon',
      `The wallet shared ${nickname}, not ${player.nickname}`
    );
  }
  const name = asText(claims[`move_${slot}`]);
  if (!name) {
    throw new RefereeError('no-move', `The wallet did not share move_${slot}`);
  }
  stored.battle.knownMoves.push({ slot, name });
}

function rewardClaims(): Claims {
  return {
    species: PIKACHU.name,
    nickname: upper(PIKACHU.name),
    dex_number: PIKACHU.dex,
    type: PIKACHU.types.join('/'),
    level: STARTER_LEVEL,
    trainer_name: 'GARY',
    trainer_id: '00002',
    move_1: PIKACHU.moves[0],
    move_2: PIKACHU.moves[1],
    move_3: PIKACHU.moves[2],
    move_4: PIKACHU.moves[3],
  };
}

/** One turn: a move Gary already knows, or a new one with the session that disclosed it */
async function takeTurn(deps: ArenaDeps, stored: StoredBattle, slot: number, sessionId: string) {
  if (!MOVE_SLOTS.includes(slot)) {
    throw new RefereeError('invalid-move', `There is no move ${slot}`, 400);
  }
  if (sessionId && usedSessions.get(sessionId)?.battleId === stored.id) {
    return { battle: stored.battle, events: [] as BattleEvent[], duplicate: true };
  }
  if (stored.battle.outcome) {
    throw new RefereeError('battle-over', 'The battle is over');
  }
  if (sessionId) {
    if (usedSessions.has(sessionId)) {
      throw new RefereeError('session-used', 'This presentation was used in another battle');
    }
    if (knownMove(stored.battle, slot)) {
      throw new RefereeError('invalid-move', `Move ${slot} is already known`, 400);
    }
    await revealMove(deps, stored, slot, sessionId);
  }
  const known = knownMove(stored.battle, slot);
  if (!known) {
    throw new RefereeError('invalid-move', `Move ${slot} needs a presentation first`, 400);
  }
  const events = playTurn(stored.battle, findMove(known.name));
  return { battle: stored.battle, events };
}

function handle(
  action: (req: Request) => Promise<unknown>
): (req: Request, res: Response) => Promise<void> {
  return async (req, res) => {
    try {
      prune();
      res.json(await action(req));
    } catch (error) {
      if (error instanceof RefereeError) {
        res.status(error.status).json({ error: error.message, reason: error.reason });
        return;
      }
      console.error('API Error (eudimon):', error);
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      res.status(500).json({ error: message });
    }
  };
}

export function eudimonArena(deps: ArenaDeps): Router {
  const router = Router();

  // Send out an EUDIMON: starts a battle from a completed send-out presentation
  router.post(
    '/battles',
    handle(async (req) => {
      const sessionId = asText(req.body?.sessionId);
      let pending = sendOuts.get(sessionId);
      if (!pending) {
        pending = startBattle(deps, sessionId).finally(() => sendOuts.delete(sessionId));
        sendOuts.set(sessionId, pending);
      }
      const stored = await pending;
      return { battleId: stored.id, battle: stored.battle };
    })
  );

  router.get(
    '/battles/:id',
    handle(async (req) => ({ battle: getBattle(String(req.params.id)).battle }))
  );

  router.post(
    '/battles/:id/turns',
    handle((req) => {
      const stored = getBattle(String(req.params.id));
      return serialize(stored, () =>
        takeTurn(deps, stored, Number(req.body?.slot), asText(req.body?.sessionId))
      );
    })
  );

  // Gary hands over his Pikachu, once per won battle
  router.post(
    '/battles/:id/reward',
    handle((req) => {
      const stored = getBattle(String(req.params.id));
      return serialize(stored, async () => {
        if (stored.battle.outcome !== 'won' || stored.battle.player.eudimonId === PIKACHU.id) {
          throw new RefereeError('no-reward', 'There is no reward for this battle', 403);
        }
        stored.reward ??= await deps.createRewardOffer(rewardClaims());
        return stored.reward;
      });
    })
  );

  return router;
}
