# Combine Subject의 동작 원리와 @Published 프로퍼티 래퍼 비교

Combine의 `Publisher`는 시스템이 제공하는 이벤트 소스(타이머, 네트워크, 알림 등)를 스트림으로 변환하는 역할을 수행합니다. 그러나 개발자가 임의의 시점에 명령형(Imperative) 코드로부터 직접 값을 주입해야 하는 상황이 존재합니다. `Subject`는 외부에서 `send(_:)` 메서드를 호출하여 값을 스트림에 밀어넣을 수 있는 Publisher입니다.

Combine은 `PassthroughSubject`와 `CurrentValueSubject` 두 가지 구체 타입을 제공하며, 유사한 역할을 수행하는 `@Published` 프로퍼티 래퍼와는 이벤트 방출 타이밍과 값 접근 방식에서 구조적 차이가 있습니다. 본 문서에서는 두 Subject의 동작 원리를 분석하고, SwiftUI의 `ObservableObject`와 연계하는 패턴에서 `@Published`와 `CurrentValueSubject`의 차이를 비교합니다.

---

## 1. 기술적 배경 및 문제 제기 (기존 방식의 한계점)

기존 Publisher(`Timer.publish`, `URLSession.dataTaskPublisher`, `NotificationCenter.publisher` 등)는 시스템 이벤트가 발생할 때 자동으로 값을 방출합니다. 그러나 사용자 버튼 입력이나 비즈니스 로직의 계산 결과처럼 **개발자가 직접 결정한 값을 스트림에 주입하는 시나리오**에서는 이러한 Publisher를 사용할 수 없습니다.

### 1.1 명령형 코드와 선언형 파이프라인 사이의 격차
사용자가 버튼을 누를 때마다 생성된 난수를 Combine 파이프라인으로 전달하려면, 명령형 이벤트 핸들러(IBAction, SwiftUI Button action)에서 선언형 스트림으로 값을 주입하는 연결 고리가 필요합니다. `Subject`는 이 격차를 메우는 브리지 역할을 수행합니다.

### 1.2 상태 보관 여부에 따른 구독 시점 문제
값을 주입하는 Subject가 현재 상태를 보관하지 않으면, 구독 이전에 `send`된 값은 소실됩니다. 반대로 상태를 보관하는 Subject는 새로운 구독자가 연결되는 즉시 마지막 값을 전달합니다. 사용 목적에 따라 적합한 Subject를 선택해야 합니다.

---

## 2. 핵심 개념 설명

### 2.1 Subject 프로토콜 사양

```swift
protocol Subject<Output, Failure> : AnyObject, Publisher {
    func send(_ value: Self.Output)
    func send(completion: Subscribers.Completion<Self.Failure>)
    func send(subscription: Subscription)
}
```

- `Subject`는 `Publisher`를 상속하면서 `AnyObject`를 준수하므로 반드시 클래스(참조 타입)로 구현됩니다.
- `send(_:)` 메서드를 통해 외부에서 값을 주입합니다.
- `send(completion:)`을 호출하면 `.finished` 또는 `.failure` 이벤트를 발생시켜 스트림을 종료합니다.

### 2.2 PassthroughSubject

```swift
final class PassthroughSubject<Output, Failure> where Failure : Error
```

- 초기값을 갖지 않으며, 가장 최근에 발행된 값의 버퍼도 보관하지 않습니다.
- 구독자가 없거나 현재 수요(Demand)가 0이면 `send`된 값은 소실(drop)됩니다.
- 이벤트의 발생 자체만을 전달하는 용도에 적합합니다.

### 2.3 CurrentValueSubject

```swift
final class CurrentValueSubject<Output, Failure> where Failure : Error
```

- 초기화 시 반드시 초기값을 전달받으며, 가장 최근에 발행된 값을 `value` 프로퍼티에 보관합니다.
- 새로운 구독자가 연결되면 현재 `value`를 즉시 방출합니다.
- `send(_:)`를 호출하면 `value` 프로퍼티도 함께 갱신됩니다. `value`에 직접 값을 할당하는 것과 `send(_:)`를 호출하는 것은 동일한 결과를 가집니다.

