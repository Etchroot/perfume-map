import { useRef, useMemo, useEffect, useState, forwardRef, useImperativeHandle } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import gsap from "gsap";
import * as THREE from "three";

const FALLBACK_COUNT = 161;
const CYAN = [0.3, 0.91, 1.0];
const lerp = (a, b, t) => a + (b - a) * t;

const TRAIL_LEN      = 70;
const COMET_DURATION = 3.2; // seconds

// ─── 피보나치 구면 (Firestore 로드 전 fallback) ────────────────────────────────
function fibonacciSphere(count, radius = 5) {
  const arr = new Float32Array(count * 3);
  const phi = Math.PI * (Math.sqrt(5) - 1);
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    arr[i * 3]     = Math.cos(theta) * r * radius;
    arr[i * 3 + 1] = y * radius;
    arr[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return arr;
}

// ─── 글로우 텍스처 ─────────────────────────────────────────────────────────────
function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0,    "rgba(255,255,255,1)");
  grad.addColorStop(0.15, "rgba(160,240,255,0.9)");
  grad.addColorStop(0.4,  "rgba(60,160,255,0.4)");
  grad.addColorStop(1,    "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// ─── 혜성 + 꼬리 ──────────────────────────────────────────────────────────────
// start / target: [x, y, z]
// onArrive: 혜성이 target에 도달하면 호출
function CometTrail({ start, target, onArrive }) {
  const cometRef    = useRef();
  const progressRef = useRef(0);
  const arrivedRef  = useRef(false);

  // 꼬리 위치 링 버퍼: index 0 = 가장 최근 (머리), 끝 = 가장 오래된 (꼬리)
  const trailPts = useRef((() => {
    const buf = new Float32Array(TRAIL_LEN * 3);
    for (let i = 0; i < TRAIL_LEN; i++) {
      buf[i * 3] = start[0]; buf[i * 3 + 1] = start[1]; buf[i * 3 + 2] = start[2];
    }
    return buf;
  })());

  // 꼬리 LineSegments 지오메트리: (TRAIL_LEN-1)개 세그먼트, 각 2점
  const lineGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((TRAIL_LEN - 1) * 6), 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(new Float32Array((TRAIL_LEN - 1) * 6), 3));
    return geo;
  }, []);

  useFrame((_, delta) => {
    if (arrivedRef.current) return;

    progressRef.current = Math.min(progressRef.current + delta / COMET_DURATION, 1);
    // easeOut: 처음엔 빠르게 → 도착 직전 감속
    const t  = 1 - Math.pow(1 - progressRef.current, 2);

    const cx = lerp(start[0], target[0], t);
    const cy = lerp(start[1], target[1], t);
    const cz = lerp(start[2], target[2], t);

    if (cometRef.current) cometRef.current.position.set(cx, cy, cz);

    // 꼬리 버퍼: 오른쪽으로 한 칸 밀고 머리에 현재 위치 삽입
    trailPts.current.copyWithin(3, 0, (TRAIL_LEN - 1) * 3);
    trailPts.current[0] = cx;
    trailPts.current[1] = cy;
    trailPts.current[2] = cz;

    // 라인 지오메트리 업데이트
    const posArr = lineGeo.attributes.position.array;
    const colArr = lineGeo.attributes.color.array;

    for (let i = 0; i < TRAIL_LEN - 1; i++) {
      const bi = i * 6;
      // A = 오래된 끝 (index i+1), B = 새로운 끝 (index i)
      posArr[bi]     = trailPts.current[(i + 1) * 3];
      posArr[bi + 1] = trailPts.current[(i + 1) * 3 + 1];
      posArr[bi + 2] = trailPts.current[(i + 1) * 3 + 2];
      posArr[bi + 3] = trailPts.current[i * 3];
      posArr[bi + 4] = trailPts.current[i * 3 + 1];
      posArr[bi + 5] = trailPts.current[i * 3 + 2];

      // 밝기: 머리(i=0) = 1, 꼬리(i=TRAIL_LEN-2) = 0
      const brA = Math.max(0, 1 - (i + 1) / (TRAIL_LEN - 1));
      const brB = Math.max(0, 1 - i       / (TRAIL_LEN - 1));
      const fA  = (i + 1) / (TRAIL_LEN - 1);
      const fB  = i       / (TRAIL_LEN - 1);

      // 색상: 머리=흰색, 중간=시안, 꼬리=투명
      colArr[bi]     = lerp(1.0, 0.3,  fA) * brA;
      colArr[bi + 1] = lerp(1.0, 0.91, fA) * brA;
      colArr[bi + 2] = 1.0 * brA;
      colArr[bi + 3] = lerp(1.0, 0.3,  fB) * brB;
      colArr[bi + 4] = lerp(1.0, 0.91, fB) * brB;
      colArr[bi + 5] = 1.0 * brB;
    }
    lineGeo.attributes.position.needsUpdate = true;
    lineGeo.attributes.color.needsUpdate    = true;

    if (progressRef.current >= 1 && !arrivedRef.current) {
      arrivedRef.current = true;
      onArrive?.();
    }
  });

  return (
    <>
      {/* 혜성 머리 — 밝은 구체 */}
      <mesh ref={cometRef} position={start}>
        <sphereGeometry args={[0.08, 12, 12]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* 빛의 꼬리 */}
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial
          vertexColors
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          transparent
        />
      </lineSegments>
    </>
  );
}

