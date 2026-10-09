/**
 * EUDIMON - Arena
 * Turn-based battle against Gary. Today's wallets answer a DCQL query with the
 * first matching option, so the choices happen on the page instead:
 * - sending out the EUDIMON is one presentation (species, nickname, level),
 * - the first use of a move is another one that asks for exactly that move
 *   (one presentation config per move slot),
 * - moves Gary already knows need no new request.
 * Every request shows up in the "Under the hood" log.
 */

import {
  createVerificationRequest,
  generateQRCode,
  waitForSession,
  getElement,
  getSessionFromUrl,
  buildRedirectUrl,
  clearSessionFromUrl,
  isDcApiAvailable,
  verifyWithDcApi,
  type Session,
} from '../shared/utils';
import {
  Dialog,
  STARTERS,
  STARTER_LEVEL,
  enableMenuKeys,
  findMove,
  findStarter,
  getStarter,
  isCancelled,
  renderSprite,
  renderWalletLink,
  sleep,
  upper,
} from '../shared/eudimon';
import { BATTLE_THEME, FANFARE, LAB_THEME, music, setupMusic } from '../shared/eudimon-music';
import {
  type BattleEvent,
  type BattleState,
  type LogEntry,
  type PlayerEudimon,
  type RequestKind,
  type Side,
  clearBattle,
  createBattle,
  endTurn,
  garysMove,
  knownMove,
  loadBattle,
  saveBattle,
  useMove,
} from './battle';
import { MoveEffects, animate, faint, popIn } from './fx';
import { neverShared, renderLog } from './log';

/**
 * EUDIMON credentials are recognised by their vct (urn:eudi:eaa:eudimon:<starter>:1),
 * so it does not matter which credential query of a presentation config the
 * wallet answered.
 */
const EUDIMON_VCT = /^urn:eudi:eaa:eudimon:([a-z]+):\d+$/;
/** Claims of the SD-JWT VC itself, shown separately from the EUDIMON's claims */
const META_CLAIMS = ['iss', 'vct', 'iat', 'exp', 'nbf', 'cnf', 'status', 'sub'];
const MOVE_SLOTS = [1, 2, 3, 4];
/** Battle messages continue on their own after this time, a click skips ahead */
const AUTO_ADVANCE_MS = 1800;

type Claims = Record<string, unknown>;
type PresentedCredential = { id?: string; values?: Claims[] };

// Use cases in src/server.ts and their presentation configs in
// eudiplo-config/playground/presentation/eudimon-*.json
function useCaseFor(request: RequestKind): string {
  return request.kind === 'send-out' ? 'eudimon-arena' : `eudimon-move-${request.slot}`;
}

function configFor(request: RequestKind): string {
  return request.kind === 'send-out' ? 'eudimon-battle' : `eudimon-move-${request.slot}`;
}

function requestedClaims(request: RequestKind): string[] {
  return request.kind === 'send-out'
    ? ['species', 'nickname', 'level']
    : ['species', 'nickname', `move_${request.slot}`];
}

const battle = getElement<HTMLDivElement>('battle');
const foeHud = getElement<HTMLDivElement>('foeHud');
const foeName = getElement<HTMLDivElement>('foeName');
const foeHp = getElement<HTMLDivElement>('foeHp');
const foeSlot = getElement<HTMLDivElement>('foeSlot');
const playerSlot = getElement<HTMLDivElement>('playerSlot');
const playerHud = getElement<HTMLDivElement>('playerHud');
const playerName = getElement<HTMLDivElement>('playerName');
const playerLevel = getElement<HTMLDivElement>('playerLevel');
const playerHp = getElement<HTMLDivElement>('playerHp');
const playerHpNumbers = getElement<HTMLDivElement>('playerHpNumbers');
const fxLayer = getElement<HTMLDivElement>('fxLayer');
const fightMenu = getElement<HTMLDivElement>('fightMenu');
const moveButtons = getElement<HTMLDivElement>('moveButtons');
const runBtn = getElement<HTMLButtonElement>('runBtn');
const verifyPanel = getElement<HTMLDivElement>('verifyPanel');
const verifyText = getElement<HTMLParagraphElement>('verifyText');
const qrFrame = getElement<HTMLDivElement>('qrFrame');
const qrCode = getElement<HTMLDivElement>('qrCode');
const walletLink = getElement<HTMLDivElement>('walletLink');
const dcApiBtn = getElement<HTMLButtonElement>('dcApiBtn');
const cancelRequestBtn = getElement<HTMLButtonElement>('cancelRequestBtn');
const verifyStatus = getElement<HTMLParagraphElement>('verifyStatus');
const resultPanel = getElement<HTMLDivElement>('resultPanel');
const resultTitle = getElement<HTMLHeadingElement>('resultTitle');
const resultFacts = getElement<HTMLDListElement>('resultFacts');
const moveSlots = getElement<HTMLOListElement>('moveSlots');
const resultNote = getElement<HTMLParagraphElement>('resultNote');
const endMenu = getElement<HTMLDivElement>('endMenu');
const againBtn = getElement<HTMLButtonElement>('againBtn');
const logPanel = getElement<HTMLElement>('logPanel');
const logSummary = getElement<HTMLParagraphElement>('logSummary');
const logList = getElement<HTMLOListElement>('logList');

