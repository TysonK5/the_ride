import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";
import { buildLandingSpots } from "./Trees";

/** Max birds flying / perched over the environment at once */
export const BIRD_COUNT = 10;

/** 5 bird model variants */
const BIRD_MODELS = [
  { name: "sparrow", body: "#8a6a4a", wing: "#5c4030", belly: "#d4c4a8", scale: 1 },
  { name: "bluebird", body: "#3a7ec8", wing: "#2a5a9a", belly: "#e8d8a0", scale: 1.05 },
  { name: "crow", body: "#2a2a30", wing: "#1a1a20", belly: "#3a3a42", scale: 1.2 },
  { name: "cardinal", body: "#c43030", wing: "#8a2020", belly: "#e06050", scale: 1.05 },
  { name: "dove", body: "#d8d4cc", wing: "#b0aaa0", belly: "#f0ece4", scale: 1.1 },
];

const FLY_MIN_Y = 6;
const FLY_MAX_Y = 22;
const WORLD_R = 120;
const FLY_SPEED = 7;
const LAND_SPEED = 5;

const _tmp = new THREE.Vector3();
const _dir = new THREE.Vector3();

function createBirdState(i, landingSpots) {
  const angle = (i / BIRD_COUNT) * Math.PI * 2;
  const r = 15 + (i % 5) * 6;
  const model = BIRD_MODELS[i % BIRD_MODELS.length];
  const perch = landingSpots[i % landingSpots.length];
  const startPerched = i % 3 === 0;

  return {
    id: i,
    model,
    mode: startPerched ? "perched" : "flying",
    pos: startPerched
      ? new THREE.Vector3(perch.x, perch.y, perch.z)
      : new THREE.Vector3(
          Math.cos(angle) * r,
          FLY_MIN_Y + (i % 4) * 2.5,
          Math.sin(angle) * r
        ),
    yaw: angle + Math.PI / 2,
    wingPhase: i * 1.3,
    timer: startPerched ? 3 + (i % 5) * 1.5 : 4 + (i % 7),
    target: startPerched
      ? new THREE.Vector3(perch.x, perch.y, perch.z)
      : new THREE.Vector3(),
    circleCenter: new THREE.Vector3(
      (Math.random() - 0.5) * 30,
      0,
      (Math.random() - 0.5) * 30
    ),
    circleR: 12 + Math.random() * 18,
    circleSpeed: 0.35 + Math.random() * 0.35,
    circleAngle: angle,
    height: FLY_MIN_Y + Math.random() * (FLY_MAX_Y - FLY_MIN_Y),
  };
}

function pickLandingSpot(spots) {
  return spots[Math.floor(Math.random() * spots.length)];
}

function FlappingBird({ model, bird }) {
  const wingL = useRef();
  const wingR = useRef();

  useFrame(() => {
    const flap =
      bird.mode === "perched" ? 0.12 : Math.sin(bird.wingPhase) * 0.7;
    if (wingL.current) wingL.current.rotation.z = flap + 0.15;
    if (wingR.current) wingR.current.rotation.z = -flap - 0.15;
  });

  const s = model.scale * 0.38;
  return (
    <group scale={s}>
      <mesh castShadow>
        <sphereGeometry args={[0.45, 6, 5]} />
        <meshToonMaterial color={model.body} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, -0.12, 0.05]} scale={[0.85, 0.7, 0.9]}>
        <sphereGeometry args={[0.35, 5, 4]} />
        <meshToonMaterial color={model.belly} />
      </mesh>
      <mesh position={[0, 0.2, 0.4]} castShadow>
        <sphereGeometry args={[0.28, 6, 5]} />
        <meshToonMaterial color={model.body} />
        <Outlines color={COLORS.outline} thickness={1} />
      </mesh>
      <mesh position={[0, 0.15, 0.65]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.08, 0.22, 4]} />
        <meshToonMaterial color="#e8a040" />
      </mesh>
      <mesh position={[0.12, 0.28, 0.52]}>
        <sphereGeometry args={[0.05, 4, 4]} />
        <meshToonMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 0.05, -0.5]} rotation={[-0.4, 0, 0]}>
        <boxGeometry args={[0.2, 0.08, 0.4]} />
        <meshToonMaterial color={model.wing} />
      </mesh>
      <mesh ref={wingL} position={[-0.4, 0.05, 0]} castShadow>
        <boxGeometry args={[0.7, 0.08, 0.35]} />
        <meshToonMaterial color={model.wing} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
      <mesh ref={wingR} position={[0.4, 0.05, 0]} castShadow>
        <boxGeometry args={[0.7, 0.08, 0.35]} />
        <meshToonMaterial color={model.wing} />
        <Outlines color={COLORS.outline} thickness={0.8} />
      </mesh>
    </group>
  );
}

