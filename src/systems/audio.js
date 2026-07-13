/**
 * Procedural SFX for The Ride (Web Audio API — no external files).
 * Unlock by calling resumeAudio() after a user gesture (Click to Play).
 */

let ctx = null;
let masterGain = null;
let sfxGain = null;
let ambientGain = null;
let muted = false;
let masterVol = 0.7;
let sfxVol = 1;
let ambientVol = 0.35;
let ambientNodes = null;
let footstepPhase = 0;
let hoofPhase = 0;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  masterGain = ctx.createGain();
  masterGain.gain.value = muted ? 0 : masterVol;
  masterGain.connect(ctx.destination);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = sfxVol;
  sfxGain.connect(masterGain);

  ambientGain = ctx.createGain();
  ambientGain.gain.value = ambientVol;
  ambientGain.connect(masterGain);
  return ctx;
}

export function resumeAudio() {
  const c = ensureCtx();
  if (!c) return Promise.resolve();
  if (c.state === "suspended") return c.resume();
  return Promise.resolve();
}

export function setAudioSettings({
  muted: m,
  masterVolume,
  sfxVolume,
  ambientVolume,
} = {}) {
  if (typeof m === "boolean") muted = m;
  if (typeof masterVolume === "number") masterVol = masterVolume;
  if (typeof sfxVolume === "number") sfxVol = sfxVolume;
  if (typeof ambientVolume === "number") ambientVol = ambientVolume;
  if (!masterGain) return;
  masterGain.gain.value = muted ? 0 : masterVol;
  if (sfxGain) sfxGain.gain.value = sfxVol;
  if (ambientGain) ambientGain.gain.value = ambientVol;
}

function now() {
  return ctx ? ctx.currentTime : 0;
}

function noiseBuffer(duration = 0.2) {
  const c = ensureCtx();
  if (!c) return null;
  const rate = c.sampleRate;
  const len = Math.max(1, Math.floor(rate * duration));
  const buf = c.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function playNoise({
  duration = 0.12,
  gain = 0.2,
  filterType = "lowpass",
  frequency = 800,
  Q = 1,
  attack = 0.005,
  decay = 0.1,
  detune = 0,
} = {}) {
  const c = ensureCtx();
  if (!c || !sfxGain) return;
  const buf = noiseBuffer(duration + 0.05);
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  filter.Q.value = Q;
  if (detune) filter.detune.value = detune;
  const g = c.createGain();
  const t0 = now();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  src.connect(filter);
  filter.connect(g);
  g.connect(sfxGain);
  src.start(t0);
  src.stop(t0 + attack + decay + 0.05);
}

function playTone({
  type = "sine",
  freq = 440,
  freqEnd = null,
  duration = 0.15,
  gain = 0.15,
  attack = 0.01,
  decay = null,
} = {}) {
  const c = ensureCtx();
  if (!c || !sfxGain) return;
  const osc = c.createOscillator();
  osc.type = type;
  const g = c.createGain();
  const t0 = now();
  const d = decay ?? duration * 0.85;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, freqEnd),
      t0 + duration
    );
  }
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + d);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(t0);
  osc.stop(t0 + attack + d + 0.05);
}

// ——— Public one-shots ———

export function sfxFootstep(sprinting = false) {
  playNoise({
    duration: 0.08,
    gain: sprinting ? 0.18 : 0.1,
    filterType: "lowpass",
    frequency: sprinting ? 420 : 280,
    Q: 0.7,
    attack: 0.002,
    decay: sprinting ? 0.07 : 0.1,
  });
  playNoise({
    duration: 0.05,
    gain: sprinting ? 0.06 : 0.035,
    filterType: "bandpass",
    frequency: 1200,
    Q: 0.8,
    attack: 0.001,
    decay: 0.04,
  });
}

export function sfxHoof(galloping = false) {
  playNoise({
    duration: 0.1,
    gain: galloping ? 0.28 : 0.18,
    filterType: "lowpass",
    frequency: galloping ? 260 : 200,
    Q: 1.2,
    attack: 0.002,
    decay: galloping ? 0.08 : 0.11,
  });
  playTone({
    type: "triangle",
    freq: galloping ? 95 : 80,
    freqEnd: 55,
    duration: 0.08,
    gain: galloping ? 0.08 : 0.05,
    attack: 0.002,
    decay: 0.07,
  });
}

export function sfxUIClick() {
  playTone({
    type: "sine",
    freq: 680,
    freqEnd: 520,
    duration: 0.06,
    gain: 0.08,
    attack: 0.005,
    decay: 0.05,
  });
}

export function sfxUIOpen() {
  playTone({
    type: "sine",
    freq: 320,
    freqEnd: 520,
    duration: 0.12,
    gain: 0.1,
    attack: 0.01,
    decay: 0.1,
  });
}

