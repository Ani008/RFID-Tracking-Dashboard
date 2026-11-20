/**
 * Geiger-counter style proximity beeper built on the Web Audio API.
 * Closer => faster beeps and a higher pitch. Right on top => continuous tone.
 *
 * Browsers only allow audio after a user gesture, so call `unlock()` from a
 * click/tap handler (e.g. the button that starts the search).
 */
export function createBeeper() {
  let ctx = null;
  let muted = false;
  let timer = null;
  let strength = 0;
  let playing = false;
  let tone = null; // continuous tone nodes when "right here"

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function beep(freq, durMs) {
    const c = ensureCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = c.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durMs / 1000);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + durMs / 1000 + 0.02);
  }

  function stopTone() {
    if (!tone) return;
    try { tone.osc.stop(); } catch { /* already stopped */ }
    tone = null;
  }

  function startTone(freq) {
    const c = ensureCtx();
    if (!c) return;
    if (tone) { tone.osc.frequency.value = freq; return; }
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.25;
    osc.connect(gain).connect(c.destination);
    osc.start();
    tone = { osc };
  }

  function tick() {
    timer = null;
    if (!playing || muted || strength <= 0.02) { stopTone(); return schedule(150); }
    const freq = 500 + strength * 1100; // 500 Hz far .. 1600 Hz close
    if (strength >= 0.9) {
      startTone(freq);
      return schedule(100);
    }
    stopTone();
    beep(freq, 70);
    // 900 ms between beeps when far, ~90 ms when very close
    schedule(900 - strength * 810);
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
      stopTone();
    },
    setStrength(s) { strength = s; },
    setMuted(m) { muted = m; if (m) stopTone(); },
    destroy() {
      this.stop();
      if (ctx) ctx.close().catch(() => {});
      ctx = null;
    },
  };
}