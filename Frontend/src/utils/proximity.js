/**
 * Turns a stream of reads of ONE tag into a smooth 0..1 "closeness" value for
 * the radar finder.
 *
 * Two signal sources are supported:
 *
 *  1. Read rate (always available). The handheld is a keyboard-wedge reader, so
 *     the page only receives tag text, not signal strength. While the trigger
 *     is held the reader re-reads a tag more often when it is close / well
 *     aligned and only occasionally when it is far / marginal (e.g. a file
 *     deep in a rack). So "reads in the last couple of seconds" is a proxy for
 *     distance. It is normalised against the best rate seen so far.
 *
 *  2. RSSI in dBm (optional). If something supplies it (see the `rfid:read`
 *     event in Search.jsx), it is blended in and makes the radar more precise.
 *
 * Reads from a far / shielded tag can be several seconds apart, so after the
 * last read the signal fades out slowly (HOLD_MS) instead of dropping to
 * "no signal" straight away.
 */

const WINDOW_MS = 2000; // sliding window used to compute reads/second
const HOLD_MS = 5000; // keep showing the tag (fading) this long after its last read
const MIN_PEAK_RATE = 4; // don't let a single stray read look like "right here"
const FLOOR = 0.08; // a tag seen within HOLD_MS never fades below this

// Typical UHF handheld RSSI range: ~ -75 dBm (edge of range) .. -30 dBm (touching)
const RSSI_FAR = -75;
const RSSI_NEAR = -30;

const clamp01 = (n) => Math.max(0, Math.min(1, n));

export function createProximityTracker() {
  let reads = []; // { t, rssi|null }
  let peakRate = 0;
  let smooth = 0;
  let lastReadAt = 0;
  let lastTarget = 0;
  let totalReads = 0;

  return {
    /** Call for EVERY read of the target tag (before any de-duplication). */
    record(rssi = null, now = Date.now()) {
      reads.push({ t: now, rssi: Number.isFinite(rssi) ? rssi : null });
      lastReadAt = now;
      totalReads += 1;
    },

    /** Call on a timer (~10 Hz). */
    sample(now = Date.now()) {
      reads = reads.filter((r) => now - r.t <= WINDOW_MS);
      const age = lastReadAt ? now - lastReadAt : Infinity;
      const active = age <= HOLD_MS;

      let target = 0;
      let rate = 0;
      let hasRssi = false;
      if (age <= WINDOW_MS) {
        rate = reads.length / (WINDOW_MS / 1000);
        peakRate = Math.max(peakRate, rate);
        const rateStrength = clamp01(rate / Math.max(peakRate, MIN_PEAK_RATE));
        const rssis = reads.filter((r) => r.rssi !== null).map((r) => r.rssi);
        hasRssi = rssis.length > 0;
        const rssiStrength = hasRssi
          ? clamp01(((rssis.reduce((a, b) => a + b, 0) / rssis.length) - RSSI_FAR) / (RSSI_NEAR - RSSI_FAR))
          : 0;
        target = hasRssi ? 0.7 * rssiStrength + 0.3 * rateStrength : rateStrength;
        // A fresh read always counts for something.
        target = Math.max(target, FLOOR);
        lastTarget = target;
      } else if (active) {
        // Between sparse reads: fade from the last value down to the floor.
        const fade = 1 - (age - WINDOW_MS) / (HOLD_MS - WINDOW_MS);
        target = Math.max(FLOOR, lastTarget * clamp01(fade));
      }

      // Rise quickly, fall slowly: the dot snaps in as you approach and drifts
      // back out when you lose the tag, instead of flickering.
      smooth += (target - smooth) * (target > smooth ? 0.45 : 0.15);
      if (smooth < 0.01) smooth = 0;

      return {
        strength: smooth,
        active,
        rate: Math.round(rate * 10) / 10,
        hasRssi,
        totalReads,
        everSeen: totalReads > 0,
        seenAgo: lastReadAt ? Math.round((now - lastReadAt) / 100) / 10 : null,
      };
    },

    reset() {
      reads = [];
      peakRate = 0;
      smooth = 0;
      lastReadAt = 0;
      lastTarget = 0;
      totalReads = 0;
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