const dialog = new Dialog(getElement('textbox'), getElement('dialogText'));
const effects = new MoveEffects(battle, fxLayer);

let state: BattleState | null = null;
/** The wallet request the verify panel shows */
let currentRequest: RequestKind | null = null;
/** Aborts polling of the QR code session, e.g. when switching to the DC API */
let polling: AbortController | null = null;
let turnRunning = false;

// --- Helpers ------------------------------------------------------------------------

async function say(text: string, autoMs = AUTO_ADVANCE_MS): Promise<void> {
  try {
    await dialog.say(text, autoMs);
  } catch (error) {
    if (!isCancelled(error)) {
      throw error;
    }
  }
}

function asText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

function formatTime(value: unknown): string {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString().slice(0, 16).replace('T', ' ')
    : '';
}

function setStatus(message: string, isError = false): void {
  verifyStatus.textContent = message;
  verifyStatus.classList.toggle('error', isError);
}

function spriteOf(side: Side): Element | null {
  return (side === 'you' ? playerSlot : foeSlot).firstElementChild;
}

// --- Scene ----------------------------------------------------------------------------

function resetScene(): void {
  foeSlot.replaceChildren(renderSprite('gary', { label: 'Gary' }));
  playerSlot.replaceChildren();
  foeHud.classList.add('hidden');
  playerHud.classList.add('hidden');
  fxLayer.replaceChildren();
  for (const panel of [fightMenu, verifyPanel, resultPanel, endMenu]) {
    panel.classList.add('hidden');
  }
}

function setHp(side: Side, hp: number, maxHp: number): void {
  const bar = side === 'you' ? playerHp : foeHp;
  const value = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  bar.style.width = `${value * 100}%`;
  bar.classList.toggle('mid', value <= 0.5 && value > 0.2);
  bar.classList.toggle('low', value <= 0.2);
  if (side === 'you') {
    playerHpNumbers.textContent = `${hp}/ ${maxHp}`;
  }
}

function playerSprite(player: PlayerEudimon): SVGSVGElement {
  // Unknown species (hand-crafted claims) fight as an EUDI ball
  return player.starterId
    ? renderSprite(player.starterId, { flip: true, label: `Your ${player.species}` })
    : renderSprite('ball', { label: player.species || 'EUDIMON' });
}

function showHuds(current: BattleState): void {
  foeName.textContent = upper(getStarter(current.rivalId).name);
  playerName.textContent = current.player.nickname;
  playerLevel.textContent = `:L${current.player.level}`;
  setHp('foe', current.foe.hp, current.foe.maxHp);
  setHp('you', current.you.hp, current.you.maxHp);
  foeHud.classList.remove('hidden');
  playerHud.classList.remove('hidden');
}

/** Restores the battle after the redirect back from the wallet */
function restoreScene(current: BattleState): void {
  resetScene();
  const rival = getStarter(current.rivalId);
  foeSlot.replaceChildren(renderSprite(rival.id, { label: `Gary's ${rival.name}` }));
  playerSlot.replaceChildren(playerSprite(current.player));
  showHuds(current);
  for (const side of ['you', 'foe'] as Side[]) {
    const sprite = spriteOf(side) as SVGElement | null;
    if (sprite && current[side].hp === 0) {
      sprite.style.visibility = 'hidden';
    }
  }
  renderBattleLog();
}

