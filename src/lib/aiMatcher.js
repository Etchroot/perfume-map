/**
 * AI 매칭 모듈
 *
 * Azure OpenAI API 키는 Firebase Functions에서만 사용됩니다.
 * 클라이언트는 /api/* 엔드포인트만 호출합니다.
 *
 * 1차 검색: /api/getEmbedding → 코사인 유사도 (클라이언트 계산)
 * 2차 검색: /api/matchModifier → GPT-4o 정밀 매칭
 */

// ─── 코사인 유사도 ─────────────────────────────────────────────────────────────
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── 1차: 임베딩 벡터 변환 (Functions 프록시) ──────────────────────────────────
/**
 * 텍스트를 1536차원 임베딩 벡터로 변환합니다.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function getEmbedding(text) {
  const res = await fetch("/api/getEmbedding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`[getEmbedding] 서버 오류 (${res.status})`);
  const data = await res.json();
  return data.embedding;
}

// ─── 1차: 코사인 유사도로 최적 fragrance 선택 (순수 클라이언트 계산) ──────────
/**
 * 사용자 임베딩과 카테고리 임베딩들을 비교하여 가장 유사한 항목을 반환합니다.
 * @param {number[]} userEmbedding
 * @param {Array<{fragrance: string, embedding: number[], position: object}>} categories
 * @returns {{ fragrance: string, index: number, score: number }}
 */
export function findBestCategory(userEmbedding, categories) {
  let bestIndex = 0;
  let bestScore = -Infinity;

  for (let i = 0; i < categories.length; i++) {
    const score = cosineSimilarity(userEmbedding, categories[i].embedding);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return {
    fragrance: categories[bestIndex].fragrance,
    index:     bestIndex,
    score:     bestScore,
  };
}

// ─── 2차: GPT-4o modifier 정밀 매칭 (Functions 프록시) ────────────────────────
/**
 * 사용자 입력과 가장 유사한 modifier 1개를 선택하고 원료명을 반환합니다.
 * @param {string} userInput
 * @param {Array<{modifier: string, ingredient: string}>} candidates
 * @returns {Promise<{ selected: string, ingredient: string }>}
 */
export async function matchModifier(userInput, candidates) {
  const res = await fetch("/api/matchModifier", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userInput, candidates }),
  });
  if (!res.ok) throw new Error(`[matchModifier] 서버 오류 (${res.status})`);
  return res.json();
}
