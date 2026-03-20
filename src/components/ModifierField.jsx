import { useRef, useMemo, useState, forwardRef, useImperativeHandle } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import gsap from "gsap";
import * as THREE from "three";

const MAX_CANDIDATES = 200;

// ─── 무작위 구면 좌표계 목표 위치 생성 ────────────────────────────────────────
function randomSphericalPositions(count) {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = 2.5 + Math.random() * 2.0;
    arr[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    arr[i * 3 + 1] = r * Math.cos(phi);
    arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  return arr;
}

// ─── 글로우 텍스처 (따뜻한 황금빛) ───────────────────────────────────────────
function createWarmGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0,    "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.15, "rgba(255, 210, 120, 0.9)");
  grad.addColorStop(0.4,  "rgba(255, 140, 40,  0.4)");
  grad.addColorStop(1,    "rgba(0,   0,   0,   0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ─── Winner 글로우 + 정보 패널 ────────────────────────────────────────────────
function WinnerGlow({ position, result }) {
  const coreRef  = useRef();
  const innerRef = useRef();
  const outerRef = useRef();

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    if (coreRef.current) {
      coreRef.current.scale.setScalar(1 + Math.sin(t * 4.5) * 0.20);
    }
    if (innerRef.current) {
      innerRef.current.material.opacity = 0.35 + Math.sin(t * 3.0) * 0.18;
      innerRef.current.scale.setScalar(1 + Math.sin(t * 2.5) * 0.22);
    }
    if (outerRef.current) {
      outerRef.current.material.opacity = 0.10 + Math.sin(t * 1.8) * 0.06;
      outerRef.current.scale.setScalar(1 + Math.sin(t * 1.5) * 0.28);
    }
  });

  return (
    <group position={position}>
      {/* 외곽 확산 헤일로 */}
      <mesh ref={outerRef}>
        <sphereGeometry args={[0.42, 16, 16]} />
        <meshBasicMaterial color="#ffb060" transparent opacity={0.10} depthWrite={false} />
      </mesh>

      {/* 중간 글로우 */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshBasicMaterial color="#ffd080" transparent opacity={0.35} depthWrite={false} />
      </mesh>

      {/* 코어 — 밝은 맥동 */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.11, 16, 16]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      {/* 정보 패널 — winner 점 위쪽으로 충분히 올려서 점을 가리지 않음 */}
      <Html position={[0, 1.8, 0]} distanceFactor={10}>
        <div
          style={{
            background: "rgba(0, 10, 25, 0.88)",
            border: "1px solid rgba(77, 232, 255, 0.55)",
            borderRadius: "10px",
            padding: "14px 18px",
            minWidth: "190px",
            backdropFilter: "blur(10px)",
            boxShadow: "0 0 28px rgba(77, 232, 255, 0.25), inset 0 0 12px rgba(77, 232, 255, 0.05)",
            pointerEvents: "none",
            userSelect: "none",
            transform: "translateX(-50%)",
          }}
        >
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#ffffff", marginBottom: "8px", fontFamily: "sans-serif", letterSpacing: "0.03em" }}>
            {result.ingredient}
          </div>
          <div style={{ fontSize: "11px", color: "#a0e8f0", marginBottom: "6px", fontFamily: "sans-serif" }}>
            {result.modifier}
          </div>
          <span style={{ display: "inline-block", fontSize: "10px", color: "#4de8ff", border: "1px solid rgba(77, 232, 255, 0.35)", borderRadius: "4px", padding: "2px 7px", fontFamily: "sans-serif" }}>
            {result.fragrance}
          </span>
        </div>
      </Html>
    </group>
  );
}

// ─── ModifierField ────────────────────────────────────────────────────────────
const ModifierField = forwardRef(function ModifierField({ status, result }, ref) {
  const pointsRef   = useRef();
  const linesRef    = useRef();
  const tweenRef    = useRef(null);
  const winnerIdxRef  = useRef(-1);
  const winnerPosRef  = useRef(null);  // 카메라 이동에 사용
  const texture     = useMemo(() => createWarmGlowTexture(), []);

  const [winnerState,    setWinnerState]    = useState(null);
  const [candidatesList, setCandidatesList] = useState([]);   // 호버용 후보 목록
  const [finalPositions, setFinalPositions] = useState(null); // 호버용 최종 위치 스냅샷
  const [hoveredIdx,     setHoveredIdx]     = useState(null);

  // ── 포인트 버퍼 ──────────────────────────────────────────────────────────────
  const positions = useMemo(() => new Float32Array(MAX_CANDIDATES * 3), []);
  const colors    = useMemo(() => {
    const arr = new Float32Array(MAX_CANDIDATES * 3);
    for (let i = 0; i < MAX_CANDIDATES; i++) {
      arr[i * 3] = 1.0; arr[i * 3 + 1] = 0.72; arr[i * 3 + 2] = 0.22;
    }
    return arr;
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, [positions, colors]);

  // ── 선 버퍼 ──────────────────────────────────────────────────────────────────
  const linePositions = useMemo(() => new Float32Array(MAX_CANDIDATES * 6), []);
  const lineGeometry  = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, [linePositions]);

  // ── 외부 노출 메서드 ──────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({

    animateExplode(candidates, winnerIdx, onComplete) {
      if (!pointsRef.current) return;
      const count   = Math.min(candidates.length, MAX_CANDIDATES);
      const targets = randomSphericalPositions(count);

      winnerIdxRef.current = winnerIdx;
      const wp = [targets[winnerIdx * 3], targets[winnerIdx * 3 + 1], targets[winnerIdx * 3 + 2]];

      for (let i = 0; i < count * 3; i++) positions[i] = 0;
      for (let i = 0; i < count * 6; i++) linePositions[i] = 0;
      geometry.attributes.position.needsUpdate = true;
      lineGeometry.attributes.position.needsUpdate = true;
      geometry.setDrawRange(0, count);
      lineGeometry.setDrawRange(0, count * 2);

      const proxy = { t: 0 };
      tweenRef.current = gsap.to(proxy, {
        t: 1,
        duration: 1.2,
        ease: "power3.out",
        onUpdate() {
          const { t } = proxy;
          for (let i = 0; i < count; i++) {
            const x = targets[i * 3]     * t;
            const y = targets[i * 3 + 1] * t;
            const z = targets[i * 3 + 2] * t;
            positions[i * 3]     = x;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = z;
            linePositions[i * 6]     = 0;
            linePositions[i * 6 + 1] = 0;
            linePositions[i * 6 + 2] = 0;
            linePositions[i * 6 + 3] = x;
            linePositions[i * 6 + 4] = y;
            linePositions[i * 6 + 5] = z;
          }
          geometry.attributes.position.needsUpdate = true;
          lineGeometry.attributes.position.needsUpdate = true;
        },
        onComplete() {
          winnerPosRef.current = wp;
          // 호버용 상태: 최종 위치 스냅샷 + 후보 목록 저장
          setFinalPositions(new Float32Array(positions.slice(0, count * 3)));
          setCandidatesList(candidates.slice(0, count));
          setWinnerState({ position: wp });
          onComplete?.();
        },
      });
    },

    reset() {
      tweenRef.current?.kill();
      geometry.setDrawRange(0, 0);
      lineGeometry.setDrawRange(0, 0);
      for (let i = 0; i < MAX_CANDIDATES * 3; i++) positions[i] = 0;
      for (let i = 0; i < MAX_CANDIDATES * 6; i++) linePositions[i] = 0;
      geometry.attributes.position.needsUpdate = true;
      lineGeometry.attributes.position.needsUpdate = true;
      winnerIdxRef.current  = -1;
      winnerPosRef.current  = null;
      setWinnerState(null);
      setCandidatesList([]);
      setFinalPositions(null);
      setHoveredIdx(null);
    },

    // CameraController에서 winner 위치를 읽기 위해 노출
    getWinnerPosition() {
      return winnerPosRef.current;
    },
  }));

  return (
    <>
      {/* modifier 포인트 */}
      <points ref={pointsRef} geometry={geometry}>
        <pointsMaterial
          size={0.24}
          map={texture}
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {/* 원점 → 각 포인트 연결선 */}
      <lineSegments ref={linesRef} geometry={lineGeometry}>
        <lineBasicMaterial
          color="#7dd8e8"
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* 호버 감지용 투명 구체 — Points 레이캐스팅보다 훨씬 신뢰성 높음 */}
      {status === "result" && finalPositions && candidatesList.map((candidate, idx) => {
        if (idx === winnerIdxRef.current) return null;
        return (
          <mesh
            key={idx}
            position={[
              finalPositions[idx * 3],
              finalPositions[idx * 3 + 1],
              finalPositions[idx * 3 + 2],
            ]}
            onPointerEnter={(e) => { e.stopPropagation(); setHoveredIdx(idx); }}
            onPointerLeave={() => setHoveredIdx(null)}
          >
            <sphereGeometry args={[0.22, 6, 6]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        );
      })}

      {/* 호버 툴팁 */}
      {status === "result" && hoveredIdx !== null && finalPositions && candidatesList[hoveredIdx] && (
        <group
          position={[
            finalPositions[hoveredIdx * 3],
            finalPositions[hoveredIdx * 3 + 1],
            finalPositions[hoveredIdx * 3 + 2],
          ]}
        >
          <Html position={[0, 0.42, 0]} distanceFactor={10}>
            <div
              style={{
                background: "rgba(0, 8, 20, 0.82)",
                border: "1px solid rgba(255, 190, 80, 0.50)",
                borderRadius: "6px",
                padding: "6px 12px",
                fontSize: "12px",
                color: "#ffd090",
                fontFamily: "sans-serif",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                userSelect: "none",
                backdropFilter: "blur(6px)",
                transform: "translateX(-50%)",
              }}
            >
              {candidatesList[hoveredIdx].ingredient}
            </div>
          </Html>
        </group>
      )}

      {/* Winner 글로우 + 정보 패널 */}
      {status === "result" && winnerState && result && (
        <WinnerGlow position={winnerState.position} result={result} />
      )}
    </>
  );
});

export default ModifierField;
