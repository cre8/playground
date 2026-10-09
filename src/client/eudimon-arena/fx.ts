/**
 * Move animations of the EUDIMON arena. They work in both directions: your
 * EUDIMON attacks from the bottom left, Gary's from the top right.
 */

import { type Move, reducedMotion, sleep } from '../shared/eudimon';
import { music } from '../shared/eudimon-music';

interface Point {
  x: number;
  y: number;
}

export function animate(
  element: Element,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions
): Promise<unknown> {
  if (reducedMotion) {
    return Promise.resolve();
  }
  return element.animate(keyframes, options).finished.catch(() => undefined);
}

/** Sprites grow in when they are sent out, like in Gen 1 */
export async function popIn(element: Element): Promise<void> {
  await animate(
    element,
    [
      { transform: 'scale(0.2)', transformOrigin: 'bottom center' },
      { transform: 'scale(1)', transformOrigin: 'bottom center' },
    ],
    { duration: 360, easing: 'steps(4)' }
  );
}

/** A fainted EUDIMON sinks out of sight */
export async function faint(element: Element): Promise<void> {
  await animate(
    element,
    [
      { transform: 'translateY(0)', clipPath: 'inset(0 0 0 0)' },
      { transform: 'translateY(100%)', clipPath: 'inset(0 0 100% 0)' },
    ],
    { duration: 600, easing: 'steps(6)', fill: 'forwards' }
  );
  (element as HTMLElement | SVGElement).style.visibility = 'hidden';
}

/** The target of a move blinks, with a hit sound */
export async function blink(element: Element, times = 3): Promise<void> {
  music.hit();
  await animate(
    element,
    [
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: 0.49 },
      { opacity: 0, offset: 0.5 },
      { opacity: 0, offset: 1 },
    ],
    { duration: 200, iterations: times }
  );
}

export class MoveEffects {
  constructor(
    private readonly battle: HTMLElement,
    private readonly layer: HTMLElement
  ) {}

  async play(move: Move, attacker: Element, defender: Element): Promise<void> {
    if (reducedMotion) {
      if (move.power > 0) {
        music.hit();
      }
      return;
    }
    const from = this.centerOf(attacker);
    const to = this.centerOf(defender);
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const direction = { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
    const along = (distance: number): Point => ({
      x: from.x + direction.x * distance,
      y: from.y + direction.y * distance,
    });

    switch (move.fx) {
      case 'scratch': {
        for (const offset of [-14, 0, 14]) {
          const slash = this.spawn('fx-slash', { x: to.x + offset, y: to.y + offset / 2 }, -50);
          await sleep(110);
          setTimeout(() => slash.remove(), 300);
        }
        await blink(defender);
        break;
      }
      case 'tackle': {
        await this.lunge(attacker, direction);
        const star = this.spawn('fx-star', to);
        await blink(defender);
        star.remove();
        break;
      }
      case 'ember': {
        await Promise.all(
          [0, 140, 280].map((delay) => this.fly('fx-flame', from, to, { delay, arc: 20 }))
        );
        await this.flash(1);
        await blink(defender);
        break;
      }
      case 'bubble': {
        await Promise.all(
          [0, 120, 240, 360].map((delay, i) =>
            this.fly('fx-bubble', from, to, { delay, arc: i % 2 ? 30 : -10 })
          )
        );
        await blink(defender);
        break;
      }
      case 'water': {
        await Promise.all(
          [0, 50, 100, 150, 200, 250, 300].map((delay) =>
            this.fly('fx-drop', from, to, { delay, duration: 350 })
          )
        );
        await blink(defender);
        break;
      }
      case 'vine': {
        for (const angle of [35, -35]) {
          const vine = this.spawn('fx-vine', to, angle);
          await sleep(180);
          vine.remove();
        }
        await blink(defender);
        break;
      }
      case 'seed': {
        await Promise.all(
          [0, 160].map((delay) => this.fly('fx-seed', from, to, { delay, arc: 60 }))
        );
        const seeds = [
          this.spawn('fx-seed', { x: to.x - 10, y: to.y + 20 }),
          this.spawn('fx-seed', { x: to.x + 12, y: to.y + 24 }),
        ];
        await blink(defender, 2);
        seeds.forEach((seed) => seed.remove());
        break;
      }
      case 'growl': {
        // Sound waves from the attacker towards the target
        const rotate = direction.x < 0 ? 180 : 0;
        await Promise.all(
          [0, 150, 300].map((delay) =>
            this.fly('fx-wave', along(40), along(120), { delay, duration: 400, rotate })
          )
        );
        break;
      }
      case 'leer': {
        await this.flash(2);
        break;
      }
      case 'tailwhip': {
        await this.wiggle(attacker);
        break;
      }
    }
  }

  private centerOf(element: Element): Point {
    const area = this.battle.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return { x: box.left - area.left + box.width / 2, y: box.top - area.top + box.height / 2 };
  }

  private spawn(className: string, at: Point, rotate = 0): HTMLDivElement {
    const fx = document.createElement('div');
    fx.className = `fx ${className}`;
    this.layer.append(fx);
    fx.style.transform = place(fx, at, rotate);
    return fx;
  }

  private async fly(
    className: string,
    from: Point,
    to: Point,
    options: { duration?: number; delay?: number; arc?: number; rotate?: number } = {}
  ): Promise<void> {
    const { duration = 450, delay = 0, arc = 0, rotate = 0 } = options;
    const fx = this.spawn(className, from, rotate);
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - arc };
    await animate(
      fx,
      [
        { transform: place(fx, from, rotate) },
        { transform: place(fx, middle, rotate) },
        { transform: place(fx, to, rotate) },
      ],
      { duration, delay, easing: 'steps(8)', fill: 'both' }
    );
    fx.remove();
  }

  private async flash(times = 2): Promise<void> {
    for (let i = 0; i < times; i++) {
      this.battle.classList.add('flash');
      await sleep(90);
      this.battle.classList.remove('flash');
      await sleep(90);
    }
  }

  private async lunge(attacker: Element, direction: Point): Promise<void> {
    const x = Math.round(direction.x * 30);
    const y = Math.round(direction.y * 30);
    await animate(
      attacker,
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${x}px, ${y}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: 320, easing: 'steps(4)' }
    );
  }

  private async wiggle(attacker: Element): Promise<void> {
    await animate(
      attacker,
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-8px)' },
        { transform: 'translateX(8px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 300, iterations: 3, easing: 'steps(4)' }
    );
  }
}

function place(fx: HTMLElement, at: Point, rotate = 0): string {
  return `translate(${at.x - fx.offsetWidth / 2}px, ${at.y - fx.offsetHeight / 2}px) rotate(${rotate}deg)`;
}
