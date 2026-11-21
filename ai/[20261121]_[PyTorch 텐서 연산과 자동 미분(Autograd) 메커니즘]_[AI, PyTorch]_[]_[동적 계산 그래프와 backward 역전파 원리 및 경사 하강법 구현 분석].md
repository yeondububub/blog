# PyTorch 텐서 연산과 자동 미분(Autograd) 메커니즘

신경망 모델을 학습한다는 것은 손실 함수(Loss Function)의 값을 최소화하는 방향으로 수많은 가중치 파라미터를 갱신하는 최적화 과정입니다. 이를 위해서는 각 가중치가 손실 값에 미치는 영향력, 즉 기울기(Gradient)를 계산해야 합니다.

수백만 개 이상의 파라미터로 이루어진 현대 딥러닝 모델에서는 개발자가 편미분 공식을 손으로 유도해 코드로 옮기는 방식이 불가능에 가깝습니다. PyTorch의 핵심 엔진인 **Autograd(Automatic Differentiation)**는 순전파(Forward Pass) 과정에서 실행된 텐서 연산을 실시간으로 기록해 동적 계산 그래프(Dynamic Computational Graph)를 구성하고, 역전파(Backward Pass) 호출 시 연쇄 법칙(Chain Rule)을 적용해 모든 학습 파라미터의 기울기를 자동으로 산출합니다.

본 문서에서는 수치 미분과 수동 미분 방식이 가지는 구조적 한계를 짚어보고, PyTorch 텐서의 내부 메타데이터(`requires_grad`, `grad_fn`, `grad`)가 계산 그래프를 구성하고 역전파를 수행하는 원리와 학습 루프 구현 시의 주의사항을 분석합니다.

---

## 1. 기술적 배경 및 문제 제기 (기존 방식의 한계점)

딥러닝 프레임워크의 자동 미분 엔진 없이 파라미터의 기울기를 구할 때 고려할 수 있는 기존 방식은 크게 **수치 미분(Numerical Differentiation)**과 **수동 해석적 미분(Manual Analytical Differentiation)** 두 가지입니다.

### 1.1 수치 미분의 계산 복잡도와 정밀도 문제
유한 차분법($\frac{f(w + h) - f(w - h)}{2h}$)을 이용하면 미분 공식을 유도하지 않고도 기울기를 근사할 수 있습니다. 그러나 파라미터가 $N$개일 때 한 번의 가중치 갱신마다 최소 $2N$번의 순전파를 다시 실행해야 합니다. 파라미터 수가 수억 개에 이르는 모델에서는 연산 시간상 사용할 수 없으며, 미세한 간격 $h$를 줄일수록 부동소수점 반올림 오차가 커지는 수치적 불안정성도 따릅니다.

### 1.2 수동 역전파 코드의 유지보수 한계
NumPy 등을 이용해 각 계층(Layer)의 `forward()`와 `backward()` 미분 수식을 직접 구현할 수도 있습니다. 하지만 모델 구조에 분기문(`if`), 반복문(`for`), 잔차 연결(Residual Connection)이 추가될 때마다 역전파 수식 전체를 사람이 다시 계산하고 검증해야 하므로 아키텍처 실험 속도가 급격히 떨어집니다.

### 1.3 정적 그래프 대비 동적 그래프(Define-by-Run)의 필요성
초기 딥러닝 프레임워크들은 연산 그래프를 먼저 선언하고 컴파일한 뒤 데이터를 흘려보내는 정적 그래프(Define-and-Run) 방식을 채택했습니다. 이 방식은 실행 전 그래프 최적화에는 유리하지만, 입력 길이나 조건에 따라 제어 흐름이 달라지는 자연어 처리 모델이나 Python 디버거(`pdb`)를 이용한 단계별 추적이 까다롭다는 단점이 있습니다. PyTorch는 코드를 실행하는 순간 그래프가 즉석에서 생성되는 **동적 계산 그래프(Define-by-Run)** 구조를 채택해 일반 Python 제어문과 디버깅 흐름을 그대로 유지합니다.

---

## 2. 핵심 개념 설명

