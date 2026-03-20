# Perfume Map — 작업 진행 기록

---

## ✅ Task 1: 데이터베이스 세팅 (완료)

**목적:** tgsc_list.csv 데이터를 Firebase Firestore에 업로드하는 Node.js 유틸리티 스크립트 작성

**작업 내역:**
- `scripts/uploadToFirestore.js` 작성
  - `categories` 컬렉션: fragrance 고유값 약 400개 업로드
  - `ingredients` 컬렉션: 전체 2387개 행 (ingredient, fragrance, modifier) 업로드
  - Firestore 배치 500개 제한 대응 — 400개씩 분할 처리
- `scripts/package.json` 작성 (firebase-admin, csv-parse, dotenv 의존성)
- 보안 처리: `serviceAccountKey.json` → `FIREBASE_SERVICE_ACCOUNT_JSON` 환경변수로 분리
  - `scripts/.env` 에 JSON 한 줄 변환 후 저장
  - `.gitignore` 에 `.env`, `serviceAccountKey.json` 등록

**생성 파일:** `scripts/uploadToFirestore.js`, `scripts/package.json`, `scripts/.env.example`, `.gitignore`

---

## ✅ Task 2: Azure OpenAI 연동 모듈 개발 (완료)

**목적:** 2단계 GPT 매칭 함수 모듈 작성 (환각 방지 프롬프트 엔지니어링 포함)

**작업 내역:**
- `src/lib/aiMatcher.js` 작성
  - `matchFragrance(userInput, categoryList)` → `{ selected: "꽃향" }`
    - 약 400개 대분류 목록 전달, 그 안에서만 1개 선택하도록 system 프롬프트 엄격 설계
  - `matchModifier(userInput, candidates)` → `{ selected: "달콤하고 프루티한", ingredient: "..." }`
    - modifier+ingredient 쌍 목록 전달, 원문과 완전 동일한 값만 반환하도록 제한
  - 공통 설정: `temperature: 0` (결정론적), `response_format: json_object` (JSON 외 출력 차단)
- React (Vite) 프로젝트 기본 구조 수동 생성 (package.json, vite.config.js, index.html, src/main.jsx)
- 환경변수 분리: `VITE_AZURE_OPENAI_ENDPOINT/API_KEY/DEPLOYMENT/API_VERSION`
  - 루트 `.env` 생성 (Vite 규격 `VITE_` 접두사 적용)

**생성 파일:** `src/lib/aiMatcher.js`, `.env.example`, `vite.config.js`, `package.json`, `index.html`, `src/main.jsx`

---

## ✅ Task 3: 3D 씬 및 파티클 시스템 구현 (완료)

**목적:** React Three Fiber 기반 3D 홀로그램 파티클 씬 구현

**작업 내역:**
- `src/components/ParticleField.jsx`
  - 피보나치 구면 분포로 400개 점 균등 배치
  - `Points` + `BufferAttribute(Float32Array)` 방식 — Task 4 GSAP 트윈 대응 설계
  - 캔버스 API로 방사형 글로우 텍스처 직접 생성
  - `forwardRef` + `useImperativeHandle`로 positions·geometry를 App.jsx에 노출
  - `idle`: 전체 구가 미세하게 맥동하는 숨쉬기 효과 (useFrame)
  - `loading`: 각 점이 위상 오프셋 파도처럼 출렁이는 로딩 인디케이터 (useFrame)
- `src/components/Scene.jsx`
  - Canvas (dpr [1,2], fov 60) + OrbitControls (자동 회전, 댐핑) + Bloom 후처리
  - `luminanceThreshold: 0.0`으로 모든 점에 글로우 적용
- `src/App.jsx`
  - 전체 상태 골격: `idle | loading | filtering | exploding | result`
  - 홀로그램 스타일 검색창 UI 오버레이
- `tailwind.config.js`, `postcss.config.js`

**생성 파일:** `src/components/ParticleField.jsx`, `src/components/Scene.jsx`, `src/App.jsx`, `tailwind.config.js`, `postcss.config.js`

---

## ✅ Task 4: 인터랙션 및 GSAP 애니메이션 연결 (완료)

**목적:** 상태 머신 + Firestore 연동 + AI 호출 + 민들레 애니메이션 전체 파이프라인 완성

**작업 내역:**
- `src/lib/firebase.js`: Firebase 클라이언트 SDK 초기화 (환경변수 기반)
- `src/components/ParticleField.jsx` (대폭 업데이트)
  - vertex colors 속성 추가 — 점별 색상 개별 제어
  - `animateFilter(selectedIndex, onComplete)` 노출:
    GSAP 단일 트윈으로 400개 전체 위치를 (0,0,0)으로 수렴, 비선택 점은 흑색 페이드, 선택 점은 흰색으로 밝아짐
  - `reset()` 노출: 원래 위치·색상 즉시 복원
