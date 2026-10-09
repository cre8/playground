/**
 * EUDIMON - Professor Oak's lab
 * Pick one of the three starters and receive it as a credential via the
 * pre-authorized code flow. Every starter has its own credential config
 * (eudimon-<starter>), so the wallet shows a card with the right EUDIMON.
 */

import { createIssuanceOffer, generateQRCode, waitForSession, getElement } from '../shared/utils';
import {
  Dialog,
  STARTERS,
  STARTER_LEVEL,
  type Starter,
  enableMenuKeys,
  getStarter,
  isCancelled,
  renderSprite,
  renderWalletLink,
  upper,
} from '../shared/eudimon';
import { FANFARE, LAB_THEME, music, setupMusic } from '../shared/eudimon-music';

const oakSprite = getElement<HTMLDivElement>('oakSprite');
const garySprite = getElement<HTMLDivElement>('garySprite');
const tablePanel = getElement<HTMLDivElement>('tablePanel');
const ballRow = getElement<HTMLDivElement>('ballRow');
const dexPanel = getElement<HTMLDivElement>('dexPanel');
const dexSprite = getElement<HTMLDivElement>('dexSprite');
const dexNumber = getElement<HTMLDivElement>('dexNumber');
const dexName = getElement<HTMLDivElement>('dexName');
const dexType = getElement<HTMLDivElement>('dexType');
const dexMoves = getElement<HTMLOListElement>('dexMoves');
const namePanel = getElement<HTMLFormElement>('namePanel');
const trainerInput = getElement<HTMLInputElement>('trainerName');
const nicknameInput = getElement<HTMLInputElement>('nickname');
const usePinInput = getElement<HTMLInputElement>('usePin');
const issueBtn = getElement<HTMLButtonElement>('issueBtn');
const backBtn = getElement<HTMLButtonElement>('backBtn');
const offerPanel = getElement<HTMLDivElement>('offerPanel');
const qrFrame = getElement<HTMLDivElement>('qrFrame');
const qrCode = getElement<HTMLDivElement>('qrCode');
const walletLink = getElement<HTMLDivElement>('walletLink');
const pinBox = getElement<HTMLDivElement>('pinBox');
const pinValue = getElement<HTMLElement>('pinValue');
const copyPinBtn = getElement<HTMLButtonElement>('copyPinBtn');
const offerStatus = getElement<HTMLParagraphElement>('offerStatus');
const confirmMenu = getElement<HTMLDivElement>('confirmMenu');
const yesBtn = getElement<HTMLButtonElement>('yesBtn');
const noBtn = getElement<HTMLButtonElement>('noBtn');
const doneMenu = getElement<HTMLDivElement>('doneMenu');
const againBtn = getElement<HTMLButtonElement>('againBtn');

const dialog = new Dialog(getElement('textbox'), getElement('dialogText'));
/** Dialog lines continue on their own after this time, a click skips ahead */
const AUTO_ADVANCE_MS = 2600;
const ballButtons = new Map<string, HTMLButtonElement>();

let selected: Starter | null = null;
let busy = false;

function showPanel(panel: HTMLElement): void {
  for (const p of [tablePanel, dexPanel, namePanel, offerPanel]) {
    p.classList.toggle('hidden', p !== panel);
  }
}

function setBalls(options: {
  selected?: Starter | null;
  taken?: Starter[];
  disabled?: boolean;
}): void {
  for (const starter of STARTERS) {
    const button = ballButtons.get(starter.id)!;
    button.classList.toggle('selected', options.selected?.id === starter.id);
    button.style.visibility = options.taken?.includes(starter) ? 'hidden' : '';
    button.disabled = options.disabled ?? false;
  }
}

function renderBalls(): void {
  for (const starter of STARTERS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ball-btn';
    button.setAttribute('aria-label', `${starter.name}, ${starter.types.join('/')} type`);
    const label = document.createElement('span');
    label.textContent = upper(starter.types[0]);
    button.append(renderSprite('ball'), label);
    button.addEventListener('click', () => void choose(starter));
    ballButtons.set(starter.id, button);
    ballRow.append(button);
  }
}