### 2.4 PassthroughSubject와 CurrentValueSubject 비교

| 구분 | `PassthroughSubject` | `CurrentValueSubject` |
| :--- | :--- | :--- |
| **초기값** | 없음 | 필수 (이니셜라이저 인자) |
| **값 보관** | 보관하지 않음 | `value` 프로퍼티에 최신 값 보관 |
| **구독 시 즉시 전달** | 전달 없음 | 현재 `value`를 즉시 방출 |
| **값 소실 조건** | 구독자 부재 또는 Demand 0 | 해당 없음 (`value`에 항상 보관) |
| **적합 용도** | 일회성 이벤트 전파 (버튼 탭, 알림) | 상태 관리 (점수, 카운터, 설정값) |

---

## 3. 코드 구현 및 라인별 상세 분석

### 3.1 PassthroughSubject를 통한 이벤트 전달

```swift
import Foundation
import Combine

// 1. PassthroughSubject 생성 (초기값 없음)
let eventSubject = PassthroughSubject<Int, URLError>()

// 2. 구독자 연결
let subscription = eventSubject
    .sink { completion in
        switch completion {
        case .finished:
            print("정상 완료")
        case .failure(let error):
            print("에러 발생: \(error)")
        }
    } receiveValue: { number in
        print("수신된 값: \(number)")
    }

// 3. 외부에서 값 주입
eventSubject.send(1)
eventSubject.send(2)

// 4. 스트림 종료
eventSubject.send(completion: .finished)

// 5. 종료 이후 send는 무시됨
eventSubject.send(3)

// 출력 결과:
// 수신된 값: 1
// 수신된 값: 2
// 정상 완료
```

#### 코드 분석
- **5번 라인**: `PassthroughSubject<Int, URLError>`로 생성합니다. 초기값이 없으므로 구독 직후 즉시 전달되는 값은 없습니다.
- **8~18번 라인**: `Failure`가 `URLError`이므로 `sink(receiveCompletion:receiveValue:)` 형태의 두 클로저를 모두 구현합니다.
- **21~22번 라인**: `send(_:)`를 호출할 때마다 구독자의 `receiveValue` 클로저가 실행됩니다.
- **25번 라인**: `send(completion: .finished)`를 호출하면 스트림이 종료됩니다.
- **28번 라인**: 종료 이후의 `send(3)`은 구독자에게 전달되지 않습니다. Combine 스트림은 completion 이벤트를 수신한 후 추가 값을 처리하지 않습니다.

---

### 3.2 CurrentValueSubject를 통한 상태 관리

```swift
import Foundation
import Combine

// 1. 초기값 0으로 CurrentValueSubject 생성
let scoreSubject = CurrentValueSubject<Int, Never>(0)

// 2. 구독 즉시 현재 value(0)를 수신
let subscription = scoreSubject
    .sink { value in
        print("현재 점수: \(value)")
    }

// 3. 값 주입 (value 프로퍼티도 동시에 갱신)
scoreSubject.send(10)
scoreSubject.send(25)

// 4. value 프로퍼티를 통해 현재 상태를 동기적으로 조회
print("저장된 점수: \(scoreSubject.value)")

// 출력 결과:
// 현재 점수: 0
// 현재 점수: 10
// 현재 점수: 25
// 저장된 점수: 25
```

#### 코드 분석
- **5번 라인**: `CurrentValueSubject<Int, Never>(0)`으로 생성합니다. 초기값 `0`이 `value` 프로퍼티에 저장됩니다.
- **8~11번 라인**: `Failure`가 `Never`이므로 `sink(receiveValue:)` 축약형을 사용합니다. 구독 즉시 현재 `value`인 `0`이 방출됩니다.
- **14~15번 라인**: `send(10)` 호출 시 구독자에게 값이 전달되고 `scoreSubject.value`도 `10`으로 갱신됩니다.
- **18번 라인**: `value` 프로퍼티를 통해 구독 없이도 현재 상태를 동기적으로 읽을 수 있습니다. `PassthroughSubject`에는 이 프로퍼티가 존재하지 않습니다.

