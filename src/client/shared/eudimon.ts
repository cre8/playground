/**
 * EUDIMON: game data and Game Boy style UI helpers shared by Professor Oak's
 * lab (issuance) and the arena (verification).
 */

import { SPRITES, type SpriteName } from './eudimon-sprites';

export type EudimonType = 'Normal' | 'Fire' | 'Water' | 'Grass' | 'Poison';

/** How a move is animated in the arena */
export type MoveFx =
  | 'scratch'
  | 'tackle'
  | 'ember'
  | 'bubble'
  | 'water'
  | 'vine'
  | 'seed'
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
};

export type StarterId = 'bulbasaur' | 'charmander' | 'squirtle';

export interface Starter {
  id: StarterId;
  name: string;
  dex: number;
  types: EudimonType[];
  /** The first two are the moves a starter knows at level 5 in Red/Blue */
  moves: [string, string, string, string];
  /** Gary picks the starter with the type advantage, like the rival in Red/Blue */
  rival: StarterId;
  /** HP at level 5 */
  hp: number;
}

export const STARTER_LEVEL = 5;

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

export function getStarter(id: StarterId): Starter {
  return STARTERS.find((s) => s.id === id)!;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Looks up a starter by its species name, case-insensitive */
export function findStarter(species: string): Starter | undefined {
  return STARTERS.find((s) => normalize(s.name) === normalize(species));
}

/** Moves that are not in the table (e.g. hand-crafted claims) act like a plain hit */
export function findMove(name: string): Move {
  const known = Object.values(MOVES).find((m) => normalize(m.name) === normalize(name));
  return known ?? { name, type: 'Normal', power: 35, pp: 35, fx: 'tackle' };
}

// Gen 1 type chart, reduced to the types of the three starters
const EFFECTIVENESS: Partial<Record<EudimonType, Partial<Record<EudimonType, number>>>> = {
  Fire: { Grass: 2, Fire: 0.5, Water: 0.5 },
  Water: { Fire: 2, Water: 0.5, Grass: 0.5 },
  Grass: { Water: 2, Fire: 0.5, Grass: 0.5, Poison: 0.5 },
  Poison: { Grass: 2, Poison: 0.5 },
};

export function effectiveness(moveType: EudimonType, defender: EudimonType[]): number {
  return defender.reduce((factor, type) => factor * (EFFECTIVENESS[moveType]?.[type] ?? 1), 1);
}

export function upper(value: string): string {
  return value.toUpperCase();
}

// --- Sprites -----------------------------------------------------------------

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Renders a pixel sprite as an SVG with one path per palette colour, in the
 * sprite's own four colour palette. The size follows the CSS variable
 * --sprite-scale (size of one sprite pixel). `flip` mirrors the sprite, front
 * sprites face left.
 */
export function renderSprite(
  name: SpriteName,
  options: { flip?: boolean; label?: string } = {}
): SVGSVGElement {
  const { palette, rows } = SPRITES[name];
  const height = rows.length;
  const width = rows[0].length;
  const paths: Record<string, string> = { '0': '', '1': '', '2': '', '3': '' };

  rows.forEach((row, y) => {
    let x = 0;
    while (x < width) {
      const colour = row[x];
      let end = x + 1;
      while (end < width && row[end] === colour) {
        end++;
      }
      if (colour !== '.') {
        const left = options.flip ? width - end : x;
        paths[colour] += `M${left} ${y}h${end - x}v1h-${end - x}z`;
      }
      x = end;
    }
  });

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.classList.add('sprite');
  svg.style.width = `calc(${width} * var(--sprite-scale))`;
  svg.style.height = `calc(${height} * var(--sprite-scale))`;
  if (options.label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', options.label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }

  for (const [colour, d] of Object.entries(paths)) {
    if (d) {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', palette[Number(colour)]);
      svg.appendChild(path);
    }
  }
  return svg;
}

// --- Dialog box --------------------------------------------------------------

export class DialogCancelled extends Error {
  constructor() {
    super('Dialog cancelled');
    this.name = 'DialogCancelled';
  }
}

export function isCancelled(error: unknown): boolean {
  return (
    error instanceof DialogCancelled ||
    (error instanceof DOMException && error.name === 'AbortError')
  );
}

export const reducedMotion =
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const TYPE_DELAY_MS = 18;

/**
 * Gen 1 style text box: text is typed letter by letter, a blinking arrow
 * shows that a click, Enter, Space or A continues. A click while typing shows
 * the whole text at once.
 */
export class Dialog {
  private token = 0;
  private skipTyping: (() => void) | null = null;
  private advance: (() => void) | null = null;
  private reject: ((error: Error) => void) | null = null;

  constructor(
    private readonly box: HTMLElement,
    private readonly textElement: HTMLElement
  ) {
    box.addEventListener('click', () => this.next());
    document.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if ((key === 'enter' || key === ' ' || key === 'a') && !isInteractive(event.target)) {
        if (this.skipTyping || this.advance) {
          event.preventDefault();
          this.next();
        }
      }
    });
  }

  /** Types the text and waits for the player, or `autoMs` if set */
  async say(text: string, autoMs = 0): Promise<void> {
    const token = await this.type(text);
    this.box.classList.add('can-advance');
    try {
      await new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        this.reject = reject;
        this.advance = () => {
          clearTimeout(timer);
          resolve();
        };
        if (autoMs > 0) {
          timer = setTimeout(() => this.advance?.(), autoMs);
        }
      });
    } finally {
      if (token === this.token) {
        this.advance = null;
        this.reject = null;
        this.box.classList.remove('can-advance');
      }
    }
  }

  /** Types the text without waiting, e.g. as a prompt for a menu */
  async show(text: string): Promise<void> {
    try {
      await this.type(text);
    } catch (error) {
      if (!isCancelled(error)) {
        throw error;
      }
    }
  }

  /** Stops the current text, a pending say() rejects with DialogCancelled */
  cancel(): void {
    this.token++;
    this.skipTyping?.();
    this.reject?.(new DialogCancelled());
    this.skipTyping = null;
    this.advance = null;
    this.reject = null;
    this.box.classList.remove('can-advance');
  }

  private next(): void {
    if (this.skipTyping) {
      this.skipTyping();
    } else {
      this.advance?.();
    }
  }

  private async type(text: string): Promise<number> {
    this.cancel();
    const token = this.token;
    this.textElement.textContent = '';

    if (reducedMotion) {
      this.textElement.textContent = text;
      return token;
    }

    await new Promise<void>((resolve) => {
      let index = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        clearTimeout(timer);
        this.skipTyping = null;
        if (token === this.token) {
          this.textElement.textContent = text;
        }
        resolve();
      };
      const step = () => {
        index++;
        this.textElement.textContent = text.slice(0, index);
        if (index >= text.length) {
          finish();
        } else {
          timer = setTimeout(step, TYPE_DELAY_MS);
        }
      };
      this.skipTyping = finish;
      step();
    });

    if (token !== this.token) {
      throw new DialogCancelled();
    }
    return token;
  }
}

function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest('a, button, input, select, textarea, [contenteditable="true"]')
  );
}

/** Lets arrow keys move the focus between the buttons of a menu box */
export function enableMenuKeys(menu: HTMLElement): void {
  menu.addEventListener('keydown', (event) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      return;
    }
    const items = [...menu.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')].filter(
      (item) => item.offsetParent !== null
    );
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (current === -1 || items.length === 0) {
      return;
    }
    event.preventDefault();
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1;
    items[(current + delta + items.length) % items.length].focus();
  });
}

/** Link button that opens the wallet on this device */
export function renderWalletLink(container: HTMLElement, uri: string): void {
  container.innerHTML = '';
  const link = document.createElement('a');
  link.href = uri;
  link.className = 'gb-btn primary';
  link.textContent = 'Open in wallet';
  container.appendChild(link);
  container.classList.remove('hidden');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : ms));
}
