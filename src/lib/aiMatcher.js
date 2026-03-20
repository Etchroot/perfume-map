/**
 * AI 매칭 모듈
 *
 * 1차 검색: Azure OpenAI Embedding API → 코사인 유사도 (빠름, LLM 불필요)
 * 2차 검색: Azure OpenAI GPT-4o Chat Completion (정확한 modifier 선택)
 *
 * 필요 환경변수 (.env):
 *   VITE_AZURE_OPENAI_ENDPOINT
 *   VITE_AZURE_OPENAI_API_KEY
 *   VITE_AZURE_OPENAI_DEPLOYMENT          (GPT-4o 배포명, 2차 검색용)
 *   VITE_AZURE_OPENAI_EMBEDDING_DEPLOYMENT (text-embedding-3-small 배포명, 1차 검색용)
 *   VITE_AZURE_OPENAI_API_VERSION
 */

const ENDPOINT   = import.meta.env.VITE_AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "");
const API_KEY    = import.meta.env.VITE_AZURE_OPENAI_API_KEY;
const DEPLOYMENT = import.meta.env.VITE_AZURE_OPENAI_DEPLOYMENT;
const EMBED_DEPLOYMENT = import.meta.env.VITE_AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
const API_VERSION = import.meta.env.VITE_AZURE_OPENAI_API_VERSION ?? "2024-02-15-preview";

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

// ─── 공통 fetch 헬퍼 ───────────────────────────────────────────────────────────
async function azureFetch(deploymentName, path, body) {
  if (!ENDPOINT || !API_KEY || !deploymentName) {
    throw new Error("Azure OpenAI 환경변수가 설정되지 않았습니다. .env를 확인하세요.");
  }
  const url = `${ENDPOINT}/openai/deployments/${deploymentName}/${path}?api-version=${API_VERSION}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure OpenAI 오류 (${res.status}): ${err}`);
  }
  return res.json();
}

// ─── 1차: 사용자 입력 → Embedding 벡터 변환 ───────────────────────────────────
/**
 * 텍스트를 1536차원 임베딩 벡터로 변환합니다.
 * @param {string} text
 * @returns {Promise<number[]>} 1536차원 벡터
 */
export async function getEmbedding(text) {
  const data = await azureFetch(EMBED_DEPLOYMENT, "embeddings", { input: text });
  return data.data[0].embedding;
}

// ─── 1차: 코사인 유사도로 최적 fragrance 선택 ──────────────────────────────────
/**
 * 사용자 임베딩과 카테고리 임베딩들을 비교하여 가장 유사한 항목을 반환합니다.
 * @param {number[]} userEmbedding  getEmbedding() 결과
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

// ─── 2차: GPT-4o로 modifier 정밀 매칭 ────────────────────────────────────────
/**
 * 사용자 입력과 가장 유사한 modifier 1개를 선택하고 원료명을 반환합니다.
 * @param {string} userInput
 * @param {Array<{modifier: string, ingredient: string}>} candidates
 * @returns {Promise<{ selected: string, ingredient: string }>}
 */
export async function matchModifier(userInput, candidates) {
  const listJson = JSON.stringify(
    candidates.map((c, i) => ({ index: i, modifier: c.modifier, ingredient: c.ingredient }))
  );

  const data = await azureFetch(DEPLOYMENT, "chat/completions", {
    messages: [
      {
        role: "system",
        content: `당신은 향수 전문가입니다.
사용자의 감성 표현을 분석하여, 아래 PROVIDED_LIST 배열 안의 항목 중 가장 잘 어울리는 항목 정확히 1개를 골라야 합니다.

규칙 (반드시 준수):
1. 반드시 아래 PROVIDED_LIST 안에 존재하는 "modifier"와 "ingredient" 값만 사용하세요.
2. 응답은 반드시 아래 JSON 형식만 출력하세요. 다른 텍스트는 일절 포함하지 마세요.
3. "selected"는 선택한 항목의 "modifier" 원문, "ingredient"는 해당 항목의 "ingredient" 원문과 완전히 동일해야 합니다.

응답 형식:
{"selected": "<modifier 원문>", "ingredient": "<ingredient 원문>"}

PROVIDED_LIST:
${listJson}`,
      },
      {
        role: "user",
        content: `사용자 입력: "${userInput}"`,
      },
    ],
    temperature: 0,
    max_tokens: 100,
    response_format: { type: "json_object" },
  });

  const raw = data.choices[0].message.content;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`JSON 파싱 실패 — 모델 응답: ${raw}`);
  }
}
