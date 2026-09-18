# 문장 임베딩과 코사인 유사도 기반 시맨틱 검색 파이프라인 구현

`Sentence Transformers` 라이브러리와 코사인 유사도(Cosine Similarity)를 결합하여 문맥적 의미를 기반으로 문서를 식별하는 밀집 검색(Dense Retrieval) 메커니즘을 상세히 다룹니다. 입력 텍스트를 고차원 밀집 벡터(Dense Vector)로 변환하는 트랜스포머 인코더 계층부터 어텐션 마스크 기반 평균 풀링(Mean Pooling), 벡터 공간 기하학, 코사인 유사도 연산 최적화까지 기술적 원리를 분석합니다.

---

## 1. 핵심 개념 및 아키텍처 분석

### 1.1 트랜스포머 인코더와 Self-Attention 연산 메커니즘
문장 임베딩 모델의 기반이 되는 트랜스포머 인코더는 입력 텍스트를 토큰화한 후 세 가지 임베딩(토큰 임베딩, 위치 임베딩, 세그먼트 임베딩)의 합으로 초기 벡터 표현을 생성합니다. 이후 다중 헤드 어텐션(Multi-Head Self-Attention) 계층을 거치며 각 토큰은 문장 내 다른 모든 토큰과의 상관관계를 반영한 문맥 의존적 표현(Contextualized Representation)으로 변환됩니다.

어텐션 연산은 Query($Q$), Key($K$), Value($V$) 세 행렬의 상호작용으로 정의됩니다.

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

- **스케일링 팩터 ($\sqrt{d_k}$)**: 은닉 차원 수 $d_k$가 커질수록 내적 결과의 분산이 증가하여 소프트맥스 함수의 기울기 소실(Vanishing Gradient)이 발생하는 현상을 방지합니다.
- **문맥 정보 통합**: 정적 단어 임베딩(Word2Vec, GloVe)과 달리 동일한 단어라도 주변 토큰의 배치에 따라 상이한 은닉 상태(Hidden State) 벡터를 출력하므로 다의어 및 구문 구조의 의미를 보존합니다.

### 1.2 어텐션 마스크 기반 평균 풀링(Mean Pooling)의 원리
트랜스포머 인코더의 최종 출력은 $[B, L, D]$ 형상을 가집니다 ($B$: 배치 크기, $L$: 시퀀스 길이, $D$: 은닉 차원). 문장 단위의 유사도를 측정하기 위해서는 시퀀스 차원($L$)을 축소하여 단일 벡터 $[B, D]$로 집약하는 풀링(Pooling) 연산이 필요합니다.

1. **[CLS] 토큰 풀링의 제약**: 사전 학습 시 분류 태스크에 편향되어 있어 문장 전체 토큰들의 의미적 평균을 충분히 반영하지 못합니다.
2. **어텐션 마스크 기반 평균 풀링(Mean Pooling)**: 패딩 토큰(Padding Token)을 제외한 실제 유효 토큰들만을 대상으로 가중 평균을 수행합니다.

$$v_{\text{sentence}} = \frac{\sum_{i=1}^{L} h_i \cdot m_i}{\sum_{i=1}^{L} m_i}$$

- $h_i$: 시퀀스 내 $i$번째 토큰의 출력 은닉 벡터
- $m_i \in \{0, 1\}$: $i$번째 토큰의 유효 여부를 나타내는 어텐션 마스크 값
- `all-MiniLM-L6-v2` 모델은 6개 계층의 트랜스포머 인코더와 평균 풀링 계층을 통과하여 각 텍스트를 384차원의 고정 길이 실수 벡터로 압축합니다.

### 1.3 벡터 공간 기하학 및 밀집 벡터(Dense Vector)의 특성
문장 임베딩은 고차원 연속 공간 상에 텍스트를 사상합니다.