function showWaitingBall(): void {
  const ball = renderSprite('ball');
  ball.classList.add('wobble');
  playerSlot.replaceChildren(ball);
}

async function slideInGary(): Promise<void> {
  const gary = foeSlot.firstElementChild;
  if (gary) {
    await animate(gary, [{ transform: 'translateX(160%)' }, { transform: 'translateX(0)' }], {
      duration: 600,
      easing: 'steps(6)',
    });
  }
}

async function sendOut(current: BattleState): Promise<void> {
  const rival = getStarter(current.rivalId);

  const gary = foeSlot.firstElementChild;
  const garyLeaves = gary
    ? animate(gary, [{ transform: 'translateX(0)' }, { transform: 'translateX(160%)' }], {
        duration: 500,
        easing: 'steps(5)',
        fill: 'forwards',
      })
    : Promise.resolve();
  await Promise.all([say(`GARY sent out ${upper(rival.name)}!`), garyLeaves]);

  const foeSprite = renderSprite(rival.id, { label: `Gary's ${rival.name}` });
  foeSlot.replaceChildren(foeSprite);
  const ball = playerSlot.firstElementChild;
  if (ball) {
    await animate(ball, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'steps(2)' });
  }
  const sprite = playerSprite(current.player);
  playerSlot.replaceChildren(sprite);
  showHuds(current);
  await Promise.all([
    popIn(foeSprite),
    popIn(sprite),
    say(`Go! ${current.player.nickname}!`, 1400),
  ]);
}

// --- Fight menu ----------------------------------------------------------------------

function renderFightMenu(current: BattleState): void {
  moveButtons.replaceChildren(
    ...MOVE_SLOTS.map((slot) => {
      const known = knownMove(current, slot);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `gb-btn move-btn ${known ? 'known' : 'unknown'}`;
      const name = document.createElement('span');
      name.className = 'move-name';
      const detail = document.createElement('small');
      if (known) {
        const move = findMove(known.name);
        name.textContent = upper(move.name);
        detail.textContent = `${upper(move.type)} · known to Gary`;
        button.setAttribute('aria-label', `${move.name}, ${move.type}, Gary already knows it`);
      } else {
        name.textContent = '???';
        detail.textContent = `move_${slot} · ask wallet`;
        button.setAttribute('aria-label', `Move ${slot}, reveal it with your wallet`);
      }
      button.append(name, detail);
      button.addEventListener('click', () => void chooseMove(slot));
      return button;
    })
  );
}

function showFightMenu(): void {
  if (!state || state.outcome) {
    return;
  }
  renderFightMenu(state);
  verifyPanel.classList.add('hidden');
  fightMenu.classList.remove('hidden');
  moveButtons.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  void dialog.show(`What will ${state.player.nickname} do?`);
}

async function chooseMove(slot: number): Promise<void> {
  if (!state || state.outcome || turnRunning) {
    return;
  }
  const known = knownMove(state, slot);
  if (!known) {
    await requestFromWallet({ kind: 'move', slot });
    return;
  }
  addLog({
    turn: state.turn,
    title: `Move ${slot}`,
    method: 'No wallet request',
    requested: [],
    received: [],
    meta: [],
    note: `Gary already knows ${upper(known.name)}, so nothing new had to be disclosed.`,
  });
  await playTurn(slot);
}

async function run(): Promise<void> {
  fightMenu.classList.add('hidden');
  await say("No! There's no running from a trainer battle!");
  showFightMenu();
}

// --- Wallet requests -------------------------------------------------------------------

function describeRequest(request: RequestKind): string {
  if (request.kind === 'send-out') {
    return 'Gary asks for your EUDIMON: species, nickname and level. Its moves stay private for now.';
  }
  return `To use move ${request.slot}, your wallet shares species, nickname and move_${request.slot}. Gary learns this one move, the others stay private.`;
}

