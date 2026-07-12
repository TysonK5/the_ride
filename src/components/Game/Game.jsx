import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Sky } from "../Environment/Sky";
import { Terrain, Mountains } from "../Environment/Terrain";
import { Trees } from "../Environment/Trees";
import { Props } from "../Environment/Props";
import { Lake } from "../Environment/Lake";
import { Fence, createGateState } from "../Environment/Fence";
import { Birds } from "../Environment/Birds";
import {
  Flowers,
  createFlowerState,
  saveFlowers,
} from "../Environment/Flowers";
import {
  ValentineTown,
  createBarnDoorState,
  createCabinState,
} from "../Town/Buildings";
import { Player } from "../Player/Player";
import { Horse, Unicorn, createRideState } from "../Horse/Horse";
import { Cat, createPlayerTrackState } from "../Animals/Cat";
import { Callie } from "../Animals/Callie";
import { Cow } from "../Animals/Cow";
import { Chickens } from "../Animals/Chicken";
import { Pigs } from "../Animals/Pig";
import { HUD } from "../UI/HUD";
import { OptionsMenu } from "../UI/OptionsMenu";
import { MapEditor } from "../UI/MapEditor";
import { loadSettings } from "../../systems/settings";
import { isOptionsButtonPressed } from "../../systems/gamepad";
import { loadPaths } from "../../systems/paths";
import {
  resumeAudio,
  setAudioSettings,
  startAmbient,
  stopAmbient,
  sfxUIClick,
  sfxUIOpen,
  sfxUIClose,
} from "../../systems/audio";