PyTorch의 Autograd는 순전파 시 연산의 이력을 방향성 비순환 그래프(DAG, Directed Acyclic Graph) 형태로 연결하고, `.backward()` 호출 시 출력 노드에서 입력 리프(Leaf) 노드 방향으로 거슬러 올라가며 기울기를 계산합니다.

<div class="diagram-container">
<svg role="img" aria-labelledby="pytorch-autograd-dag-title pytorch-autograd-dag-desc" viewBox="0 0 960 320" xmlns="http://www.w3.org/2000/svg">
  <title id="pytorch-autograd-dag-title">PyTorch Autograd 동적 계산 그래프와 역전파 흐름</title>
  <desc id="pytorch-autograd-dag-desc">입력 텐서와 가중치 리프 텐서로부터 순전파 연산이 grad_fn 노드로 연결되고 backward 호출 시 연쇄 법칙으로 리프 텐서의 grad 필드에 기울기가 누적되는 흐름</desc>
  <defs>
    <marker id="arr-ag-ink" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#2d3142"/>
    </marker>
    <marker id="arr-ag-accent" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#bf4520"/>
    </marker>
  </defs>

  <!-- Canvas Background -->
  <rect width="960" height="320" fill="#f5f5f5" rx="8"/>

  <!-- Forward Zone -->
  <rect x="24" y="20" width="912" height="156" rx="6" fill="#ececec" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="5 3"/>
  <text x="44" y="44" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#4f5d75">1. 순전파 (Forward Pass) - 연산 실행과 동시에 DAG 생성</text>

  <!-- Backward Zone -->
  <rect x="24" y="192" width="912" height="108" rx="6" fill="#ececec" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="5 3"/>
  <text x="44" y="216" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#bf4520">2. 역전파 (Backward Pass) - L.backward() 호출 시 연쇄 법칙 적용</text>

  <!-- 1. ARROWS (drawn before boxes) -->
  <!-- Forward arrows -->
  <line x1="204" y1="92" x2="264" y2="92" stroke="#2d3142" stroke-width="1.25" marker-end="url(#arr-ag-ink)"/>
  <line x1="428" y1="92" x2="488" y2="92" stroke="#2d3142" stroke-width="1.25" marker-end="url(#arr-ag-ink)"/>
  <line x1="652" y1="92" x2="720" y2="92" stroke="#2d3142" stroke-width="1.25" marker-end="url(#arr-ag-ink)"/>

  <!-- Backward arrows -->
  <path d="M 816 144 L 816 252 Q 816 260 808 260 L 664 260" fill="none" stroke="#bf4520" stroke-width="1.75" stroke-dasharray="5 3" marker-end="url(#arr-ag-accent)"/>
  <line x1="500" y1="260" x2="432" y2="260" stroke="#bf4520" stroke-width="1.75" stroke-dasharray="5 3" marker-end="url(#arr-ag-accent)"/>
  <line x1="268" y1="260" x2="208" y2="260" stroke="#bf4520" stroke-width="1.75" stroke-dasharray="5 3" marker-end="url(#arr-ag-accent)"/>

  <!-- Arrow label masks -->
  <rect x="720" y="246" width="84" height="18" fill="#ececec"/>
  <text x="762" y="259" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">dL/dL = 1.0</text>

  <!-- 2. NODES -->
  <!-- Forward Nodes -->
  <rect x="44" y="64" width="160" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="124" y="88" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Leaf Tensor (w, b)</text>
  <text x="124" y="106" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">requires_grad=True</text>

  <rect x="264" y="64" width="164" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="346" y="88" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">선형 연산 (z = wx + b)</text>
  <text x="346" y="106" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">grad_fn: AddBackward0</text>

  <rect x="488" y="64" width="164" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="570" y="88" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">오차 계산 (L = (z-y)²)</text>
  <text x="570" y="106" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">grad_fn: PowBackward0</text>

  <rect x="720" y="64" width="192" height="80" rx="4" fill="rgba(191,69,32,0.08)" stroke="#bf4520" stroke-width="1.75"/>
  <text x="816" y="96" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#bf4520">스칼라 손실 텐서 (L)</text>
  <text x="816" y="116" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">L.backward() 시작점</text>

  <!-- Backward Nodes -->
  <rect x="500" y="232" width="164" height="52" rx="4" fill="#ffffff" stroke="#bf4520" stroke-width="1.25"/>
  <text x="582" y="254" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">dL/dz 계산</text>
  <text x="582" y="272" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">PowBackward0 실행</text>

  <rect x="268" y="232" width="164" height="52" rx="4" fill="#ffffff" stroke="#bf4520" stroke-width="1.25"/>
  <text x="350" y="254" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">dL/dw, dL/db 계산</text>
  <text x="350" y="272" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">Mul/AddBackward0 실행</text>

  <rect x="44" y="232" width="164" height="52" rx="4" fill="rgba(191,69,32,0.08)" stroke="#bf4520" stroke-width="1.75"/>
  <text x="126" y="254" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#bf4520">기울기 누적 (Leaf)</text>
  <text x="126" y="272" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">w.grad, b.grad 저장</text>