export function sfxUIClose() {
  playTone({
    type: "sine",
    freq: 480,
    freqEnd: 280,
    duration: 0.1,
    gain: 0.08,
    attack: 0.01,
    decay: 0.09,
  });
}

export function sfxDoorWood() {
  playNoise({
    duration: 0.25,
    gain: 0.22,
    filterType: "lowpass",
    frequency: 500,
    Q: 0.6,
    attack: 0.01,
    decay: 0.22,
  });
  playTone({
    type: "triangle",
    freq: 180,
    freqEnd: 90,
    duration: 0.2,
    gain: 0.1,
    attack: 0.01,
    decay: 0.18,
  });
}

export function sfxGate() {
  playNoise({
    duration: 0.2,
    gain: 0.18,
    filterType: "bandpass",
    frequency: 900,
    Q: 2,
    attack: 0.005,
    decay: 0.18,
  });
  playTone({
    type: "square",
    freq: 220,
    freqEnd: 140,
    duration: 0.15,
    gain: 0.04,
    attack: 0.005,
    decay: 0.12,
  });
}

export function sfxFlowerPick() {
  playTone({
    type: "sine",
    freq: 720,
    freqEnd: 980,
    duration: 0.12,
    gain: 0.09,
    attack: 0.01,
    decay: 0.1,
  });
  playNoise({
    duration: 0.08,
    gain: 0.06,
    filterType: "highpass",
    frequency: 2000,
    Q: 0.5,
    attack: 0.005,
    decay: 0.06,
  });
}

/** Soft net whoosh + sparkle when catching a butterfly */
export function sfxButterflyCatch() {
  playNoise({
    duration: 0.14,
    gain: 0.1,
    filterType: "bandpass",
    frequency: 900,
    Q: 0.8,
    attack: 0.005,
    decay: 0.12,
  });
  playTone({
    type: "triangle",
    freq: 880,
    freqEnd: 1320,
    duration: 0.18,
    gain: 0.08,
    attack: 0.01,
    decay: 0.14,
  });
}

export function sfxFlowerPlant() {
  playNoise({
    duration: 0.15,
    gain: 0.14,
    filterType: "lowpass",
    frequency: 350,
    Q: 0.8,
    attack: 0.01,
    decay: 0.14,
  });
  playTone({
    type: "sine",
    freq: 280,
    freqEnd: 200,
    duration: 0.12,
    gain: 0.06,
    attack: 0.01,
    decay: 0.1,
  });
}

export function sfxMount() {
  playNoise({
    duration: 0.2,
    gain: 0.16,
    filterType: "lowpass",
    frequency: 400,
    Q: 0.7,
    attack: 0.01,
    decay: 0.18,
  });
  playTone({
    type: "triangle",
    freq: 160,
    freqEnd: 110,
    duration: 0.18,
    gain: 0.07,
    attack: 0.01,
    decay: 0.15,
  });
}

export function sfxDismount() {
  playNoise({
    duration: 0.18,
    gain: 0.15,
    filterType: "lowpass",
    frequency: 380,
    Q: 0.7,
    attack: 0.008,
    decay: 0.15,
  });
}

/** Low cow moo */
export function sfxMoo() {
  playTone({
    type: "sawtooth",
    freq: 140,
    freqEnd: 95,
    duration: 0.55,
    gain: 0.09,
    attack: 0.04,
    decay: 0.5,
  });
  setTimeout(() => {
    playTone({
      type: "triangle",
      freq: 110,
      freqEnd: 75,
      duration: 0.45,
      gain: 0.08,
      attack: 0.03,
      decay: 0.4,
    });
  }, 180);
  playNoise({
    duration: 0.4,
    gain: 0.05,
    filterType: "lowpass",
    frequency: 280,
    Q: 0.6,
    attack: 0.05,
    decay: 0.35,
  });
}

/** Soft low "fart" when the cow poops */
export function sfxFart() {
  // Fluttery low buzz
  playTone({
    type: "sawtooth",
    freq: 95,
    freqEnd: 55,
    duration: 0.28,
    gain: 0.11,
    attack: 0.01,
    decay: 0.26,
  });
  setTimeout(() => {
    playTone({
      type: "square",
      freq: 70,
      freqEnd: 40,
      duration: 0.18,
      gain: 0.07,
      attack: 0.005,
      decay: 0.16,
    });
  }, 90);
  // Airy noise tail
  playNoise({
    duration: 0.35,
    gain: 0.1,
    filterType: "lowpass",
    frequency: 220,
    Q: 0.8,
    attack: 0.01,
    decay: 0.32,
  });
  setTimeout(() => {
    playNoise({
      duration: 0.2,
      gain: 0.06,
      filterType: "bandpass",
      frequency: 160,
      Q: 1.2,
      attack: 0.005,
      decay: 0.18,
    });
  }, 120);
}