- **샴 네트워크(Siamese Network)와 대조 학습(Contrastive Learning)**: 사전 훈련 단계에서 유사한 문장 쌍(Positive Pairs)은 벡터 공간 상에서 유클리드 거리 및 각도가 가깝도록 유도하고, 상이한 문장 쌍(Negative Pairs)은 멀어지도록 손실 함수(MultipleNegativesRankingLoss)를 적용합니다.
- **의미론적 보존성**: 키워드가 직접적으로 일치하지 않더라도 유사한 개념군(예: 프로그래밍 언어 사양, 컴파일 방식, 가상 머신 런타임)에 속한 텍스트들은 동일한 공간 영역 내에 군집을 형성합니다.

### 1.4 코사인 유사도(Cosine Similarity) 연산 원리와 L2 정규화
코사인 유사도는 다차원 벡터 공간에서 두 벡터 간의 사잇각에 대한 코사인 값을 계산하여 방향성의 일치도를 측정합니다.

$$\text{Cosine Similarity}(A, B) = \frac{A \cdot B}{\|A\|_2 \|B\|_2} = \frac{\sum_{i=1}^{D} A_i B_i}{\sqrt{\sum_{i=1}^{D} A_i^2} \sqrt{\sum_{i=1}^{D} B_i^2}}$$

- **크기 독립성(Scale Invariance)**: 벡터의 L2 노름(Norm)으로 내적값을 나누어 정규화하므로, 문장의 절대적인 길이 차이로 인해 발생하는 크기 왜곡을 배제하고 방향적 정렬 상태만을 평가합니다.
- **L2 정규화 최적화**: 임베딩 벡터를 미리 단위 벡터($\|A\|_2 = 1, \|B\|_2 = 1$)로 정규화해 둘 경우 분모 계산이 생략되어 단순 벡터 내적($A \cdot B$)만으로 코사인 유사도가 산출됩니다. 이에 따라 유사도 계산 복잡도가 대폭 감소합니다.

### 1.5 RAG(Retrieval-Augmented Generation) 시스템 내 검색기(Retriever) 구조
RAG 아키텍처에서 밀집 검색기는 지식 베이스와 생성 모델을 연결하는 핵심 인터페이스입니다.

```mermaid
flowchart LR
    A["지식 문서 집합 (Documents)"] --> B["Sentence Transformer (인코딩)"]
    B --> C["문서 임베딩 행렬 (N x 384)"]
    D["사용자 질의 (Query)"] --> E["Sentence Transformer (인코딩)"]
    E --> F["질의 벡터 (1 x 384)"]
    C --> G["코사인 유사도 매트릭스 연산"]
    F --> G
    G --> H["최고 유사도 인덱스 도출 (Top-1)"]
    H --> I["관련 문서 컨텍스트 추출"]
```

1. **오프라인 색인(Offline Indexing)**: 지식 베이스 문서를 사전 로드하여 384차원 임베딩 행렬($N \times 384$)로 변환 후 적재합니다.
2. **온라인 검색(Online Retrieval)**: 런타임에 유입된 사용자 질의를 단일 벡터($1 \times 384$)로 인코딩한 뒤, 행렬 곱셈을 통해 문서 집합과의 유사도 벡터($1 \times N$)를 산출합니다.
3. **인덱스 추출**: 최댓값을 가진 인덱스를 선택하여 원본 문서를 획득하고 LLM 프롬프트에 주입합니다.

---

## 2. 코드 구현 및 라인별 상세 분석

다음은 `Sentence Transformers`와 `scikit-learn`을 활용하여 문장 임베딩을 생성하고 코사인 유사도를 통해 최적의 관련 문서를 도출하는 파이프라인 구현 코드입니다. 자바(Java)의 언어적 특성을 다룬 문서를 지식 베이스에 구성하고, 직접적인 단어 일치 없이 문맥적 의미로 해당 문서를 검색하는 시나리오를 구성합니다.