---

### 3.3 @Published와 CurrentValueSubject의 동작 차이 비교

```swift
import Foundation
import Combine

// 1. @Published 프로퍼티 래퍼 사용
class PublishedCounter {
    @Published var count = 0
}

// 2. CurrentValueSubject 사용
class SubjectCounter {
    var count = CurrentValueSubject<Int, Never>(0)
}

// --- @Published 동작 ---
let publishedCounter = PublishedCounter()

let pubSubscription = publishedCounter.$count
    .sink { value in
        print("Published 수신: \(value)")
    }

publishedCounter.count = 1
publishedCounter.count = 2

// 출력 결과:
// Published 수신: 0   (초기값 즉시 방출)
// Published 수신: 1
// Published 수신: 2

// --- CurrentValueSubject 동작 ---
let subjectCounter = SubjectCounter()

let subSubscription = subjectCounter.count
    .sink { value in
        print("Subject 수신: \(value)")
    }

subjectCounter.count.send(1)
subjectCounter.count.send(2)

// 출력 결과:
// Subject 수신: 0   (초기값 즉시 방출)
// Subject 수신: 1
// Subject 수신: 2
```

#### 코드 분석

두 방식 모두 초기값을 즉시 방출하고 값 변경 시 구독자에게 전달하는 동작은 동일합니다. 핵심적인 차이는 다음과 같습니다.

| 구분 | `@Published` | `CurrentValueSubject` |
| :--- | :--- | :--- |
| **이벤트 방출 시점** | `willSet` (프로퍼티 갱신 직전) | `send(_:)` 호출 즉시 (갱신 완료 후) |
| **값 할당 문법** | `counter.count = 1` (프로퍼티 할당) | `counter.count.send(1)` (메서드 호출) |
| **현재 값 접근** | `counter.count` (프로퍼티 직접 접근) | `counter.count.value` (.value 프로퍼티) |
| **선언 위치 제약** | 클래스 내부에서만 선언 가능 | 제약 없음 (구조체, 전역 변수 등 사용 가능) |
| **Failure 타입** | `Never` 고정 | 임의의 `Error` 타입 지정 가능 |
| **completion 전송** | 불가 | `send(completion:)` 호출 가능 |

`@Published`는 `willSet` 시점에 이벤트를 방출하므로, `sink` 클로저 내부에서 해당 인스턴스의 프로퍼티를 직접 참조하면 갱신 이전의 구값이 조회됩니다. `CurrentValueSubject`는 `send(_:)` 호출과 동시에 `value` 프로퍼티가 갱신되므로 이 시점 차이가 없습니다.

---

### 3.4 SwiftUI ObservableObject에서의 활용 패턴

```swift
import SwiftUI
import Combine

// 1. @Published를 활용한 ViewModel
class PublishedViewModel: ObservableObject {
    @Published var count = 0
}

// 2. CurrentValueSubject를 활용한 ViewModel
class SubjectViewModel: ObservableObject {
    var count = CurrentValueSubject<Int, Never>(0)
}

// --- @Published 기반 뷰 ---
struct PublishedCounterView: View {
    @ObservedObject var viewModel = PublishedViewModel()

    var body: some View {
        VStack {
            Text("Count: \(viewModel.count)")
            Button("증가") {
                viewModel.count += 1
            }
        }
    }
}

// --- CurrentValueSubject 기반 뷰 ---
struct SubjectCounterView: View {
    @ObservedObject var viewModel = SubjectViewModel()

    var body: some View {
        VStack {
            Text("Count: \(viewModel.count.value)")
            Button("증가") {
                viewModel.count.send(viewModel.count.value + 1)
            }
        }
    }
}
```

