/**
 * Turns a stream of reads of ONE tag into a smooth 0..1 "closeness" value for
 * the radar finder.
 *
 * The handheld is a keyboard-wedge reader, so the page only gets tag text, not
 * signal strength. On the UTouch2 the reader app repeats a tag at a roughly
 * fixed interval (about once per 1-2 s) no matter how close it is, so raw
 * "reads per second" can't tell near from far.
 *
 * What does change with distance is how RELIABLY the reads arrive:
 *   - close tag  -> a read on every beat of the reader's interval
 *   - far tag    -> beats are missed (gaps)
 * So we learn the reader's normal interval from the gaps between reads, then
 * measure what fraction of the expected beats actually arrived recently.
 *
 * If something supplies RSSI (see the `rfid:read` event in Search.jsx) it is
 * blended in and makes the radar more precise.
 */

const HOLD_MS = 5000; // keep showing the tag (fading) this long after its last read
const FLOOR = 0.08; // a tag seen within HOLD_MS never fades below this
const DEFAULT_INTERVAL = 1000; // assumed beat until we've seen a few reads
const KEEP_MS = 30000;
const MIN_READS_TO_TRUST = 3; // fewer reads than this can't claim "very close"

// RSSI unit from the SEUIC SDK is not documented, so we handle it defensively:
//  - negative numbers are treated as dBm: ~ -75 (edge of range) .. -30 (touching)
//    (values below -150 are assumed to be dBm x10 and divided by 10)
//  - positive numbers (e.g. raw 0..255) are scaled against the largest value
//    seen during this search, so it is relative rather than absolute.
// Once you have your real calibration numbers, tune these two constants.
const RSSI_FAR = -75;
const RSSI_NEAR = -30;
const MIN_POSITIVE_SPAN = 15; // avoid exaggerating tiny RSSI jitter

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clamp01 = (n) => clamp(n, 0, 1);

export function createProximityTracker() {
  let times = []; // { t, rssi|null }
  let smooth = 0;
  let lastReadAt = 0;
  let lastTarget = 0;
  let totalReads = 0;
  let burstStart = 0;
  let seenMax = null; // largest positive-style RSSI seen this search
  let exponent = 1; // sensitivity curve: <1 pulls the dot in sooner, >1 makes it harder

  // The reader's usual gap between reads = a low percentile of recent gaps
  // (long gaps are just the trigger being released / the tag being missed).
  function beatInterval() {
    const gaps = [];
    for (let i = 1; i < times.length; i++) {
      const g = times[i].t - times[i - 1].t;
      if (g > 0 && g <= 4000) gaps.push(g);
    }
    if (gaps.length < 2) return DEFAULT_INTERVAL;
    gaps.sort((a, b) => a - b);
    return clamp(gaps[Math.floor(gaps.length * 0.2)], 150, 2500);
  }

  function scaleRssi(avg) {
    if (avg <= 0) return clamp01((avg - RSSI_FAR) / (RSSI_NEAR - RSSI_FAR));
    const span = Math.max(MIN_POSITIVE_SPAN, seenMax || 0);
    return clamp01((avg - (seenMax - span)) / span);
  }

  return {
    /** Lower exponent = more sensitive (dot reaches the centre sooner). */
    setSensitivity(e) { exponent = e; },

    /** Call for EVERY read of the target tag (before any de-duplication). */
    record(rssi = null, now = Date.now()) {
      // A long silence starts a new "burst" (e.g. a fresh trigger press).
      if (!lastReadAt || now - lastReadAt > Math.max(3 * beatInterval(), 3000)) burstStart = now;
      let r = Number.isFinite(rssi) ? rssi : null;
      if (r !== null && r < -150) r /= 10; // dBm x10 -> dBm
      if (r !== null && r > 0) seenMax = seenMax === null ? r : Math.max(seenMax, r);
      times.push({ t: now, rssi: r });
      lastReadAt = now;
      totalReads += 1;
    },

    /** Call on a timer (~10 Hz). */
    sample(now = Date.now()) {
      times = times.filter((r) => now - r.t <= KEEP_MS);
      const T = beatInterval();
      const age = lastReadAt ? now - lastReadAt : Infinity;
      const active = age <= HOLD_MS;
      const liveMs = Math.max(2 * T, 1500); // still "being read right now"

      let target = 0;
      let ratio = 0;
      let hasRssi = false;
      if (age <= liveMs) {
        const W = clamp(5 * T, 2000, 8000);
        const start = Math.max(lastReadAt - W, burstStart);
        const inWin = times.filter((r) => r.t >= start);
        // Beats we'd expect between `start` and the latest read, inclusive.
        const expected = (lastReadAt - start) / T + 1;
        ratio = clamp01(inWin.length / expected);
        if (inWin.length < MIN_READS_TO_TRUST) ratio = Math.min(ratio, 0.35);

        const rssis = inWin.filter((r) => r.rssi !== null).map((r) => r.rssi);
        hasRssi = rssis.length > 0;
        const rssiStrength = hasRssi ? scaleRssi(rssis.reduce((a, b) => a + b, 0) / rssis.length) : 0;
        const fill = Math.pow(ratio, exponent);
        target = hasRssi ? 0.7 * rssiStrength + 0.3 * fill : fill;
        target = Math.max(target, FLOOR); // a fresh read always counts for something
        lastTarget = target;
      } else if (active) {
        // Between reads: fade from the last value down to the floor.
        const fade = 1 - (age - liveMs) / (HOLD_MS - liveMs);
        target = Math.max(FLOOR, lastTarget * clamp01(fade));
      }

      // Rise quickly, fall slowly so the dot doesn't flicker.
      smooth += (target - smooth) * (target > smooth ? 0.45 : 0.15);
      if (smooth < 0.01) smooth = 0;

      return {
        strength: smooth,
        active,
        ratio,
        interval: Math.round(T) / 1000,
        hasRssi,
        totalReads,
        everSeen: totalReads > 0,
        seenAgo: lastReadAt ? Math.round((now - lastReadAt) / 100) / 10 : null,
      };
    },

    reset() {
      times = [];
      smooth = 0;
      lastReadAt = 0;
      lastTarget = 0;
      totalReads = 0;
      burstStart = 0;
      seenMax = null;
    },
  };
}

export function proximityLabel(strength, active, everSeen = false) {
  if (!active && strength < 0.05) {
    return everSeen ? 'Signal lost — move back toward where it was last read' : 'No signal — sweep the reader around';
  }
  if (strength > 0.85) return 'Right here';
  if (strength > 0.6) return 'Very close';
  if (strength > 0.35) return 'Getting closer';
  if (strength > 0.12) return 'Far';
  return 'Weak signal';
}