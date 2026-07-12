import { useCallback, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PATHS,
  MAP_LANDMARKS,
  clonePaths,
  resetPaths,
  savePaths,
} from "../../systems/paths";
import "./MapEditor.css";

/** World half-extent shown in the editor (matches playable ranch area) */
const VIEW = 220;
const VIEWBOX = `${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`;

/** Convert SVG pointer event → world [x, z] (SVG y is -z for north-up map) */
function eventToWorld(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const local = pt.matrixTransform(ctm.inverse());
  // svg y → world -z so north (+Z in some games) maps up; our game +Z is "south" on
  // the title map but consistent local coords: worldX = svgX, worldZ = svgY
  return {
    x: Math.round(local.x * 10) / 10,
    z: Math.round(local.y * 10) / 10,
  };
}

function pathToSvgD(waypoints, closed) {
  if (!waypoints?.length) return "";
  let d = `M ${waypoints[0][0]} ${waypoints[0][1]}`;
  for (let i = 1; i < waypoints.length; i++) {
    d += ` L ${waypoints[i][0]} ${waypoints[i][1]}`;
  }
  if (closed) d += " Z";
  return d;
}

export function MapEditor({ paths, onChange, onClose }) {
  const [selectedId, setSelectedId] = useState(paths[0]?.id ?? null);
  const [selectedPoint, setSelectedPoint] = useState(null); // index
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState("");
  const dragRef = useRef(null); // { pathId, index }
  const svgRef = useRef(null);

  const selected = useMemo(
    () => paths.find((p) => p.id === selectedId) || null,
    [paths, selectedId]
  );

  const updatePaths = useCallback(
    (next, markDirty = true) => {
      onChange(next);
      if (markDirty) setDirty(true);
      setStatus("");
    },
    [onChange]
  );

  const moveWaypoint = useCallback(
    (pathId, index, x, z) => {
      updatePaths(
        paths.map((p) => {
          if (p.id !== pathId) return p;
          const waypoints = p.waypoints.map((w, i) =>
            i === index ? [x, z] : w
          );
          return { ...p, waypoints };
        })
      );
    },
    [paths, updatePaths]
  );

  const onPointerDownPoint = (e, pathId, index) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(pathId);
    setSelectedPoint(index);
    dragRef.current = { pathId, index };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || !svgRef.current) return;
    const world = eventToWorld(svgRef.current, e.clientX, e.clientY);
    if (!world) return;
    // Clamp to map view
    const x = Math.max(-VIEW + 2, Math.min(VIEW - 2, world.x));
    const z = Math.max(-VIEW + 2, Math.min(VIEW - 2, world.z));
    moveWaypoint(drag.pathId, drag.index, x, z);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const addPoint = () => {
    if (!selected) return;
    const wps = selected.waypoints;
    let nx;
    let nz;
    if (wps.length >= 2) {
      const a = wps[wps.length - 2];
      const b = wps[wps.length - 1];
      nx = b[0] + (b[0] - a[0]);
      nz = b[1] + (b[1] - a[1]);
    } else if (wps.length === 1) {
      nx = wps[0][0] + 8;
      nz = wps[0][1];
    } else {
      nx = 0;
      nz = 10;
    }
    nx = Math.max(-VIEW + 2, Math.min(VIEW - 2, nx));
    nz = Math.max(-VIEW + 2, Math.min(VIEW - 2, nz));
    const next = paths.map((p) =>
      p.id === selected.id
        ? { ...p, waypoints: [...p.waypoints, [nx, nz]] }
        : p
    );
    updatePaths(next);
    setSelectedPoint(next.find((p) => p.id === selected.id).waypoints.length - 1);
  };

  const deletePoint = () => {
    if (!selected || selectedPoint == null) return;
    if (selected.waypoints.length <= (selected.closed ? 3 : 2)) {
      setStatus("Need at least " + (selected.closed ? "3" : "2") + " points.");
      return;
    }
    const next = paths.map((p) => {
      if (p.id !== selected.id) return p;
      return {
        ...p,
        waypoints: p.waypoints.filter((_, i) => i !== selectedPoint),
      };
    });
    updatePaths(next);
    setSelectedPoint(null);
  };

  const insertPointAfter = () => {
    if (!selected || selectedPoint == null) return;
    const wps = selected.waypoints;
    const i = selectedPoint;
    const a = wps[i];
    const b = wps[(i + 1) % wps.length];
    // For open paths at last point, extend past the end
    let mx;
    let mz;
    if (!selected.closed && i === wps.length - 1) {
      const prev = wps[Math.max(0, i - 1)];
      mx = a[0] + (a[0] - prev[0]) * 0.5;
      mz = a[1] + (a[1] - prev[1]) * 0.5;
    } else {
      mx = (a[0] + b[0]) / 2;
      mz = (a[1] + b[1]) / 2;
    }
    const waypoints = [...wps];
    waypoints.splice(i + 1, 0, [
      Math.round(mx * 10) / 10,
      Math.round(mz * 10) / 10,
    ]);
    updatePaths(
      paths.map((p) => (p.id === selected.id ? { ...p, waypoints } : p))
    );
    setSelectedPoint(i + 1);
  };

  const handleSave = () => {
    const ok = savePaths(paths);
    setDirty(false);
    setStatus(ok ? "Saved permanently (this browser)." : "Save failed.");
  };

  const handleReset = () => {
    if (
      !window.confirm(
        "Reset all paths to the default ranch layout? This clears saved edits."
      )
    ) {
      return;
    }
    const next = resetPaths();
    updatePaths(next, false);
    setDirty(false);
    setSelectedPoint(null);
    setStatus("Reset to defaults.");
  };

  const handleClose = () => {
    if (dirty) {
      const save = window.confirm(
        "Save path changes before leaving the map editor?"
      );
      if (save) savePaths(paths);
    }
    onClose?.();
  };

  return (
    <div className="map-editor-overlay">
      <div className="map-editor-panel" role="dialog" aria-labelledby="map-editor-title">
        <header className="map-editor-header">
          <div>
            <h2 id="map-editor-title" className="map-editor-title">
              Map Editor
            </h2>
            <p className="map-editor-sub">
              Drag waypoints to reshape dirt paths · changes save to this browser
            </p>
          </div>
          <div className="map-editor-header-actions">
            {dirty && <span className="map-editor-dirty">Unsaved</span>}
            <button type="button" className="map-btn primary" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="map-btn" onClick={handleReset}>
              Reset defaults
            </button>
            <button type="button" className="map-btn ghost" onClick={handleClose}>
              Close
            </button>
          </div>
        </header>

        <div className="map-editor-body">
          <aside className="map-editor-sidebar">
            <h3 className="map-side-title">Paths</h3>
            <ul className="map-path-list">
              {paths.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={
                      "map-path-item" +
                      (p.id === selectedId ? " is-selected" : "")
                    }
                    onClick={() => {
                      setSelectedId(p.id);
                      setSelectedPoint(null);
                    }}
                  >
                    <span className="map-path-name">{p.name}</span>
                    <span className="map-path-meta">
                      {p.waypoints.length} pts · {p.closed ? "loop" : "open"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {selected && (
              <div className="map-point-tools">
                <h3 className="map-side-title">Selected path</h3>
                <p className="map-hint">
                  {selected.name}
                  {selectedPoint != null
                    ? ` · point ${selectedPoint + 1}`
                    : " · click a handle"}
                </p>
                <div className="map-tool-row">
                  <button type="button" className="map-btn small" onClick={addPoint}>
                    + End point
                  </button>
                  <button
                    type="button"
                    className="map-btn small"
                    onClick={insertPointAfter}
                    disabled={selectedPoint == null}
                  >
                    + After
                  </button>
                  <button
                    type="button"
                    className="map-btn small danger"
                    onClick={deletePoint}
                    disabled={selectedPoint == null}
                  >
                    Delete
                  </button>
                </div>
                {selectedPoint != null && selected.waypoints[selectedPoint] && (
                  <div className="map-coords">
                    <label>
                      X
                      <input
                        type="number"
                        step={0.5}
                        value={selected.waypoints[selectedPoint][0]}
                        onChange={(e) =>
                          moveWaypoint(
                            selected.id,
                            selectedPoint,
                            Number(e.target.value),
                            selected.waypoints[selectedPoint][1]
                          )
                        }
                      />
                    </label>
                    <label>
                      Z
                      <input
                        type="number"
                        step={0.5}
                        value={selected.waypoints[selectedPoint][1]}
                        onChange={(e) =>
                          moveWaypoint(
                            selected.id,
                            selectedPoint,
                            selected.waypoints[selectedPoint][0],
                            Number(e.target.value)
                          )
                        }
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {status && <p className="map-status">{status}</p>}
            <p className="map-legend">
              <span className="swatch path" /> Path
              <span className="swatch barn" /> Barn
              <span className="swatch water" /> Lake
            </p>
          </aside>

          <div className="map-canvas-wrap">
            <svg
              ref={svgRef}
              className="map-svg"
              viewBox={VIEWBOX}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {/* Grass background */}
              <rect
                x={-VIEW}
                y={-VIEW}
                width={VIEW * 2}
                height={VIEW * 2}
                className="map-bg"
              />

              {/* Grid */}
              {Array.from({ length: 15 }, (_, i) => {
                const v = -VIEW + i * 20;
                return (
                  <g key={i} className="map-grid">
                    <line x1={v} y1={-VIEW} x2={v} y2={VIEW} />
                    <line x1={-VIEW} y1={v} x2={VIEW} y2={v} />
                  </g>
                );
              })}

              {/* Landmarks */}
              {MAP_LANDMARKS.map((lm) => (
                <g key={lm.id} className={`map-landmark map-lm-${lm.id}`}>
                  <circle cx={lm.x} cy={lm.z} r={lm.r} />
                  <text x={lm.x} y={lm.z + lm.r + 4} textAnchor="middle">
                    {lm.name}
                  </text>
                </g>
              ))}

              {/* Paths (unselected first, selected on top) */}
              {[...paths]
                .sort((a, b) =>
                  a.id === selectedId ? 1 : b.id === selectedId ? -1 : 0
                )
                .map((p) => {
                  const active = p.id === selectedId;
                  return (
                    <g key={p.id} className={"map-path" + (active ? " is-active" : "")}>
                      <path
                        d={pathToSvgD(p.waypoints, p.closed)}
                        className="map-path-stroke"
                        strokeWidth={active ? p.width * 0.55 : p.width * 0.4}
                      />
                      {p.waypoints.map(([x, z], i) => (
                        <circle
                          key={i}
                          cx={x}
                          cy={z}
                          r={active ? 2.4 : 1.6}
                          className={
                            "map-handle" +
                            (active && selectedPoint === i ? " is-selected" : "")
                          }
                          onPointerDown={(e) => onPointerDownPoint(e, p.id, i)}
                        />
                      ))}
                    </g>
                  );
                })}

              {/* Origin crosshair */}
              <line x1={-6} y1={0} x2={6} y2={0} className="map-origin" />
              <line x1={0} y1={-6} x2={0} y2={6} className="map-origin" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Helper if parent needs a fresh default without storage */
export function getDefaultPathsClone() {
  return clonePaths(DEFAULT_PATHS);
}
