/**
 * EUDIMON: Game Boy style UI helpers shared by Professor Oak's lab (issuance)
 * and the arena (verification), plus the game data of src/shared/eudimon-rules.ts.
 */

import { SPRITES, type SpriteName } from './eudimon-sprites';

// Game data and battle rules, also used by the server to referee the arena
export * from '../../shared/eudimon-rules';

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