function BirdActor({ bird, landingSpots }) {
  const groupRef = useRef();

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const b = bird;
    const dt = Math.min(delta, 0.05);
    b.timer -= dt;

    if (b.mode === "flying") {
      b.circleAngle += b.circleSpeed * dt;
      b.circleCenter.x += Math.sin(b.circleAngle * 0.1) * 2 * dt;
      b.circleCenter.z += Math.cos(b.circleAngle * 0.13) * 2 * dt;
      b.circleCenter.x = THREE.MathUtils.clamp(b.circleCenter.x, -90, 90);
      b.circleCenter.z = THREE.MathUtils.clamp(b.circleCenter.z, -90, 90);

      const tx = b.circleCenter.x + Math.cos(b.circleAngle) * b.circleR;
      const tz = b.circleCenter.z + Math.sin(b.circleAngle) * b.circleR;
      const ty = b.height + Math.sin(b.circleAngle * 2 + b.id) * 1.2;

      const target = _tmp.set(tx, ty, tz);
      _dir.copy(target).sub(b.pos);
      const dist = _dir.length();
      if (dist > 0.01) {
        _dir.multiplyScalar(1 / dist);
        const speed = FLY_SPEED * (0.85 + 0.15 * Math.sin(b.circleAngle));
        b.pos.addScaledVector(_dir, speed * dt);
        b.yaw = Math.atan2(_dir.x, _dir.z);
      }

      const flat = Math.hypot(b.pos.x, b.pos.z);
      if (flat > WORLD_R) {
        b.pos.x *= WORLD_R / flat;
        b.pos.z *= WORLD_R / flat;
        b.circleCenter.set(0, 0, 0);
      }

      b.wingPhase += dt * 14;

      if (b.timer <= 0) {
        const spot = pickLandingSpot(landingSpots);
        b.target.set(spot.x, spot.y, spot.z);
        b.mode = "landing";
        b.timer = 25;
      }
    } else if (b.mode === "landing") {
      _dir.copy(b.target).sub(b.pos);
      const dist = _dir.length();
      if (dist < 0.35) {
        b.pos.copy(b.target);
        b.mode = "perched";
        b.timer = 4 + Math.random() * 10;
        b.wingPhase = 0;
      } else {
        _dir.multiplyScalar(1 / dist);
        const speed = Math.min(LAND_SPEED + dist * 0.4, FLY_SPEED * 1.2);
        b.pos.addScaledVector(_dir, speed * dt);
        b.yaw = Math.atan2(_dir.x, _dir.z);
        b.wingPhase += dt * 12;
      }
    } else if (b.mode === "perched") {
      b.pos.copy(b.target);
      b.yaw += Math.sin(performance.now() * 0.001 + b.id) * 0.002;
      b.wingPhase *= 0.9;

      if (b.timer <= 0) {
        b.mode = "takeoff";
        b.timer = 1.2;
        b.height = FLY_MIN_Y + Math.random() * (FLY_MAX_Y - FLY_MIN_Y);
        b.circleCenter.set(
          b.pos.x + (Math.random() - 0.5) * 20,
          0,
          b.pos.z + (Math.random() - 0.5) * 20
        );
        b.circleR = 10 + Math.random() * 16;
        b.circleAngle = Math.random() * Math.PI * 2;
      }
    } else if (b.mode === "takeoff") {
      b.pos.y += 6 * dt;
      b.pos.x += Math.sin(b.yaw) * FLY_SPEED * 0.5 * dt;
      b.pos.z += Math.cos(b.yaw) * FLY_SPEED * 0.5 * dt;
      b.wingPhase += dt * 16;
      if (b.timer <= 0 || b.pos.y > b.height - 1) {
        b.mode = "flying";
        b.timer = 6 + Math.random() * 12;
      }
    }

    groupRef.current.position.copy(b.pos);
    groupRef.current.rotation.y = b.yaw;
    groupRef.current.rotation.z =
      b.mode === "perched" ? 0 : Math.sin(b.wingPhase * 0.5) * 0.15;
  });

  return (
    <group ref={groupRef}>
      <FlappingBird model={bird.model} bird={bird} />
    </group>
  );
}

export function Birds() {
  const landingSpots = useMemo(() => buildLandingSpots(), []);
  const birds = useMemo(
    () =>
      Array.from({ length: BIRD_COUNT }, (_, i) =>
        createBirdState(i, landingSpots)
      ),
    [landingSpots]
  );

  return (
    <group userData={{ ignoreCameraCollision: true }}>
      {birds.map((b) => (
        <BirdActor key={b.id} bird={b} landingSpots={landingSpots} />
      ))}
    </group>
  );
}
