/**
 * Turns a stream of reads of ONE tag into a smooth 0..1 "closeness" value for
 * the radar finder.
 *
 * Two signal sources are supported:
 *
 *  1. Read rate (always available). The handheld is a keyboard-wedge reader, so
 *     the page only receives tag text, not signal strength. But while the
 *     trigger is held the reader re-reads a tag many times a second when it is
 *     close / well aligned, and only occasionally when it is far / marginal.
 *     So "reads in the last second" is a good proxy for distance. It is
 *     normalised against the best rate seen so far for this target, so it
 *     self-calibrates to whatever the reader is configured to do.
 *
 *  2. RSSI in dBm (optional). If something supplies it (see the `rfid:read`
 *     event in Search.jsx), it is blended in and makes the radar more precise.
 */

const WINDOW_MS = 1000; // sliding window used to compute reads/second
const LOST_MS = 1500; // no read for this long => signal considered lost
const MIN_PEAK_RATE = 6; // don't let a single stray read look like "right here"

// Typical UHF handheld RSSI range: ~ -75 dBm (edge of range) .. -30 dBm (touching)
const RSSI_FAR = -75;
const RSSI_NEAR = -30;

const clamp01 = (n) => Math.max(0, Math.min(1, n));

export function createProximityTracker() {
  let reads = []; // { t, rssi|null }
  let peakRate = 0;
  let smooth = 0;
  let lastReadAt = 0;

  return {
    /** Call for EVERY read of the target tag (before any de-duplication). */
    record(rssi = null, now = Date.now()) {
      reads.push({ t: now, rssi: Number.isFinite(rssi) ? rssi : null });
      lastReadAt = now;
    },

    /** Call on a timer (~10 Hz). */
    sample(now = Date.now()) {
      reads = reads.filter((r) => now - r.t <= WINDOW_MS);
      const rate = reads.length / (WINDOW_MS / 1000);
      peakRate = Math.max(peakRate, rate);

      const rateStrength = clamp01(rate / Math.max(peakRate, MIN_PEAK_RATE));

      const rssis = reads.filter((r) => r.rssi !== null).map((r) => r.rssi);
      const hasRssi = rssis.length > 0;
      const rssiStrength = hasRssi
        ? clamp01(((rssis.reduce((a, b) => a + b, 0) / rssis.length) - RSSI_FAR) / (RSSI_NEAR - RSSI_FAR))
        : 0;

      const active = now - lastReadAt <= LOST_MS && lastReadAt > 0;
      const target = !active ? 0 : hasRssi ? 0.7 * rssiStrength + 0.3 * rateStrength : rateStrength;

      // Rise quickly, fall slowly: the dot snaps in as you approach and drifts
      // back out when you lose the tag, instead of flickering.
      smooth += (target - smooth) * (target > smooth ? 0.45 : 0.15);
      if (smooth < 0.01) smooth = 0;

      return { strength: smooth, active, rate, hasRssi, lastReadAt };
    },

    reset() {
      reads = [];
      peakRate = 0;
      smooth = 0;
      lastReadAt = 0;
    },
  };
}

export function proximityLabel(strength, active) {
  if (!active && strength < 0.05) return 'No signal — sweep the reader around';
  if (strength > 0.85) return 'Right here';
  if (strength > 0.6) return 'Very close';
  if (strength > 0.35) return 'Getting closer';
  if (strength > 0.12) return 'Far';
  return 'Weak signal';
}