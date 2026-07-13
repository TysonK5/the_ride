import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_GAMEPAD_BINDINGS,
  PS4_BUTTONS,
} from "../../systems/gamepad";
import {
  clearVirtualGamepad,
  setVirtualButton,
  setVirtualLeftStick,
  setVirtualOptions,
  setVirtualRightStick,
} from "../../systems/virtualGamepad";
import "./TouchControls.css";

const ACTION_SHORT = {
  forward: "Fwd",
  back: "Back",
  left: "Left",
  right: "Right",
  sprint: "Sprint",
  interact: "Use",
  mount: "Mount",
  callHorse: "Whistle",
  fly: "Fly↑",
  flyDown: "Fly↓",
};

/** Buttons shown on the touch overlay (action face + shoulders). */
const TOUCH_FACE = [
  { buttonIndex: 3, className: "face-tri" }, // △ mount
  { buttonIndex: 2, className: "face-sq" }, // □ whistle
  { buttonIndex: 1, className: "face-cir" }, // ○
  { buttonIndex: 0, className: "face-crs" }, // ✕ interact
];

const TOUCH_SHOULDERS = [
  { buttonIndex: 6, side: "left" }, // L2 fly down
  { buttonIndex: 4, side: "left" }, // L1
  { buttonIndex: 5, side: "right" }, // R1 sprint
  { buttonIndex: 7, side: "right" }, // R2 fly
];

function actionOnButton(binds, buttonId) {
  for (const [actionId, code] of Object.entries(binds)) {
    if (code === buttonId) return actionId;
  }
  return null;
}

/**
 * Full-screen touch virtual DualShock layout for phones / tablets.
 * Feeds virtualGamepad state consumed by sampleGamepadInput.
 */
export function TouchControls({ settings, onOpenOptions, visible }) {
  const binds = settings?.gamepadBindings || DEFAULT_GAMEPAD_BINDINGS;
  const [activeBtns, setActiveBtns] = useState(() => new Set());

  useEffect(() => {
    if (!visible) clearVirtualGamepad();
    return () => clearVirtualGamepad();
  }, [visible]);

  const pressBtn = useCallback((buttonId, down) => {
    setVirtualButton(buttonId, down);
    setActiveBtns((prev) => {
      const next = new Set(prev);
      if (down) next.add(buttonId);
      else next.delete(buttonId);
      return next;
    });
  }, []);

  if (!visible) return null;

  return (
    <div className="touch-controls" aria-label="On-screen touch controller">
      {/* Left stick — move */}
      <div className="touch-zone touch-zone-left">
        <VirtualStick
          label="Move"
          onChange={setVirtualLeftStick}
        />
        <div className="touch-shoulders touch-shoulders-left">
          {TOUCH_SHOULDERS.filter((s) => s.side === "left").map((s) => {
            const btn = PS4_BUTTONS[s.buttonIndex];
            const actionId = actionOnButton(binds, btn.id);
            return (
              <TouchBtn
                key={btn.id}
                btn={btn}
                actionId={actionId}
                active={activeBtns.has(btn.id)}
                onPress={pressBtn}
              />
            );
          })}
        </div>
      </div>

      {/* Center: menu */}
      <div className="touch-zone touch-zone-center">
        <button
          type="button"
          className="touch-menu-btn"
          onPointerDown={(e) => {
            e.preventDefault();
            setVirtualOptions(true);
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            setVirtualOptions(false);
            onOpenOptions?.();
          }}
          onPointerCancel={() => setVirtualOptions(false)}
          onPointerLeave={() => setVirtualOptions(false)}
        >
          Menu
        </button>
      </div>

      {/* Right: face buttons + look stick */}
      <div className="touch-zone touch-zone-right">
        <div className="touch-shoulders touch-shoulders-right">
          {TOUCH_SHOULDERS.filter((s) => s.side === "right").map((s) => {
            const btn = PS4_BUTTONS[s.buttonIndex];
            const actionId = actionOnButton(binds, btn.id);
            return (
              <TouchBtn
                key={btn.id}
                btn={btn}
                actionId={actionId}
                active={activeBtns.has(btn.id)}
                onPress={pressBtn}
              />
            );
          })}
        </div>
        <div className="touch-face">
          {TOUCH_FACE.map((f) => {
            const btn = PS4_BUTTONS[f.buttonIndex];
            const actionId = actionOnButton(binds, btn.id);
            return (
              <TouchBtn
                key={btn.id}
                btn={btn}
                actionId={actionId}
                active={activeBtns.has(btn.id)}
                onPress={pressBtn}
                className={f.className}
                face
              />
            );
          })}
        </div>
        <VirtualStick label="Look" onChange={setVirtualRightStick} />
      </div>
    </div>
  );
}

function TouchBtn({ btn, actionId, active, onPress, className = "", face = false }) {
  const downRef = useRef(false);

  const end = useCallback(() => {
    if (!downRef.current) return;
    downRef.current = false;
    onPress(btn.id, false);
  }, [btn.id, onPress]);

  return (
    <button
      type="button"
      className={
        "touch-btn" +
        (face ? " is-face" : "") +
        (active ? " is-active" : "") +
        (actionId ? " is-bound" : "") +
        (className ? ` ${className}` : "")
      }
      title={
        actionId
          ? `${btn.name} — ${ACTION_SHORT[actionId] || actionId}`
          : btn.name
      }
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        downRef.current = true;
        onPress(btn.id, true);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        end();
      }}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <span className="touch-btn-glyph">{btn.label}</span>
      {actionId && (
        <span className="touch-btn-action">
          {ACTION_SHORT[actionId] || actionId}
        </span>
      )}
    </button>
  );
}

function VirtualStick({ label, onChange }) {
  const baseRef = useRef(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const activePtr = useRef(null);

  const radius = 48; // px travel for full deflection

  const updateFromEvent = useCallback(
    (e) => {
      const el = baseRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) {
        dx = (dx / dist) * radius;
        dy = (dy / dist) * radius;
      }
      const nx = dx / radius;
      const ny = dy / radius;
      setKnob({ x: dx, y: dy });
      // Standard gamepad: +X right, +Y down
      onChange(nx, ny);
    },
    [onChange, radius]
  );

  const release = useCallback(() => {
    activePtr.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  }, [onChange]);

  return (
    <div
      ref={baseRef}
      className="touch-stick"
      role="slider"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        activePtr.current = e.pointerId;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        updateFromEvent(e);
      }}
      onPointerMove={(e) => {
        if (activePtr.current !== e.pointerId) return;
        e.preventDefault();
        updateFromEvent(e);
      }}
      onPointerUp={(e) => {
        if (activePtr.current !== e.pointerId) return;
        e.preventDefault();
        release();
      }}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span className="touch-stick-label">{label}</span>
      <div
        className="touch-stick-knob"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