/** Two-tone whistle to call a horse */
export function sfxWhistle() {
  // Rising first note
  playTone({
    type: "sine",
    freq: 980,
    freqEnd: 1480,
    duration: 0.22,
    gain: 0.11,
    attack: 0.02,
    decay: 0.18,
  });
  // Second chirp a beat later
  setTimeout(() => {
    playTone({
      type: "sine",
      freq: 1200,
      freqEnd: 1680,
      duration: 0.28,
      gain: 0.1,
      attack: 0.015,
      decay: 0.24,
    });
  }, 160);
  // Soft air noise under the whistle
  playNoise({
    duration: 0.35,
    gain: 0.04,
    filterType: "bandpass",
    frequency: 1400,
    Q: 1.2,
    attack: 0.02,
    decay: 0.3,
  });
}

/**
 * Horse drink SFX: "slurp slurp gulp ahhhh"
 * Timed to roughly match DRINK_DURATION (~3s).
 */
export function sfxHorseDrink() {
  const c = ensureCtx();
  if (!c || !sfxGain) return;

  // --- slurp · slurp (wet mouth pulls) ---
  const slurps = [
    { t: 0.15, f: 280, g: 0.14 },
    { t: 0.55, f: 320, g: 0.13 },
    { t: 0.95, f: 260, g: 0.15 },
    { t: 1.35, f: 300, g: 0.12 },
  ];
  for (const s of slurps) {
    setTimeout(() => {
      // Wet noise
      playNoise({
        duration: 0.18,
        gain: s.g,
        filterType: "bandpass",
        frequency: 900,
        Q: 1.4,
        attack: 0.01,
        decay: 0.14,
      });
      // Low “slrrp” tone
      playTone({
        type: "sawtooth",
        freq: s.f,
        freqEnd: s.f * 0.55,
        duration: 0.2,
        gain: s.g * 0.55,
        attack: 0.02,
        decay: 0.16,
      });
      playTone({
        type: "sine",
        freq: s.f * 1.8,
        freqEnd: s.f * 0.9,
        duration: 0.16,
        gain: s.g * 0.35,
        attack: 0.015,
        decay: 0.12,
      });
    }, s.t * 1000);
  }

  // --- gulp · gulp (throat glugs) ---
  const gulps = [
    { t: 1.7, f: 140 },
    { t: 2.05, f: 120 },
  ];
  for (const g of gulps) {
    setTimeout(() => {
      playTone({
        type: "sine",
        freq: g.f,
        freqEnd: g.f * 0.7,
        duration: 0.14,
        gain: 0.16,
        attack: 0.01,
        decay: 0.12,
      });
      playNoise({
        duration: 0.1,
        gain: 0.08,
        filterType: "lowpass",
        frequency: 400,
        Q: 0.8,
        attack: 0.005,
        decay: 0.08,
      });
    }, g.t * 1000);
  }

  // --- ahhhh (satisfied sigh after the drink) ---
  setTimeout(() => {
    // Soft breathy noise
    playNoise({
      duration: 0.55,
      gain: 0.07,
      filterType: "bandpass",
      frequency: 1100,
      Q: 0.6,
      attack: 0.08,
      decay: 0.45,
    });
    // Warm “ahh” vowel-ish tone
    playTone({
      type: "triangle",
      freq: 220,
      freqEnd: 180,
      duration: 0.65,
      gain: 0.11,
      attack: 0.1,
      decay: 0.55,
    });
    playTone({
      type: "sine",
      freq: 330,
      freqEnd: 260,
      duration: 0.55,
      gain: 0.06,
      attack: 0.12,
      decay: 0.45,
    });
  }, 2350);
}

export function sfxFishStart() {
  playTone({
    type: "sine",
    freq: 400,
    freqEnd: 560,
    duration: 0.1,
    gain: 0.08,
    attack: 0.01,
    decay: 0.08,
  });
}

export function sfxFishCast() {
  playNoise({
    duration: 0.18,
    gain: 0.12,
    filterType: "highpass",
    frequency: 1500,
    Q: 0.6,
    attack: 0.005,
    decay: 0.15,
  });
  playTone({
    type: "sine",
    freq: 500,
    freqEnd: 180,
    duration: 0.25,
    gain: 0.06,
    attack: 0.01,
    decay: 0.22,
  });
}

export function sfxFishSplash() {
  playNoise({
    duration: 0.22,
    gain: 0.25,
    filterType: "bandpass",
    frequency: 900,
    Q: 0.9,
    attack: 0.005,
    decay: 0.2,
  });
  playNoise({
    duration: 0.15,
    gain: 0.12,
    filterType: "highpass",
    frequency: 2400,
    Q: 0.5,
    attack: 0.002,
    decay: 0.12,
  });
}

