import {
  DEFAULT_GAMEPAD_BINDINGS,
  formatGamepadCode,
} from "./gamepad";

const STORAGE_KEY = "the-ride-settings-v2";

/** Base mouse sensitivity (radians per pixel at sensitivity = 1) */
export const BASE_MOUSE_SENS = 0.002;

export const ACTION_DEFS = [
  { id: "forward", label: "Move Forward" },
  { id: "back", label: "Move Backward" },
  { id: "left", label: "Move Left" },
  { id: "right", label: "Move Right" },
  { id: "sprint", label: "Sprint / Gallop" },
  { id: "interact", label: "Interact" },
  { id: "mount", label: "Mount / Dismount" },
  { id: "callHorse", label: "Call Horse (whistle)" },
  { id: "fly", label: "Unicorn Fly Up" },
  { id: "flyDown", label: "Unicorn Fly Down" },
];

export const DEFAULT_SETTINGS = {
  mouseSensitivity: 1,
  invertLookY: true,
  invertLookX: false,
  /** Allow DualShock / standard gamepad input when a pad is connected */
  gamepadEnabled: true,
  /** Right-stick look multiplier */
  gamepadLookSensitivity: 1,
  /** Audio */
  soundMuted: false,
  masterVolume: 0.7,
  sfxVolume: 1,
  ambientVolume: 0.4,
  bindings: {
    forward: "KeyW",
    back: "KeyS",
    left: "KeyA",
    right: "KeyD",
    sprint: "ShiftLeft",
    interact: "KeyE",
    mount: "KeyR",
    callHorse: "KeyH",
    fly: "Space",
    flyDown: "KeyC",
  },
  gamepadBindings: { ...DEFAULT_GAMEPAD_BINDINGS },
};

export function loadSettings() {
  try {
    // Prefer v2; fall back to v1 and migrate
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem("the-ride-settings-v1");
    }
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      bindings: {
        ...DEFAULT_SETTINGS.bindings,
        ...(parsed.bindings || {}),
      },
      gamepadBindings: {
        ...DEFAULT_SETTINGS.gamepadBindings,
        ...(parsed.gamepadBindings || {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota / private mode
  }
}

/** Human-readable key label from KeyboardEvent.code */
export function formatKeyCode(code) {
  if (!code) return "—";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map = {
    ShiftLeft: "Left Shift",
    ShiftRight: "Right Shift",
    ControlLeft: "Left Ctrl",
    ControlRight: "Right Ctrl",
    AltLeft: "Left Alt",
    AltRight: "Right Alt",
    Space: "Space",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Escape: "Esc",
    Enter: "Enter",
    Tab: "Tab",
    Backspace: "Backspace",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Backquote: "`",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
  };
  return map[code] || code;
}

/** Display label for either keyboard or gamepad binding code */
export function formatBindingCode(code) {
  if (!code) return "—";
  if (String(code).startsWith("gp-")) return formatGamepadCode(code);
  return formatKeyCode(code);
}

/** True if this pressed code matches the bound action (ShiftLeft also accepts ShiftRight). */
export function isActionDown(bindings, actionId, keysHeld) {
  const code = bindings[actionId];
  if (!code) return false;
  if (keysHeld[code]) return true;
  // Convenience: either shift counts when sprint is bound to a Shift key
  if (code === "ShiftLeft" || code === "ShiftRight") {
    return !!(keysHeld.ShiftLeft || keysHeld.ShiftRight);
  }
  return false;
}
