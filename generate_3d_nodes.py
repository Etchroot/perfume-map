import os
import pandas as pd
import numpy as np
import json
from openai import AzureOpenAI
from sklearn.manifold import TSNE
from sklearn.preprocessing import MinMaxScaler
from dotenv import load_dotenv

# 1. .env 파일 환경 변수 로드
load_dotenv()

api_key = os.getenv("VITE_AZURE_OPENAI_API_KEY")
endpoint = os.getenv("VITE_AZURE_OPENAI_ENDPOINT")
api_version = os.getenv("VITE_AZURE_OPENAI_EMBEDDING_API_VERSION")
embedding_model = os.getenv("VITE_AZURE_OPENAI_EMBEDDING_DEPLOYMENT")

# 환경 변수가 잘 들어왔는지 체크
if not all([api_key, endpoint, api_version, embedding_model]):
    print("🚨 에러: .env 파일에서 Azure OpenAI 관련 변수를 찾을 수 없습니다. 이름을 확인해 주세요.")
    exit()

# 2. Azure OpenAI 클라이언트 설정
client = AzureOpenAI(
    api_key=api_key,  
    api_version=api_version,
    azure_endpoint=endpoint
)

# 3. 데이터 불러오기
print("데이터를 불러오는 중...")
df = pd.read_csv('tgsc_list.csv')
unique_fragrances = df['fragrance'].dropna().unique().tolist()
print(f"총 {len(unique_fragrances)}개의 고유한 대분류를 찾았습니다.")

# 4. 텍스트 임베딩 추출
print(f"Azure OpenAI API({embedding_model})를 통해 임베딩 벡터를 추출하는 중...")
response = client.embeddings.create(
    input=unique_fragrances,
    model=embedding_model
)
embeddings = [data.embedding for data in response.data]

# 5. 차원 축소 (1536차원 -> 3차원)
print("3D 좌표로 차원 축소 중 (t-SNE)...")
tsne = TSNE(n_components=3, perplexity=30, random_state=42)
embeddings_3d = tsne.fit_transform(np.array(embeddings))

# 6. 좌표 스케일링
scaler = MinMaxScaler(feature_range=(-10, 10))
embeddings_3d_scaled = scaler.fit_transform(embeddings_3d)

# 7. JSON 데이터로 포맷팅 (3D 좌표 + 1536차원 벡터 모두 저장)
nodes_data = []
for i, frag in enumerate(unique_fragrances):
    x, y, z = embeddings_3d_scaled[i]
    nodes_data.append({
        "id": frag,
        "name": frag,
        "position": {
            "x": round(float(x), 3), 
            "y": round(float(y), 3), 
            "z": round(float(z), 3)
        },
        "embedding": embeddings[i] 
    })

# 8. 파일 저장
with open('fragrance_3d_nodes.json', 'w', encoding='utf-8') as f:
    json.dump(nodes_data, f, ensure_ascii=False, indent=2)

print("✅ 성공적으로 'fragrance_3d_nodes.json' 파일이 생성되었습니다!")