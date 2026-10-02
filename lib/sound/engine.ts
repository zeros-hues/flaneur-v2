// Synthesized sound cues, Web Audio API only, no audio files.
// Off by default: nothing plays unless the viewer turned sound on in settings.
// Never used for search, navigation, errors or loading.

import { getPrefs } from "@/lib/prefs";

export type Cue = "captureConfirm" | "cardSlide" | "sayHello" | "streetClosed" | "walkEnd";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

function audio(): { ctx: AudioContext; out: AudioNode } | null {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    // A gentle lowpass on everything keeps the cues warm, never bright.
    const warm = ctx.createBiquadFilter();
    warm.type = "lowpass";
    warm.frequency.value = 3200;
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(warm).connect(ctx.destination);
  }
  // Browsers start the context suspended until a user gesture; cues follow gestures.
  if (ctx.state === "suspended") void ctx.resume();
  return master ? { ctx, out: master } : null;
}

function noise(c: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

// Attack then exponential decay to silence by `t0 + dur`.
function envelope(c: AudioContext, t0: number, peak: number, attack: number, dur: number): GainNode {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  return g;
}

type Tone = { type: OscillatorType; from: number; to: number; peak: number; attack: number; dur: number };

function tone(c: AudioContext, out: AudioNode, t0: number, t: Tone): void {
  const osc = c.createOscillator();
  osc.type = t.type;
  osc.frequency.setValueAtTime(t.from, t0);
  osc.frequency.exponentialRampToValueAtTime(t.to, t0 + t.dur);
  osc.connect(envelope(c, t0, t.peak, t.attack, t.dur)).connect(out);
  osc.start(t0);
  osc.stop(t0 + t.dur + 0.05);
}

const CUES: Record<Cue, (c: AudioContext, out: AudioNode, t0: number) => void> = {
  // Soft low thud, ~90ms.
  captureConfirm: (c, out, t0) => {
    tone(c, out, t0, { type: "sine", from: 140, to: 70, peak: 0.5, attack: 0.004, dur: 0.09 });
  },

  // Short filtered-noise rustle, ~120ms: a bandpass sweeping down, like paper over paper.
  cardSlide: (c, out, t0) => {
    const src = c.createBufferSource();
    src.buffer = noise(c);
    const band = c.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(2400, t0);
    band.frequency.exponentialRampToValueAtTime(900, t0 + 0.12);
    src.connect(band).connect(envelope(c, t0, 0.22, 0.02, 0.12)).connect(out);
    src.start(t0);
    src.stop(t0 + 0.15);
  },

  // Slightly brighter, ~150ms: a small rising note with a quiet octave above.
  sayHello: (c, out, t0) => {
    tone(c, out, t0, { type: "triangle", from: 440, to: 520, peak: 0.22, attack: 0.008, dur: 0.15 });
    tone(c, out, t0, { type: "sine", from: 880, to: 1040, peak: 0.05, attack: 0.008, dur: 0.12 });
  },

  // Low, with a ~180ms tail.
  streetClosed: (c, out, t0) => {
    tone(c, out, t0, { type: "sine", from: 98, to: 62, peak: 0.45, attack: 0.01, dur: 0.18 });
  },

  // 400ms of silence, then one soft tone, ~600ms.
  walkEnd: (c, out, t0) => {
    const start = t0 + 0.4;
    tone(c, out, start, { type: "sine", from: 329.6, to: 329.6, peak: 0.2, attack: 0.04, dur: 0.6 });
    tone(c, out, start, { type: "sine", from: 659.3, to: 659.3, peak: 0.03, attack: 0.04, dur: 0.45 });
  },
};

export function play(cue: Cue): void {
  if (!getPrefs().sound) return;
  const a = audio();
  if (!a) return;
  CUES[cue](a.ctx, a.out, a.ctx.currentTime + 0.01);
}

export const CUE_NAMES = Object.keys(CUES) as Cue[];