// ─── ParticleField ────────────────────────────────────────────────────────────
const ParticleField = forwardRef(function ParticleField({ status = "idle", categories = [] }, ref) {
  const pointsRef   = useRef();
  const tweenRef    = useRef(null);
  const isAnimating = useRef(false);
  const texture     = useMemo(() => createGlowTexture(), []);
  const [hoveredIdx,  setHoveredIdx]  = useState(null);
  const [cometState,  setCometState]  = useState(null);

  const { camera } = useThree();

  const categoryPositions = useMemo(() => categories.map((c) => c.position), [categories]);

  const count = categoryPositions.length > 0 ? categoryPositions.length : FALLBACK_COUNT;

  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  const colors    = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = CYAN[0]; arr[i * 3 + 1] = CYAN[1]; arr[i * 3 + 2] = CYAN[2];
    }
    return arr;
  }, [count]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  // ── 좌표 업데이트 ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const posAttr = geometry.attributes.position;
    if (categoryPositions.length > 0) {
      for (let i = 0; i < categoryPositions.length; i++) {
        const p = categoryPositions[i];
        posAttr.array[i * 3]     = p.x;
        posAttr.array[i * 3 + 1] = p.y;
        posAttr.array[i * 3 + 2] = p.z;
      }
    } else {
      posAttr.array.set(fibonacciSphere(FALLBACK_COUNT, 5));
    }
    posAttr.needsUpdate = true;
  }, [categoryPositions, geometry]);

  const basePositionsRef = useRef(null);
  useEffect(() => {
    if (categoryPositions.length > 0) {
      basePositionsRef.current = new Float32Array(geometry.attributes.position.array);
    }
  }, [categoryPositions, geometry]);

  // ── 외부 노출 메서드 ─────────────────────────────────────────────────────────
  useImperativeHandle(ref, () => ({

    animateFilter(selectedIndex, onComplete) {
      if (!pointsRef.current) return;
      isAnimating.current = true;
      pointsRef.current.scale.setScalar(1);

      // ① 혜성 도착 시 실행될 페이드아웃 함수 정의
      const startFade = () => {
        const colAttr  = geometry.attributes.color;
        const startCol = new Float32Array(colAttr.array);
        const proxy    = { t: 0 };
        tweenRef.current = gsap.to(proxy, {
          t: 1,
          duration: 0.8,
          ease: "power2.out",
          onUpdate() {
            const { t } = proxy;
            for (let i = 0; i < count; i++) {
              if (i !== selectedIndex) {
                const fade = 1 - t;
                colAttr.array[i * 3]     = startCol[i * 3]     * fade;
                colAttr.array[i * 3 + 1] = startCol[i * 3 + 1] * fade;
                colAttr.array[i * 3 + 2] = startCol[i * 3 + 2] * fade;
              }
            }
            colAttr.needsUpdate = true;
          },
          onComplete() {
            isAnimating.current = false;
            onComplete?.(); // 페이드 완료 → Promise resolve
          },
        });
      };

      // ② 혜성 시작 위치 계산 — 카메라 화면 밖 랜덤 엣지
      const targetPos = categoryPositions[selectedIndex] || { x: 0, y: 0, z: 0 };
      const targetVec = new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z);
      const ndcZ      = targetVec.clone().project(camera).z;

      const angle = Math.random() * Math.PI * 2;
      let sx = Math.cos(angle), sy = Math.sin(angle);
      const m = Math.max(Math.abs(sx), Math.abs(sy));
      sx = (sx / m) * 1.2;
      sy = (sy / m) * 1.2;

      const startWorld = new THREE.Vector3(sx, sy, ndcZ).unproject(camera);

      // ③ 혜성 상태 설정 — onComplete = 도착 시 페이드 시작
      setCometState({
        start:      [startWorld.x, startWorld.y, startWorld.z],
        target:     [targetPos.x,  targetPos.y,  targetPos.z],
        onComplete: startFade,
      });
    },

    reset() {
      tweenRef.current?.kill();
      isAnimating.current = false;

      const posAttr = geometry.attributes.position;
      const colAttr = geometry.attributes.color;
      if (basePositionsRef.current) posAttr.array.set(basePositionsRef.current);
      for (let i = 0; i < count; i++) {
        colAttr.array[i * 3]     = CYAN[0];
        colAttr.array[i * 3 + 1] = CYAN[1];
        colAttr.array[i * 3 + 2] = CYAN[2];
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      pointsRef.current?.scale.setScalar(1);
      setCometState(null);
    },
  }));

  // ── idle / loading 프레임 애니메이션 ─────────────────────────────────────────
  useFrame(({ clock }) => {
    if (!pointsRef.current || isAnimating.current) return;
    const time = clock.getElapsedTime();

    if (status === "idle") {
      pointsRef.current.scale.setScalar(1 + Math.sin(time * 0.6) * 0.025);
    }

    if (status === "loading") {
      pointsRef.current.scale.setScalar(1);
      const posAttr = geometry.attributes.position;
      const base    = basePositionsRef.current;
      if (!base) return;
      for (let i = 0; i < count; i++) {
        const wave  = Math.sin(time * 3 + i * 0.4) * 0.25;
        const scale = 1 + wave * 0.12;
        posAttr.array[i * 3]     = base[i * 3]     * scale;
        posAttr.array[i * 3 + 1] = base[i * 3 + 1] * scale;
        posAttr.array[i * 3 + 2] = base[i * 3 + 2] * scale;
      }
      posAttr.needsUpdate = true;
    }
  });

  const visible = ["idle", "loading", "filtering"].includes(status);

  return (
    <>
      <points ref={pointsRef} geometry={geometry} visible={visible}>
        <pointsMaterial
          size={0.27}
          map={texture}
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {/* idle 상태: fragrance 이름 호버 감지용 투명 구체 */}
      {status === "idle" && categories.map((cat, idx) => (
        <mesh
          key={idx}
          position={[cat.position.x, cat.position.y, cat.position.z]}
          onPointerEnter={(e) => { e.stopPropagation(); setHoveredIdx(idx); }}
          onPointerLeave={() => setHoveredIdx(null)}
        >
          <sphereGeometry args={[0.25, 6, 6]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}

      {/* 호버 툴팁 */}
      {status === "idle" && hoveredIdx !== null && categories[hoveredIdx] && (
        <group position={[
          categories[hoveredIdx].position.x,
          categories[hoveredIdx].position.y + 0.5,
          categories[hoveredIdx].position.z,
        ]}>
          <Html distanceFactor={10}>
            <div style={{
              background: "rgba(0, 8, 20, 0.82)",
              border: "1px solid rgba(77, 232, 255, 0.45)",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "11px",
              color: "#7dd8f0",
              fontFamily: "sans-serif",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              userSelect: "none",
              backdropFilter: "blur(6px)",
              transform: "translateX(-50%)",
            }}>
              {categories[hoveredIdx].fragrance}
            </div>
          </Html>
        </group>
      )}

      {/* 혜성 — filtering 단계에서만 */}
      {cometState && (
        <CometTrail
          start={cometState.start}
          target={cometState.target}
          onArrive={() => {
            cometState.onComplete?.();
            setCometState(null);
          }}
        />
      )}
    </>
  );
});

export default ParticleField;
