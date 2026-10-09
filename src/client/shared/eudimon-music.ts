/**
 * EUDIMON music: original 8-bit tunes in the style of the Gen 1 games (not
 * the games' tracks) and the music on/off button. Music starts with the
 * first click or key press, since browsers block audio before that.
 */

import { Chiptune, type Song } from './chiptune';

const STORAGE_KEY = 'eudimon-music';

const repeat = (pattern: string, times: number): string => Array(times).fill(pattern).join(' ');

/** Professor Oak's lab: easygoing, C major */
export const LAB_THEME: Song = {
  bpm: 116,
  loop: true,
  tracks: {
    lead: [
      'E5/2 G5/2 C6/4 B5/2 G5/2 E5/4',
      'A5/2 C6/2 E6/4 D6/2 C6/2 A5/4',
      'F5/2 A5/2 C6/2 A5/2 G5/4 F5/4',
      'G5/2 B5/2 D6/4 C6/2 B5/2 G5/4',
      'E6/4 D6/2 C6/2 G5/4 E5/4',
      'A5/2 B5/2 C6/2 E6/2 D6/4 C6/4',
      'D6/2 C6/2 A5/4 B5/2 C6/2 D6/4',
      'C6/8 r/4 G5/2 F5/2',
    ].join(' '),
    harmony: [
      repeat('C4/2 E4/2 G4/2 E4/2', 2),
      repeat('A3/2 C4/2 E4/2 C4/2', 2),
      repeat('F3/2 A3/2 C4/2 A3/2', 2),
      repeat('G3/2 B3/2 D4/2 B3/2', 2),
      repeat('C4/2 E4/2 G4/2 E4/2', 2),
      repeat('A3/2 C4/2 E4/2 C4/2', 2),
      'D4/2 F4/2 A4/2 F4/2 G3/2 B3/2 D4/2 B3/2',
      'C4/2 E4/2 G4/2 E4/2 C4/4 r/4',
    ].join(' '),
    bass: [
      'C3/4 G3/4 C3/4 G3/4',
      'A2/4 E3/4 A2/4 E3/4',
      'F2/4 C3/4 F2/4 C3/4',
      'G2/4 D3/4 G2/4 D3/4',
      'C3/4 G3/4 C3/4 G3/4',
      'A2/4 E3/4 A2/4 E3/4',
      'D3/4 A2/4 G2/4 B2/4',
      'C3/4 G2/4 C3/8',
    ].join(' '),
    drums: repeat('k/4 h/4 s/4 h/4', 8),
  },
};

/** Battle against Gary: fast, E minor, with a chromatic run as intro */
export const BATTLE_THEME: Song = {
  bpm: 168,
  loop: true,
  intro: {
    lead: [
      'B5/1 A#5/1 A5/1 G#5/1 G5/1 F#5/1 F5/1 E5/1 D#5/1 D5/1 C#5/1 C5/1 B4/1 A#4/1 A4/1 G#4/1',
      'E5/2 r/2 E5/2 r/2 E5/2 r/2 D#5/2 F#5/2',
    ].join(' '),
    harmony: 'r/16 B4/2 r/2 B4/2 r/2 B4/2 r/2 B4/2 B4/2',
    bass: repeat('E2/2 E3/2', 8),
    drums: `${repeat('h/2', 8)} k/2 r/2 k/2 r/2 k/2 r/2 s/2 s/2`,
  },
  tracks: {
    lead: [
      'E5/2 E5/2 G5/2 E5/2 B5/4 A5/2 G5/2',
      'F#5/2 G5/2 A5/2 G5/2 F#5/4 E5/4',
      'G5/2 G5/2 C6/2 G5/2 E6/4 D6/2 C6/2',
      'B5/2 A5/2 F#5/2 A5/2 D6/4 C6/2 B5/2',
      'E6/2 D6/2 B5/2 G5/2 E5/2 G5/2 B5/2 E6/2',
      'D6/2 B5/2 G5/2 B5/2 A5/4 G5/4',
      'C6/2 B5/2 A5/2 G5/2 A5/2 B5/2 C6/2 E6/2',
      'D#6/4 B5/4 F#5/4 D#5/4',
    ].join(' '),
    harmony: [
      repeat('G4/2 B4/2', 8),
      repeat('G4/2 C5/2', 4),
      repeat('F#4/2 A4/2', 4),
      repeat('G4/2 B4/2', 8),
      repeat('G4/2 C5/2', 4),
      'F#4/2 B4/2 F#4/2 B4/2 F#4/2 A4/2 F#4/2 D#4/2',
    ].join(' '),
    bass: [
      repeat('E2/2 E3/2', 8),
      repeat('C2/2 C3/2', 4),
      repeat('D2/2 D3/2', 4),
      repeat('E2/2 E3/2', 8),
      repeat('C2/2 C3/2', 4),
      repeat('B1/2 B2/2', 4),
    ].join(' '),
    drums: repeat('k/2 h/2 s/2 h/2', 16),
  },
};

/** Short fanfare when you receive your EUDIMON */
export const FANFARE: Song = {
  bpm: 132,
  loop: false,
  tracks: {
    lead: 'G5/2 G5/2 G5/2 C6/6 r/2 B5/2 C6/8',
    harmony: 'E5/2 E5/2 E5/2 E5/6 r/2 D5/2 E5/8',
    bass: 'C3/2 C3/2 C3/2 C3/6 r/2 G2/2 C3/8',
    drums: 'k/2 k/2 k/2 s/6 r/4 s/8',
  },
};

export const music = new Chiptune();

function loadPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

function savePreference(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable (private mode), the choice only lasts for this page
  }
}

/**
 * Wires the music button and plays `song` in a loop. With music switched on
 * (the default), it starts on the first click or key press on the page.
 */
export function setupMusic(button: HTMLButtonElement, song: Song): void {
  const label = button.querySelector<HTMLElement>('[data-music-label]') ?? button;
  let wanted = loadPreference();

  const render = () => {
    button.setAttribute('aria-pressed', String(wanted));
    label.textContent = wanted ? 'Music on' : 'Music off';
  };

  const unlock = (event: Event) => {
    if (event.target instanceof Node && button.contains(event.target)) {
      return;
    }
    document.removeEventListener('click', unlock, true);
    document.removeEventListener('keydown', unlock, true);
    if (wanted && !music.isEnabled) {
      music.setEnabled(true);
    }
  };

  button.addEventListener('click', () => {
    wanted = !wanted;
    savePreference(wanted);
    music.setEnabled(wanted);
    render();
  });

  music.setBackground(song);
  document.addEventListener('click', unlock, true);
  document.addEventListener('keydown', unlock, true);
  render();
}
