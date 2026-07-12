import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTION_DEFS,
  DEFAULT_SETTINGS,
  formatKeyCode,
  saveSettings,
} from "../../systems/settings";
import {
  PS4_BUTTONS,
  detectGamepadButtonPress,
  formatGamepadCode,
  gamepadConnectionLabel,
} from "../../systems/gamepad";
import "./OptionsMenu.css";

/** Short labels for action tags drawn on the controller diagram */
const ACTION_SHORT = {
  forward: "Fwd",
  back: "Back",
  left: "Left",
  right: "Right",
  sprint: "Sprint",
  interact: "Use",
};

export function OptionsMenu({
  settings,
  onChange,
  onResume,
  onCloseToTitle,
  showResume = true,
}) {
  /** 'kb' | 'gp' listening mode, or null */
  const [listening, setListening] = useState(null); // action id for keyboard
  const [gpListening, setGpListening] = useState(null); // action id for gamepad
  const [padStatus, setPadStatus] = useState(() => gamepadConnectionLabel());
  const prevPadButtonsRef = useRef(new Set());

  const update = useCallback(
    (partial) => {
      const next = { ...settings, ...partial };
      if (partial.bindings) {
        next.bindings = { ...settings.bindings, ...partial.bindings };
      }
      if (partial.gamepadBindings) {
        next.gamepadBindings = {
          ...settings.gamepadBindings,
          ...partial.gamepadBindings,
        };
      }
      onChange(next);
      saveSettings(next);
    },
    [settings, onChange]
  );

  const setBinding = useCallback(
    (actionId, code) => {
      const bindings = { ...settings.bindings };
      for (const [id, c] of Object.entries(bindings)) {
        if (id !== actionId && c === code) {
          bindings[id] = bindings[actionId];
        }
      }
      bindings[actionId] = code;
      update({ bindings });
      setListening(null);
    },
    [settings.bindings, update]
  );

  const setGamepadBinding = useCallback(
    (actionId, code) => {
      const gamepadBindings = { ...(settings.gamepadBindings || {}) };
      for (const [id, c] of Object.entries(gamepadBindings)) {
        if (id !== actionId && c === code) {
          gamepadBindings[id] = gamepadBindings[actionId];
        }
      }
      gamepadBindings[actionId] = code;
      update({ gamepadBindings });
      setGpListening(null);
    },
    [settings.gamepadBindings, update]
  );

  // Keyboard rebind listener
  useEffect(() => {
    if (!listening) return;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === "Escape") {
        setListening(null);
        return;
      }
      setBinding(listening, e.code);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [listening, setBinding]);

  // Gamepad rebind: poll for a new button press (or cancel with Esc)
  useEffect(() => {
    if (!gpListening) {
      prevPadButtonsRef.current = new Set();
      return;
    }
    const onKey = (e) => {
      if (e.code === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setGpListening(null);
      }
    };
    window.addEventListener("keydown", onKey, true);

    let raf = 0;
    const tick = () => {
      const { code, pressedNow } = detectGamepadButtonPress(
        prevPadButtonsRef.current
      );
      prevPadButtonsRef.current = pressedNow;
      if (code) {
        setGamepadBinding(gpListening, code);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [gpListening, setGamepadBinding]);

  // Connection status refresh
  useEffect(() => {
    const refresh = () => setPadStatus(gamepadConnectionLabel());
    refresh();
    window.addEventListener("gamepadconnected", refresh);
    window.addEventListener("gamepaddisconnected", refresh);
    const id = setInterval(refresh, 1500);
    return () => {
      window.removeEventListener("gamepadconnected", refresh);
      window.removeEventListener("gamepaddisconnected", refresh);
      clearInterval(id);
    };
  }, []);

  const resetDefaults = () => {
    const next = structuredClone(DEFAULT_SETTINGS);
    onChange(next);
    saveSettings(next);
    setListening(null);
    setGpListening(null);
  };

  const gpBinds = settings.gamepadBindings || DEFAULT_SETTINGS.gamepadBindings;

  /** Map button id → action id currently bound to it */
  const actionOnButton = (buttonId) => {
    for (const def of ACTION_DEFS) {
      if (gpBinds[def.id] === buttonId) return def.id;
    }
    return null;
  };

  const onControllerButtonClick = (buttonId) => {
    if (gpListening) {
      setGamepadBinding(gpListening, buttonId);
      return;
    }
    // Click button with no action selected → start listening for the first unbound-looking action
    // Prefer rebinding whatever is currently on that button, else interact
    const existing = actionOnButton(buttonId);
    setListening(null);
    setGpListening(existing || "interact");
  };

  return (
    <div className="options-overlay">
      <div className="options-panel" role="dialog" aria-labelledby="options-title">
        <h2 id="options-title" className="options-title">
          Options
        </h2>
        <p className="options-subtitle">Controls &amp; mouse</p>

        <section className="options-section">
          <h3 className="options-section-title">Mouse</h3>

          <label className="options-row">
            <span>Look sensitivity</span>
            <div className="options-slider-wrap">
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.05}
                value={settings.mouseSensitivity}
                onChange={(e) =>
                  update({ mouseSensitivity: Number(e.target.value) })
                }
              />
              <span className="options-value">
                {settings.mouseSensitivity.toFixed(2)}×
              </span>
            </div>
          </label>

          <label className="options-row options-check">
            <span>Invert look (vertical)</span>
            <input
              type="checkbox"
              checked={settings.invertLookY}
              onChange={(e) => update({ invertLookY: e.target.checked })}
            />
          </label>

          <label className="options-row options-check">
            <span>Invert look (horizontal)</span>
            <input
              type="checkbox"
              checked={settings.invertLookX}
              onChange={(e) => update({ invertLookX: e.target.checked })}
            />
          </label>
        </section>

        <section className="options-section">
          <h3 className="options-section-title">Keyboard</h3>
          <p className="options-hint">
            Click a binding, then press a key. Esc cancels.
          </p>
          <div className="options-binds">
            {ACTION_DEFS.map(({ id, label }) => (
              <div key={id} className="options-bind-row">
                <span className="options-bind-label">{label}</span>
                <button
                  type="button"
                  className={
                    "options-bind-btn" +
                    (listening === id ? " is-listening" : "")
                  }
                  onClick={() => {
                    setGpListening(null);
                    setListening((cur) => (cur === id ? null : id));
                  }}
                >
                  {listening === id
                    ? "Press a key…"
                    : formatKeyCode(settings.bindings[id])}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="options-section">
          <h3 className="options-section-title">PS4 / Gamepad</h3>

          <label className="options-row options-check">
            <span>Enable controller</span>
            <input
              type="checkbox"
              checked={!!settings.gamepadEnabled}
              onChange={(e) => update({ gamepadEnabled: e.target.checked })}
            />
          </label>

          <label className="options-row">
            <span>Stick look sensitivity</span>
            <div className="options-slider-wrap">
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.05}
                value={settings.gamepadLookSensitivity ?? 1}
                onChange={(e) =>
                  update({ gamepadLookSensitivity: Number(e.target.value) })
                }
                disabled={!settings.gamepadEnabled}
              />
              <span className="options-value">
                {(settings.gamepadLookSensitivity ?? 1).toFixed(2)}×
              </span>
            </div>
          </label>

          <p className="options-hint options-pad-status">{padStatus}</p>
          <p className="options-hint">
            Select an action below, then press a controller button or click it
            on the diagram. Left stick moves · Right stick looks · Options
            opens this menu.
          </p>

          <div className="options-binds">
            {ACTION_DEFS.map(({ id, label }) => (
              <div key={`gp-${id}`} className="options-bind-row">
                <span className="options-bind-label">{label}</span>
                <button
                  type="button"
                  className={
                    "options-bind-btn gp" +
                    (gpListening === id ? " is-listening" : "")
                  }
                  disabled={!settings.gamepadEnabled}
                  onClick={() => {
                    setListening(null);
                    setGpListening((cur) => (cur === id ? null : id));
                    prevPadButtonsRef.current = new Set();
                  }}
                >
                  {gpListening === id
                    ? "Press a button…"
                    : formatGamepadCode(gpBinds[id])}
                </button>
              </div>
            ))}
          </div>

          {/* On-screen DualShock-style mapper */}
          <div
            className={
              "ps4-controller" +
              (settings.gamepadEnabled ? "" : " is-disabled") +
              (gpListening ? " is-listening-mode" : "")
            }
            aria-label="On-screen PlayStation controller for remapping"
          >
            <div className="ps4-body">
              {/* Shoulder / triggers */}
              <div className="ps4-shoulders">
                <ControllerBtn
                  btn={PS4_BUTTONS[6]}
                  actionId={actionOnButton("gp-button-6")}
                  listening={gpListening}
                  onPick={onControllerButtonClick}
                />
                <ControllerBtn
                  btn={PS4_BUTTONS[4]}
                  actionId={actionOnButton("gp-button-4")}
                  listening={gpListening}
                  onPick={onControllerButtonClick}
                />
                <div className="ps4-shoulder-gap" />
                <ControllerBtn
                  btn={PS4_BUTTONS[5]}
                  actionId={actionOnButton("gp-button-5")}
                  listening={gpListening}
                  onPick={onControllerButtonClick}
                />
                <ControllerBtn
                  btn={PS4_BUTTONS[7]}
                  actionId={actionOnButton("gp-button-7")}
                  listening={gpListening}
                  onPick={onControllerButtonClick}
                />
              </div>

              <div className="ps4-main">
                {/* Left cluster: Share + D-pad + L3 */}
                <div className="ps4-cluster left">
                  <ControllerBtn
                    btn={PS4_BUTTONS[8]}
                    actionId={actionOnButton("gp-button-8")}
                    listening={gpListening}
                    onPick={onControllerButtonClick}
                    small
                  />
                  <div className="ps4-dpad">
                    <ControllerBtn
                      btn={PS4_BUTTONS[12]}
                      actionId={actionOnButton("gp-button-12")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      className="dpad-up"
                    />
                    <ControllerBtn
                      btn={PS4_BUTTONS[14]}
                      actionId={actionOnButton("gp-button-14")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      className="dpad-left"
                    />
                    <div className="dpad-center" />
                    <ControllerBtn
                      btn={PS4_BUTTONS[15]}
                      actionId={actionOnButton("gp-button-15")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      className="dpad-right"
                    />
                    <ControllerBtn
                      btn={PS4_BUTTONS[13]}
                      actionId={actionOnButton("gp-button-13")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      className="dpad-down"
                    />
                  </div>
                  <div className="ps4-stick-wrap">
                    <div className="ps4-stick" title="Left stick — move">
                      <span className="ps4-stick-label">LS</span>
                      <span className="ps4-stick-hint">Move</span>
                    </div>
                    <ControllerBtn
                      btn={PS4_BUTTONS[10]}
                      actionId={actionOnButton("gp-button-10")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      small
                    />
                  </div>
                </div>

                {/* Center touch pad decoration */}
                <div className="ps4-touchpad">
                  <span>PS4</span>
                </div>

                {/* Right cluster: Options + face + R3 */}
                <div className="ps4-cluster right">
                  <ControllerBtn
                    btn={PS4_BUTTONS[9]}
                    actionId={actionOnButton("gp-button-9")}
                    listening={gpListening}
                    onPick={onControllerButtonClick}
                    small
                  />
                  <div className="ps4-face">
                    <ControllerBtn
                      btn={PS4_BUTTONS[3]}
                      actionId={actionOnButton("gp-button-3")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      className="face-tri"
                      face
                    />
                    <ControllerBtn
                      btn={PS4_BUTTONS[2]}
                      actionId={actionOnButton("gp-button-2")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      className="face-sq"
                      face
                    />
                    <ControllerBtn
                      btn={PS4_BUTTONS[1]}
                      actionId={actionOnButton("gp-button-1")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      className="face-cir"
                      face
                    />
                    <ControllerBtn
                      btn={PS4_BUTTONS[0]}
                      actionId={actionOnButton("gp-button-0")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      className="face-crs"
                      face
                    />
                  </div>
                  <div className="ps4-stick-wrap">
                    <div className="ps4-stick" title="Right stick — look">
                      <span className="ps4-stick-label">RS</span>
                      <span className="ps4-stick-hint">Look</span>
                    </div>
                    <ControllerBtn
                      btn={PS4_BUTTONS[11]}
                      actionId={actionOnButton("gp-button-11")}
                      listening={gpListening}
                      onPick={onControllerButtonClick}
                      small
                    />
                  </div>
                </div>
              </div>
            </div>
            {gpListening && (
              <p className="ps4-listen-hint">
                Mapping <strong>{ACTION_SHORT[gpListening] || gpListening}</strong>
                … press a button or click the diagram · Esc cancels
              </p>
            )}
          </div>
        </section>

        <div className="options-actions">
          {showResume && (
            <button type="button" className="options-btn primary" onClick={onResume}>
              Resume
            </button>
          )}
          <button type="button" className="options-btn" onClick={onCloseToTitle}>
            {showResume ? "Title screen" : "Back"}
          </button>
          <button type="button" className="options-btn ghost" onClick={resetDefaults}>
            Reset defaults
          </button>
        </div>
      </div>
    </div>
  );
}

function ControllerBtn({
  btn,
  actionId,
  listening,
  onPick,
  className = "",
  small = false,
  face = false,
}) {
  const bound = !!actionId;
  const isTarget = listening && listening === actionId;
  const waiting = !!listening;

  return (
    <button
      type="button"
      title={
        bound
          ? `${btn.name} → ${ACTION_SHORT[actionId] || actionId}`
          : btn.name
      }
      className={
        [
          "ps4-btn",
          className,
          small ? "is-small" : "",
          face ? "is-face" : "",
          bound ? "is-bound" : "",
          isTarget ? "is-active-bind" : "",
          waiting ? "is-awaiting" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      onClick={() => onPick(btn.id)}
    >
      <span className="ps4-btn-glyph">{btn.label}</span>
      {bound && (
        <span className="ps4-btn-action">{ACTION_SHORT[actionId]}</span>
      )}
    </button>
  );
}
