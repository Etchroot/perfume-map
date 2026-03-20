import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";

export default function SelectedSphere({ fragrance }) {
  const coreRef  = useRef();
  const outerRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (coreRef.current)  coreRef.current.scale.setScalar(1 + Math.sin(t * 2.5) * 0.15);
    if (outerRef.current) {
      outerRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.22);
      outerRef.current.material.opacity = 0.22 + Math.sin(t * 2) * 0.08;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      {/* 외곽 와이어프레임 글로우 링 */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.85, 32, 32]} />
        <meshBasicMaterial color="#4de8ff" transparent opacity={0.22} wireframe />
      </mesh>

      {/* 코어 구체 — 더 크게 */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.40, 32, 32]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* fragrance 이름 */}
      <Html center distanceFactor={8} position={[0, 1.1, 0]}>
        <div
          style={{
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: 600,
            fontFamily: "sans-serif",
            textAlign: "center",
            whiteSpace: "nowrap",
            letterSpacing: "0.08em",
            textShadow: "0 0 12px rgba(77,232,255,0.9), 0 0 24px rgba(77,232,255,0.5)",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {fragrance}
        </div>
      </Html>
    </group>
  );
}
