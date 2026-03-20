프로젝트 개요: 3D 향료 추천 인터랙티브 웹 서비스

1. 프로젝트 설명 (Project Description)

이 프로젝트는 사용자가 입력한 추상적인 감성 단어(예: "설레는", "비 오는 숲")를 분석하여, 2387개의 향료(Ingredient) 데이터 중 가장 잘 어울리는 원료를 찾아주는 웹 서비스입니다.
가장 큰 특징은 단순한 텍스트 검색이 아니라, 3D 공간에서 데이터 점(Point Cloud)들이 상호작용하며 마치 '민들레 씨앗'처럼 퍼져나가는 홀로그램 스타일의 시각화를 제공하는 것입니다.

2. 데이터 구조 (tgsc_list.csv)

총 2387행. 3개의 주요 컬럼으로 구성.

Ingredient: 향을 내는 실제 원료 명칭 (최종 결과값)

modifier: 향에 대한 디테일한 묘사 (소분류)

fragrance: 향의 대분류 (약 400개의 고유값 존재)

3. 핵심 로직 및 UX 시나리오 (2-Step Filtering & 3D Animation)

[Step 0: 초기 화면]

화면에 약 400개의 빛나는 점들이 3D 공간(구형 또는 무작위 군집)에 떠 있습니다. (각 점은 고유한 fragrance 대분류를 의미)

하단에 사용자가 텍스트를 입력할 수 있는 검색창이 있습니다.

[Step 1: 1차 계산 (대분류 매칭)]

사용자가 검색어 입력 후 Enter.

Logic: Azure OpenAI GPT-4o를 호출하여, 사용자의 검색어와 약 400개의 fragrance 목록을 비교, 가장 의미가 유사한 fragrance 단어 1개를 추출합니다.

3D Animation: 선택되지 않은 399개의 점들은 서서히 페이드아웃 되며 사라집니다. 선택된 1개의 점이 화면 중앙으로 이동합니다.

[Step 2: 2차 계산 (민들레 전개 및 소분류 매칭)]

Logic: 화면 중앙으로 온 fragrance에 속하는 전체 행들을 DB에서 가져옵니다. 다시 GPT-4o를 호출하여 사용자의 검색어와 해당 행들의 modifier들을 비교, 가장 유사한 행 1개를 최종 선택합니다.

3D Animation: 화면 중앙의 점이 마치 '민들레 씨앗'이 퍼지듯 수십 개의 새로운 점(해당 fragrance에 속한 modifier들)으로 폭발하듯 흩어집니다.

Result UI: 흩어진 점들 중 최종 선택된 데이터의 점이 강렬하게 반짝(Blinking) 거립니다. 해당 점 옆에 홀로그램 패널 UI가 나타나며 최종 Ingredient와 modifier, fragrance 텍스트 정보를 표시합니다.

4. 기술 스택 (Tech Stack)

Frontend: React (Vite), TailwindCSS

3D Visualization: Three.js, React Three Fiber (@react-three/fiber), @react-three/drei

Animation: GSAP (점들의 부드러운 이동 및 전개 애니메이션 처리)

Backend / Database: Firebase Hosting, Firebase Firestore

AI: Azure OpenAI API (GPT-4o)

5. 작업 지시서 (Claude를 위한 상세 태스크)

Task 1: 데이터베이스 세팅 (Firebase 스크립트 작성)

tgsc_list.csv 파일을 읽어 Firebase Firestore에 업로드하는 Node.js 유틸리티 스크립트를 작성하세요.

중요: 프론트엔드 최적화를 위해 데이터를 2개의 컬렉션으로 분리해서 저장해야 합니다.

categories 컬렉션: fragrance 컬럼의 중복을 제거한 고유값 목록 (약 400개)

ingredients 컬렉션: 전체 2387개 행 데이터

Task 2: Azure OpenAI 연동 모듈 개발

Azure OpenAI 연동을 위한 함수 모듈을 작성하세요. (Endpoint, API Key는 환경변수로 처리)

프롬프트 엔지니어링 주의사항: LLM이 환각을 일으키지 않도록, 전달해 준 배열(List) 안에서만 정확히 1개의 단어를 골라 json 형태로 리턴하도록 system 프롬프트를 엄격하게 작성하세요.

1차 API: matchFragrance(userInput, categoryList) -> { "selected": "꽃향" }

2차 API: matchModifier(userInput, modifierList) -> { "selected": "달콤하고 프루티한", "ingredient": "..." }

Task 3: 3D 씬 및 파티클 시스템 구현 (R3F)

InstancedMesh 또는 Points를 사용하여 수백 개의 점을 성능 저하 없이 렌더링하세요.

각 점은 빛나는 구체(Hologram Point)처럼 보이도록 MeshBasicMaterial과 Bloom 효과(Post-processing)를 적용하세요.

카메라 컨트롤(OrbitControls)을 추가하여 사용자가 화면을 돌려볼 수 있게 하세요.

Task 4: 인터랙션 및 GSAP 애니메이션 연결

상태 관리: React의 상태를 이용해 Idle(초기) -> Filtering(1차) -> Exploding(2차) -> Result(결과) 상태를 관리하세요.

1차 결과가 나오면 GSAP을 이용해 선택된 점의 position을 (0,0,0)으로 부드럽게 이동시키고, 나머지는 opacity를 0으로 만드세요.

2차 데이터를 받아오면 중심 좌표 (0,0,0)에서부터 무작위 구면 좌표계(Spherical coordinates) 방향으로 새로운 점들이 퍼져나가는 애니메이션(민들레 효과)을 GSAP으로 구현하세요.

최종 선택된 점에 펄스(Pulse) 효과를 주고, 해당 3D 좌표에 매칭되는 HTML UI(Drei의 Html 컴포넌트 활용)를 띄워 원료 이름을 표시하세요.

6. 제약 사항 및 고려 대상

성능: 3D 공간의 점 이동 로직은 React state 업데이트 대신 useFrame 또는 GSAP을 통해 직접 참조(ref)를 변경하여 프레임 드랍을 방지하세요.

로딩 처리: LLM 응답을 기다리는 동안 3D 씬 내에서 파티클들이 파도처럼 출렁이거나 색상이 변하는 형태의 로딩 인디케이터 시각 효과를 반드시 구현하세요.