import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Sky } from "../Environment/Sky";
import { Terrain, Mountains } from "../Environment/Terrain";
import { Trees } from "../Environment/Trees";
import { Props } from "../Environment/Props";
import { Lake } from "../Environment/Lake";
import { Fence, createGateState } from "../Environment/Fence";
import { Birds } from "../Environment/Birds";
import { Flowers, createFlowerState } from "../Environment/Flowers";
import { ValentineTown, createBarnDoorState } from "../Town/Buildings";
import { Player } from "../Player/Player";
import { Horse, createRideState } from "../Horse/Horse";
import { HUD } from "../UI/HUD";
import { OptionsMenu } from "../UI/OptionsMenu";
import { loadSettings } from "../../systems/settings";
import { isOptionsButtonPressed } from "../../systems/gamepad";

function Scene({
  enabled,
  rideState,
  gateState,
  barnDoorState,
  flowerState,
  flowerVersion,
  onFlowerChange,
  onRideHint,
  settings,
}) {
  return (
    <>
      <color attach="background" args={["#87ceeb"]} />
      <fog attach="fog" args={["#c8e8ff", 100, 280]} />

      <Sky />
      <Terrain />
      <Mountains />
      <Trees />
      <Props />
      <Lake />
      <ValentineTown barnDoorState={barnDoorState} />
      <Fence gateState={gateState} />
      <Birds />
      <Flowers key={flowerVersion} flowerState={flowerState} />
      <Horse rideState={rideState} />
      <Player
        enabled={enabled}
        rideState={rideState}
        gateState={gateState}
        barnDoorState={barnDoorState}
        flowerState={flowerState}
        onFlowerChange={onFlowerChange}
        onRideHint={onRideHint}
        settings={settings}
      />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.45}
        scale={250}
        blur={2}
        far={40}
        color="#2a1808"
      />

      <EffectComposer>
        <Bloom intensity={0.15} luminanceThreshold={0.9} />
        <Vignette eskil={false} offset={0.15} darkness={0.4} />
      </EffectComposer>
    </>
  );
}

export function Game() {
  const [locked, setLocked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rideHint, setRideHint] = useState("");
  const [settings, setSettings] = useState(() => loadSettings());
  const [flowerVersion, setFlowerVersion] = useState(0);
  const wasLockedRef = useRef(false);

  const rideState = useMemo(() => createRideState([8, 0, 14]), []);
  const gateState = useMemo(() => createGateState(), []);
  const barnDoorState = useMemo(() => createBarnDoorState(), []);
  const flowerState = useMemo(() => createFlowerState(), []);

  const handleFlowerChange = useCallback(() => {
    flowerState.version += 1;
    setFlowerVersion(flowerState.version);
  }, [flowerState]);

  const handlePlay = useCallback(() => {
    setMenuOpen(false);
    document.body.requestPointerLock();
  }, []);

  const handleResume = useCallback(() => {
    setMenuOpen(false);
    document.body.requestPointerLock();
  }, []);

  const handleCloseToTitle = useCallback(() => {
    setMenuOpen(false);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  const openOptions = useCallback(() => {
    setMenuOpen(true);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  const handleLockChange = useCallback(() => {
    const isLocked = document.pointerLockElement === document.body;
    // Opening options while leaving play (e.g. Esc releases lock)
    if (wasLockedRef.current && !isLocked) {
      setMenuOpen(true);
    }
    if (isLocked) {
      setMenuOpen(false);
    }
    wasLockedRef.current = isLocked;
    setLocked(isLocked);
  }, []);

  useEffect(() => {
    document.addEventListener("pointerlockchange", handleLockChange);
    return () =>
      document.removeEventListener("pointerlockchange", handleLockChange);
  }, [handleLockChange]);

  // Esc from title screen opens options; Esc in options goes to title
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== "Escape") return;
      // While listening for a rebind, OptionsMenu handles Escape
      if (e.defaultPrevented) return;

      if (locked) {
        // Browser will exit pointer lock; lockchange opens menu
        return;
      }
      if (menuOpen) {
        e.preventDefault();
        setMenuOpen(false);
      } else {
        // Title screen → options
        e.preventDefault();
        setMenuOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked, menuOpen]);

  // DualShock Options / Start — open options (edge-triggered). Does not close
  // the menu so remapping that button won't immediately dismiss the panel.
  const optionsBtnHeldRef = useRef(false);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const held = isOptionsButtonPressed();
      if (held && !optionsBtnHeldRef.current && !menuOpen) {
        if (document.pointerLockElement) document.exitPointerLock();
        setMenuOpen(true);
      }
      optionsBtnHeldRef.current = held;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [menuOpen]);

  const playerEnabled = locked && !menuOpen;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        shadows
        camera={{ fov: 60, near: 0.1, far: 500, position: [0, 4, 12] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = 2; // PCFSoftShadowMap
        }}
      >
        <Suspense fallback={null}>
          <Scene
            enabled={playerEnabled}
            rideState={rideState}
            gateState={gateState}
            barnDoorState={barnDoorState}
            flowerState={flowerState}
            flowerVersion={flowerVersion}
            onFlowerChange={handleFlowerChange}
            onRideHint={setRideHint}
            settings={settings}
          />
        </Suspense>
      </Canvas>

      {menuOpen ? (
        <OptionsMenu
          settings={settings}
          onChange={setSettings}
          onResume={handleResume}
          onCloseToTitle={handleCloseToTitle}
          showResume
        />
      ) : (
        <HUD
          locked={locked}
          onPlay={handlePlay}
          onOpenOptions={openOptions}
          rideHint={rideHint}
          settings={settings}
        />
      )}
    </div>
  );
}
