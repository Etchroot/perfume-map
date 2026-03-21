# PERFUME MAP

> 감성 언어로 향료를 탐색하는 3D 인터랙티브 웹 서비스

---

## 서비스 소개

PERFUME MAP은 사용자가 입력한 추상적인 감성 표현(예: *"비 오는 숲"*, *"설레는 아침"*)을 AI가 분석하여, 2,387개의 향료 데이터 중 가장 잘 어울리는 원료를 찾아주는 향수 추천 서비스입니다.

단순한 키워드 검색이 아닌, **3D 홀로그램 파티클 시각화** 위에서 AI 매칭 과정이 애니메이션으로 펼쳐지는 것이 핵심입니다. 약 161개의 향료 대분류(fragrance)가 우주의 별처럼 공간에 떠 있고, 검색 결과가 도출될수록 점들이 수렴·폭발하며 최종 향료를 가리킵니다.

---

## 주요 기능

### Step 0 — 초기 화면
- 약 161개의 빛나는 파티클이 3D 공간에 피보나치 구면 분포로 배치
- OrbitControls로 자유롭게 회전·줌 가능
- idle 상태에서 전체 구가 미세하게 맥동하는 호흡 효과

### Step 1 — 향 대분류 매칭 (Embedding 기반)
- 사용자 입력 텍스트를 Azure OpenAI `text-embedding-3-small`으로 1,536차원 벡터로 변환
- 각 fragrance 카테고리의 임베딩과 **코사인 유사도**를 계산하여 최적 대분류 1개 선택
- 애니메이션: 비선택 점들은 페이드아웃 → 선택된 점이 화면 중앙으로 수렴

### Step 2 — 향료 정밀 매칭 (GPT-4o 기반)
- 선택된 대분류에 속한 전체 재료를 Firestore에서 로드
- GPT-4o가 modifier 목록과 사용자 감성을 비교하여 최종 원료 1개 선택 (환각 방지 엄격 프롬프트)
- 애니메이션: 중심 점에서 민들레 씨앗처럼 modifier 점들이 구면으로 폭발·전개

### Step 3 — 결과 표시
- Winner 점에 3겹 발광 구체(Glow) + 맥동 애니메이션
- 홀로그램 정보 패널: Ingredient 이름, Modifier 설명, Fragrance 대분류 표시
- 비선택 modifier 점에 마우스 호버 시 해당 ingredient 이름 툴팁 표시
- 카메라가 자동으로 winner 텍스트 패널을 정면에서 최대 확대로 이동

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **프론트엔드** | React 18, Vite, TailwindCSS |
| **3D 렌더링** | Three.js, React Three Fiber (`@react-three/fiber`) |
| **3D 유틸리티** | `@react-three/drei` (OrbitControls, Html) |
| **후처리 효과** | `@react-three/postprocessing` (Bloom) |
| **애니메이션** | GSAP (파티클 버퍼 직접 조작, 프레임 드랍 방지) |
| **데이터베이스** | Firebase Firestore (클라이언트 SDK) |
| **AI — 1차 매칭** | Azure OpenAI `text-embedding-3-small` (임베딩 + 코사인 유사도) |
| **AI — 2차 매칭** | Azure OpenAI `GPT-4o` (Chat Completion, temperature=0) |
| **데이터 업로드** | Node.js 스크립트 (`firebase-admin`, `csv-parse`) |

---

## 데이터 구조

원본 데이터: `tgsc_list.csv` (2,387행)

| 컬럼 | 설명 | 비고 |
|------|------|------|
| `fragrance` | 향 대분류 | 약 161개 고유값 |
| `modifier` | 향 소분류 묘사 | AI 2차 매칭 대상 |
| `ingredient` | 실제 향료 원료명 | 최종 결과값 |

Firestore 컬렉션 구조:
- **`categories`**: fragrance 고유값 + 임베딩 벡터 + 3D 위치 좌표 (약 161개)
- **`ingredients`**: 전체 2,387개 행 (ingredient, modifier, fragrance)

---

## 아키텍처 핵심 설계 결정

### 성능: React state 대신 버퍼 직접 조작
Three.js `BufferGeometry`의 `Float32Array`를 GSAP 트윈에서 직접 수정하고 `needsUpdate = true`만 설정합니다. React state 업데이트를 피함으로써 리렌더링 없이 60fps 애니메이션을 유지합니다.

### 신뢰성: 호버 감지에 투명 구체 사용
`THREE.Points` 레이캐스팅(`e.index`)은 줌 레벨에 따라 불안정합니다. 각 modifier 점 위치에 `opacity={0}` 투명 구체 메시를 배치하여 표준 R3F 포인터 이벤트를 사용합니다.

### 카메라 동기화: useFrame priority 시스템
OrbitControls(priority=0)와 충돌 없이 카메라를 제어하기 위해 `useFrame(priority=100)`으로 매 프레임 camera.position을 덮어씁니다. OrbitControls는 다음 프레임에서 덮어쓰인 위치를 새 기준으로 읽어 자연스럽게 동기화됩니다.

### 환각 방지 프롬프트 설계
GPT-4o에게 반드시 `PROVIDED_LIST` 배열 안의 값만 반환하도록 system 프롬프트를 엄격하게 구성했습니다. `temperature: 0`, `response_format: json_object`로 출력을 고정합니다.

---

## 환경변수 설정 (`.env`)

```env
# Firebase
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Azure OpenAI
VITE_AZURE_OPENAI_ENDPOINT=
VITE_AZURE_OPENAI_API_KEY=
VITE_AZURE_OPENAI_DEPLOYMENT=          # GPT-4o 배포명
VITE_AZURE_OPENAI_EMBEDDING_DEPLOYMENT= # text-embedding-3-small 배포명
VITE_AZURE_OPENAI_API_VERSION=2024-02-15-preview
```

> **주의:** 값에 따옴표(`"`), 선행 공백, 후행 쉼표(`,`)를 포함하지 마세요. Vite는 따옴표를 제거하지 않고 그대로 문자열에 포함시킵니다.

---

## 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
```

### 데이터 업로드 (최초 1회)

```bash
cd scripts
npm install
node uploadToFirestore.js
```

---

## 컴포넌트 구조

```
src/
├── App.jsx                  # 상태 머신 (idle → loading → filtering → exploding → result)
│                            # Firestore 로드, AI 호출 오케스트레이션, UI 오버레이
├── lib/
│   ├── firebase.js          # Firestore 클라이언트 초기화
│   └── aiMatcher.js         # getEmbedding(), findBestCategory(), matchModifier()
└── components/
    ├── Scene.jsx            # Canvas, OrbitControls, CameraController, Bloom
    ├── ParticleField.jsx    # 161개 fragrance 파티클 (animateFilter, reset)
    ├── ModifierField.jsx    # Modifier 민들레 폭발, 연결선, 호버 툴팁, WinnerGlow
    └── SelectedSphere.jsx   # 선택된 fragrance 중심 구체 + 레이블
```
