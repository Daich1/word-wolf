// ===== Word Wolf Audio =====
// WebAudio で効果音・BGMをその場で合成する。音源ファイル不要。

const SOUND_KEY = 'wolf_sound';
const VOL_KEY = 'wolf_vol';
const AC = window.AudioContext || window.webkitAudioContext;

let actx = null, master = null, sfxBus = null, bgmBus = null, noiseBuf = null;
let soundOn = true;
try { soundOn = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) {}

const clamp01 = n => Math.max(0, Math.min(1, Number(n) || 0));
let vols = { bgm: 0.8, sfx: 1 };
try {
  const s = JSON.parse(localStorage.getItem(VOL_KEY) || 'null');
  if (s) vols = { bgm: clamp01(s.bgm), sfx: clamp01(s.sfx) };
} catch (e) {}
function saveVols() {
  try { localStorage.setItem(VOL_KEY, JSON.stringify(vols)); } catch (e) {}
}
const bgmTarget = () => (curMood ? MOODS[curMood].vol : 0) * vols.bgm;

function initAudio() {
  if (actx || !AC) return actx;
  actx = new AC();
  master = actx.createGain(); master.gain.value = soundOn ? 0.9 : 0.0001;
  master.connect(actx.destination);
  sfxBus = actx.createGain(); sfxBus.gain.value = vols.sfx; sfxBus.connect(master);
  bgmBus = actx.createGain(); bgmBus.gain.value = 0.0001; bgmBus.connect(master);
  noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return actx;
}

function unlock() {
  if (!soundOn) return;
  const c = initAudio();
  if (c && c.state === 'suspended') c.resume();
}
['pointerdown', 'keydown'].forEach(ev =>
  document.addEventListener(ev, unlock, { passive: true }));
document.addEventListener('visibilitychange', () => {
  if (!actx) return;
  if (document.hidden) actx.suspend();
  else if (soundOn) actx.resume();
});

const ready = () => soundOn && !!initAudio() && actx.state !== 'closed';
const now = () => (initAudio() ? actx.currentTime : 0);
const NOTE = semi => 440 * Math.pow(2, semi / 12);

function tone(o) {
  if (!ready()) return;
  const t = o.t || now();
  const dur = o.dur || 0.2;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = o.type || 'triangle';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol == null ? 0.25 : o.vol, t + (o.attack || 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(o.bus || sfxBus);
  osc.start(t); osc.stop(t + dur + 0.02);
}
function noise(o) {
  if (!ready()) return;
  const t = o.t || now();
  const dur = o.dur || 0.18;
  const src = actx.createBufferSource();
  src.buffer = noiseBuf; src.loop = true;
  const f = actx.createBiquadFilter();
  f.type = 'bandpass'; f.Q.value = o.q || 1.2;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol == null ? 0.2 : o.vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(o.bus || sfxBus);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}
function duck(secs) {
  if (!bgmBus || !curMood || !ready()) return;
  const t = now(), v = bgmTarget();
  bgmBus.gain.cancelScheduledValues(t);
  bgmBus.gain.setValueAtTime(v * 0.3, t);
  bgmBus.gain.linearRampToValueAtTime(v, t + secs);
}

// ===== SFX =====
const SFX = {
  tap:    () => tone({ freq: 520, to: 380, dur: 0.07, type: 'square', vol: 0.10 }),
  back:   () => tone({ freq: 360, to: 240, dur: 0.10, type: 'square', vol: 0.09 }),
  pick:   () => {
    tone({ freq: NOTE(3), dur: 0.16, vol: 0.20 });
    noise({ freq: 2600, to: 1400, dur: 0.05, vol: 0.06 });
  },
  flip:   () => {
    noise({ freq: 500, to: 3000, dur: 0.18, vol: 0.13, q: 0.8 });
    tone({ freq: NOTE(-12), t: now() + 0.1, dur: 0.32, vol: 0.20 });
  },
  confirm:() => [0, 4, 7, 12].forEach((s, i) =>
    tone({ freq: NOTE(3 + s), t: now() + i * 0.05, dur: 0.3, vol: 0.16 })),
  vote:   () => {
    tone({ freq: NOTE(5), dur: 0.12, vol: 0.18 });
    tone({ freq: NOTE(10), t: now() + 0.08, dur: 0.2, vol: 0.14 });
  },
  reveal: () => {
    duck(1.6);
    const t = now();
    [0, 3, 7, 12].forEach((s, i) =>
      tone({ freq: NOTE(-2 + s), t: t + i * 0.12, dur: 0.5, vol: 0.20 }));
    noise({ t: t + 0.4, freq: 4000, to: 1500, dur: 0.5, vol: 0.06 });
  },
  citizen_win: () => {
    duck(2.0);
    const t = now();
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) =>
      tone({ freq: NOTE(3 + s), t: t + i * 0.07, dur: 0.45, vol: 0.20 }));
    [0, 7, 12].forEach(s =>
      tone({ freq: NOTE(3 + s), t: t + 0.55, dur: 1.3, vol: 0.12, type: 'sine' }));
  },
  wolf_win: () => {
    duck(1.8);
    const t = now();
    [0, 3, 6, 9, 12].forEach((s, i) =>
      tone({ freq: NOTE(-5 + s), t: t + i * 0.1, dur: 0.5, vol: 0.18, type: 'sawtooth' }));
    noise({ t: t + 0.3, freq: 800, dur: 0.6, vol: 0.08 });
  },
  tick:   () => tone({ freq: NOTE(15), dur: 0.06, type: 'square', vol: 0.09 }),
  join:   () => [0, 7].forEach((s, i) =>
    tone({ freq: NOTE(3 + s), t: now() + i * 0.07, dur: 0.22, vol: 0.15 })),
  start:  () => {
    const t = now();
    [0, 4, 7, 12, 19].forEach((s, i) =>
      tone({ freq: NOTE(-2 + s), t: t + i * 0.08, dur: 0.4, vol: 0.20 }));
    noise({ t: t + 0.3, freq: 800, to: 4000, dur: 0.4, vol: 0.08 });
  },
  final:  () => {
    const t = now();
    [0, 4, 7, 12, 11, 12].forEach((s, i) =>
      tone({ freq: NOTE(3 + s), t: t + i * 0.12, dur: 0.55, vol: 0.20 }));
    [0, 4, 7, 12].forEach(s =>
      tone({ freq: NOTE(3 + s), t: t + 0.78, dur: 1.6, vol: 0.13, type: 'sine' }));
  },
};

