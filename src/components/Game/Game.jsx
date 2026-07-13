import { Suspense, useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Sky } from "../Environment/Sky";
import { Terrain, Mountains } from "../Environment/Terrain";
import { Trees } from "../Environment/Trees";
import { Props } from "../Environment/Props";
import { Lake } from "../Environment/Lake";
import { Dock } from "../Environment/Dock";
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
import {
  Butterflies,
  createButterflyState,
} from "../Animals/Butterfly";
import { HUD } from "../UI/HUD";
import { OptionsMenu } from "../UI/OptionsMenu";
import { MapEditor } from "../UI/MapEditor";
import { TouchControls } from "../UI/TouchControls";
import { loadSettings } from "../../systems/settings";
import { isOptionsButtonPressed } from "../../systems/gamepad";
import { clearVirtualGamepad } from "../../systems/virtualGamepad";
import { loadPaths } from "../../systems/paths";
import { createFurnitureState } from "../../systems/furniture";
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
  furnitureState,
  flowerState,
  flowerVersion,
  onFlowerChange,
  onRideHint,
  settings,
  pathDefs,
  playerTrack,
  butterflyState,
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
      <Dock />
      <ValentineTown
        barnDoorState={barnDoorState}
        cabinState={cabinState}
        furnitureState={furnitureState}
        playerTrack={playerTrack}
      />
      <Fence gateState={gateState} />
      <Birds />
      <Flowers key={flowerVersion} flowerState={flowerState} />
      <Butterflies flowerState={flowerState} butterflyState={butterflyState} />
      <Horse
        rideState={rideState}
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
        playerTrack={playerTrack}
      />
      <Unicorn
        rideState={unicornRideState}
        cabinState={cabinState}
        barnDoorState={barnDoorState}
        gateState={gateState}
        playerTrack={playerTrack}
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
        furnitureState={furnitureState}
        flowerState={flowerState}
        butterflyState={butterflyState}
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
  /** Pointer lock (desktop mouse look) */
  const [locked, setLocked] = useState(false);
  /**
   * Gameplay active without pointer lock — used for touch / on-screen
   * controller on phones and tablets.
   */
  const [touchPlaying, setTouchPlaying] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mapEditorOpen, setMapEditorOpen] = useState(false);
  const [rideHint, setRideHint] = useState("");
  const [settings, setSettings] = useState(() => loadSettings());
  const [pathDefs, setPathDefs] = useState(() => loadPaths());
  const [flowerVersion, setFlowerVersion] = useState(0);
  const wasLockedRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const playing = locked || touchPlaying;
  const touchControlsOn = !!settings.touchControlsEnabled;

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
  const furnitureState = useMemo(() => createFurnitureState(), []);
  const flowerState = useMemo(() => createFlowerState(), []);
  const butterflyState = useMemo(
    () => createButterflyState(flowerState),
    [flowerState]
  );
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

  const beginPlay = useCallback(() => {
    resumeAudio().then(() => {
      const s = settingsRef.current;
      setAudioSettings({
        muted: s.soundMuted,
        masterVolume: s.masterVolume ?? 0.7,
        sfxVolume: s.sfxVolume ?? 1,
        ambientVolume: s.ambientVolume ?? 0.4,
      });
      startAmbient();
      sfxUIClick();
    });
    setMenuOpen(false);
    setMapEditorOpen(false);
    clearVirtualGamepad();
    if (settingsRef.current.touchControlsEnabled) {
      // Phones / tablets: play without pointer lock; look via right stick
      setTouchPlaying(true);
    } else {
      setTouchPlaying(false);
      document.body.requestPointerLock();
    }
  }, []);

  const handlePlay = beginPlay;
  const handleResume = beginPlay;

  const handleCloseToTitle = useCallback(() => {
    sfxUIClose();
    stopAmbient();
    setMenuOpen(false);
    setTouchPlaying(false);
    clearVirtualGamepad();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  const openOptions = useCallback(() => {
    sfxUIOpen();
    setMapEditorOpen(false);
    setMenuOpen(true);
    clearVirtualGamepad();
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
    // Keep touchPlaying so Resume returns to the world without title screen
  }, []);

  const openMapEditor = useCallback(() => {
    sfxUIOpen();
    setMenuOpen(false);
    setMapEditorOpen(true);
    clearVirtualGamepad();
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
    // Leaving pointer lock (Esc) opens options — skip if already in touch play
    // and the lock was never held (or user is only using on-screen controls).
    if (wasLockedRef.current && !isLocked && !mapEditorOpen) {
      setMenuOpen(true);
    }
    if (isLocked) {
      setMenuOpen(false);
      setMapEditorOpen(false);
      setTouchPlaying(false);
    }
    wasLockedRef.current = isLocked;
    setLocked(isLocked);
  }, [mapEditorOpen]);

  useEffect(() => {
    document.addEventListener("pointerlockchange", handleLockChange);
    return () =>
      document.removeEventListener("pointerlockchange", handleLockChange);
  }, [handleLockChange]);

  // Esc: map editor → close; touch play → options; options → title; title → options
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.code !== "Escape") return;
      if (e.defaultPrevented) return;

      if (mapEditorOpen) {
        e.preventDefault();
        setMapEditorOpen(false);
        return;
      }

      if (locked) {
        // Browser exits pointer lock; lockchange opens menu
        return;
      }

      if (touchPlaying && !menuOpen) {
        e.preventDefault();
        clearVirtualGamepad();
        setMenuOpen(true);
        return;
      }

      if (menuOpen) {
        e.preventDefault();
        // Resume if we were in a touch session; otherwise back to title
        if (touchPlaying) {
          setMenuOpen(false);
        } else {
          setMenuOpen(false);
        }
      } else {
        e.preventDefault();
        setMenuOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [locked, menuOpen, mapEditorOpen, touchPlaying]);

  // DualShock Options / Start — open options (edge-triggered).
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
        clearVirtualGamepad();
        setMenuOpen(true);
      }
      optionsBtnHeldRef.current = held;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [menuOpen, mapEditorOpen]);

  const playerEnabled = playing && !menuOpen && !mapEditorOpen;
  const showTouchPad =
    touchControlsOn && playerEnabled && !mapEditorOpen && !menuOpen;

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
            furnitureState={furnitureState}
            flowerState={flowerState}
            flowerVersion={flowerVersion}
            onFlowerChange={handleFlowerChange}
            onRideHint={setRideHint}
            settings={settings}
            pathDefs={pathDefs}
            playerTrack={playerTrack}
            butterflyState={butterflyState}
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
          showResume={playing || locked || touchPlaying}
        />
      ) : (
        <>
          <HUD
            locked={playing}
            onPlay={handlePlay}
            onOpenOptions={openOptions}
            onOpenMapEditor={openMapEditor}
            rideHint={rideHint}
            settings={settings}
          />
          <TouchControls
            settings={settings}
            onOpenOptions={openOptions}
            visible={showTouchPad}
          />
        </>
      )}
    </div>
  );
}
