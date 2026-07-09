import { Outlines, Text } from "@react-three/drei";
import { COLORS } from "../../materials/colors";

function BuildingBase({
  position,
  rotation = 0,
  width,
  depth,
  height,
  wallColor = COLORS.woodLight,
  roofColor = COLORS.roofRed,
  roofStyle = "peaked",
  sign,
  signColor = COLORS.gold,
  porch = false,
  balcony = false,
  windows = true,
}) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Main body */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshToonMaterial color={wallColor} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>

      {/* Roof */}
      {roofStyle === "peaked" ? (
        <mesh position={[0, height + 0.8, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[Math.max(width, depth) * 0.75, 1.6, 4]} />
          <meshToonMaterial color={roofColor} />
          <Outlines color={COLORS.outline} thickness={2} />
        </mesh>
      ) : (
        <mesh position={[0, height + 0.3, 0]} castShadow>
          <boxGeometry args={[width + 0.4, 0.6, depth + 0.4]} />
          <meshToonMaterial color={roofColor} />
          <Outlines color={COLORS.outline} thickness={2} />
        </mesh>
      )}

      {/* Porch */}
      {porch && (
        <mesh position={[0, 0.3, depth / 2 + 0.6]} castShadow>
          <boxGeometry args={[width + 0.8, 0.15, 1.2]} />
          <meshToonMaterial color={COLORS.wood} />
          <Outlines color={COLORS.outline} thickness={1.5} />
        </mesh>
      )}

      {/* Balcony */}
      {balcony && (
        <group position={[0, height * 0.65, depth / 2 + 0.3]}>
          <mesh castShadow>
            <boxGeometry args={[width, 0.12, 1]} />
            <meshToonMaterial color={COLORS.wood} />
            <Outlines color={COLORS.outline} thickness={1.5} />
          </mesh>
          {[-width / 2 + 0.3, width / 2 - 0.3].map((x, i) => (
            <mesh key={i} position={[x, 0.5, 0.3]} castShadow>
              <boxGeometry args={[0.08, 1, 0.08]} />
              <meshToonMaterial color={COLORS.woodDark} />
            </mesh>
          ))}
        </group>
      )}

      {/* Windows */}
      {windows &&
        [-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * (width / 2 + 0.02), height * 0.55, 0]}
            rotation={[0, side * Math.PI / 2, 0]}
          >
            <planeGeometry args={[0.8, 1]} />
            <meshToonMaterial color="#87ceeb" />
          </mesh>
        ))}

      {/* Door */}
      <mesh position={[0, 0.9, depth / 2 + 0.02]}>
        <planeGeometry args={[0.9, 1.8]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>

      {/* Sign */}
      {sign && (
        <Text
          position={[0, height + 2.2, depth / 2 + 0.1]}
          fontSize={0.45}
          color={signColor}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.03}
          outlineColor={COLORS.outline}
        >
          {sign}
        </Text>
      )}
    </group>
  );
}

function Church({ position }) {
  return (
    <group position={position}>
      <BuildingBase
        position={[0, 0, 0]}
        width={8}
        depth={12}
        height={5}
        wallColor={COLORS.white}
        roofColor={COLORS.roof}
        roofStyle="peaked"
        sign="CHURCH"
        signColor={COLORS.white}
      />
      <mesh position={[0, 8, -2]} castShadow>
        <boxGeometry args={[2, 6, 2]} />
        <meshToonMaterial color={COLORS.stone} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh position={[0, 12, -2]} castShadow>
        <coneGeometry args={[1.5, 3, 4]} />
        <meshToonMaterial color={COLORS.roof} />
        <Outlines color={COLORS.outline} thickness={2} />
      </mesh>
      <mesh position={[0, 0.5, 4]} receiveShadow>
        <cylinderGeometry args={[0.08, 0.08, 1, 6]} />
        <meshToonMaterial color={COLORS.stoneDark} />
      </mesh>
    </group>
  );
}

function TrainStation({ position }) {
  return (
    <group position={position}>
      <BuildingBase
        position={[0, 0, 0]}
        width={14}
        depth={8}
        height={3.5}
        wallColor={COLORS.woodLight}
        roofColor={COLORS.roofGreen}
        roofStyle="flat"
        porch
        sign="STATION"
      />
      <mesh position={[-10, 1.5, 0]} castShadow>
        <boxGeometry args={[0.3, 3, 0.3]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[10, 1.5, 0]} castShadow>
        <boxGeometry args={[0.3, 3, 0.3]} />
        <meshToonMaterial color={COLORS.woodDark} />
      </mesh>
      <mesh position={[0, 3.2, 0]} castShadow>
        <boxGeometry args={[20.6, 0.3, 0.3]} />
        <meshToonMaterial color={COLORS.wood} />
      </mesh>
    </group>
  );
}

function CattlePen({ position }) {
  return (
    <group position={position}>
      {[0, 1, 2].map((i) => (
        <group key={i} position={[i * 3 - 3, 0, 0]}>
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[1.2, 1.2, 2]} />
            <meshToonMaterial color={COLORS.white} />
            <Outlines color={COLORS.outline} thickness={1.5} />
          </mesh>
          <mesh position={[0, 1.5, 0.5]} castShadow>
            <boxGeometry args={[0.8, 0.6, 0.8]} />
            <meshToonMaterial color={COLORS.dirtDark} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function ValentineTown() {
  return (
    <group>
      {/* Main street — north side */}
      <BuildingBase
        position={[10, 0, -14]}
        width={10}
        depth={8}
        height={5}
        wallColor={COLORS.woodLight}
        roofColor={COLORS.roofRed}
        balcony
        porch
        sign="SALOON"
      />
      <BuildingBase
        position={[-6, 0, -14]}
        width={7}
        depth={7}
        height={4}
        wallColor={COLORS.stone}
        roofColor={COLORS.roof}
        sign="SHERIFF"
        signColor={COLORS.gold}
      />
      <BuildingBase
        position={[-20, 0, -12]}
        width={8}
        depth={7}
        height={3.5}
        wallColor={COLORS.woodLight}
        roofColor={COLORS.roofGreen}
        porch
        sign="GENERAL STORE"
        signColor={COLORS.white}
      />
      <BuildingBase
        position={[-14, 0, 8]}
        width={6}
        depth={6}
        height={3.5}
        wallColor={COLORS.white}
        roofColor={COLORS.roofRed}
        sign="DOCTOR"
      />

      {/* Main street — south side */}
      <BuildingBase
        position={[16, 0, 10]}
        width={7}
        depth={7}
        height={4.5}
        wallColor={COLORS.woodLight}
        roofColor={COLORS.roofRed}
        porch
        sign="BANK"
        signColor={COLORS.gold}
      />
      <BuildingBase
        position={[24, 0, 10]}
        width={8}
        depth={8}
        height={6}
        wallColor={COLORS.woodLight}
        roofColor={COLORS.roofGreen}
        balcony
        sign="HOTEL"
      />

      {/* Landmarks */}
      <Church position={[38, 3, -28]} />
      <TrainStation position={[0, 0, 38]} />
      <CattlePen position={[-30, 0, 0]} />

      {/* Wooden sidewalks */}
      {[-14, 14].map((z) =>
        [-25, -15, -5, 5, 15, 25].map((x) => (
          <mesh key={`${x}-${z}`} position={[x, 0.12, z]} receiveShadow>
            <boxGeometry args={[3, 0.08, 1.5]} />
            <meshToonMaterial color={COLORS.wood} />
          </mesh>
        ))
      )}
    </group>
  );
}
