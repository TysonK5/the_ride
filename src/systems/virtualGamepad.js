/**
 * On-screen / touch virtual DualShock-style pad.
 * Written by TouchControls UI; read by sampleGamepadInput.
 */

const buttons = Object.create(null); // gp-button-N → true while held
let leftX = 0;
let leftY = 0; // standard: up is negative
let rightX = 0;
let rightY = 0;
let optionsHeld = false;

export function setVirtualButton(buttonId, down) {
  if (!buttonId) return;
  if (down) buttons[buttonId] = true;
  else delete buttons[buttonId];
}

export function setVirtualLeftStick(x, y) {
  leftX = clampAxis(x);
  leftY = clampAxis(y);
}

export function setVirtualRightStick(x, y) {
  rightX = clampAxis(x);
  rightY = clampAxis(y);
}

/** Options / pause — edge-polled like a real pad */
export function setVirtualOptions(down) {
  optionsHeld = !!down;
}

export function isVirtualOptionsPressed() {
  return optionsHeld;
}

export function isVirtualButtonDown(buttonId) {
  return !!buttons[buttonId];
}

export function getVirtualAxes() {
  return { leftX, leftY, rightX, rightY };
}

export function hasVirtualStickInput() {
  return (
    Math.abs(leftX) > 0.001 ||
    Math.abs(leftY) > 0.001 ||
    Math.abs(rightX) > 0.001 ||
    Math.abs(rightY) > 0.001
  );
}

export function hasAnyVirtualInput() {
  return (
    Object.keys(buttons).length > 0 ||
    hasVirtualStickInput() ||
    optionsHeld
  );
}

/** Clear all virtual presses (menu open, unmount, etc.) */
export function clearVirtualGamepad() {
  for (const k of Object.keys(buttons)) delete buttons[k];
  leftX = 0;
  leftY = 0;
  rightX = 0;
  rightY = 0;
  optionsHeld = false;
}

function clampAxis(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(-1, Math.min(1, v));
}
