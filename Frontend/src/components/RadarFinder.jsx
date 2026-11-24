import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, CheckCircle2, Square, Navigation, Crosshair, ArrowLeft, ArrowRight, RotateCcw, Zap } from 'lucide-react';
import { createBeeper } from '../utils/beeper.js';
import { proximityLabel } from '../utils/proximity.js';
import './RadarFinder.css';

const SIZE = 280;
const C = SIZE / 2;
const R_MAX = 118; // outermost ring
const R_MIN = 24; // minimum distance from centre reader
const BEAM_HALF_ANGLE = 28; // antenna aperture cone in degrees (±28°)

const SENS = [
  { label: 'Low', exp: 1.6 },
  { label: 'Medium', exp: 1 },
  { label: 'High', exp: 0.6 },
];

export default function RadarFinder({ tracker, fileLabel, onOpenFile, onStop, targetFile }) {
  const [state, setState] = useState({
    strength: 0,
    maxStrength: 0,
    active: false,
    interval: 1,
    hasRssi: false,
    rssi: null,
    estDistance: null,
    lockedBearing: null,
    totalReads: 0,
    everSeen: false,
    seenAgo: null,
  });

  const [muted, setMuted] = useState(false);
  const beeper = useRef(null);

  // Live real-world handheld reader compass heading (0..360°)
  const [deviceHeading, setDeviceHeading] = useState(0);
  // Physical room bearing (0..360°) where the target file was detected
  const targetBearing = useRef(0);
  const headingAvailable = useRef(false);

  // Curve exponent
  const [sens, setSens] = useState(1);
  useEffect(() => {
    tracker.setSensitivity(SENS[sens].exp);
  }, [tracker, sens]);

  // Real-time Compass & Native Reader Orientation Listener
  useEffect(() => {
    // 1. Native Android bridge custom event (dispatched by DashboardBridge in WebView)
    function handleNativeHeading(e) {
      const h = Number(e.detail?.heading);
      if (Number.isFinite(h)) {
        headingAvailable.current = true;
        setDeviceHeading((h + 360) % 360);
      }
    }

    // 2. Standard W3C DeviceOrientation events (fallback)
    function handleOrientation(e) {
      let h = null;
      if (e.webkitCompassHeading != null) {
        h = e.webkitCompassHeading;
      } else if (e.alpha != null) {
        h = (360 - e.alpha) % 360;
      }
      if (h !== null && !isNaN(h)) {
        headingAvailable.current = true;
        setDeviceHeading(h);
      }
    }

    window.addEventListener('rfid:heading', handleNativeHeading);
    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    return () => {
      window.removeEventListener('rfid:heading', handleNativeHeading);
      window.removeEventListener('deviceorientation', handleOrientation, true);
      window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
    };
  }, []);

  // Proximity sampling & audio feedback
  useEffect(() => {
    const b = createBeeper();
    beeper.current = b;
    b.start();

    const id = setInterval(() => {
      // Check native interface directly if available
      try {
        if (window.RFIDNative && typeof window.RFIDNative.getHeading === 'function') {
          const nh = Number(window.RFIDNative.getHeading());
          if (Number.isFinite(nh)) {
            headingAvailable.current = true;
            setDeviceHeading((nh + 360) % 360);
          }
        }
      } catch (_) {}

      const s = tracker.sample();
      b.setStrength(s.strength);
      setState(s);

      // Lock or update target bearing from physical hardware read
      if (s.lockedBearing != null) {
        targetBearing.current = s.lockedBearing;
      } else if (s.active && s.strength > 0.08) {
        if (!targetBearing.current) {
          targetBearing.current = deviceHeading;
        }
      }
    }, 25);

    return () => {
      clearInterval(id);
      b.destroy();
    };
  }, [tracker, deviceHeading]);

  useEffect(() => {
    beeper.current?.setMuted(muted);
  }, [muted]);

  const { strength, maxStrength, active, hasRssi, rssi, estDistance, totalReads, everSeen, seenAgo } = state;

  // Calculate relative angle between antenna beam (deviceHeading) and target file
  let diff = (targetBearing.current - deviceHeading) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  const inBeam = Math.abs(diff) <= BEAM_HALF_ANGLE;
  const isPinpoint = inBeam && strength >= 0.82;
  const isLeft = diff < -BEAM_HALF_ANGLE && diff >= -120;
  const isRight = diff > BEAM_HALF_ANGLE && diff <= 120;
  const isBehind = Math.abs(diff) > 120;

  // Un-faked physical distance from center (0..1 maps to R_MAX .. R_MIN)
  const dist = R_MIN + (1 - strength) * (R_MAX - R_MIN);

  // Position of target dot: 0° is North (12 o'clock), 90° East (3 o'clock), 270° West (9 o'clock)
  const targetRad = (targetBearing.current * Math.PI) / 180;
  const dx = C + Math.sin(targetRad) * dist;
  const dy = C - Math.cos(targetRad) * dist;

  // Dot is visible once ever detected
  const visible = everSeen || active || strength > 0.02;
  const pct = Math.round(strength * 100);
  const tone = strength >= 0.70 ? 'hot' : strength >= 0.35 ? 'warm' : 'cold';

  // Directional Antenna Beam Path (pointing UP relative to reader axis)
  const coneRadius = R_MAX + 8;
  const radHalf = (BEAM_HALF_ANGLE * Math.PI) / 180;
  const x1 = C - Math.sin(radHalf) * coneRadius;
  const y1 = C - Math.cos(radHalf) * coneRadius;
  const x2 = C + Math.sin(radHalf) * coneRadius;
  const y2 = C - Math.cos(radHalf) * coneRadius;
  const beamPath = `M ${C} ${C} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${coneRadius} ${coneRadius} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z`;

  return (
    <div className={`radar radar-${tone} ${inBeam && active ? 'radar-beam-active' : ''} ${isPinpoint ? 'radar-pinpoint-active' : ''}`}>
      <button
        type="button"
        className="radar-mute"
        onClick={(e) => {
          e.stopPropagation();
          beeper.current?.unlock();
          setMuted((m) => !m);
        }}
        aria-label={muted ? 'Unmute beeps' : 'Mute beeps'}
        title={muted ? 'Unmute beeps' : 'Mute beeps'}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>

      {/* Direction guidance banner */}
      <div
        className={`radar-guidance-pill ${
          !everSeen
            ? ''
            : isPinpoint
            ? 'aim-pinpoint'
            : inBeam
            ? 'aim-direct'
            : isLeft
            ? 'turn-left'
            : isRight
            ? 'turn-right'
            : 'turn-around'
        }`}
      >
        {!everSeen ? (
          <>
            <Navigation size={14} className="radar-sweep-icon" /> Sweep reader around room
          </>
        ) : isPinpoint ? (
          <>
            <Crosshair size={16} /> 🔥 EXACT FILE • PINPOINT (&lt;15cm)!
          </>
        ) : inBeam ? (
          <>
            <Crosshair size={15} /> Direct Aim • In Beam Range! {estDistance != null ? `(~${estDistance}m)` : ''}
          </>
        ) : isLeft ? (
          <>
            <ArrowLeft size={15} /> Turn Left ({Math.round(Math.abs(diff))}°)
          </>
        ) : isRight ? (
          <>
            Turn Right ({Math.round(Math.abs(diff))}°) <ArrowRight size={15} />
          </>
        ) : (
          <>
            <RotateCcw size={15} /> Behind You • Turn Around
          </>
        )}
      </div>

      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="radar-svg" role="img" aria-label={`Radar finder for ${fileLabel}`}>
        <defs>
          <radialGradient id="radar-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#12311f" />
            <stop offset="100%" stopColor="#09160f" />
          </radialGradient>

          {/* Normal antenna beam gradient */}
          <radialGradient id="beam-gradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.35" />
            <stop offset="70%" stopColor="#22c55e" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#16a34a" stopOpacity="0.05" />
          </radialGradient>

          {/* Active target-locked beam gradient */}
          <radialGradient id="beam-gradient-active" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#86efac" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#22c55e" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#15803d" stopOpacity="0.12" />
          </radialGradient>
        </defs>

        {/* Outer background */}
        <circle cx={C} cy={C} r={R_MAX + 14} fill="url(#radar-bg)" />

        {/* Distance Rings */}
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} cx={C} cy={C} r={R_MAX * f} className={`radar-ring ${f === 1 ? 'outer' : ''}`} />
        ))}

        {/* Crosshair Axes */}
        <line x1={C - R_MAX - 6} y1={C} x2={C + R_MAX + 6} y2={C} className="radar-axis" />
        <line x1={C} y1={C - R_MAX - 6} x2={C} y2={C + R_MAX + 6} className="radar-axis" />

        {/* Cardinal Compass Markers */}
        <text x={C} y="15" textAnchor="middle" className="radar-cardinal">N</text>
        <text x={SIZE - 10} y={C + 4} textAnchor="middle" className="radar-cardinal">E</text>
        <text x={C} y={SIZE - 6} textAnchor="middle" className="radar-cardinal">S</text>
        <text x="10" y={C + 4} textAnchor="middle" className="radar-cardinal">W</text>

        {/* DYNAMIC ANTENNA BEAM CONE (Rotates dynamically with the handheld reader) */}
        <g transform={`rotate(${deviceHeading.toFixed(1)}, ${C}, ${C})`} className="radar-beam-group">
          <path d={beamPath} className={`radar-beam-cone ${inBeam && active ? 'active' : ''}`} />
        </g>

        {/* TARGET FILE DOT (Placed at real physical room bearing and measured distance) */}
        {visible && (
          <g className="radar-target" style={{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }}>
            <circle r={14 + strength * 10} className={`radar-target-halo ${inBeam ? 'active-halo' : ''}`} />
            <rect x="-8" y="-8" width="16" height="16" rx="3.5" className={`radar-target-dot ${inBeam ? 'active-dot' : ''}`} />
          </g>
        )}

        {/* THE READER AT CENTRE (Arrow rotates with reader heading) */}
        <g transform={`translate(${C} ${C}) rotate(${deviceHeading.toFixed(1)})`}>
          <circle r="15" className="radar-center-bg" />
          <path d="M 0 -11 L 5 -3 L 2 -3 L 2 7 L -2 7 L -2 -3 L -5 -3 Z" className="radar-reader-arrow" />
        </g>
      </svg>

      <button
        type="button"
        className="radar-sens"
        onClick={(e) => {
          e.stopPropagation();
          setSens((s) => (s + 1) % SENS.length);
        }}
        title="Cycle sensitivity curve"
      >
        Sensitivity: <strong>{SENS[sens].label}</strong>
      </button>

      {/* Real-time status readout (Un-faked numbers) */}
      <div className="radar-readout">
        <div className="radar-label">{proximityLabel(strength, active, everSeen, maxStrength, seenAgo, inBeam, estDistance)}</div>
        <div className="radar-bar" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="radar-sub">
          {everSeen ? (
            <>
              <strong>{pct}% signal</strong>
              {rssi != null && <span> · {rssi} dBm</span>}
              {estDistance != null && <span> · ~{estDistance}m dist</span>}
              <span> · {totalReads} read{totalReads === 1 ? '' : 's'}</span>
              <span> · {inBeam ? '🎯 In Beam' : 'Rotate reader to align beam'}</span>
            </>
          ) : (
            'Hold the trigger and sweep reader across the shelf room.'
          )}
        </div>
      </div>

      {/* Target File Card & Action Buttons */}
      {targetFile && (
        <div className="radar-file-card">
          <div className="radar-file-title">{targetFile.fileName || fileLabel}</div>
          <div className="radar-file-meta">
            <div>
              File ID
              <strong className="mono">{targetFile.fileId}</strong>
            </div>
            <div>
              Case Number
              <strong>{targetFile.caseId || '—'}</strong>
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              Shelf / Rack Location
              <strong>{targetFile.storageLocation || 'Location not recorded'}</strong>
            </div>
          </div>

          <div className="radar-actions" style={{ flexDirection: 'column' }}>
            {window.RFIDNative?.openRadar && targetFile && (
              <button
                type="button"
                className="btn-radar-native"
                onClick={(e) => {
                  e.stopPropagation();
                  window.RFIDNative.openRadar(
                    targetFile.fileId || '',
                    targetFile.rfidTag || '',
                    targetFile.fileName || '',
                    targetFile.caseId || '',
                    targetFile.storageLocation || ''
                  );
                }}
              >
                <Zap size={16} /> ⚡ Launch 60 FPS Native Radar
              </button>
            )}

            <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
              {onOpenFile && (
                <button
                  type="button"
                  className="btn-radar-open"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenFile();
                  }}
                >
                  <CheckCircle2 size={16} /> Open File
                </button>
              )}

              {onStop && (
                <button
                  type="button"
                  className="btn-radar-stop"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop();
                  }}
                  title="Stop searching and return"
                >
                  <Square size={14} /> Stop
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
