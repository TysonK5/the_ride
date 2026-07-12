import { Sky as DreiSky } from "@react-three/drei";

export function Sky() {
  return (
    <>
      <DreiSky
        distance={450000}
        sunPosition={[80, 40, 60]}
        inclination={0.52}
        azimuth={0.25}
        mieCoefficient={0.005}
        mieDirectionalG={0.9}
        rayleigh={0.4}
        turbidity={8}
      />
      <ambientLight intensity={0.55} color="#ffe8c8" />
      <directionalLight
        position={[60, 80, 40]}
        intensity={1.8}
        color="#fff8e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
        shadow-camera-near={0.5}
        shadow-camera-far={520}
      />
      <hemisphereLight args={["#87ceeb", "#6bc94a", 0.4]} />
    </>
  );
}
