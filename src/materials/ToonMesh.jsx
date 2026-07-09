import { useMemo } from "react";
import * as THREE from "three";
import { Outlines } from "@react-three/drei";

const gradientMap = (() => {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 4, 0);
  grad.addColorStop(0, "#444");
  grad.addColorStop(0.35, "#888");
  grad.addColorStop(0.65, "#ccc");
  grad.addColorStop(1, "#fff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  return tex;
})();

export function useToonMaterial(color, options = {}) {
  return useMemo(
    () =>
      new THREE.MeshToonMaterial({
        color,
        gradientMap,
        ...options,
      }),
    [color, options]
  );
}

export function ToonBox({ color, outline = true, outlineWidth = 2, children, ...props }) {
  const material = useToonMaterial(color);
  return (
    <mesh {...props} material={material} castShadow receiveShadow>
      {children ?? <boxGeometry />}
      {outline && <Outlines color="#1a1008" thickness={outlineWidth} />}
    </mesh>
  );
}

export function ToonMesh({ color, geometry, outline = true, outlineWidth = 2, ...props }) {
  const material = useToonMaterial(color);
  return (
    <mesh {...props} material={material} castShadow receiveShadow>
      {geometry}
      {outline && <Outlines color="#1a1008" thickness={outlineWidth} />}
    </mesh>
  );
}
