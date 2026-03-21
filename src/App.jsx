import { useState, useRef, useEffect } from "react";
import { collection, getDocs, query as fsQuery, where } from "firebase/firestore";
import { db } from "./lib/firebase";
import { getEmbedding, findBestCategory, matchModifier } from "./lib/aiMatcher";
import Scene from "./components/Scene";

export default function App() {
  const [status,            setStatus]            = useState("idle");
  const [query,             setQuery]             = useState("");
  const [result,            setResult]            = useState(null);
  const [selectedFragrance, setSelectedFragrance] = useState(null);
  const [categories,         setCategories]         = useState([]);
  const [loadProgress,      setLoadProgress]      = useState(0);   // 0~100
  const [dataReady,         setDataReady]         = useState(false);

  const particleRef    = useRef();
  const modifierRef    = useRef();
  const categoriesRef  = useRef([]);
  const progressTimer  = useRef(null);

  // ── 앱 시작 시 categories 미리 로드 ──────────────────────────────────────────
  useEffect(() => {
    // 가상 진행률 애니메이션: 0% → 85% 구간을 부드럽게 채움
    progressTimer.current = setInterval(() => {
      setLoadProgress((prev) => {
        if (prev >= 85) { clearInterval(progressTimer.current); return 85; }
        return prev + 2;
      });
    }, 80);

    getDocs(collection(db, "categories")).then((snap) => {
      clearInterval(progressTimer.current);
      const cats = snap.docs.map((d) => d.data());
      categoriesRef.current = cats;
      setCategories(cats);
      setLoadProgress(100);
      setTimeout(() => setDataReady(true), 400); // 100% 잠깐 보여준 뒤 UI 해제
      console.log(`[초기화] categories ${cats.length}개 로드 완료`);
    }).catch((err) => {
      clearInterval(progressTimer.current);
      console.error("[초기화] categories 로드 실패 — Firestore 보안 규칙을 확인하세요:", err);
      setLoadProgress(-1); // 에러 상태 표시
    });

    return () => clearInterval(progressTimer.current);
  }, []);

  // ── 검색 핸들러 ───────────────────────────────────────────────────────────────
  const handleSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || status !== "idle") return;

    if (categoriesRef.current.length === 0) return;

    try {
      setStatus("loading");

      // ── [1차] 임베딩 → 코사인 유사도로 fragrance 대분류 선택 ───────────────
      const userEmbedding = await getEmbedding(q);
      const { fragrance: matchedFragrance, index: selectedIndex, score } =
        findBestCategory(userEmbedding, categoriesRef.current);

      console.log(`[1차] "${q}" → "${matchedFragrance}" (유사도: ${score.toFixed(4)}, 인덱스: ${selectedIndex})`);

      setSelectedFragrance(matchedFragrance);

      // ── [1차 애니메이션] + [2차 계산] 병렬 시작 ────────────────────────────
      setStatus("filtering");

      // 혜성 애니메이션 완료 Promise
      const animDone = new Promise((resolve) => {
        particleRef.current.animateFilter(selectedIndex, resolve);
      });

      // 2차 계산: 혜성 이동 중 백그라운드에서 실행
      const step2Done = (async () => {
        const ingSnap    = await getDocs(
          fsQuery(collection(db, "ingredients"), where("fragrance", "==", matchedFragrance))
        );
        const candidates = ingSnap.docs.map((d) => d.data());
        console.log(`[2차] "${matchedFragrance}" 소속 원료 ${candidates.length}개`);

        const match     = await matchModifier(q, candidates);
        const winnerIdx = Math.max(
          0,
          candidates.findIndex((c) => c.ingredient === match.ingredient)
        );
        console.log(`[2차] 최종 선택: ${match.ingredient} / ${match.selected}`);
        return { candidates, match, winnerIdx };
      })();

      // 둘 다 완료될 때까지 대기
      const [, step2] = await Promise.all([animDone, step2Done]);

      // ── [2차 애니메이션] 민들레 폭발 ──────────────────────────────────────
      setStatus("exploding");
      modifierRef.current.animateExplode(step2.candidates, step2.winnerIdx, () => {
        setResult({
          ingredient: step2.match.ingredient,
          modifier:   step2.match.selected,
          fragrance:  matchedFragrance,
        });
        setStatus("result");
      });
    } catch (err) {
      console.error("[1차] 오류:", err);
      handleReset();
    }
  };

  // ── 전체 리셋 ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    particleRef.current?.reset();
    modifierRef.current?.reset();
    setResult(null);
    setSelectedFragrance(null);
    setStatus("idle");
    setQuery("");
  };

  const statusMessage = {
    loading:   "향의 별자리를 분석하는 중...",
    filtering: "가장 가까운 향을 찾아가는 중...",
    exploding: "향료의 세계가 열립니다...",
  }[status];

  return (
    <div className="relative w-screen h-screen bg-black overflow-hidden">

      {/* 데이터 로딩 오버레이 */}
      {!dataReady && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
          {loadProgress === -1 ? (
            /* 에러 상태 */
            <>
              <p className="mb-2 text-sm text-red-400/90 select-none">데이터 로드 실패</p>
              <p className="text-xs text-red-400/60 select-none">
                Firestore 보안 규칙을 확인해주세요
              </p>
              <button
                onClick={() => window.location.reload()}
                className="mt-6 px-5 py-2 rounded-full text-xs border border-cyan-400/40 text-cyan-300 hover:border-cyan-400/80 transition-all"
              >
                새로고침
              </button>
            </>
          ) : (
            /* 정상 로딩 */
            <>
              <p className="mb-6 text-sm tracking-[0.25em] text-cyan-300/80 select-none">
                향기를 정렬 중입니다.
              </p>
              <div className="w-56 h-px bg-cyan-900/60 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 rounded-full transition-all duration-200"
                  style={{ width: `${loadProgress}%` }}
                />
              </div>
              <p className="mt-3 text-xs text-cyan-500/60 tabular-nums select-none">
                {loadProgress}%
              </p>
            </>
          )}
        </div>
      )}

      <Scene
        status={status}
        result={result}
        selectedFragrance={selectedFragrance}
        categories={categories}
        particleRef={particleRef}
        modifierRef={modifierRef}
      />

      {/* 타이틀 */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 text-center pointer-events-none select-none">
        <h1 className="text-5xl font-light tracking-[0.3em] text-cyan-300/80">
          PERFUME MAP
        </h1>
        <p className="mt-2 text-xl tracking-widest text-cyan-500/40">
          향의 우주를 탐색하세요
        </p>
      </div>

      {/* 검색창 */}
      {(status === "idle" || status === "loading") && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-full max-w-xl px-4">
          <form onSubmit={handleSearch} className="relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="감성을 입력하세요  (예: 비 오는 숲, 설레는 아침)"
              disabled={status !== "idle"}
              className="
                w-full px-7 py-5 pr-24 rounded-full text-sm
                bg-black/30 backdrop-blur-md
                border border-cyan-400/30
                text-cyan-100 placeholder-cyan-500/40
                outline-none focus:border-cyan-400/70
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-all duration-300
              "
            />
            <button
              type="submit"
              disabled={status !== "idle"}
              className="
                absolute right-2 top-1/2 -translate-y-1/2
                px-6 py-3 rounded-full text-sm
                bg-cyan-400/10 hover:bg-cyan-400/25
                border border-cyan-400/30 hover:border-cyan-400/60
                text-cyan-300
                disabled:opacity-30 disabled:cursor-not-allowed
                transition-all duration-200
              "
            >
              탐색
            </button>
          </form>
        </div>
      )}

      {/* 진행 상태 안내 */}
      {statusMessage && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none select-none">
          <p className="text-xs text-cyan-400/60 animate-pulse tracking-widest">
            {statusMessage}
          </p>
        </div>
      )}

      {/* 결과 화면 리셋 버튼 */}
      {status === "result" && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
          <button
            onClick={handleReset}
            className="
              px-8 py-3 rounded-full text-sm
              bg-black/40 backdrop-blur-md
              border border-cyan-400/40 hover:border-cyan-400/80
              text-cyan-300 hover:text-white
              transition-all duration-300
            "
          >
            다시 탐색하기
          </button>
        </div>
      )}
    </div>
  );
}
