/**
 * DualShock / standard Gamepad API helpers.
 * Browser mapping follows the common "standard" layout (Xbox indices),
 * labeled here with PlayStation names for the on-screen mapper.
 */

export const GAMEPAD_DEADZONE = 0.18;
/** Radians/sec look speed at stick full deflection, sensitivity = 1 */
export const BASE_GAMEPAD_LOOK = 2.4;

/** PS4 face / shoulder / pad buttons (standard mapping) */
export const PS4_BUTTONS = [
  { id: "gp-button-0", label: "✕", name: "Cross", group: "face" },
  { id: "gp-button-1", label: "○", name: "Circle", group: "face" },
  { id: "gp-button-2", label: "□", name: "Square", group: "face" },
  { id: "gp-button-3", label: "△", name: "Triangle", group: "face" },
  { id: "gp-button-4", label: "L1", name: "L1", group: "shoulder" },
  { id: "gp-button-5", label: "R1", name: "R1", group: "shoulder" },
  { id: "gp-button-6", label: "L2", name: "L2", group: "trigger" },
  { id: "gp-button-7", label: "R2", name: "R2", group: "trigger" },
  { id: "gp-button-8", label: "Share", name: "Share", group: "meta" },
  { id: "gp-button-9", label: "Options", name: "Options", group: "meta" },
  { id: "gp-button-10", label: "L3", name: "L3", group: "stick" },
  { id: "gp-button-11", label: "R3", name: "R3", group: "stick" },
  { id: "gp-button-12", label: "▲", name: "D-Pad Up", group: "dpad" },
  { id: "gp-button-13", label: "▼", name: "D-Pad Down", group: "dpad" },
  { id: "gp-button-14", label: "◀", name: "D-Pad Left", group: "dpad" },
  { id: "gp-button-15", label: "▶", name: "D-Pad Right", group: "dpad" },
];

const BUTTON_BY_ID = Object.fromEntries(PS4_BUTTONS.map((b) => [b.id, b]));

export const DEFAULT_GAMEPAD_BINDINGS = {
  forward: "gp-button-12", // D-Pad Up (left stick also moves)
  back: "gp-button-13",
  left: "gp-button-14",
  right: "gp-button-15",
  sprint: "gp-button-5", // R1
  interact: "gp-button-0", // Cross
  mount: "gp-button-3", // Triangle
  callHorse: "gp-button-2", // Square — whistle for horse
  fly: "gp-button-7", // R2
  flyDown: "gp-button-6", // L2
};

export function formatGamepadCode(code) {
  if (!code) return "—";
  const btn = BUTTON_BY_ID[code];
  if (btn) return btn.name;
  return code;
}

export function getFirstGamepad() {
  if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  if (!pads) return null;
  for (let i = 0; i < pads.length; i++) {
    if (pads[i]) return pads[i];
  }
  return null;
}

function applyDeadzone(v, dz = GAMEPAD_DEADZONE) {
  if (Math.abs(v) < dz) return 0;
  // Rescale so values just outside deadzone start from 0
  const sign = v < 0 ? -1 : 1;
  return sign * ((Math.abs(v) - dz) / (1 - dz));
}

function buttonPressed(pad, index) {
  const b = pad.buttons[index];
  if (!b) return false;
  return b.pressed || (typeof b.value === "number" && b.value > 0.5);
}

function parseButtonIndex(code) {
  if (!code || !code.startsWith("gp-button-")) return -1;
  const n = Number(code.slice("gp-button-".length));
  return Number.isFinite(n) ? n : -1;
}

/** True if the bound gamepad control is held. */
export function isGamepadActionDown(gamepadBindings, actionId, pad) {
  if (!pad || !gamepadBindings) return false;
  const code = gamepadBindings[actionId];
  const idx = parseButtonIndex(code);
  if (idx < 0) return false;
  return buttonPressed(pad, idx);
}

/**
 * Sample the first connected pad into gameplay-ready values.
 * Left stick + D-pad bindings drive move; right stick drives look.
 */
export function sampleGamepadInput(settings) {
  if (!settings?.gamepadEnabled) return null;
  const pad = getFirstGamepad();
  if (!pad) return null;

  const binds = settings.gamepadBindings || DEFAULT_GAMEPAD_BINDINGS;
  const lx = applyDeadzone(pad.axes[0] ?? 0);
  const ly = applyDeadzone(pad.axes[1] ?? 0);
  const rx = applyDeadzone(pad.axes[2] ?? 0);
  const ry = applyDeadzone(pad.axes[3] ?? 0);

  // Left stick: up is negative Y in standard mapping
  let moveX = lx;
  let moveZ = -ly; // forward when stick up

  // Digital bindings (D-pad by default) add on top
  if (isGamepadActionDown(binds, "left", pad)) moveX -= 1;
  if (isGamepadActionDown(binds, "right", pad)) moveX += 1;
  if (isGamepadActionDown(binds, "forward", pad)) moveZ += 1;
  if (isGamepadActionDown(binds, "back", pad)) moveZ -= 1;

  // Clamp combined stick + d-pad
  const len = Math.hypot(moveX, moveZ);
  if (len > 1) {
    moveX /= len;
    moveZ /= len;
  }

  return {
    pad,
    moveX,
    moveZ,
    lookX: rx,
    lookY: ry,
    sprint: isGamepadActionDown(binds, "sprint", pad),
    interact: isGamepadActionDown(binds, "interact", pad),
    mount: isGamepadActionDown(binds, "mount", pad),
    callHorse: isGamepadActionDown(binds, "callHorse", pad),
    fly: isGamepadActionDown(binds, "fly", pad),
    flyDown: isGamepadActionDown(binds, "flyDown", pad),
    options: buttonPressed(pad, 9),
    connected: true,
    id: pad.id || "Gamepad",
  };
}

/**
 * While remapping, return the first newly pressed button id, or null.
 * `prevPressed` is a Set of button indices that were already down.
 */
export function detectGamepadButtonPress(prevPressed) {
  const pad = getFirstGamepad();
  if (!pad) return { code: null, pressedNow: prevPressed };

  const pressedNow = new Set();
  let newlyPressed = null;

  for (let i = 0; i < Math.min(pad.buttons.length, 16); i++) {
    if (buttonPressed(pad, i)) {
      pressedNow.add(i);
      if (!prevPressed.has(i) && newlyPressed == null) {
        newlyPressed = `gp-button-${i}`;
      }
    }
  }

  return { code: newlyPressed, pressedNow };
}

export function gamepadConnectionLabel() {
  const pad = getFirstGamepad();
  if (!pad) return "No controller connected";
  // Prefer a short friendly name
  const id = pad.id || "Controller";
  if (/dualshock|wireless controller|playstation|ps4|ps5/i.test(id)) {
    return "PlayStation controller connected";
  }
  return `Controller connected: ${id.slice(0, 42)}`;
}

/** Options / Start button — always available for pause menu, even if gameplay pad is disabled */
export function isOptionsButtonPressed() {
  const pad = getFirstGamepad();
  if (!pad) return false;
  return buttonPressed(pad, 9);
}