```python
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# 1. 사전 학습된 문장 임베딩 모델 로드
# all-MiniLM-L6-v2 모델은 384차원의 밀집 임베딩 벡터를 출력
embedder = SentenceTransformer("all-MiniLM-L6-v2")

# 2. 지식 베이스(Knowledge Base) 문서 집합 정의
documents = [
    "Python is an interpreted, high-level, general-purpose programming language.",
    "PyTorch is an open-source machine learning framework used for deep learning.",
    "Java is a compiled, object-oriented language that runs bytecode on the Java Virtual Machine for platform independence."
]

# 3. 문서 집합을 384차원의 임베딩 행렬(N x D)로 일괄 변환 (배치 추론)
doc_vectors = embedder.encode(documents)

# 4. 사용자 질의어 정의 (키워드 불일치 테스트 케이스)
# "Java"라는 단어를 직접 포함하지 않고 바이트코드, 가상 머신, 플랫폼 독립성 등의 개념적 의미로 탐색
query = "Which language compiles source code into bytecode to execute on a virtual machine across platforms"
query_vector = embedder.encode([query])

# 5. 질의 벡터와 문서 벡터 간 코사인 유사도 행렬 계산
# 반환 형태는 (1, 문서 수) 형상의 2차원 numpy 배열
similarities = cosine_similarity(query_vector, doc_vectors)[0]

# 6. 유사도 점수가 가장 높은 문서의 인덱스 추출
best_doc_idx = int(np.argmax(similarities))

# 7. 검색 결과 및 유사도 메트릭 출력
print(f"질문: {query}\n")
print(f"가장 유사도가 높은 문서 (유사도: {similarities[best_doc_idx]:.4f}):")
print(f"-> {documents[best_doc_idx]}")
```

### 코드 라인별 상세 분석

- **Line 6 (`SentenceTransformer("all-MiniLM-L6-v2")`)**: 사전 학습된 가중치를 다운로드하고 메모리에 로드합니다. 모델 인스턴스화에는 가중치 역직렬화와 텐서 할당 비용이 소요되므로 실무 환경에서는 요청 단위 생성을 지양하고 애플리케이션 수명 주기 동안 싱글톤(Singleton)으로 유지해야 합니다.
- **Line 18 (`embedder.encode(documents)`)**: 개별 문장을 반복문으로 순회하지 않고 리스트 형태로 전달하여 배치 추론(Batch Inference)을 수행합니다. 파이토치(PyTorch) 백엔드가 내부 텐서를 배치 단위로 묶어 연산하므로 GPU 및 CPU 벡터 연산 처리량이 향상됩니다. 반환값은 `(3, 384)` 형태의 2차원 `numpy.ndarray`입니다.
- **Line 22 (`embedder.encode([query])`)**: 단일 문자열을 리스트(`[query]`)로 감싸 전달하여 출력 형태를 `(1, 384)` 형상의 2차원 배열로 일치시킵니다.
- **Line 26 (`cosine_similarity(query_vector, doc_vectors)[0]`)**: `(1, 384)` 크기의 질의 벡터와 `(3, 384)` 크기의 문서 행렬 간 내적 및 L2 노름 나눗셈을 수행하여 `(1, 3)` 형상의 유사도 행렬을 생성합니다. 인덱스 `[0]`을 참조하여 1차원 배열(`(3,)`)로 차원을 축소합니다.
- **Line 29 (`np.argmax(similarities)`)**: 1차원 배열에서 최댓값을 가진 인덱스를 $O(N)$ 시간 복잡도로 탐색합니다. 상위 $K$개의 다중 문서를 반환해야 하는 시스템에서는 `np.argsort()[::-1][:k]`를 활용할 수 있습니다.

---

## 3. 적용 시 고려해야 할 점 (주의사항 및 예외 처리)

### 3.1 대규모 데이터셋에서의 연산 복잡도 병목
- **전수 탐색(Flat Search)의 한계**: 본 예제에서 사용된 `cosine_similarity` 방식은 질의가 유입될 때마다 전체 문서 벡터와 일대일 내적을 계산하는 완전 탐색(Brute-force) 방식입니다. 문서 수 $N$이 증가함에 따라 검색 시간 복잡도는 $O(N \cdot D)$로 선형 증가합니다.
- **해결 방안**: 대규모 데이터셋을 서빙할 경우, FAISS, Milvus, Qdrant 등 전용 벡터 인덱스 엔진을 적용하고 HNSW(Hierarchical Navigable Small World) 또는 IVF-PQ(Inverted File with Product Quantization) 같은 ANN(Approximate Nearest Neighbor) 알고리즘을 도입하여 검색 복잡도를 $O(\log N)$ 수준으로 제어해야 합니다.