function renderDex(starter: Starter): void {
  dexSprite.replaceChildren(renderSprite(starter.id, { label: starter.name }));
  dexNumber.textContent = `No.${String(starter.dex).padStart(3, '0')}`;
  dexName.textContent = upper(starter.name);
  dexType.textContent = `Type/${upper(starter.types.join('/'))}`;
  dexMoves.replaceChildren(
    ...starter.moves.map((move, index) => {
      const item = document.createElement('li');
      const slot = document.createElement('span');
      slot.textContent = `${index + 1} `;
      item.append(slot, upper(move));
      return item;
    })
  );
}

async function say(...lines: string[]): Promise<void> {
  try {
    for (const line of lines) {
      await dialog.say(line, AUTO_ADVANCE_MS);
    }
  } catch (error) {
    if (!isCancelled(error)) {
      throw error;
    }
  }
}

async function intro(): Promise<void> {
  await say(
    'OAK: Ah, there you are! Welcome to my EUDIMON lab.',
    'There are three EUDI BALLS on the table. Each one holds an EUDIMON!',
    'You can have one. Go on, choose!'
  );
  if (!selected) {
    await dialog.show('Which EUDIMON do you want?');
  }
}

async function choose(starter: Starter): Promise<void> {
  if (busy) {
    return;
  }
  selected = starter;
  setBalls({ selected: starter });
  renderDex(starter);
  showPanel(dexPanel);
  confirmMenu.classList.remove('hidden');
  yesBtn.focus();
  await dialog.show(`So! You want ${upper(starter.name)}, the ${upper(starter.types[0])} EUDIMON?`);
}

async function backToTable(): Promise<void> {
  selected = null;
  setBalls({});
  confirmMenu.classList.add('hidden');
  showPanel(tablePanel);
  ballButtons.get(STARTERS[0].id)?.focus();
  await dialog.show('Which EUDIMON do you want?');
}

async function askName(): Promise<void> {
  if (!selected) {
    return;
  }
  confirmMenu.classList.add('hidden');
  nicknameInput.placeholder = upper(selected.name);
  showPanel(namePanel);
  trainerInput.focus();
  trainerInput.select();
  await dialog.show(
    `OAK: What is your name? You can also give ${upper(selected.name)} a nickname.`
  );
}

function generateTrainerId(): string {
  // Gen 1 trainer IDs are 16 bit numbers
  return Math.floor(Math.random() * 65536)
    .toString()
    .padStart(5, '0');
}

