const functions = require("firebase-functions");

const ENDPOINT          = () => (process.env.AZURE_OPENAI_ENDPOINT ?? "").replace(/\/$/, "");
const API_KEY           = () =>  process.env.AZURE_OPENAI_API_KEY;
const DEPLOYMENT        = () =>  process.env.AZURE_OPENAI_DEPLOYMENT;
const EMBED_DEPLOYMENT  = () =>  process.env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT;
const API_VERSION       = () =>  process.env.AZURE_OPENAI_API_VERSION ?? "2024-02-15-preview";

// ── 공통 Azure fetch ──────────────────────────────────────────────────────────
async function azureFetch(deploymentName, path, body) {
  const url = `${ENDPOINT()}/openai/deployments/${deploymentName}/${path}?api-version=${API_VERSION()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": API_KEY() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Azure OpenAI 오류 (${res.status}): ${err}`);
  }
  return res.json();
}

// ── /api/getEmbedding ─────────────────────────────────────────────────────────
// body: { text: string }
// returns: { embedding: number[] }
exports.getEmbedding = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "text 필드가 필요합니다." });

  try {
    const data = await azureFetch(EMBED_DEPLOYMENT(), "embeddings", { input: text });
    res.json({ embedding: data.data[0].embedding });
  } catch (err) {
    console.error("[getEmbedding]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── /api/matchModifier ────────────────────────────────────────────────────────
// body: { userInput: string, candidates: Array<{modifier, ingredient}> }
// returns: { selected: string, ingredient: string }
exports.matchModifier = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  const { userInput, candidates } = req.body;
  if (!userInput || !candidates) {
    return res.status(400).json({ error: "userInput, candidates 필드가 필요합니다." });
  }

  const listJson = JSON.stringify(
    candidates.map((c, i) => ({ index: i, modifier: c.modifier, ingredient: c.ingredient }))
  );

  try {
    const data = await azureFetch(DEPLOYMENT(), "chat/completions", {
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
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error("[matchModifier]", err.message);
    res.status(500).json({ error: err.message });
  }
});