async function requestFromWallet(request: RequestKind): Promise<void> {
  polling?.abort();
  polling = new AbortController();
  const { signal } = polling;
  currentRequest = request;

  fightMenu.classList.add('hidden');
  verifyText.textContent = describeRequest(request);
  cancelRequestBtn.classList.toggle('hidden', request.kind === 'send-out');
  qrCode.replaceChildren();
  qrFrame.classList.remove('hidden');
  walletLink.classList.add('hidden');
  setStatus('Preparing the request...');
  verifyPanel.classList.remove('hidden');
  void dialog.show(
    request.kind === 'send-out'
      ? 'Which EUDIMON will you send out? Scan the code with your EUDI Wallet.'
      : `Reveal move ${request.slot} with your EUDI Wallet.`
  );

  try {
    const result = await createVerificationRequest(
      useCaseFor(request),
      buildRedirectUrl('{sessionId}')
    );
    signal.throwIfAborted();
    if (state) {
      // Kept for the same-device flow, the wallet redirects back to a fresh page
      state.pending = { ...request, sessionId: result.sessionId };
      saveBattle(state);
    }
    await generateQRCode(qrCode, result.crossDeviceUri ?? result.uri);
    renderWalletLink(walletLink, result.uri);
    setStatus('Waiting for your wallet...');

    const session = await waitForSession(result.sessionId, { signal, onUpdate: onSessionUpdate });
    await applyResponse(request, session.credentials, 'QR code / link', result.sessionId);
  } catch (error) {
    if (!isCancelled(error)) {
      await showRequestError(error);
    }
  }
}

async function requestWithDcApi(): Promise<void> {
  const request = currentRequest;
  if (!request) {
    return;
  }
  polling?.abort();
  dcApiBtn.disabled = true;
  setStatus('Opening your browser wallet...');
  try {
    const result = await verifyWithDcApi(useCaseFor(request), (status) => setStatus(status));
    await applyResponse(request, result.credentials, 'DC API', result.sessionId);
  } catch (error) {
    await showRequestError(error);
  } finally {
    dcApiBtn.disabled = false;
  }
}

function cancelRequest(): void {
  polling?.abort();
  if (state) {
    state.pending = undefined;
    saveBattle(state);
  }
  showFightMenu();
}

function onSessionUpdate(session: Session): void {
  if (session.status === 'fetched') {
    setStatus('Your wallet opened the request...');
  } else if (session.status === 'processing') {
    setStatus('Checking your EUDIMON...');
  }
}

async function showRequestError(error: unknown): Promise<void> {
  console.error('EUDIMON request failed', error);
  const message = error instanceof Error ? error.message : String(error);
  setStatus(`Error: ${message}`, true);
  qrFrame.classList.toggle('hidden', !qrCode.hasChildNodes());
  verifyPanel.classList.remove('hidden');
  if (currentRequest?.kind === 'move') {
    cancelRequestBtn.classList.remove('hidden');
    await dialog.show('The wallet request failed. Try again or pick another move.');
  } else {
    endMenu.classList.remove('hidden');
    againBtn.focus();
    await dialog.show('The battle was called off. Want to try again?');
  }
}

function findEudimonClaims(credentials: PresentedCredential[] | undefined): Claims | undefined {
  return credentials
    ?.flatMap((credential) => credential.values ?? [])
    .find((claims) => EUDIMON_VCT.test(asText(claims.vct)));
}

function readPlayer(claims: Claims): PlayerEudimon {
  const species = asText(claims.species);
  const fromVct = EUDIMON_VCT.exec(asText(claims.vct))?.[1];
  return {
    species,
    nickname: upper(asText(claims.nickname) || species || 'EUDIMON'),
    level: Number(claims.level) || STARTER_LEVEL,
    starterId: (findStarter(species) ?? STARTERS.find((s) => s.id === fromVct))?.id,
  };
}

function logEntry(
  current: BattleState,
  request: RequestKind,
  claims: Claims,
  method: string,
  sessionId: string | undefined
): LogEntry {
  return {
    turn: current.turn,
    title: request.kind === 'send-out' ? 'Send out' : `Move ${request.slot}`,
    configId: configFor(request),
    method,
    sessionId,
    requested: requestedClaims(request),
    received: Object.entries(claims)
      .filter(([claim]) => !META_CLAIMS.includes(claim))
      .map(([claim, value]) => [claim, asText(value) || JSON.stringify(value)]),
    meta: (
      [
        ['Issuer', asText(claims.iss)],
        ['vct', asText(claims.vct)],
        ['Issued', formatTime(claims.iat)],
        ['Expires', formatTime(claims.exp)],
      ] as [string, string][]
    ).filter(([, value]) => value),
  };
}

