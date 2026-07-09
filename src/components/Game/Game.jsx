import { Suspense, useState, useCallback, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { Sky } from "../Environment/Sky";
import { Terrain, Mountains } from "../Environment/Terrain";
import { Trees } from "../Environment/Trees";
import { Props } from "../Environment/Props";
import { ValentineTown } from "../Town/Buildings";
import { Player } from "../Player/Player";
import { HUD } from "../UI/HUD";

function Scene({ locked }) {
  return (
    <>
      <color attach="background" args={["#87ceeb"]} />
      <fog attach="fog" args={["#c8e8ff", 60, 140]} />

      <Sky />
      <Terrain />
      <Mountains />
      <Trees />
      <Props />
      <ValentineTown />
      <Player enabled={locked} />

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.45}
        scale={120}
        blur={2}
        far={30}
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

  const handlePlay = useCallback(() => {
    document.body.requestPointerLock();
  }, []);

  const handleLockChange = useCallback(() => {
    setLocked(document.pointerLockElement === document.body);
  }, []);

  useEffect(() => {
    document.addEventListener("pointerlockchange", handleLockChange);
    return () => document.removeEventListener("pointerlockchange", handleLockChange);
  }, [handleLockChange]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        shadows
        camera={{ fov: 60, near: 0.1, far: 300, position: [0, 4, 12] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = 2; // PCFSoftShadowMap
        }}
      >
        <Suspense fallback={null}>
          <Scene locked={locked} />
        </Suspense>
      </Canvas>
      <HUD locked={locked} onPlay={handlePlay} />
    </div>
  );
}
