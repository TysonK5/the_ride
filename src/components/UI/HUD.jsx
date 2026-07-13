import { formatKeyCode } from "../../systems/settings";
import "./HUD.css";

export function HUD({
  locked,
  onPlay,
  onOpenOptions,
  onOpenMapEditor,
  rideHint = "",
  settings,
}) {
  const b = settings?.bindings;
  const padOn = !!settings?.gamepadEnabled;
  const touchOn = !!settings?.touchControlsEnabled;
  const moveHint = b
    ? `${formatKeyCode(b.forward)}/${formatKeyCode(b.left)}/${formatKeyCode(b.back)}/${formatKeyCode(b.right)} move`
    : "WASD move";
  const sprintHint = b
    ? `${formatKeyCode(b.sprint)} sprint`
    : "Shift sprint";
  const interactHint = b
    ? `${formatKeyCode(b.interact)} interact`
    : "E interact";
  const mountHint = b
    ? `${formatKeyCode(b.mount || "KeyR")} mount`
    : "R mount";
  const flyHint = b
    ? `${formatKeyCode(b.fly || "Space")}/${formatKeyCode(b.flyDown || "KeyC")} fly`
    : "Space/C fly";
  const padHint = padOn ? " · PS4 pad ok" : "";
  const touchHint = touchOn ? " · On-screen pad" : "";

  if (locked) {
    return (
      <div className="hud hud-minimal">
        <div className="hud-location">The Ranch</div>
        <div className="hud-bottom">
          {rideHint ? <div className="hud-prompt">{rideHint}</div> : null}
          <div className="hud-controls-hint">
            {touchOn
              ? "Left stick move · Right stick look · Face buttons act · Menu options"
              : `${moveHint} · ${sprintHint} · ${interactHint} · ${mountHint} · ${flyHint} · ESC options`}
            {padHint}
            {touchHint}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hud hud-overlay">
      <div className="hud-panel">
        <h1 className="hud-title">The Ride</h1>
        <p className="hud-subtitle">Heartlands Territory</p>
        <p className="hud-desc">
          Walk the open range, visit the barn and cabin, and ride the white
          horse across the flats.
        </p>
        <button type="button" className="hud-play-btn" onClick={onPlay}>
          {touchOn ? "Tap to Play" : "Click to Play"}
        </button>
        <button
          type="button"
          className="hud-options-btn"
          onClick={onOpenOptions}
        >
          Options
        </button>
        {onOpenMapEditor && (
          <button
            type="button"
            className="hud-options-btn"
            onClick={onOpenMapEditor}
          >
            Map Editor
          </button>
        )}
        <div className="hud-controls">
          <span>{b ? formatKeyCode(b.forward) : "W"}…</span> Move
          <span>{b ? formatKeyCode(b.sprint) : "Shift"}</span> Sprint
          <span>{b ? formatKeyCode(b.interact) : "E"}</span> Interact
          <span>{b ? formatKeyCode(b.mount || "KeyR") : "R"}</span> Mount
          <span>{b ? formatKeyCode(b.fly || "Space") : "Space"}</span> Unicorn
          fly
          <span>ESC</span> Options
          {padOn && (
            <>
              <span>LS/RS</span> Move / Look
              <span>Options</span> Menu
            </>
          )}
        </div>
      </div>
    </div>
  );
}