function addLog(entry: LogEntry): void {
  if (!state) {
    return;
  }
  state.log.push(entry);
  saveBattle(state);
  renderBattleLog();
}

function renderBattleLog(): void {
  if (!state) {
    logPanel.classList.add('hidden');
    return;
  }
  renderLog(logList, logSummary, state.log);
  logPanel.classList.remove('hidden');
}

async function applyResponse(
  request: RequestKind,
  credentials: unknown,
  method: string,
  sessionId: string | undefined
): Promise<void> {
  verifyPanel.classList.add('hidden');
  if (sessionId && state?.handled.includes(sessionId)) {
    return;
  }

  const claims = findEudimonClaims(credentials as PresentedCredential[] | undefined);
  if (!claims) {
    await say("GARY: Huh? That's not an EUDIMON!", 0);
    if (request.kind === 'move' && state) {
      showFightMenu();
    } else {
      endMenu.classList.remove('hidden');
    }
    return;
  }

  if (request.kind === 'send-out') {
    state = createBattle(readPlayer(claims));
    if (sessionId) {
      state.handled.push(sessionId);
    }
    state.log.push(logEntry(state, request, claims, method, sessionId));
    saveBattle(state);
    renderBattleLog();
    await sendOut(state);
    showFightMenu();
    return;
  }

  if (!state) {
    await showRequestError(new Error('There is no battle running'));
    return;
  }
  state.pending = undefined;
  if (sessionId) {
    state.handled.push(sessionId);
  }
  const entry = logEntry(state, request, claims, method, sessionId);

  // The wallet picks the first matching credential, so it can be another EUDIMON
  const presented = readPlayer(claims);
  if (presented.nickname !== state.player.nickname || presented.species !== state.player.species) {
    entry.note = `The wallet shared ${presented.nickname}, not ${state.player.nickname}, so Gary ignored it.`;
    addLog(entry);
    await say("GARY: Hey! That's not the EUDIMON you sent out!");
    showFightMenu();
    return;
  }

  const moveName = asText(claims[`move_${request.slot}`]);
  if (!moveName) {
    entry.note = `The wallet did not share move_${request.slot}.`;
    addLog(entry);
    await say(`${state.player.nickname} doesn't know which move to use...`);
    showFightMenu();
    return;
  }

  state.knownMoves.push({ slot: request.slot, name: moveName });
  addLog(entry);
  await playTurn(request.slot);
}

// --- Turns ------------------------------------------------------------------------------

async function playEvents(events: BattleEvent[]): Promise<void> {
  for (const event of events) {
    switch (event.type) {
      case 'use': {
        const attacker = spriteOf(event.side);
        const defender = spriteOf(event.side === 'you' ? 'foe' : 'you');
        void dialog.show(event.text);
        await sleep(600);
        if (attacker && defender) {
          await effects.play(event.move, attacker, defender);
        }
        break;
      }
      case 'hp':
        setHp(event.side, event.hp, event.maxHp);
        await sleep(700);
        break;
      case 'text':
        await say(event.text);
        break;
      case 'faint': {
        const sprite = spriteOf(event.side);
        if (sprite) {
          await faint(sprite);
        }
        await say(event.text);
        break;
      }
    }
  }
}

async function playTurn(slot: number): Promise<void> {
  const current = state;
  const known = current ? knownMove(current, slot) : undefined;
  if (!current || !known) {
    return;
  }
  turnRunning = true;
  fightMenu.classList.add('hidden');

  await playEvents(useMove(current, 'you', findMove(known.name)));
  if (!current.outcome) {
    await playEvents(useMove(current, 'foe', garysMove(current)));
  }
  if (!current.outcome) {
    await playEvents(endTurn(current));
  }
  saveBattle(current);
  renderBattleLog();
  turnRunning = false;

  if (current.outcome) {
    await finishBattle(current);
  } else {
    showFightMenu();
  }
}

async function finishBattle(current: BattleState): Promise<void> {
  fightMenu.classList.add('hidden');
  if (current.outcome === 'won') {
    music.jingle(FANFARE, LAB_THEME);
    await say('GARY: WHAT?! My EUDIMON lost?');
    await say(`GARY: Fine, ${current.player.nickname} is not bad. Smell ya later!`);
  } else {
    music.setBackground(LAB_THEME);
    await say(`${current.player.nickname} has no strength left!`);
    await say('GARY: Hah! Told you mine is stronger! Smell ya later!');
  }
  showSummary(current);
}