</svg>
</div>

### 2.1 `Tensor`와 `requires_grad`
`torch.Tensor`는 다차원 배열 데이터(`data`)뿐만 아니라 자동 미분 추적을 위한 메타데이터를 함께 보관합니다.
- `requires_grad=True`: 해당 텐서로 수행하는 모든 연산을 Autograd가 추적하도록 지시합니다. `nn.Parameter`로 선언된 신경망 가중치는 기본적으로 `requires_grad=True` 상태입니다.
- `is_leaf`: 사용자가 직접 생성한 텐서(또는 `requires_grad=False`인 모든 텐서)는 리프 텐서(`is_leaf=True`)로 분류됩니다. 중간 연산 결과로 파생된 텐서는 `is_leaf=False`가 되며, 기본 설정에서는 메모리를 절약하기 위해 중간 텐서의 `.grad` 속성을 유지하지 않고 리프 텐서의 `.grad`에만 최종 기울기를 누적합니다.

### 2.2 `grad_fn`과 계산 그래프 연결 구조
`requires_grad=True`인 텐서가 연산에 참여하면, 결과 텐서에는 자신을 만들어 낸 역연산 객체(`Function`)를 가리키는 `grad_fn` 포인터가 기록됩니다. 예를 들어 덧셈 연산 결과에는 `AddBackward0`, 행렬 곱 결과에는 `MmBackward0`가 연결됩니다. 사용자가 직접 생성한 리프 텐서는 이전 연산이 없으므로 `grad_fn`이 `None`입니다.

### 2.3 연쇄 법칙(Chain Rule)과 `.backward()`
합성 함수 $L = f(g(w))$에 대해 $w$의 기울기 $\frac{\partial L}{\partial w}$는 다음과 같이 국소 미분들의 곱으로 분해됩니다.

$$\frac{\partial L}{\partial w} = \frac{\partial L}{\partial z} \cdot \frac{\partial z}{\partial w} \quad (z = g(w))$$

`L.backward()`가 호출되면 Autograd 엔진은 출력 텐서 `L`의 `grad_fn`부터 시작해 입력 텐서들을 향해 그래프를 역방향으로 순회하면서 각 노드의 국소 기울기를 곱해 전파하고, 최종적으로 리프 텐서의 `.grad` 버퍼에 더합니다(`+=`). 역전파가 완료되면 동적 그래프는 메모리에서 즉시 해제됩니다.

---

## 3. 코드 구현 및 라인별 상세 분석

실제 PyTorch 코드를 통해 계산 그래프 추적, 기울기 누적 동작, 그리고 `Autograd` 기반의 경사 하강법 학습 루프를 구현합니다.

### 3.1 계산 그래프 추적과 `grad_fn` 확인

