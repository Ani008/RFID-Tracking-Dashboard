/**
 * High-precision Geiger-counter style audio locator built on the Web Audio API.
 *
 * Designed for file-room shelf pinpointing:
 *  - Far (> 2m): Slow, calm beeps (~1 beep/sec, 600-800 Hz).
 *  - Approaching (30cm - 1m): Moderate pace (2-4 beeps/sec, 1000-1400 Hz).
 *  - Close (15cm - 30cm): Fast pace (5-8 beeps/sec, 1500-1900 Hz).
 *  - PINPOINT ZONE (0 - 15cm): Ultra-rapid staccato frenzy (15-25 beeps/sec, 35-70ms interval,
 *    2100-2700 Hz, boosted volume). Enables instantly finding 1 file among 100 on a shelf.
 *  - As soon as the reader moves past 15cm, speed smoothly decelerates back to normal.
 */
export function createBeeper() {
  let ctx = null;
  let muted = false;
  let timer = null;
  let strength = 0;
  let playing = false;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function beep(freq, durMs, volume = 0.3) {
    const c = ensureCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = c.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.min(volume, 0.75), t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + durMs / 1000 + 0.015);
  }

  function tick() {
    timer = null;
    if (!playing || muted || strength <= 0.03) {
      return schedule(120);
    }

    let freq;
    let intervalMs;
    let durMs;
    let volume;

    if (strength >= 0.82) {
      // ==========================================
      // PINPOINT ZONE: 0 to 15 cm
      // Ultra-fast machine-gun rapid beeps (15-25 beeps per second)
      // ==========================================
      const p = Math.min(1, Math.max(0, (strength - 0.82) / 0.18)); // 0..1 within 0-15cm
      // Interval shrinks from 75ms down to 35ms as you get closer to 0cm
      intervalMs = Math.round(75 - p * 40);
      // Frequency ramps up from 2100 Hz to 2750 Hz
      freq = Math.round(2100 + p * 650);
      // Crisp 20ms - 28ms staccato click so every pulse is distinctly heard
      durMs = Math.round(28 - p * 8);
      // Increased punchy volume
      volume = 0.55 + p * 0.15;
    } else if (strength >= 0.60) {
      // 15cm to 40cm
      const p = (strength - 0.60) / 0.22;
      intervalMs = Math.round(210 - p * 135); // 210ms down to 75ms
      freq = Math.round(1450 + p * 650);     // 1450 Hz to 2100 Hz
      durMs = 36;
      volume = 0.38 + p * 0.14;
    } else if (strength >= 0.30) {
      // 40cm to 1.5m
      const p = (strength - 0.30) / 0.30;
      intervalMs = Math.round(520 - p * 310); // 520ms down to 210ms
      freq = Math.round(950 + p * 500);       // 950 Hz to 1450 Hz
      durMs = 45;
      volume = 0.28 + p * 0.10;
    } else {
      // > 1.5m (Far)
      const p = Math.max(0, strength / 0.30);
      intervalMs = Math.round(880 - p * 360); // 880ms down to 520ms (~1-2 beeps/sec)
      freq = Math.round(620 + p * 330);       // 620 Hz to 950 Hz
      durMs = 52;
      volume = 0.22;
    }

    beep(freq, durMs, volume);
    schedule(intervalMs);
  }

  function schedule(ms) {
    if (playing) timer = setTimeout(tick, ms);
  }

  return {
    unlock: ensureCtx,
    start() {
      if (playing) return;
      playing = true;
      ensureCtx();
      schedule(0);
    },
    stop() {
      playing = false;
      clearTimeout(timer);
      timer = null;
    },
    setStrength(s) { strength = s; },
    setMuted(m) { muted = m; },
    destroy() {
      this.stop();
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
    },
  };
}