export function sfxFishBite() {
  playTone({
    type: "triangle",
    freq: 180,
    freqEnd: 90,
    duration: 0.08,
    gain: 0.12,
    attack: 0.002,
    decay: 0.07,
  });
  playNoise({
    duration: 0.1,
    gain: 0.14,
    filterType: "lowpass",
    frequency: 500,
    Q: 1,
    attack: 0.002,
    decay: 0.08,
  });
}

export function sfxFishReel() {
  const c = ensureCtx();
  if (!c || !sfxGain) return;
  // Rapid clicks
  for (let i = 0; i < 8; i++) {
    const t0 = now() + i * 0.08;
    const osc = c.createOscillator();
    osc.type = "square";
    osc.frequency.value = 900 + (i % 3) * 40;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.04, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
    osc.connect(g);
    g.connect(sfxGain);
    osc.start(t0);
    osc.stop(t0 + 0.05);
  }
}

export function sfxFishCatch() {
  playTone({
    type: "sine",
    freq: 520,
    duration: 0.1,
    gain: 0.1,
    attack: 0.01,
    decay: 0.08,
  });
  playTone({
    type: "sine",
    freq: 780,
    duration: 0.14,
    gain: 0.09,
    attack: 0.02,
    decay: 0.12,
  });
  setTimeout(() => {
    playTone({
      type: "sine",
      freq: 1040,
      duration: 0.18,
      gain: 0.08,
      attack: 0.01,
      decay: 0.15,
    });
  }, 90);
}

/**
 * Call each frame while walking on foot.
 * stepRate roughly matches walk cycle (rad/s * factor).
 */
export function updateFootsteps(isMoving, sprinting, delta) {
  if (!isMoving) {
    footstepPhase = 0;
    return;
  }
  const rate = sprinting ? 9.5 : 5.2;
  footstepPhase += delta * rate;
  if (footstepPhase >= 1) {
    footstepPhase -= 1;
    sfxFootstep(sprinting);
  }
}

/** Call each frame while riding. */
export function updateHoofsteps(isMoving, galloping, delta) {
  if (!isMoving) {
    hoofPhase = 0;
    return;
  }
  const rate = galloping ? 8.5 : 4.8;
  hoofPhase += delta * rate;
  if (hoofPhase >= 1) {
    hoofPhase -= 1;
    sfxHoof(galloping);
  }
}

/** Soft wind + distant birds loop while playing. */
export function startAmbient() {
  const c = ensureCtx();
  if (!c || !ambientGain || ambientNodes) return;

  // Wind noise
  const windBuf = noiseBuffer(2.5);
  const wind = c.createBufferSource();
  wind.buffer = windBuf;
  wind.loop = true;
  const windFilter = c.createBiquadFilter();
  windFilter.type = "lowpass";
  windFilter.frequency.value = 380;
  const windG = c.createGain();
  windG.gain.value = 0.045;
  wind.connect(windFilter);
  windFilter.connect(windG);
  windG.connect(ambientGain);
  wind.start();

  // Occasional soft bird chirps via LFO-gated tones
  const birdOsc = c.createOscillator();
  birdOsc.type = "sine";
  birdOsc.frequency.value = 1800;
  const birdG = c.createGain();
  birdG.gain.value = 0;
  const lfo = c.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.07;
  const lfoG = c.createGain();
  lfoG.gain.value = 0.012;
  lfo.connect(lfoG);
  // Manual chirp scheduler
  let birdTimer = null;
  const scheduleBird = () => {
    if (!ctx || muted) {
      birdTimer = setTimeout(scheduleBird, 4000);
      return;
    }
    const t0 = now();
    const o = c.createOscillator();
    o.type = "sine";
    const base = 1400 + Math.random() * 900;
    o.frequency.setValueAtTime(base, t0);
    o.frequency.exponentialRampToValueAtTime(base * 1.25, t0 + 0.08);
    o.frequency.exponentialRampToValueAtTime(base * 0.9, t0 + 0.16);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
    o.connect(g);
    g.connect(ambientGain);
    o.start(t0);
    o.stop(t0 + 0.22);
    birdTimer = setTimeout(scheduleBird, 3500 + Math.random() * 7000);
  };
  scheduleBird();

  ambientNodes = { wind, windG, birdOsc, birdG, lfo, birdTimer };
  // birdOsc/lfo unused as continuous — only scheduler; stop them if started
  try {
    birdOsc.stop();
  } catch {
    /* not started */
  }
}

export function stopAmbient() {
  if (!ambientNodes) return;
  try {
    ambientNodes.wind?.stop();
  } catch {
    /* already stopped */
  }
  if (ambientNodes.birdTimer) clearTimeout(ambientNodes.birdTimer);
  ambientNodes = null;
}
