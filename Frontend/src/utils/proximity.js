/**
 * Real-world physical proximity and directional tracker for the
 * SEUIC AUTOID UTouch2 UHF RFID Handheld Reader.
 *
 * Physical characteristics of the UTouch2 reader:
 *  - 30 to 33 dBm UHF circular antenna (865-868 / 920-925 MHz).
 *  - Touching / immediate range (<0.3m): RSSI is -1 to -10 dBm.
 *  - Close shelf range (~1m): RSSI is -20 to -28 dBm.
 *  - Medium aisle range (~2-3m): RSSI is -32 to -42 dBm.
 *  - Far aisle range (~4-6m): RSSI is -45 to -55 dBm.
 *  - Edge of reception (>6-7m): RSSI is -56 to -58 dBm.
 *
 * This tracker converts live hardware RSSI and pulse rates into un-faked physical
 * distance (0..1 where 0 = outer boundary ~6m, 1 = touching <0.3m) and tracks the
 * true compass bearing where the tag signal peaked.
 */

const HOLD_MS = 30000; // retain tag display during search without dropping to 0
const FLOOR = 0.06; // lowest detectable threshold (outer ring)
const DEFAULT_INTERVAL = 1000;
const KEEP_MS = 30000;
const MIN_READS_TO_TRUST = 1; // Instant trust on the very first read

// Physical calibration limits for SEUIC AUTOID UTouch2 (dBm)
const RSSI_FAR = -58;  // limit of readable range (~6-8 meters) -> 0%
const RSSI_NEAR = -8;  // touching / right on top (<0.3 meters) -> 100%
const MIN_POSITIVE_SPAN = 15;

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clamp01 = (n) => clamp(n, 0, 1);

export function createProximityTracker() {
  let times = []; // { t, rssi|null, heading|null }
  let smooth = 0;
  let lastReadAt = 0;
  let lastTarget = 0;
  let totalReads = 0;
  let burstStart = 0;
  let seenMax = null;
  let maxStrength = 0;
  let exponent = 1;
  let lastRssi = null;
  let lockedBearing = null; // compass bearing where tag signal was strongest

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

  function estimateDistance(rssi) {
    if (rssi == null || !Number.isFinite(rssi)) return null;
    // Log-distance path loss approximation for UHF RFID in indoor shelving:
    // d = 10 ^ ((-8 - rssi) / (10 * 2.2))
    const d = Math.pow(10, (-8 - rssi) / 22);
    return Math.min(Math.max(Math.round(d * 10) / 10, 0.1), 8.0);
  }

  return {
    setSensitivity(e) { exponent = e; },

    record(rssi = null, now = Date.now(), heading = null) {
      if (!lastReadAt || now - lastReadAt > Math.max(3 * beatInterval(), 3000)) burstStart = now;
      let r = Number.isFinite(rssi) ? rssi : null;
      if (r !== null && r < -150) r /= 10;
      if (r !== null && r > 0) seenMax = seenMax === null ? r : Math.max(seenMax, r);
      if (r !== null) lastRssi = r;

      const h = Number.isFinite(heading) ? heading : null;
      times.push({ t: now, rssi: r, heading: h });
      lastReadAt = now;
      totalReads += 1;

      // Update locked bearing from read with strongest signal
      if (h !== null) {
        if (lockedBearing === null) {
          lockedBearing = h;
        } else if (r !== null && (lastRssi === null || r >= lastRssi - 3)) {
          // Weighted moving average towards peak signal direction
          let diff = (h - lockedBearing) % 360;
          if (diff > 180) diff -= 360;
          if (diff < -180) diff += 360;
          lockedBearing = (lockedBearing + diff * 0.4 + 360) % 360;
        }
      }
    },

    sample(now = Date.now()) {
      times = times.filter((r) => now - r.t <= KEEP_MS);
      const T = beatInterval();
      const age = lastReadAt ? now - lastReadAt : Infinity;
      const active = age <= HOLD_MS;
      const liveMs = Math.max(2 * T, 1500);

      let target = 0;
      let ratio = 0;
      let hasRssi = false;
      let currentAvgRssi = null;

      if (age <= liveMs) {
        const W = clamp(5 * T, 2000, 8000);
        const start = Math.max(lastReadAt - W, burstStart);
        const inWin = times.filter((r) => r.t >= start);
        const expected = (lastReadAt - start) / T + 1;
        ratio = clamp01(inWin.length / expected);
        if (inWin.length < MIN_READS_TO_TRUST) ratio = Math.min(ratio, 0.35);

        const rssis = inWin.filter((r) => r.rssi !== null).map((r) => r.rssi);
        hasRssi = rssis.length > 0;
        if (hasRssi) {
          currentAvgRssi = rssis.reduce((a, b) => a + b, 0) / rssis.length;
          const rssiStrength = scaleRssi(currentAvgRssi);
          const fill = Math.pow(ratio, exponent);
          // Primary weight given to physical RSSI from the hardware
          target = 0.85 * rssiStrength + 0.15 * fill;
        } else {
          target = Math.pow(ratio, exponent);
        }

        // Tag is genuine: preserve whatever real strength was detected
        target = Math.max(target, FLOOR);
        lastTarget = target;

        // Also check if any recent read in the window had a heading
        const withHeadings = inWin.filter((r) => r.heading !== null && r.rssi !== null);
        if (withHeadings.length > 0) {
          withHeadings.sort((a, b) => (b.rssi || -999) - (a.rssi || -999));
          lockedBearing = withHeadings[0].heading;
        }
      } else if (totalReads > 0) {
        // Keep the tag visible at its last confirmed physical distance without artificial inflation
        target = lastTarget;
      }

      // Ultra-fast responsiveness for rapid shelf scanning: immediate rise on target, swift drop when moving away
      smooth += (target - smooth) * (target > smooth ? 0.92 : 0.55);
      if (smooth < 0.01) smooth = totalReads > 0 ? lastTarget : 0;
      maxStrength = Math.max(maxStrength, smooth);

      return {
        strength: smooth,
        maxStrength,
        active,
        ratio,
        interval: Math.round(T) / 1000,
        hasRssi,
        rssi: currentAvgRssi !== null ? Math.round(currentAvgRssi) : lastRssi,
        estDistance: estimateDistance(currentAvgRssi !== null ? currentAvgRssi : lastRssi),
        lockedBearing,
        totalReads,
        everSeen: totalReads > 0,
        seenAgo: lastReadAt ? Math.round((now - lastReadAt) / 100) / 10 : null,
      };
    },

    reset() {
      times = [];
      smooth = 0;
      maxStrength = 0;
      lastReadAt = 0;
      lastTarget = 0;
      totalReads = 0;
      burstStart = 0;
      seenMax = null;
      lastRssi = null;
      lockedBearing = null;
    },
  };
}

export function proximityLabel(strength, active, everSeen = false, maxStrength = 0, seenAgo = null, inBeam = true, estDistance = null) {
  if (everSeen) {
    const distText = estDistance != null ? ` (~${estDistance}m)` : '';
    if (inBeam) {
      if (strength >= 0.82) return `🔥 EXACT FILE • PINPOINT (<15cm)!`;
      if (strength >= 0.60) return `🎯 In Beam • Very close${distText}`;
      if (strength >= 0.30) return `🎯 In Beam • Medium range${distText}`;
      return `🎯 In Beam • File detected in distance${distText}`;
    }
    return '📡 Target Detected • Align handheld beam with file';
  }
  return '📡 Searching… Sweep handheld reader around room';
}