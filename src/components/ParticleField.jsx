import { useRef, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import { useFrame } from "@react-three/fiber";
import gsap from "gsap";
import * as THREE from "three";

const FALLBACK_COUNT = 161; // Firestore 로드 전 임시 표시 수
const CYAN = [0.3, 0.91, 1.0];
const lerp = (a, b, t) => a + (b - a) * t;

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

// ─── ParticleField ────────────────────────────────────────────────────────────
// categoryPositions: [{x,y,z}] — Firestore에서 로드한 JSON 좌표
const ParticleField = forwardRef(function ParticleField({ status = "idle", categoryPositions = [] }, ref) {
  const pointsRef   = useRef();
  const tweenRef    = useRef(null);
  const isAnimating = useRef(false);
  const texture     = useMemo(() => createGlowTexture(), []);

  const count = categoryPositions.length > 0 ? categoryPositions.length : FALLBACK_COUNT;

  // positions / colors 버퍼 (count에 맞게 생성)
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
  // Firestore 데이터 로드 완료 시 → JSON 좌표로 교체
  // 미로드 시 → 피보나치 구 fallback
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

  // basePositions: 애니메이션 복원용 (현재 실제 positions 스냅샷)
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

      const posAttr  = geometry.attributes.position;
      const colAttr  = geometry.attributes.color;
      const startPos = new Float32Array(posAttr.array);
      const startCol = new Float32Array(colAttr.array);

      const proxy = { t: 0 };
      tweenRef.current = gsap.to(proxy, {
        t: 1,
        duration: 1.6,
        ease: "power2.inOut",
        onUpdate() {
          const { t } = proxy;
          for (let i = 0; i < count; i++) {
            posAttr.array[i * 3]     = lerp(startPos[i * 3],     0, t);
            posAttr.array[i * 3 + 1] = lerp(startPos[i * 3 + 1], 0, t);
            posAttr.array[i * 3 + 2] = lerp(startPos[i * 3 + 2], 0, t);

            if (i !== selectedIndex) {
              colAttr.array[i * 3]     = lerp(startCol[i * 3],     0, t);
              colAttr.array[i * 3 + 1] = lerp(startCol[i * 3 + 1], 0, t);
              colAttr.array[i * 3 + 2] = lerp(startCol[i * 3 + 2], 0, t);
            } else {
              // 선택된 점: 흰색으로 밝아짐
              colAttr.array[i * 3]     = lerp(startCol[i * 3],     2.0, t);
              colAttr.array[i * 3 + 1] = lerp(startCol[i * 3 + 1], 2.0, t);
              colAttr.array[i * 3 + 2] = lerp(startCol[i * 3 + 2], 2.0, t);
            }
          }
          posAttr.needsUpdate = true;
          colAttr.needsUpdate = true;
        },
        onComplete() {
          isAnimating.current = false;
          onComplete?.();
        },
      });
    },

    reset() {
      tweenRef.current?.kill();
      isAnimating.current = false;

      const posAttr = geometry.attributes.position;
      const colAttr = geometry.attributes.color;

      // 원래 좌표로 복원
      if (basePositionsRef.current) {
        posAttr.array.set(basePositionsRef.current);
      }
      for (let i = 0; i < count; i++) {
        colAttr.array[i * 3]     = CYAN[0];
        colAttr.array[i * 3 + 1] = CYAN[1];
        colAttr.array[i * 3 + 2] = CYAN[2];
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      pointsRef.current?.scale.setScalar(1);
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
  );
});

export default ParticleField;
