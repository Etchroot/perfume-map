/**
 * Firebase Firestore 데이터 업로드 스크립트
 *
 * 사용 방법:
 * 1. 프로젝트 루트의 .env 파일에 FIREBASE_SERVICE_ACCOUNT_JSON 이 설정되어 있어야 합니다.
 * 2. npm install 실행
 * 3. npm run upload 실행
 *
 * 생성/갱신되는 컬렉션:
 * - categories : fragrance_3d_nodes.json 기반 (position + embedding 포함)
 * - ingredients: tgsc_list.csv 전체 2387개 행
 */

// 루트 .env 를 명시적으로 참조
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const admin = require("firebase-admin");
const fs    = require("fs");
const path  = require("path");
const { parse } = require("csv-parse/sync");

// ─── Firebase 초기화 ───────────────────────────────────────────────────────────
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!serviceAccountJson) {
  console.error("❌ 환경변수 FIREBASE_SERVICE_ACCOUNT_JSON 이 설정되어 있지 않습니다.");
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(serviceAccountJson);
} catch {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT_JSON 파싱 실패: JSON 형식을 확인해주세요.");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ─── 배치 업로드 헬퍼 ─────────────────────────────────────────────────────────
async function batchUpload(collectionName, documents, getDocId = null, batchSize = 400) {
  const BATCH_SIZE = batchSize;
  let totalUploaded = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const chunk = documents.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    chunk.forEach((doc) => {
      // getDocId 함수가 있으면 명시적 ID 사용 (덮어쓰기 가능), 없으면 자동 ID
      const ref = getDocId
        ? db.collection(collectionName).doc(getDocId(doc))
        : db.collection(collectionName).doc();
      batch.set(ref, doc);
    });

    await batch.commit();
    totalUploaded += chunk.length;
    console.log(`   [${collectionName}] ${totalUploaded} / ${documents.length} 완료...`);
  }
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {

  // ── 1. categories: fragrance_3d_nodes.json 기반 업로드 ──────────────────────
  console.log("\n📌 [1/2] categories 컬렉션 업로드 중...");

  const nodesPath = path.join(__dirname, "../fragrance_3d_nodes.json");
  if (!fs.existsSync(nodesPath)) {
    console.error("❌ fragrance_3d_nodes.json 파일을 찾을 수 없습니다.");
    process.exit(1);
  }

  const nodesRaw = JSON.parse(fs.readFileSync(nodesPath, "utf8"));
  // 객체({0:{...}, 1:{...}}) 또는 배열 모두 대응
  const nodes = Array.isArray(nodesRaw) ? nodesRaw : Object.values(nodesRaw);

  const categoryDocs = nodes.map((node) => ({
    fragrance: node.name,           // 향 대분류 이름
    position:  node.position,       // { x, y, z }  — 3D 렌더링용
    embedding: node.embedding,      // 1536차원 벡터 — 코사인 유사도 검색용
  }));

  console.log(`   총 ${categoryDocs.length}개 노드 (embedding ${nodes[0].embedding.length}차원)`);

  // fragrance 이름을 문서 ID로 사용 → 재업로드 시 중복 없이 덮어쓰기
  // embedding 배열이 커서 배치 크기를 20으로 줄임
  await batchUpload("categories", categoryDocs, (doc) => doc.fragrance, 20);
  console.log("✅ categories 업로드 완료!\n");

  // ── 2. ingredients: CSV 전체 행 업로드 ──────────────────────────────────────
  console.log("📌 [2/2] ingredients 컬렉션 업로드 중...");

  const csvPath = path.join(__dirname, "../tgsc_list.csv");
  const csvText = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  console.log(`   총 ${records.length}행`);

  const ingredientDocs = records.map((r) => ({
    ingredient: r.Ingredient || "",
    fragrance:  r.fragrance  || "",
    modifier:   r.modifier   || "",
  }));

  await batchUpload("ingredients", ingredientDocs);
  console.log("✅ ingredients 업로드 완료!\n");

  console.log("🎉 모든 업로드 완료!");
  console.log(`   - categories : ${categoryDocs.length}개 (embedding 포함)`);
  console.log(`   - ingredients: ${ingredientDocs.length}개`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ 업로드 오류:", err);
  process.exit(1);
});