// ===== BGM =====
const CHORD = { maj:[0,4,7], min:[0,3,7], maj7:[0,4,7,11], min7:[0,3,7,10], dom7:[0,4,7,10] };
const MOODS = {
  lobby:   { bpm: 88, vol: 0.12, bass: 4, hat: 2, arp: 'up',
             prog: [[-9,'min7'], [-5,'maj7'], [-12,'min7'], [-2,'dom7']] },
  discuss: { bpm: 108, vol: 0.13, bass: 2, hat: 1, arp: 'up',
             prog: [[-12,'min'], [-4,'maj'], [-9,'min'], [-2,'dom7']] },
  vote:    { bpm: 72, vol: 0.14, bass: 4, hat: 0, arp: 'pulse',
             prog: [[-12,'min'], [-5,'min']] },
  reveal:  { bpm: 78, vol: 0.14, bass: 4, hat: 0, arp: 'pulse',
             prog: [[-9,'min'], [-2,'dom7']] },
};

let wantMood = null, curMood = null;
let bgmStep = 0, bgmTime = 0, bgmTimer = null;

function bgmBeat(m, i, t) {
  const [root, type] = m.prog[Math.floor(i / 8) % m.prog.length];
  const iv = CHORD[type];
  const s = i % 8;
  if (m.bass && s % m.bass === 0)
    tone({ freq: NOTE(root - 24), t, dur: 0.5, type: 'sine', vol: 0.5, bus: bgmBus });
  if (m.hat && s % m.hat === 0)
    noise({ freq: 7000, dur: 0.04, vol: 0.05, q: 2, t, bus: bgmBus });
  if (m.arp === 'up') {
    const n = iv[s % iv.length] + (s >= iv.length ? 12 : 0);
    tone({ freq: NOTE(root + n), t, dur: 0.22, type: 'triangle', vol: 0.22, bus: bgmBus });
  } else if (m.arp === 'pulse' && (s === 0 || s === 4)) {
    iv.forEach(n => tone({ freq: NOTE(root + n), t, dur: 1.1, type: 'sine', vol: 0.16, bus: bgmBus }));
  }
}

function bgmTick() {
  if (!curMood || !ready() || vols.bgm <= 0) return;
  const m = MOODS[curMood];
  const stepDur = 30 / m.bpm;
  if (bgmTime < now()) bgmTime = now() + 0.02;
  while (bgmTime < now() + 0.2) {
    bgmBeat(m, bgmStep, bgmTime);
    bgmTime += stepDur;
    bgmStep++;
  }
}

function syncBgm() {
  if (!soundOn || !wantMood) return stopBgm();
  if (curMood === wantMood) return;
  if (!initAudio()) return;
  curMood = wantMood;
  bgmStep = 0; bgmTime = now() + 0.05;
  const t = now();
  bgmBus.gain.cancelScheduledValues(t);
  bgmBus.gain.setValueAtTime(0.0001, t);
  bgmBus.gain.linearRampToValueAtTime(bgmTarget(), t + 0.8);
  if (!bgmTimer) bgmTimer = setInterval(bgmTick, 40);
}
function stopBgm() {
  if (!curMood && !bgmTimer) return;
  if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; }
  curMood = null;
  if (!bgmBus) return;
  const t = now();
  bgmBus.gain.cancelScheduledValues(t);
  bgmBus.gain.setValueAtTime(bgmBus.gain.value, t);
  bgmBus.gain.linearRampToValueAtTime(0.0001, t + 0.4);
}

const Sound = {
  play(name, arg) { if (SFX[name]) SFX[name](arg); },
  bgm(mood) { wantMood = mood || null; syncBgm(); },
  isOn: () => soundOn,
  getVol: () => ({ bgm: vols.bgm, sfx: vols.sfx }),
  setVol(kind, val) {
    if (kind !== 'bgm' && kind !== 'sfx') return;
    vols[kind] = clamp01(val);
    saveVols();
    if (!actx) return;
    if (kind === 'sfx') sfxBus.gain.setTargetAtTime(vols.sfx, now(), 0.02);
    else bgmBus.gain.setTargetAtTime(bgmTarget(), now(), 0.05);
  },
  toggle() {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (e) {}
    if (soundOn) {
      unlock();
      if (master) master.gain.setTargetAtTime(0.9, now(), 0.05);
      syncBgm();
      SFX.tap();
    } else {
      if (master) master.gain.setTargetAtTime(0.0001, now(), 0.05);
      stopBgm();
    }
    return soundOn;
  },
};
