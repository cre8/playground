/**
 * Tiny Game Boy style synthesizer for the EUDIMON pages. Like the Game Boy
 * sound chip it has two pulse channels, a bass channel (triangle) and a noise
 * channel for drums. Songs are scheduled ahead with the Web Audio clock.
 */

export type Channel = 'lead' | 'harmony' | 'bass' | 'drums';

/**
 * A track is a list of space separated tokens `<note>/<steps>`, one step is a
 * 16th note: `C#5/2` is an 8th note C#5, `r/4` a quarter rest. Drum tracks use
 * `k` (kick), `s` (snare) and `h` (hi-hat) instead of notes.
 */
export type Tracks = Partial<Record<Channel, string>>;

export interface Song {
  bpm: number;
  /** Played once before the main part */
  intro?: Tracks;
  tracks: Tracks;
  loop: boolean;
}

interface NoteEvent {
  channel: Channel;
  step: number;
  steps: number;
  note: string;
}

interface Section {
  events: NoteEvent[];
  length: number;
}

const LOOKAHEAD_S = 0.15;
const TICK_MS = 25;
const MASTER_GAIN = 0.5;
const CHANNEL_GAIN: Record<Channel, number> = {
  lead: 0.1,
  harmony: 0.05,
  bass: 0.2,
  drums: 0.12,
};
const PULSE_DUTY: Partial<Record<Channel, number>> = { lead: 0.5, harmony: 0.25 };
const SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
};

