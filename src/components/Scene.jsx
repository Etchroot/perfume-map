import { useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import ParticleField from "./ParticleField";
import ModifierField from "./ModifierField";
import SelectedSphere from "./SelectedSphere";

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// ─── 결과 완료 시 카메라를 텍스트 패널 정면으로 부드럽게 이동 ─────────────────
// priority=100: OrbitControls(priority=0) 이후에 실행 → camera 위치를 덮어씀
// OrbitControls는 다음 프레임에서 덮어쓰인 camera.position을 "현재 위치"로 읽음
// → 애니메이션 종료 후 자연스럽게 OrbitControls 상태와 동기화됨
function CameraController({ result, modifierRef, controlsRef }) {
  const { camera } = useThree();
  const animRef = useRef({ active: false, progress: 0 });

  useEffect(() => {
    if (!result) {
      animRef.current = { active: false, progress: 0 };
      return;
    }
    const timer = setTimeout(() => {
      const wp = modifierRef?.current?.getWinnerPosition?.();
      if (!wp || !controlsRef.current) return;

      // 텍스트 패널은 winner 위 1.8 — 정확히 패널 위치를 카메라 중앙으로
      const focusPoint = new THREE.Vector3(wp[0], wp[1] + 1.8, wp[2]);

      // 카메라 접근 방향: 원점 → winner 의 바깥쪽 (radial)
      const outDir = new THREE.Vector3(...wp);
      if (outDir.length() < 0.001) outDir.set(0, 0, 1);
      else outDir.normalize();

      // minDistance(6) 만큼 떨어진 카메라 목표 위치
      const newCamPos = focusPoint.clone().addScaledVector(outDir, 6);

      animRef.current = {
        active:       true,
        progress:     0,
        startTarget:  controlsRef.current.target.clone(),
        startCamPos:  camera.position.clone(),
        endTarget:    focusPoint,
        endCamPos:    newCamPos,
      };
    }, 300);
    return () => clearTimeout(timer);
  }, [result]);

  useFrame(() => {
    const anim = animRef.current;
    if (!anim.active || !controlsRef.current) return;

    anim.progress = Math.min(anim.progress + 0.015, 1);
    const t = easeInOut(anim.progress);

    // OrbitControls target과 camera.position을 동시에 lerp
    controlsRef.current.target.lerpVectors(anim.startTarget, anim.endTarget, t);
    camera.position.lerpVectors(anim.startCamPos, anim.endCamPos, t);
    camera.lookAt(controlsRef.current.target);

    if (anim.progress >= 1) anim.active = false;
  }, 100); // OrbitControls(0) 이후 실행

  return null;
}

export default function Scene({ status, result, selectedFragrance, categories, particleRef, modifierRef }) {
  const controlsRef = useRef();

  return (
    <Canvas
      camera={{ position: [0, 0, 13], fov: 60 }}
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
    >
      <color attach="background" args={["#00000a"]} />

      <OrbitControls
        ref={controlsRef}
        enablePan={true}
        minDistance={6}
        maxDistance={22}
        autoRotate={status === "idle"}
        autoRotateSpeed={0.25}
        enableDamping
        dampingFactor={0.05}
        mouseButtons={{
          LEFT: THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />

      <CameraController result={result} modifierRef={modifierRef} controlsRef={controlsRef} />

      <ParticleField ref={particleRef} status={status} categories={categories} />

      {/* 혜성이 도착한 뒤(exploding~) 선택된 fragrance 구체 표시 */}
      {(status === "exploding" || status === "result") && selectedFragrance && (
        <SelectedSphere fragrance={selectedFragrance} />
      )}

      <ModifierField ref={modifierRef} status={status} result={result} />

      <EffectComposer>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.0}
          luminanceSmoothing={0.85}
          mipmapBlur
          radius={0.6}
        />
      </EffectComposer>
    </Canvas>
  );
}
