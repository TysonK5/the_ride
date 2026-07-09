import { useEffect } from "react";
import "./HUD.css";

export function HUD({ locked, onPlay }) {
  useEffect(() => {
    const onLock = () => {};
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, []);

  if (locked) {
    return (
      <div className="hud hud-minimal">
        <div className="hud-location">Valentine</div>
        <div className="hud-controls-hint">WASD to move · ESC to release mouse</div>
      </div>
    );
  }

  return (
    <div className="hud hud-overlay">
      <div className="hud-panel">
        <h1 className="hud-title">The Ride</h1>
        <p className="hud-subtitle">Valentine · Heartlands Territory</p>
        <p className="hud-desc">
          Explore a stylized frontier town inspired by Red Dead Redemption.
          Walk the main street, visit the saloon, and ride out to the cattle pens.
        </p>
        <button type="button" className="hud-play-btn" onClick={onPlay}>
          Click to Play
        </button>
        <div className="hud-controls">
          <span>W / A / S / D</span> Move
          <span>Mouse</span> Look around
          <span>ESC</span> Menu
        </div>
      </div>
    </div>
  );
}
