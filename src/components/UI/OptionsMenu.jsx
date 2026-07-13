import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACTION_DEFS,
  DEFAULT_SETTINGS,
  formatKeyCode,
  isLikelyTouchDevice,
  saveSettings,
} from "../../systems/settings";
import {
  detectGamepadButtonPress,
  formatGamepadCode,
  gamepadConnectionLabel,
} from "../../systems/gamepad";
import { setAudioSettings, sfxUIClick } from "../../systems/audio";
import "./OptionsMenu.css";

export function OptionsMenu({
  settings,
  onChange,
  onResume,
  onCloseToTitle,
  onOpenMapEditor,
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
      setAudioSettings({
        muted: next.soundMuted,
        masterVolume: next.masterVolume,
        sfxVolume: next.sfxVolume,
        ambientVolume: next.ambientVolume,
      });
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
    next.touchControlsEnabled = isLikelyTouchDevice();
    onChange(next);
    saveSettings(next);
    setListening(null);
    setGpListening(null);
  };

  const gpBinds = settings.gamepadBindings || DEFAULT_SETTINGS.gamepadBindings;

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
          <h3 className="options-section-title">Audio</h3>
          <label className="options-row options-check">
            <span>Mute all sound</span>
            <input
              type="checkbox"
              checked={!!settings.soundMuted}
              onChange={(e) => update({ soundMuted: e.target.checked })}
            />
          </label>
          <label className="options-row">
            <span>Master volume</span>
            <div className="options-slider-wrap">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.masterVolume ?? 0.7}
                disabled={!!settings.soundMuted}
                onChange={(e) =>
                  update({ masterVolume: Number(e.target.value) })
                }
              />
              <span className="options-value">
                {Math.round((settings.masterVolume ?? 0.7) * 100)}%
              </span>
            </div>
          </label>
          <label className="options-row">
            <span>Effects</span>
            <div className="options-slider-wrap">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.sfxVolume ?? 1}
                disabled={!!settings.soundMuted}
                onChange={(e) => update({ sfxVolume: Number(e.target.value) })}
              />
              <span className="options-value">
                {Math.round((settings.sfxVolume ?? 1) * 100)}%
              </span>
            </div>
          </label>
          <label className="options-row">
            <span>Ambience</span>
            <div className="options-slider-wrap">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.ambientVolume ?? 0.4}
                disabled={!!settings.soundMuted}
                onChange={(e) =>
                  update({ ambientVolume: Number(e.target.value) })
                }
              />
              <span className="options-value">
                {Math.round((settings.ambientVolume ?? 0.4) * 100)}%
              </span>
            </div>
          </label>
          <button
            type="button"
            className="options-btn small"
            style={{ width: "100%", marginTop: "0.25rem" }}
            onClick={() => {
              sfxUIClick();
            }}
          >
            Test sound
          </button>
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
          <h3 className="options-section-title">Touch / On-screen</h3>
          <label className="options-row options-check">
            <span>On-screen controller</span>
            <input
              type="checkbox"
              checked={!!settings.touchControlsEnabled}
              onChange={(e) =>
                update({ touchControlsEnabled: e.target.checked })
              }
            />
          </label>
          <p className="options-hint">
            For phones and tablets: shows opaque move / look sticks and action
            buttons over the game. Play starts without mouse lock; use the Menu
            button to pause. Button labels follow the gamepad bindings below.
          </p>
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
                disabled={
                  !settings.gamepadEnabled && !settings.touchControlsEnabled
                }
              />
              <span className="options-value">
                {(settings.gamepadLookSensitivity ?? 1).toFixed(2)}×
              </span>
            </div>
          </label>

          <p className="options-hint options-pad-status">{padStatus}</p>
          <p className="options-hint">
            Select an action, then press a physical button to rebind. Left stick
            moves · Right stick looks · Options / Menu opens this panel. Touch
            controls use the same bindings.
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
        </section>

        <section className="options-section">
          <h3 className="options-section-title">Map</h3>
          <p className="options-hint">
            Drag dirt-path waypoints on a top-down map and save them for this
            browser.
          </p>
          <button
            type="button"
            className="options-btn primary"
            style={{ width: "100%" }}
            onClick={onOpenMapEditor}
            disabled={!onOpenMapEditor}
          >
            Open map editor
          </button>
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
