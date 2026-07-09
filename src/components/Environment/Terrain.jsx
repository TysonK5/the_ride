import { useMemo } from "react";
import * as THREE from "three";
import { COLORS } from "../../materials/colors";

function noise(x, z) {
  return (
    Math.sin(x * 0.04) * Math.cos(z * 0.05) * 2 +
    Math.sin(x * 0.08 + 1.3) * Math.cos(z * 0.07) * 1 +
    Math.sin(x * 0.15) * 0.5
  );
}

export function Terrain() {
  const { geometry, material } = useMemo(() => {
    const size = 200;
    const segments = 80;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = noise(x, z);

      // Flatten town center
      const dist = Math.sqrt(x * x + (z + 10) * (z + 10));
      if (dist < 35) {
        y *= Math.max(0, (dist - 15) / 20);
      }

      // Hills around edges
      const edgeDist = Math.max(Math.abs(x), Math.abs(z));
      if (edgeDist > 60) {
        y += (edgeDist - 60) * 0.15;
      }

      pos.setY(i, y);
    }
    geo.computeVertexNormals();

    const grad = document.createElement("canvas");
    grad.width = 2;
    grad.height = 1;
    const ctx = grad.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 2, 0);
    g.addColorStop(0, "#444");
    g.addColorStop(0.5, "#aaa");
    g.addColorStop(1, "#fff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 1);
    const gradientMap = new THREE.CanvasTexture(grad);
    gradientMap.minFilter = THREE.NearestFilter;

    const mat = new THREE.MeshToonMaterial({
      color: COLORS.grass,
      gradientMap,
    });

    return { geometry: geo, material: mat };
  }, []);

  return (
    <group>
      <mesh geometry={geometry} material={material} receiveShadow />
      <RoadPatch x={0} z={0} width={8} length={70} rotation={0} />
      <RoadPatch x={-20} z={0} width={6} length={30} rotation={Math.PI / 2} />
      <RoadPatch x={25} z={-5} width={5} length={25} rotation={Math.PI / 2} />
    </group>
  );
}

function RoadPatch({ x, z, width, length, rotation }) {
  return (
    <mesh position={[x, 0.08, z]} rotation={[-Math.PI / 2, rotation, 0]} receiveShadow>
      <planeGeometry args={[width, length]} />
      <meshToonMaterial color={COLORS.dirt} />
    </mesh>
  );
}

export function Mountains() {
  const peaks = useMemo(
    () =>
      [
        [-70, -60, 18, 30],
        [-50, -75, 22, 35],
        [60, -70, 20, 32],
        [75, -50, 16, 28],
        [-80, 40, 14, 25],
        [85, 30, 17, 30],
      ].map(([x, z, h, w], i) => ({ x, z, h, w, key: i })),
    []
  );

  return (
    <group>
      {peaks.map(({ x, z, h, w, key }) => (
        <group key={key} position={[x, h / 2 - 2, z]}>
          <mesh castShadow>
            <coneGeometry args={[w, h, 6]} />
            <meshToonMaterial color={COLORS.mountain} />
          </mesh>
          <mesh position={[0, h * 0.25, 0]} castShadow>
            <coneGeometry args={[w * 0.55, h * 0.35, 6]} />
            <meshToonMaterial color={COLORS.mountainSnow} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