- `src/components/ModifierField.jsx` (신규)
  - `MAX_CANDIDATES(200)` 크기 버퍼 사전 할당 + `setDrawRange`로 가시 범위 제어
  - `animateExplode(candidates, winnerIdx, onComplete)` 노출:
    무작위 구면 좌표계로 목표 위치 생성, GSAP으로 (0,0,0)→목표 민들레 폭발 애니메이션
  - `PulseSphere`: winner 좌표에 useFrame 기반 펄스 구체 + Drei `Html` 홀로그램 패널
  - `reset()` 노출: drawRange 초기화, winner 데이터 소거
- `src/components/Scene.jsx` (업데이트)
  - ModifierField 항상 마운트 (타이밍 이슈 방지), status·result prop 전달
  - `exploding`·`result` 상태에서 OrbitControls 자동 회전 정지
- `src/App.jsx` (전면 재작성)
  - `idle → loading → filtering → exploding → result` 완전한 상태 머신
  - Firestore categories 조회 → matchFragrance → animateFilter
  → Firestore ingredients 조회 → matchModifier → animateExplode → result 표시
  - "다시 탐색하기" 버튼으로 전체 리셋 처리
- `.env.example` 업데이트: Firebase 웹 앱 설정 변수 추가

**생성/수정 파일:** `src/lib/firebase.js`, `src/components/ParticleField.jsx`, `src/components/ModifierField.jsx`, `src/components/Scene.jsx`, `src/App.jsx`, `.env.example`

---

## ✅ Task 5: 버그 수정 — Firebase categories 0개 로드 (완료)

**문제:** 앱 실행 시 categories 컬렉션 문서가 0개로 로드되어 검색 불가

**원인 분석:**
- `.env` 파일의 Firebase 환경변수 값들이 따옴표(`"`), 선행 공백, 후행 쉼표(`,`)를 포함하고 있었음
- Vite는 `.env` 값에서 따옴표를 제거하지 않고 그대로 문자열에 포함시킴
- 결과적으로 `VITE_FIREBASE_PROJECT_ID`에 잘못된 문자가 포함되어 Firestore가 다른 프로젝트에 연결을 시도하거나 접근 거부 발생

**수정 내역:**
- `.env` 파일의 모든 Firebase 환경변수에서 `"` 따옴표, 앞뒤 공백, 후행 `,` 제거
  - Before: `VITE_FIREBASE_API_KEY= "AIzaSy...",`
  - After: `VITE_FIREBASE_API_KEY=AIzaSy...`

**수정 파일:** `.env`

---

## ✅ Task 6: UX 개선 — 1차 결과 시각화 강화 (완료)

**요구사항:**
1. 1차 필터링 후 선택된 fragrance 점을 더 크고 뚜렷하게 표시
2. 2단계 후에도 fragrance 중심 점을 유지 (제거하지 않음)
3. Modifier 점들이 fragrance 중심 점 주위에 배치
4. 중심 점 ↔ modifier 점 연결선 추가
5. Modifier 점 크기 증가 (중심 점의 절반 크기)
6. 선택된 winner modifier 점 발광 효과

**작업 내역:**

- `src/components/SelectedSphere.jsx` (신규)
  - 선택된 fragrance를 3D 구체로 표현: 외곽 와이어프레임 글로우(r=0.85) + 내부 맥동 코어(r=0.40)
  - `useFrame` 기반 독립적인 맥동 애니메이션
  - `Html` 컴포넌트로 fragrance 이름 레이블 표시 (point 위 1.1 위치)
  - `filtering | exploding | result` 상태에서 지속 표시 (결과 후에도 유지)

- `src/components/ModifierField.jsx` (대폭 수정)
  - `linePositions` 버퍼 추가 (MAX_CANDIDATES × 6 floats): 원점→각 modifier 점 쌍
  - `THREE.LineSegments` + `lineBasicMaterial` 렌더링 (opacity 0.18, AdditiveBlending)
  - `animateExplode` 내 linePositions 동기 업데이트 (GSAP 트윈에서 점 위치와 동시 처리)
  - `WinnerGlow` 컴포넌트 신규 작성:
    - 3겹 발광 구체: 외곽 헤일로(r=0.42) + 중간 글로우(r=0.22) + 코어(r=0.11)
    - 각 레이어 독립 주파수로 맥동 (4.5Hz / 3.0Hz / 1.8Hz)
    - `Html position={[0, 1.8, 0]}` 에 홀로그램 정보 패널 (ingredient / modifier / fragrance 표시)
  - 포인트 크기: `size={0.14} → size={0.24}`