function frequency(note: string): number {
  const match = /^([A-G]#?)(\d)$/.exec(note);
  if (!match) {
    throw new Error(`Invalid note: ${note}`);
  }
  const midi = 12 * (Number(match[2]) + 1) + SEMITONES[match[1]];
  return 440 * 2 ** ((midi - 69) / 12);
}

/** Parses tracks into events, sorted by time */
export function parseTracks(tracks: Tracks): Section {
  const events: NoteEvent[] = [];
  let length = 0;
  for (const [channel, track] of Object.entries(tracks) as [Channel, string][]) {
    let step = 0;
    for (const token of track.trim().split(/\s+/)) {
      const [note, steps] = token.split('/');
      const count = Number(steps);
      if (!Number.isInteger(count) || count <= 0) {
        throw new Error(`Invalid token: ${token}`);
      }
      if (note !== 'r') {
        events.push({ channel, step, steps: count, note });
      }
      step += count;
    }
    length = Math.max(length, step);
  }
  events.sort((a, b) => a.step - b.step);
  return { events, length };
}

export class Chiptune {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly waves = new Map<number, PeriodicWave>();
  private stopCurrent: (() => void) | null = null;
  private background: Song | null = null;
  private enabled = false;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        void this.context?.suspend();
      } else if (this.enabled) {
        void this.context?.resume();
      }
    });
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Turning music on has to happen in a user gesture (browser autoplay rules) */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stop();
      void this.context?.suspend();
      return;
    }
    const context = this.ensureContext();
    if (!context) {
      this.enabled = false;
      return;
    }
    void context.resume();
    if (this.background) {
      this.play(this.background);
    }
  }

  /** Sets the looping background song of the page */
  setBackground(song: Song): void {
    this.background = song;
    if (this.enabled) {
      this.play(song);
    }
  }

  /** Plays a song once, then the background song (or `next`, which becomes the new one) */
  jingle(song: Song, next?: Song): void {
    if (next) {
      this.background = next;
    }
    if (!this.enabled) {
      return;
    }
    this.play(song, () => {
      if (this.background) {
        this.play(this.background);
      }
    });
  }

  /** Short noise burst for a hit */
  hit(): void {
    const context = this.context;
    if (!this.enabled || !context || !this.master || !this.noise) {
      return;
    }
    const time = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4000, time);
    filter.frequency.exponentialRampToValueAtTime(300, time + 0.25);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(time);
    source.stop(time + 0.3);
  }

  private ensureContext(): AudioContext | null {
    if (this.context) {
      return this.context;
    }
    const AudioContextClass =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      return null;
    }
    const context = new AudioContextClass();
    this.master = context.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(context.destination);

    // White noise; the Game Boy uses an LFSR, which sounds close enough
    this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.context = context;
    return context;
  }

  private stop(): void {
    this.stopCurrent?.();
    this.stopCurrent = null;
  }

  private play(song: Song, onEnd?: () => void): void {
    this.stop();
    const context = this.context;
    if (!context || !this.master) {
      return;
    }

    const sections = [...(song.intro ? [parseTracks(song.intro)] : []), parseTracks(song.tracks)];
    const stepSeconds = 60 / song.bpm / 4;
    const output = context.createGain();
    output.connect(this.master);

    let section = 0;
    let index = 0;
    let origin = context.currentTime + 0.05;

    const tick = () => {
      const horizon = context.currentTime + LOOKAHEAD_S;
      for (;;) {
        const { events, length } = sections[section];
        if (index >= events.length) {
          const end = origin + length * stepSeconds;
          if (section < sections.length - 1) {
            section++;
          } else if (!song.loop || events.length === 0) {
            if (context.currentTime >= end) {
              finish();
              onEnd?.();
            }
            return;
          }
          origin = end;
          index = 0;
          continue;
        }
        const event = events[index];
        const time = origin + event.step * stepSeconds;
        if (time > horizon) {
          return;
        }
        this.voice(output, event, time, event.steps * stepSeconds);
        index++;
      }
    };

    const timer = setInterval(tick, TICK_MS);
    const finish = () => {
      clearInterval(timer);
      if (this.stopCurrent === stop) {
        this.stopCurrent = null;
      }
    };
    const stop = () => {
      clearInterval(timer);
      output.gain.setValueAtTime(0, context.currentTime);
      setTimeout(() => output.disconnect(), 500);
    };
    this.stopCurrent = stop;
    tick();
  }

  private voice(output: AudioNode, event: NoteEvent, time: number, duration: number): void {
    const context = this.context!;
    const level = CHANNEL_GAIN[event.channel];
    const gain = context.createGain();
    gain.connect(output);

    if (event.channel === 'drums') {
      this.drum(gain, event.note, time, level);
      return;
    }

    const oscillator = context.createOscillator();
    const duty = PULSE_DUTY[event.channel];
    if (duty) {
      oscillator.setPeriodicWave(this.pulse(duty));
    } else {
      oscillator.type = 'triangle';
    }
    oscillator.frequency.setValueAtTime(frequency(event.note), time);

    // Short attack, slight decay, cut before the next note like a Game Boy envelope
    const end = time + duration * 0.9;
    const decayEnd = Math.min(time + 0.2, end - 0.01);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(level, time + 0.005);
    gain.gain.linearRampToValueAtTime(level * 0.6, decayEnd);
    gain.gain.linearRampToValueAtTime(0, end);

    oscillator.connect(gain);
    oscillator.start(time);
    oscillator.stop(end + 0.01);
    oscillator.onended = () => gain.disconnect();
  }

  private drum(gain: GainNode, kind: string, time: number, level: number): void {
    const context = this.context!;
    if (kind === 'k') {
      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(160, time);
      oscillator.frequency.exponentialRampToValueAtTime(40, time + 0.12);
      gain.gain.setValueAtTime(level * 2, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
      oscillator.connect(gain);
      oscillator.start(time);
      oscillator.stop(time + 0.15);
      oscillator.onended = () => gain.disconnect();
      return;
    }

    const hat = kind === 'h';
    const length = hat ? 0.04 : 0.13;
    const source = context.createBufferSource();
    source.buffer = this.noise;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = hat ? 7000 : 1200;
    gain.gain.setValueAtTime(hat ? level * 0.5 : level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + length);
    source.connect(filter).connect(gain);
    source.start(time);
    source.stop(time + length + 0.01);
    source.onended = () => gain.disconnect();
  }

  /** Pulse wave with the given duty cycle, like the Game Boy's square channels */
  private pulse(duty: number): PeriodicWave {
    let wave = this.waves.get(duty);
    if (!wave) {
      const harmonics = 32;
      const real = new Float32Array(harmonics);
      const imag = new Float32Array(harmonics);
      for (let k = 1; k < harmonics; k++) {
        real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
      }
      wave = this.context!.createPeriodicWave(real, imag);
      this.waves.set(duty, wave);
    }
    return wave;
  }
}
