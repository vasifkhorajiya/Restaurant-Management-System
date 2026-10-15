// Tiny "ding" for staff screens (new order / table request). Uses the Web Audio API — no audio file needed.
// Browsers only allow sound after the user has clicked something on the page once.
let ctx;
const KEY = 'sound-enabled';

export const soundEnabled = () => localStorage.getItem(KEY) !== 'off';
export const setSoundEnabled = (on) => localStorage.setItem(KEY, on ? 'on' : 'off');

export function ding() {
  if (!soundEnabled()) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    [880, 1175].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    });
  } catch { /* audio blocked — ignore */ }
}