async function issue(): Promise<void> {
  const starter = selected;
  if (!starter || busy) {
    return;
  }

  const trainer = upper(trainerInput.value.trim());
  if (!trainer) {
    trainerInput.focus();
    await dialog.show('OAK: Please tell me your name first!');
    return;
  }
  const nickname = upper(nicknameInput.value.trim()) || upper(starter.name);

  const claims = {
    species: starter.name,
    nickname,
    dex_number: starter.dex,
    type: starter.types.join('/'),
    level: STARTER_LEVEL,
    trainer_name: trainer,
    trainer_id: generateTrainerId(),
    move_1: starter.moves[0],
    move_2: starter.moves[1],
    move_3: starter.moves[2],
    move_4: starter.moves[3],
  };

  busy = true;
  issueBtn.disabled = true;
  backBtn.disabled = true;
  setBalls({ selected: starter, disabled: true });

  try {
    void dialog.show('OAK: Just a moment...');
    const result = await createIssuanceOffer(`eudimon-${starter.id}`, {
      claims,
      useTxCode: usePinInput.checked,
    });

    showPanel(offerPanel);
    qrFrame.classList.remove('hidden');
    await generateQRCode(qrCode, result.uri);
    renderWalletLink(walletLink, result.uri);
    if (result.txCode) {
      pinValue.textContent = result.txCode;
      pinBox.classList.remove('hidden');
    } else {
      pinBox.classList.add('hidden');
    }
    setStatus(
      result.txCode
        ? 'Scan the code and enter the PIN in your wallet'
        : 'Scan the code with your EUDI Wallet'
    );
    void dialog.show(`OAK: Here is your ${nickname}! Take it with you in your EUDI Wallet.`);

    await waitForSession(result.sessionId, {
      flow: 'issuance',
      onUpdate: (session) => {
        if (session.status === 'pending') {
          setStatus('Waiting for your wallet to accept...');
        } else if (session.status === 'processing') {
          setStatus(`Transferring ${nickname}...`);
        }
      },
    });

    await received(starter, trainer, nickname);
  } catch (error) {
    console.error('EUDIMON issuance failed', error);
    const message = error instanceof Error ? error.message : 'Issuance failed';
    setStatus(`Error: ${message}`, true);
    qrFrame.classList.toggle('hidden', !qrCode.hasChildNodes());
    showPanel(offerPanel);
    doneMenu.classList.remove('hidden');
    againBtn.focus();
    await dialog.show('OAK: Hmm, something went wrong. Shall we try again?');
  } finally {
    busy = false;
    issueBtn.disabled = false;
    backBtn.disabled = false;
  }
}

async function received(starter: Starter, trainer: string, nickname: string): Promise<void> {
  const rival = getStarter(starter.rival);

  setBalls({ taken: [starter], disabled: true });
  showPanel(tablePanel);
  music.jingle(FANFARE);
  await say(`${trainer} received ${nickname}!`);

  garySprite.classList.remove('hidden');
  garySprite.classList.add('enter-right');
  await say('GARY: Gramps! I want an EUDIMON too!');
  setBalls({ taken: [starter, rival], disabled: true });
  await say(`GARY: I'll take ${upper(rival.name)}! It beats your ${upper(starter.name)} anyway.`);

  doneMenu.classList.remove('hidden');
  doneMenu.querySelector<HTMLElement>('a')?.focus();
  await dialog.show(`GARY: ${trainer}! Let's battle in the arena. Smell ya later!`);
}

function setStatus(message: string, isError = false): void {
  offerStatus.textContent = message;
  offerStatus.classList.toggle('error', isError);
}

async function startOver(): Promise<void> {
  doneMenu.classList.add('hidden');
  garySprite.classList.add('hidden');
  garySprite.classList.remove('enter-right');
  qrCode.replaceChildren();
  walletLink.classList.add('hidden');
  pinBox.classList.add('hidden');
  setStatus('Scan the code with your EUDI Wallet');
  await backToTable();
}

async function copyPin(): Promise<void> {
  try {
    await navigator.clipboard.writeText(pinValue.textContent ?? '');
    copyPinBtn.textContent = 'Copied';
    setTimeout(() => {
      copyPinBtn.textContent = 'Copy';
    }, 1500);
  } catch (error) {
    console.error('Failed to copy PIN', error);
  }
}

function init(): void {
  oakSprite.append(renderSprite('oak', { label: 'Professor Oak' }));
  garySprite.append(renderSprite('gary', { label: 'Gary' }));
  renderBalls();
  setupMusic(getElement<HTMLButtonElement>('musicToggle'), LAB_THEME);

  yesBtn.addEventListener('click', () => void askName());
  noBtn.addEventListener('click', () => void backToTable());
  backBtn.addEventListener('click', () => void backToTable());
  namePanel.addEventListener('submit', (event) => {
    event.preventDefault();
    void issue();
  });
  againBtn.addEventListener('click', () => void startOver());
  copyPinBtn.addEventListener('click', () => void copyPin());
  enableMenuKeys(confirmMenu);
  enableMenuKeys(doneMenu);
  enableMenuKeys(ballRow);

  void intro();
}

init();