function Scene({
  enabled,
  rideState,
  unicornRideState,
  gateState,
  barnDoorState,
  cabinState,
  flowerState,
  flowerVersion,
  onFlowerChange,
  onRideHint,
  settings,
  pathDefs,
  playerTrack,
}) {
  return (
    <>
      <color attach="background" args={["#87ceeb"]} />
      <fog attach="fog" args={["#c8e8ff", 140, 480]} />

      <Sky />
      <Terrain pathDefs={pathDefs} />
      <Mountains />
      <Trees />
      <Props />
      <Lake />
      <ValentineTown barnDoorState={barnDoorState} cabinState={cabinState} />
      <Fence gateState={gateState} />
      <Birds />
      <Flowers key={flowerVersion} flowerState={flowerState} />
      <Horse
        rideState={rideState}
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
      />
      <Unicorn
        rideState={unicornRideState}
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
      />
      <Cat
        playerTrack={playerTrack}
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
      />
      <Callie
        playerTrack={playerTrack}
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
      />
      <Cow
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
      />
      <Chickens
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
      />
      <Pigs
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
      />
      <Player
        enabled={enabled}
        rideState={rideState}
        unicornRideState={unicornRideState}
        gateState={gateState}
        barnDoorState={barnDoorState}
        cabinState={cabinState}
        flowerState={flowerState}
        playerTrack={playerTrack}
        onFlowerChange={onFlowerChange}
        onRideHint={onRideHint}
        settings={settings}
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
  const [mapEditorOpen, setMapEditorOpen] = useState(false);
  const [rideHint, setRideHint] = useState("");
  const [settings, setSettings] = useState(() => loadSettings());
  const [pathDefs, setPathDefs] = useState(() => loadPaths());
  const [flowerVersion, setFlowerVersion] = useState(0);
  const wasLockedRef = useRef(false);

  // Spawn inside the horse pen so they can idle-wander
  const rideState = useMemo(
    () => createRideState([14, 0, 0], "horse"),
    []
  );
  // Light purple unicorn also in the pen
  const unicornRideState = useMemo(
    () => createRideState([22, 0, 2], "unicorn"),
    []
  );
  const gateState = useMemo(() => createGateState(), []);
  const barnDoorState = useMemo(() => createBarnDoorState(), []);
  const cabinState = useMemo(() => createCabinState(), []);
  const flowerState = useMemo(() => createFlowerState(), []);
  const playerTrack = useMemo(() => createPlayerTrackState([0, 0, 8]), []);

  const handleFlowerChange = useCallback(() => {
    flowerState.version += 1;
    setFlowerVersion(flowerState.version);
    // Persist moved / planted flower positions to localStorage
    saveFlowers(flowerState);
  }, [flowerState]);

  // Apply saved audio prefs once
  useEffect(() => {
    setAudioSettings({
      muted: settings.soundMuted,
      masterVolume: settings.masterVolume ?? 0.7,
      sfxVolume: settings.sfxVolume ?? 1,
      ambientVolume: settings.ambientVolume ?? 0.4,
    });
  }, [settings]);

  const handlePlay = useCallback(() => {
    resumeAudio().then(() => {
      setAudioSettings({
        muted: settings.soundMuted,
        masterVolume: settings.masterVolume ?? 0.7,
        sfxVolume: settings.sfxVolume ?? 1,
        ambientVolume: settings.ambientVolume ?? 0.4,
      });
      startAmbient();
      sfxUIClick();
    });
    setMenuOpen(false);
    document.body.requestPointerLock();
  }, [settings]);

  const handleResume = useCallback(() => {
    resumeAudio().then(() => {
      startAmbient();
      sfxUIClick();
    });
    setMenuOpen(false);
    document.body.requestPointerLock();
  }, []);

  const handleCloseToTitle = useCallback(() => {
    sfxUIClose();
    stopAmbient();
    setMenuOpen(false);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  const openOptions = useCallback(() => {
    sfxUIOpen();
    setMapEditorOpen(false);
    setMenuOpen(true);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  const openMapEditor = useCallback(() => {
    sfxUIOpen();
    setMenuOpen(false);
    setMapEditorOpen(true);
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  const closeMapEditor = useCallback(() => {
    sfxUIClose();
    setMapEditorOpen(false);
  }, []);

  const handleLockChange = useCallback(() => {
    const isLocked = document.pointerLockElement === document.body;
    // Opening options while leaving play (e.g. Esc releases lock)
    if (wasLockedRef.current && !isLocked && !mapEditorOpen) {
      setMenuOpen(true);
    }
    if (isLocked) {
      setMenuOpen(false);
      setMapEditorOpen(false);
    }
    wasLockedRef.current = isLocked;
    setLocked(isLocked);
  }, [mapEditorOpen]);

  useEffect(() => {
    document.addEventListener("pointerlockchange", handleLockChange);
    return () =>
      document.removeEventListener("pointerlockchange", handleLockChange);
  }, [handleLockChange]);

  // Esc: map editor → close; options → title; title → options
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== "Escape") return;
      // While listening for a rebind, OptionsMenu handles Escape
      if (e.defaultPrevented) return;

      if (mapEditorOpen) {
        e.preventDefault();
        setMapEditorOpen(false);
        return;
      }

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
  }, [locked, menuOpen, mapEditorOpen]);

  // DualShock Options / Start — open options (edge-triggered). Does not close
  // the menu so remapping that button won't immediately dismiss the panel.
  const optionsBtnHeldRef = useRef(false);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const held = isOptionsButtonPressed();
      if (
        held &&
        !optionsBtnHeldRef.current &&
        !menuOpen &&
        !mapEditorOpen
      ) {
        if (document.pointerLockElement) document.exitPointerLock();
        setMenuOpen(true);
      }
      optionsBtnHeldRef.current = held;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [menuOpen, mapEditorOpen]);

  const playerEnabled = locked && !menuOpen && !mapEditorOpen;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        shadows
        camera={{ fov: 60, near: 0.1, far: 900, position: [0, 4, 12] }}
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
            unicornRideState={unicornRideState}
            gateState={gateState}
            barnDoorState={barnDoorState}
            cabinState={cabinState}
            flowerState={flowerState}
            flowerVersion={flowerVersion}
            onFlowerChange={handleFlowerChange}
            onRideHint={setRideHint}
            settings={settings}
            pathDefs={pathDefs}
            playerTrack={playerTrack}
          />
        </Suspense>
      </Canvas>

      {mapEditorOpen ? (
        <MapEditor
          paths={pathDefs}
          onChange={setPathDefs}
          onClose={closeMapEditor}
        />
      ) : menuOpen ? (
        <OptionsMenu
          settings={settings}
          onChange={setSettings}
          onResume={handleResume}
          onCloseToTitle={handleCloseToTitle}
          onOpenMapEditor={openMapEditor}
          showResume
        />
      ) : (
        <HUD
          locked={locked}
          onPlay={handlePlay}
          onOpenOptions={openOptions}
          onOpenMapEditor={openMapEditor}
          rideHint={rideHint}
          settings={settings}
        />
      )}
    </div>
  );
}