#### 코드 분석
- **6번 라인**: `@Published var count`는 `ObservableObject`의 `objectWillChange` Publisher와 자동으로 연동됩니다. `count`가 변경되면 SwiftUI가 뷰를 다시 렌더링합니다.
- **11번 라인**: `CurrentValueSubject`를 사용할 경우, `@Published`가 아니므로 `objectWillChange`와 자동 연동되지 않습니다. `count.send(_:)` 호출만으로는 SwiftUI 뷰가 갱신되지 않습니다. 뷰를 갱신하려면 `objectWillChange.send()`를 수동으로 호출하거나, `count`를 구독하여 별도의 `@Published` 프로퍼티에 값을 전달해야 합니다.
- **21~23번 라인**: `@Published` 기반에서는 `viewModel.count += 1`로 프로퍼티를 직접 수정합니다. 자연스러운 Swift 문법으로 동작합니다.
- **35~37번 라인**: `CurrentValueSubject` 기반에서는 `viewModel.count.send(viewModel.count.value + 1)`로 값을 갱신합니다. 프로퍼티 할당이 아닌 메서드 호출 방식이므로 코드 가독성이 상대적으로 낮아집니다.

---

## 4. 적용 시 고려해야 할 점 (주의사항 및 예외 처리)

### 4.1 completion 이후 send 무시
`PassthroughSubject`와 `CurrentValueSubject` 모두 `send(completion:)`이 호출된 이후에는 `send(_:)`를 호출해도 구독자에게 값이 전달되지 않습니다. 스트림이 종료된 Subject를 재사용하려면 새로운 인스턴스를 생성해야 합니다.

### 4.2 PassthroughSubject의 값 소실 조건
공식 문서에 따르면, `PassthroughSubject`는 구독자가 없거나 현재 수요(Demand)가 0인 경우 `send`된 값을 소실(drop)합니다. 따라서 구독이 완료되기 전에 값을 전송하면 해당 값은 복구할 수 없습니다. 초기값이나 마지막 상태가 필요한 시나리오에서는 `CurrentValueSubject`를 사용해야 합니다.

### 4.3 SwiftUI에서 @Published 우선 사용 원칙
SwiftUI의 `ObservableObject`와 연동할 때는 `@Published`를 우선적으로 사용해야 합니다. `@Published`는 `objectWillChange` Publisher와 자동으로 연동되어 프로퍼티 변경 시 뷰를 재렌더링합니다. `CurrentValueSubject`를 사용할 경우 이 자동 연동이 동작하지 않으므로 수동으로 뷰 갱신을 트리거해야 합니다.

### 4.4 @Published의 willSet 타이밍 주의
`@Published`는 `willSet` 시점에 이벤트를 방출합니다. `sink` 클로저 내부에서 인스턴스의 프로퍼티를 직접 읽으면 갱신 이전 값이 반환됩니다. 클로저의 파라미터로 전달받은 새 값을 사용해야 합니다.

```swift
let counter = PublishedCounter()

counter.$count
    .sink { newValue in
        // newValue: 갱신될 새 값 (정확)
        // counter.count: 아직 갱신되지 않은 이전 값 (부정확)
        print("파라미터 값: \(newValue), 프로퍼티 값: \(counter.count)")
    }

counter.count = 10
// 출력: 파라미터 값: 10, 프로퍼티 값: 0
```

---

## 5. 결론

Combine의 `Subject`는 명령형 코드에서 선언형 스트림으로 값을 주입하는 브리지 역할을 수행합니다.

1. **`PassthroughSubject`**: 값을 보관하지 않으며 이벤트 발생 시점의 전파만 담당합니다. 버튼 탭, 사용자 제스처 등 일회성 이벤트 전달에 적합합니다.
2. **`CurrentValueSubject`**: 현재 상태를 `value` 프로퍼티에 보관하고 새 구독자에게 즉시 전달합니다. 점수, 카운터, 설정값 등 상태 관리에 적합합니다.
3. **SwiftUI 연동 시 `@Published` 우선 사용**: `ObservableObject`와 자동 연동되는 `@Published`를 기본으로 사용하고, Combine 파이프라인의 세밀한 제어(에러 처리, completion 전송, 외부 모듈 연동)가 필요한 경우에 한해 `CurrentValueSubject`를 선택합니다.