```python
import torch

# 1. 사용자가 직접 생성한 학습 파라미터 (Leaf Tensor, grad_fn은 None)
w = torch.tensor([2.0], requires_grad=True)
b = torch.tensor([1.0], requires_grad=True)

# 2. 입력 데이터와 정답 레이블 (미분 불필요, requires_grad=False)
x = torch.tensor([3.0])
y_true = torch.tensor([10.0])

# 3. 순전파(Forward Pass): 연산을 수행할 때마다 grad_fn이 연결됨
z = w * x        # MulBackward0 연결, is_leaf=False
y_pred = z + b   # AddBackward0 연결, is_leaf=False
loss = (y_pred - y_true) ** 2  # PowBackward0 연결

print(f"w.is_leaf: {w.is_leaf}, w.grad_fn: {w.grad_fn}")
print(f"z.is_leaf: {z.is_leaf}, z.grad_fn: {z.grad_fn}")
print(f"loss.grad_fn: {loss.grad_fn}")

# 4. 역전파(Backward Pass): 스칼라 손실 값에서 각 리프 텐서까지의 편미분 계산
#    loss = (3w + b - 10)^2 = (6 + 1 - 10)^2 = 9
#    dL/dw = 2 * (3w + b - 10) * 3 = 2 * (-3) * 3 = -18
#    dL/db = 2 * (3w + b - 10) * 1 = 2 * (-3) * 1 = -6
loss.backward()

print(f"w.grad: {w.grad}")  # tensor([-18.])
print(f"b.grad: {b.grad}")  # tensor([-6.])
```

- **구현 상세 분석**:
  - `z`와 `y_pred`는 중간 연산 결과이므로 `z.grad`를 출력해 보면 `None`이 나옵니다. 중간 텐서의 기울기를 디버깅 목적으로 확인해야 할 때는 순전파 직후 `z.retain_grad()`를 명시적으로 호출해야 합니다.
  - `loss.backward()`는 기본적으로 **스칼라(원소가 1개인 텐서)**에 대해서만 인자 없이 호출할 수 있습니다. 손실 텐서가 스칼라가 아닌 다차원 벡터인 경우에는 야코비안(Jacobian) 행렬 곱을 위해 같은 크기의 가중치 벡터를 `tensor.backward(gradient=...)` 형태로 전달해야 합니다.

### 3.2 `Autograd`와 `torch.no_grad()`를 활용한 선형 회귀 학습 루프

```python
import torch

# 재현성을 위해 난수 시드 고정
torch.manual_seed(42)

# 실제 관계식: y = 3.5 * x + 1.2
x_train = torch.linspace(0.0, 10.0, 100).unsqueeze(1)
y_train = 3.5 * x_train + 1.2

# 학습 대상 파라미터 초기화 (Leaf Tensor)
w = torch.randn((1, 1), requires_grad=True)
b = torch.zeros(1, requires_grad=True)

learning_rate = 0.01

for epoch in range(1, 201):
    # 1. 순전파: 예측값 및 평균 제곱 오차(MSE) 손실 계산
    y_pred = x_train @ w + b
    loss = ((y_pred - y_train) ** 2).mean()

    # 2. 역전파: 현재 에폭의 파라미터별 기울기 산출
    loss.backward()

    # 3. 가중치 갱신: 업데이트 연산 자체가 계산 그래프에 기록되지 않도록 차단
    with torch.no_grad():
        w -= learning_rate * w.grad
        b -= learning_rate * b.grad

        # 4. 기울기 초기화: PyTorch는 .grad에 값을 덮어쓰지 않고 더하므로(.grad += new_grad)
        #    다음 에폭으로 넘어가기 전에 반드시 0으로 초기화해야 함
        w.grad.zero_()
        b.grad.zero_()

    if epoch % 50 == 0:
        print(f"Epoch {epoch:3d} | loss={loss.item():.6f} | w={w.item():.4f} | b={b.item():.4f}")
```

- **구현 상세 분석 및 효율성**:
  - **왜 `with torch.no_grad():` 블록 안에서 가중치를 갱신하는가**: `w -= learning_rate * w.grad`를 `no_grad()` 바깥에서 실행하면 파라미터 갱신 연산 자체가 새로운 연산 노드로 계산 그래프에 추가되려 합니다. 특히 리프 텐서(`requires_grad=True`)에 직접 제자리(in-place) 연산을 수행하면 PyTorch가 `RuntimeError: a leaf Variable that requires grad is being used in an in-place operation` 예외를 발생시켜 차단합니다.
  - **왜 `w.grad.zero_()`를 매 스텝 호출하는가**: PyTorch가 `.grad`를 자동으로 덮어쓰지 않고 누적하도록 설계된 이유는, GPU 메모리가 부족해 큰 배치(Batch)를 한 번에 처리할 수 없을 때 작은 미니 배치를 여러 번 순전파·역전파하여 기울기를 모은 뒤 한 번에 갱신하는 **Gradient Accumulation** 기법을 자연스럽게 지원하기 위함입니다.

