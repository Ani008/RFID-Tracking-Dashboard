import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { createBeeper } from '../utils/beeper.js';
import { proximityLabel } from '../utils/proximity.js';
import './RadarFinder.css';

const SIZE = 280;
const C = SIZE / 2;
const R_MAX = 118; // outermost ring
const R_MIN = 16; // dot never covers the centre reader icon

/**
 * Radar-style finder. The centre is the handheld reader; the yellow dot is the
 * file. The stronger the signal, the closer the dot gets to the centre and the
 * faster/higher the beeps.
 *
 * Note: a single UHF reader can't tell direction, only signal strength, so the
 * dot's angle is cosmetic. Distance (and the beeps) are the real information.
 */
export default function RadarFinder({ tracker, fileLabel }) {
  const [state, setState] = useState({ strength: 0, active: false, rate: 0, hasRssi: false });
  const [muted, setMuted] = useState(false);
  const beeper = useRef(null);

  useEffect(() => {
    const b = createBeeper();
    beeper.current = b;
    b.start();
    const id = setInterval(() => {
      const s = tracker.sample();
      b.setStrength(s.strength);
      setState(s);
    }, 100);
    return () => {
      clearInterval(id);
      b.destroy();
    };
  }, [tracker]);

  useEffect(() => { beeper.current?.setMuted(muted); }, [muted]);

  const { strength, active, rate, hasRssi } = state;
  const dist = R_MIN + (1 - strength) * (R_MAX - R_MIN);
  const angle = (-50 * Math.PI) / 180;
  const dx = C + Math.cos(angle) * dist;
  const dy = C + Math.sin(angle) * dist;
  const visible = active || strength > 0.03;
  const pct = Math.round(strength * 100);
  const tone = strength > 0.6 ? 'hot' : strength > 0.25 ? 'warm' : 'cold';

  return (
    <div className={`radar radar-${tone}`}>
      <button
        type="button"
        className="radar-mute"
        onClick={(e) => { e.stopPropagation(); beeper.current?.unlock(); setMuted((m) => !m); }}
        aria-label={muted ? 'Unmute beeps' : 'Mute beeps'}
        title={muted ? 'Unmute beeps' : 'Mute beeps'}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar-svg" role="img" aria-label={`Radar finder for ${fileLabel}`}>
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#12311f" />
            <stop offset="100%" stopColor="#0a1a12" />
          </radialGradient>
          <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0" />
            <stop offset="100%" stopColor="#4ade80" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        <circle cx={C} cy={C} r={R_MAX + 14} fill="url(#radar-bg)" />
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} cx={C} cy={C} r={R_MAX * f} className="radar-ring" />
        ))}
        <line x1={C - R_MAX - 6} y1={C} x2={C + R_MAX + 6} y2={C} className="radar-axis" />
        <line x1={C} y1={C - R_MAX - 6} x2={C} y2={C + R_MAX + 6} className="radar-axis" />

        {/* rotating sweep */}
        <g className="radar-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
          <path d={`M ${C} ${C} L ${C + R_MAX + 10} ${C} A ${R_MAX + 10} ${R_MAX + 10} 0 0 0 ${C + (R_MAX + 10) * Math.cos(-0.7)} ${C + (R_MAX + 10) * Math.sin(-0.7)} Z`} fill="url(#radar-sweep)" />
        </g>

        {/* the file */}
        {visible && (
          <g className="radar-target" style={{ transform: `translate(${dx}px, ${dy}px)` }}>
            <circle r={14 + strength * 8} className="radar-target-halo" />
            <rect x="-7" y="-7" width="14" height="14" rx="2.5" className="radar-target-dot" />
          </g>
        )}

        {/* the reader (centre) */}
        <g transform={`translate(${C} ${C})`}>
          <circle r="13" className="radar-center-bg" />
          <g className="radar-reader" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M -4 -6 h 6 a 3 3 0 0 1 3 3 v 4 l -3 6 h -6 z" />
            <path d="M 5 -4 q 3 2 0 6" />
          </g>
        </g>
      </svg>

      <div className="radar-readout">
        <div className="radar-label">{proximityLabel(strength, active)}</div>
        <div className="radar-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        <div className="radar-sub">
          {active
            ? `${pct}% signal · ${rate} read${rate === 1 ? '' : 's'}/s${hasRssi ? ' · RSSI on' : ''}`
            : 'Hold the trigger and move the reader around. Closer = faster beeps.'}
        </div>
      </div>
    </div>
  );
}