function showSummary(current: BattleState): void {
  resultTitle.textContent =
    current.outcome === 'won' ? 'You won! What Gary learned' : 'What Gary learned';
  const facts: [string, string][] = [
    ['Species', upper(current.player.species || '?')],
    ['Nickname', current.player.nickname],
    ['Level', String(current.player.level)],
  ];
  resultFacts.replaceChildren(
    ...facts.flatMap(([label, value]) => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      return [dt, dd];
    })
  );

  moveSlots.replaceChildren(
    ...MOVE_SLOTS.map((slot) => {
      const known = knownMove(current, slot);
      const item = document.createElement('li');
      const label = document.createElement('small');
      item.className = `move-slot ${known ? 'revealed' : 'hidden-move'}`;
      if (known) {
        label.textContent = `move_${slot} · ${upper(findMove(known.name).type)}`;
        item.append(label, upper(known.name));
      } else {
        label.textContent = `move_${slot} · never disclosed`;
        item.append(label, '???');
      }
      return item;
    })
  );

  const requests = current.log.filter((entry) => entry.configId).length;
  const hidden = neverShared(current.log);
  resultNote.textContent =
    `${requests} wallet request${requests === 1 ? '' : 's'}, ${current.knownMoves.length} of 4 moves revealed. ` +
    `Gary never saw: ${hidden.join(', ') || 'nothing'}.`;

  resultPanel.classList.remove('hidden');
  endMenu.classList.remove('hidden');
  againBtn.focus({ preventScroll: true });
  void dialog.show(`${current.player.nickname} is ready for the next battle!`);
}

// --- Start --------------------------------------------------------------------------------

async function newBattle(intro: boolean): Promise<void> {
  polling?.abort();
  clearBattle();
  state = null;
  renderBattleLog();
  resetScene();
  music.setBackground(BATTLE_THEME);
  void slideInGary();
  if (intro) {
    await say('GARY wants to battle!', 1600);
    await say('GARY: Hey! My EUDIMON is way stronger than yours!', 2200);
  } else {
    await say('GARY: Again? Bring it on!', 1600);
  }
  showWaitingBall();
  await requestFromWallet({ kind: 'send-out' });
}

/** Same-device flow: the wallet redirected back with ?session=... */
async function resume(sessionId: string): Promise<void> {
  const saved = loadBattle();
  clearSessionFromUrl();

  if (saved?.handled.includes(sessionId)) {
    // Another tab already applied this response
    state = saved;
    restoreScene(saved);
    if (saved.outcome) {
      showSummary(saved);
    } else {
      showFightMenu();
    }
    return;
  }

  let request: RequestKind = { kind: 'send-out' };
  if (saved?.pending?.sessionId === sessionId && !saved.outcome) {
    state = saved;
    restoreScene(saved);
    request = saved.pending.kind === 'move' ? { kind: 'move', slot: saved.pending.slot } : request;
  } else {
    clearBattle();
    resetScene();
    showWaitingBall();
  }
  currentRequest = request;
  void dialog.show('Your EUDIMON is on its way back from your wallet...');

  try {
    const session = await waitForSession(sessionId, { onUpdate: onSessionUpdate });
    await applyResponse(request, session.credentials, 'Same device', sessionId);
  } catch (error) {
    await showRequestError(error);
  }
}

function init(): void {
  setupMusic(getElement<HTMLButtonElement>('musicToggle'), BATTLE_THEME);
  resetScene();
  againBtn.addEventListener('click', () => void newBattle(false));
  dcApiBtn.addEventListener('click', () => void requestWithDcApi());
  cancelRequestBtn.addEventListener('click', cancelRequest);
  runBtn.addEventListener('click', () => void run());
  enableMenuKeys(endMenu);
  enableMenuKeys(fightMenu);
  if (isDcApiAvailable()) {
    dcApiBtn.classList.remove('hidden');
  }

  const sessionId = getSessionFromUrl();
  if (sessionId) {
    void resume(sessionId);
  } else {
    void newBattle(true);
  }
}

init();