---

## 4. 적용 시 고려해야 할 점 (주의사항 및 예외 처리)

### 4.1 In-Place 연산으로 인한 역전파 버전 충돌
역전파 시 일부 연산(`PowBackward0`, `MulBackward0` 등)은 기울기를 계산하기 위해 순전파 때 사용했던 텐서의 원본 값을 저장해 둡니다. 만약 순전파 이후 `.backward()` 호출 전에 텐서 값을 제자리 연산(`x.add_(1)`, `x[0] = 0`, `relu_(x)`)으로 덮어쓰면, PyTorch 내부의 `_version` 카운터가 불일치하게 되어 다음과 같은 런타임 오류가 발생합니다.

```text
RuntimeError: one of the variables needed for gradient computation has been modified by an inplace operation
```

학습 그래프에 연결된 텐서에는 가급적 새로운 텐서를 반환하는 비파괴 연산(`x = x + 1`, `F.relu(x, inplace=False)`)을 사용해야 안전합니다.

### 4.2 추론(Inference) 및 검증 단계에서의 메모리 누수 방지
모델 평가(Validation)나 서빙 추론 시에는 역전파를 수행하지 않지만, `torch.no_grad()`(또는 `torch.inference_mode()`)를 감싸지 않고 모델에 입력을 통과시키면 PyTorch가 매 요청마다 중간 활성화 값(Activation)과 계산 그래프를 메모리에 계속 생성합니다.

또한 학습 루프에서 손실 값을 로깅할 때 `total_loss += loss`처럼 `Tensor` 객체 자체를 파이썬 리스트나 누적 변수에 저장하면, 매 스텝의 전체 계산 그래프가 해제되지 않고 메모리에 남아 OOM(Out of Memory)을 유발합니다. 스칼라 수치만 필요할 때는 반드시 `loss.item()` 또는 `loss.detach()`로 그래프 연결을 끊은 값을 사용해야 합니다.

### 4.3 `detach()`와 `numpy()` 변환 규칙
`requires_grad=True`로 추적 중인 텐서에 바로 `.numpy()`를 호출하면 NumPy 배열은 Autograd가 추적할 수 없으므로 `RuntimeError: Can't call numpy() on Tensor that requires grad` 예외가 발생합니다. 시각화를 하거나 외부 라이브러리로 넘길 때는 `tensor.detach().cpu().numpy()` 순서로 그래프 분리(`detach`)와 호스트 메모리 이동(`cpu`)을 먼저 수행해야 합니다.

### 4.4 동일 그래프에서 두 번 역전파 호출 시
`loss.backward()`는 기본적으로 역전파를 마친 직후 중간 버퍼와 그래프를 메모리에서 삭제합니다. 만약 GAN 학습이나 다중 손실 함수 실험 등으로 동일한 그래프에 `.backward()`를 두 번 이상 호출해야 한다면 첫 번째 호출 시 `loss.backward(retain_graph=True)` 옵션을 명시해야 합니다.

---

## 5. 결론

PyTorch의 Autograd 메커니즘을 통해 확인한 핵심 설계 특성은 다음과 같습니다.

1. **연산 추적과 자동 미분의 분리**: 텐서에 `requires_grad=True`를 지정하는 것만으로 순전파 시 동적 계산 그래프(`grad_fn` 체인)가 자동 구성되며, `.backward()` 호출 한 번으로 연쇄 법칙 기반의 모든 리프 파라미터 기울기가 산출됩니다.
2. **제어 흐름의 유연성과 디버깅**: 실행 시점에 그래프가 만들어지는 Define-by-Run 구조 덕분에 Python 조건문과 반복문을 모델 내부에 그대로 사용할 수 있으며, 중간 텐서 값과 기울기(`retain_grad()`)를 즉시 검증할 수 있습니다.
3. **명시적인 상태 제어 필요성**: 기울기 누적(`zero_grad()`), 추론 시 그래프 차단(`no_grad()` / `inference_mode()`), 로깅 시 그래프 분리(`item()` / `detach()`)를 개발자가 명시적으로 제어해야 메모리 누수와 런타임 오류 없는 안정적인 학습 파이프라인을 유지할 수 있습니다.