### 3.2 입력 시퀀스 길이 제한과 청킹(Chunking)
- `all-MiniLM-L6-v2` 모델은 최대 256개 또는 128개의 토큰 시퀀스 길이 제한을 가집니다. 긴 문서를 그대로 인코딩할 경우 초과된 텍스트는 버려지는 절삭(Truncation) 현상이 발생합니다.
- 따라서 긴 텍스트 문서는 고정된 토큰 단위로 분할하고, 문맥 단절을 방지하기 위해 10% 내외의 오버랩(Overlap)을 적용하는 전처리 청킹 파이프라인을 구축해야 합니다.

### 3.3 L2 정규화(Normalize Embeddings)를 통한 내적 연산 최적화
- `SentenceTransformer.encode` 함수 호출 시 `normalize_embeddings=True` 옵션을 부여하면 출력 벡터가 L2 정규화되어 단위 벡터(Unit Vector)로 반환됩니다.
- 단위 벡터 간의 코사인 유사도는 분모 계산이 생략되므로 단순 행렬 내적(`np.dot` 또는 `doc_vectors @ query_vector.T`)만으로 계산이 가능하며 불필요한 부동소수점 나눗셈 연산을 생략할 수 있습니다.

### 3.4 도메인 특화 용어 및 다국어 처리
- `all-MiniLM-L6-v2`는 영문 코퍼스 중심의 모델입니다. 한국어 텍스트나 사내 전용 기술 명세 데이터를 처리할 때는 다국어 지원 모델(`paraphrase-multilingual-MiniLM-L12-v2`, `bge-m3` 등)을 선택하거나 도메인 코퍼스에 맞춘 대조 학습 기반 파인튜닝을 적용해야 검색 품질을 유지할 수 있습니다.

---

## 4. 결론 (해당 기술의 기대효과 요약)

문장 임베딩과 코사인 유사도에 기반한 밀집 검색은 어휘 불일치 문제를 극복하고 문맥 정보에 부합하는 문서를 식별합니다. 고정 차원의 밀집 벡터 공간을 통해 텍스트 간 의미적 거리를 수치화함으로써, 지식 베이스 검색과 RAG 파이프라인의 검색 모듈 전반에 걸쳐 신뢰도 높은 컨텍스트를 제공하는 기술적 토대를 마련할 수 있습니다.

---

## 5. 전체 소스코드

```python
import numpy as np
from sentence_transformers import SentenceTransformer


def run_semantic_search():
    # 1. 모델 로드 (384차원 임베딩 출력)
    embedder = SentenceTransformer("all-MiniLM-L6-v2")

    # 2. 참조 지식 베이스 문서 집합 (자바 언어 명세 포함)
    documents = [
        "Python is an interpreted, high-level, general-purpose programming language.",
        "PyTorch is an open-source machine learning framework used for deep learning.",
        "Java is a compiled, object-oriented language that runs bytecode on the Java Virtual Machine for platform independence."
    ]

    # 3. 문서 벡터화 (normalize_embeddings=True 적용으로 단위 벡터 생성)
    doc_vectors = embedder.encode(documents, normalize_embeddings=True)

    # 4. 질의어 정의 및 인코딩
    # 키워드("Java") 없이 개념적 의미(bytecode, virtual machine, platform independence)로 질의
    query = "Which language compiles source code into bytecode to execute on a virtual machine across platforms"
    query_vector = embedder.encode([query], normalize_embeddings=True)

    # 5. 단위 벡터 간 내적 연산을 통한 코사인 유사도 산출
    similarities = np.dot(query_vector, doc_vectors.T)[0]
    best_doc_idx = int(np.argmax(similarities))

    # 6. 결과 출력
    print(f"질의어: {query}")
    print(f"매칭 문서 인덱스: {best_doc_idx}")
    print(f"유사도 점수: {similarities[best_doc_idx]:.4f}")
    print(f"검색 결과 문서: {documents[best_doc_idx]}")


if __name__ == "__main__":
    run_semantic_search()
```