- `src/components/Scene.jsx` (수정)
  - `SelectedSphere`를 `filtering | exploding | result` 상태에서 렌더링

**수정/생성 파일:** `src/components/SelectedSphere.jsx`, `src/components/ModifierField.jsx`, `src/components/Scene.jsx`

---

## ✅ Task 7: UX 개선 — 호버 기능 및 카메라 자동 이동 (완료)

**요구사항:**
1. 결과 상태에서 비선택 modifier 점에 마우스 호버 시 ingredient 이름 툴팁 표시
2. 결과 도달 시 카메라가 winner modifier 점 방향으로 자동 이동
3. 결과 텍스트 패널이 winner 점을 가리지 않도록 충분히 위로 배치

**작업 내역:**

- `src/components/ModifierField.jsx` (호버 기능)
  - `THREE.Points` 레이캐스팅(`e.index`)이 불안정하여 대안 접근
  - 각 modifier 점 위치에 투명 구체 메시(`opacity={0}`, r=0.22) 배치
  - 표준 R3F `onPointerEnter` / `onPointerLeave` 이벤트로 신뢰성 높은 호버 감지
  - `candidatesList`, `finalPositions` 상태를 `animateExplode` 완료 시 스냅샷으로 저장
  - `hoveredIdx` state로 활성 툴팁 제어 (`result` 상태에서만 활성)
  - winner 점(winnerIdxRef)은 호버 대상에서 제외
  - 정보 패널 위치: `[0, 1.8, 0]`으로 상향 조정

- `src/components/Scene.jsx` (카메라 자동 이동)
  - `CameraController` 컴포넌트 신규 작성
  - `useFrame(priority=100)`: OrbitControls(priority=0) 이후 실행하여 camera.position 덮어쓰기
  - 알고리즘:
    1. `result` state 변경 감지 → 300ms 딜레이 후 애니메이션 시작
    2. `focusPoint = winner + [0, 1.8, 0]` (텍스트 패널 정중앙)
    3. `outDir = normalize(winner)` (원점 → winner 방향 단위 벡터)
    4. `newCamPos = focusPoint + outDir × 6` (minDistance=6 만큼 외부)
    5. `easeInOut` 보간으로 ~67프레임 동안 `camera.position` + `controls.target` 동시 lerp
  - `getWinnerPosition()` 메서드를 `ModifierField`에서 노출, CameraController가 호출

**수정 파일:** `src/components/ModifierField.jsx`, `src/components/Scene.jsx`

---

## ✅ Task 8: UX 개선 — 시각적 스케일 확대 (완료)

**요구사항:**
1. 초기 화면 fragrance 점 크기 1.5배 증가
2. 타이틀 "PERFUME MAP" 및 부제목 2배 확대
3. 검색 입력창 2배 확대
4. 결과 도달 시 카메라가 텍스트 패널 기준 최대 확대(minDistance=6)

**작업 내역:**

- `src/components/ParticleField.jsx`
  - `pointsMaterial size={0.18} → size={0.27}` (×1.5)

- `src/App.jsx`
  - 타이틀: `text-2xl → text-5xl`
  - 부제목: `text-xs → text-xl`
  - 입력창 컨테이너: `max-w-xl → max-w-3xl`
  - 입력창 패딩: `py-4 → py-7`, 폰트: `text-sm → text-lg`
  - 버튼: `px-5 py-2 text-xs → px-8 py-4 text-base`

- `src/components/Scene.jsx`
  - 카메라 minDistance=6 설정 → `newCamPos = focusPoint + outDir × 6` 으로 최대 확대 보장

**수정 파일:** `src/components/ParticleField.jsx`, `src/App.jsx`, `src/components/Scene.jsx`

---

## 최종 파일 구조

```
perfumemap/
├── src/
│   ├── App.jsx                      # 상태 머신 + UI 오버레이
│   ├── main.jsx
│   ├── lib/
│   │   ├── firebase.js              # Firestore 클라이언트 초기화
│   │   └── aiMatcher.js             # Embedding + GPT-4o 매칭 함수
│   └── components/
│       ├── Scene.jsx                # Canvas + OrbitControls + CameraController
│       ├── ParticleField.jsx        # 400개 fragrance 점 파티클 시스템
│       ├── ModifierField.jsx        # Modifier 민들레 폭발 + 호버 + WinnerGlow
│       └── SelectedSphere.jsx       # 선택된 fragrance 중심 구체
├── scripts/
│   └── uploadToFirestore.js         # CSV → Firestore 업로드 스크립트
├── .env                             # 환경변수 (gitignore)
├── .env.example
└── task.md / README.md
```
