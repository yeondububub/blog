# Swift Combine 기본 구조 분석과 비동기 처리의 선언형 전환

iOS 애플리케이션 개발에서 비동기 데이터 처리는 UI 반응성 유지와 시스템 자원의 효율적 활용을 위해 필수적입니다. Swift 5.1 및 iOS 13에서 도입된 Combine 프레임워크는 시간에 따라 발생하는 값들을 선언형(Declarative)으로 처리할 수 있는 통합 이벤트 스트림 시스템을 제공합니다.

기존의 iOS 비동기 처리는 클로저(Completion Handler), Delegate, NotificationCenter, KVO 등 서로 다른 도구가 파편화되어 사용되었습니다. 본 문서에서는 기존 비동기 처리 방식의 구조적 한계를 분석하고, Combine의 3대 핵심 구성 요소(Publisher, Operator, Subscriber)와 구독 생명주기를 기반으로 기존 명령형 비동기 코드를 선언형 데이터 스트림으로 전환하는 구조를 설명합니다.

---

## 1. 기술적 배경 및 문제 제기 (기존 비동기 방식의 한계점)

전통적인 iOS 개발 환경에서는 작업의 성격과 데이터 전달 방식에 따라 서로 다른 비동기 API가 혼재되어 사용되었습니다.

### 1.1 비동기 인터페이스의 파편화와 조합성 부재
단일 비즈니스 로직에서 여러 비동기 소스를 함께 다룰 때 인터페이스 간의 결합이 어려워집니다. 예를 들어 사용자 입력을 수신하고(Target-Action), 일정 시간 타이핑 지연을 두고(GCD Timer), 네트워크 요청을 수행한 뒤(Completion Handler), 결과를 UI에 반영(DispatchQueue.main)하는 과정에서 각기 다른 4가지 비동기 패턴의 생명주기를 수동으로 동기화해야 합니다.

### 1.2 콜백 지옥(Callback Hell)과 옵셔널 삼중 분기
`URLSession.dataTask(with:completionHandler:)`는 `(Data?, URLResponse?, Error?)` 형태의 세 가지 옵셔널 파라미터를 반환합니다. 이론적으로 8가지 상태 조합이 발생하므로 모든 분기에서 방어적 언래핑을 수행해야 합니다. 중첩된 콜백 구조에서 특정 분기의 `return` 시점에 `completion` 클로저 호출을 누락하면, 호출부는 작업 완료 여부를 알지 못한 채 영구 대기 상태에 빠집니다.

### 1.3 명령형 스레드 전환 코드의 강한 결합
백그라운드 스레드에서 수신한 데이터를 UI에 반영하기 위해 비즈니스 로직 내부 곳곳에 `DispatchQueue.main.async`를 호출해야 합니다. 스레드 전환 코드가 데이터 변환 및 가공 로직과 뒤섞이면서 코드 가독성과 응집도가 저하됩니다.

---

## 2. 핵심 개념 설명

Combine은 모든 비동기 이벤트를 시간 축에 따라 순차적으로 방출되는 **데이터 스트림(Data Stream)으로** 추상화합니다.

```mermaid
flowchart LR
    Pub["Publisher<br/>(생산자: 이벤트 발행)"] -- "Output: Data<br/>Failure: Error" --> Op["Operator Chain<br/>(가공: map -> decode -> receive)"]
    Op -- "Output: Transformed<br/>Failure: Error" --> Sub["Subscriber<br/>(소비자: 최종 소비 및 UI 반영)"]
```

### 2.1 Combine의 3대 핵심 구성 요소

1. **Publisher (발행자)**:
   - 시간에 따라 하나 이상의 값을 방출할 수 있는 프로토콜입니다.
   - 방출할 데이터 타입(`Output`)과 실패 시 전달할 에러 타입(`Failure`)을 제네릭으로 명시합니다.
   ```swift
   public protocol Publisher<Output, Failure> {
       associatedtype Output
       associatedtype Failure : Error
       func receive<S>(subscriber: S) where S : Subscriber, Self.Failure == S.Failure, Self.Output == S.Input
   }
   ```

2. **Operator (연산자)**:
   - 업스트림(Upstream) Publisher로부터 전달받은 데이터를 가공, 필터링, 변환하여 다운스트림(Downstream)으로 전달하는 중간 처리자입니다.
   - `map`, `filter`, `decode`, `receive(on:)`, `eraseToAnyPublisher` 등이 이에 해당합니다.

3. **Subscriber (구독자)**:
   - Publisher가 방출한 데이터와 완료(정상 종료 또는 에러) 이벤트를 수신하여 최종적으로 소비하는 프로토콜입니다.
   - 대표적으로 클로저 기반의 `sink`와 객체 프로퍼티에 값을 직접 할당하는 `assign`이 사용됩니다.
   ```swift
   public protocol Subscriber<Input, Failure> : CustomCombineIdentifierConvertible {
       associatedtype Input
       associatedtype Failure : Error
       func receive(subscription: Subscription)
       func receive(_ input: Self.Input) -> Subscribers.Demand
       func receive(completion: Subscribers.Completion<Self.Failure>)
   }
   ```

---

### 2.2 5단계 구독 생명주기 (Subscription Lifecycle)

Combine의 동작 원리는 생산자가 일방적으로 데이터를 밀어내는 Push 방식이 아니라, 구독자의 수요 요청에 반응하는 Pull-Push 하이브리드 프로토콜로 구현됩니다.


1. **구독 요청 (`subscribe`)**: Subscriber가 Publisher에게 구독을 요청합니다.
2. **구독 객체 수신 (`receive(subscription:)`)**: Publisher는 연결 통로인 `Subscription` 인스턴스를 생성하여 Subscriber에게 전달합니다.
3. **수요 요청 (`request(_:)`)**: Subscriber는 자신이 처리할 수 있는 데이터의 양(`Subscribers.Demand`)을 Subscription에 요청합니다. 이를 통해 역압(Backpressure)을 제어합니다.
4. **데이터 방출 (`receive(_:)`)**: Publisher는 Subscriber가 요청한 수량 범위 내에서 데이터를 전달합니다.
5. **종료 이벤트 (`receive(completion:)`)**: 작업이 정상 완료(`.finished`)되거나 에러가 발생(`.failure(Error)`)하면 스트림이 종료되며 이후 추가 데이터는 발행되지 않습니다.

---

### 2.3 기존 비동기 방식과 Combine의 구조적 차이점

| 비교 항목 | 기존 비동기 방식 (Legacy) | Combine 프레임워크 |
| :--- | :--- | :--- |
| **인터페이스 통합성** | Closure, Delegate, Notification, KVO 등 파편화 | `Publisher<Output, Failure>` 단일 인터페이스 |
| **이벤트 처리 모델** | 명령형(Imperative) 분기 처리 | 함수형 선언형(Declarative) 파이프라인 |
| **조합성 (Composability)** | 중첩 콜백 구조(Callback Hell) 발생 | 연산자 체이닝 (`map`, `decode`, `flatMap` 등) |
| **스레드 제어** | `DispatchQueue.main.async` 직접 호출 분산 | `receive(on:)`, `subscribe(on:)` 선언적 지정 |
| **취소 및 리소스 해제** | 객체별 취소 메서드(`task.cancel()`) 수동 호출 | `AnyCancellable`을 통한 생명주기 자동 관리 |
| **데이터 흐름 제어** | 생산자 중심 일방적 Push 방식 | 수요 기반 Pull-Push 혼합 (Backpressure 지원) |

---

## 3. 코드 구현 및 라인별 상세 분석

네트워크 API로부터 JSON 데이터를 가져와 디코딩한 뒤 메인 스레드에 출력하는 동일한 작업을 두 가지 방식으로 구현하여 비교합니다.

### 3.1 기존 Completion Handler 기반 구현

```swift
import Foundation

// 1. 디코딩 대상 데이터 모델 정의
struct Post: Decodable {
    let id: Int
    let title: String
    let body: String
}

// 2. 콜백 기반 네트워크 요청 함수 정의
func fetchPostLegacy(id: Int, completion: @escaping (Result<Post, Error>) -> Void) {
    guard let url = URL(string: "https://jsonplaceholder.typicode.com/posts/\(id)") else {
        let urlError = NSError(domain: "URLError", code: -1, userInfo: [NSLocalizedDescriptionKey: "유효하지 않은 URL입니다."])
        completion(.failure(urlError))
        return
    }

    // 3. DataTask 생성 및 콜백 분기 처리
    let task = URLSession.shared.dataTask(with: url) { data, response, error in
        // 에러 우선 검증
        if let error = error {
            completion(.failure(error))
            return
        }

        // 응답 데이터 존재 여부 검증
        guard let data = data else {
            let noDataError = NSError(domain: "DataError", code: -2, userInfo: [NSLocalizedDescriptionKey: "응답 데이터가 비어 있습니다."])
            completion(.failure(noDataError))
            return
        }

        // JSON 디코딩 시도
        do {
            let post = try JSONDecoder().decode(Post.self, from: data)
            completion(.success(post))
        } catch {
            completion(.failure(error))
        }
    }

    // 4. 네트워크 작업 시작
    task.resume()
}

// 5. 함수 호출 및 메인 스레드 전환 처리
fetchPostLegacy(id: 1) { result in
    DispatchQueue.main.async {
        switch result {
        case .success(let post):
            print("데이터 수신 성공: \(post.title)")
        case .failure(let error):
            print("데이터 수신 실패: \(error.localizedDescription)")
        }
    }
}
```

#### 코드 분석
- **18~42번 라인**: `data`, `response`, `error`의 3가지 옵셔널 상태를 일일이 if-let 및 guard-let으로 분기 처리해야 하며, 모든 분기에서 `completion` 호출 및 `return` 누락을 방지해야 합니다.
- **48~57번 라인**: 결과를 전달받는 호출부에서 UI 갱신을 위해 `DispatchQueue.main.async` 블록을 수동으로 호출해야 합니다.

---

### 3.2 Combine 기반 선언형 데이터 스트림 구현

```swift
import Foundation
import Combine

// 1. 디코딩 대상 데이터 모델 정의
struct Post: Decodable {
    let id: Int
    let title: String
    let body: String
}

// 2. AnyPublisher를 반환하는 선언형 네트워크 함수 정의
func fetchPostPublisher(id: Int) -> AnyPublisher<Post, Error> {
    let url = URL(string: "https://jsonplaceholder.typicode.com/posts/\(id)")!

    return URLSession.shared.dataTaskPublisher(for: url)
        // 3. (data: Data, response: URLResponse) 튜플에서 data 추출
        .map(\.data)
        // 4. Data를 Post 모델 타입으로 디코딩
        .decode(type: Post.self, decoder: JSONDecoder())
        // 5. 다운스트림 수신 스레드를 Main으로 전환
        .receive(on: DispatchQueue.main)
        // 6. 구체적인 중첩 제네릭 타입을 AnyPublisher로 추상화
        .eraseToAnyPublisher()
}

// 7. 구독 객체(Subscription)의 수명주기를 관리하는 컨테이너
var cancellables = Set<AnyCancellable>()

// 8. 파이프라인 구독 및 데이터 소비
fetchPostPublisher(id: 1)
    .sink { completion in
        switch completion {
        case .finished:
            print("스트림 정상 완료")
        case .failure(let error):
            print("스트림 에러 종료: \(error.localizedDescription)")
        }
    } receiveValue: { post in
        print("데이터 수신 성공: \(post.title)")
    }
    // 9. 구독 토큰을 Set에 보관하여 메모리 해제 방지
    .store(in: &cancellables)
```

#### 라인별 상세 분석
- **14번 라인 (`dataTaskPublisher(for:)`)**: `URLSession`의 Combine 확장 메서드로, 네트워크 통신 결과를 `(data: Data, response: URLResponse)` 튜플 형태로 방출하는 Publisher를 생성합니다.
- **16번 라인 (`map(\.data)`)**: KeyPath 문법을 사용하여 응답 메타데이터를 제외하고 순수 페이로드인 `Data`만을 추출하여 다운스트림으로 넘깁니다.
- **18번 라인 (`decode(type:decoder:)`)**: 내부적으로 `JSONDecoder`를 실행하여 바이트 데이터를 `Post` 구조체로 변환합니다. 변환 실패 시 `DecodingError`를 발생시키며 즉시 에러 채널로 분기합니다.
- **20번 라인 (`receive(on:)`)**: 이 연산자 이후에 위치한 모든 연산자와 최종 `Subscriber`의 클로저 실행을 `DispatchQueue.main` 스레드에서 동작하도록 보장합니다.
- **22번 라인 (`eraseToAnyPublisher()`)**: 복잡하게 중첩된 구체 제네릭 타입을 숨기고 `AnyPublisher<Post, Error>` 형태의 단일 인터페이스로 추상화(Type Erasure)합니다.
- **29~39번 라인 (`sink`)**: `Subscriber`를 생성하여 파이프라인에 연결합니다. 에러 및 완료 이벤트는 `receiveCompletion`에서, 정상 결과는 `receiveValue`에서 분리하여 수신합니다.
- **41번 라인 (`store(in:)`)**: `sink`가 반환하는 `AnyCancellable` 토큰을 `cancellables` 컬렉션에 저장합니다. 이 토큰이 유지되는 동안 비동기 작업이 활성 상태를 유지합니다.

---

## 4. 적용 시 고려해야 할 점 (주의사항 및 예외 처리)

### 4.1 `AnyCancellable`의 수명주기 관리
`sink` 연산자가 반환하는 `AnyCancellable` 객체는 참조 카운트가 0이 되는 즉시 메모리에서 해제(`deinit`)되며 내부 구독을 자동으로 취소합니다. 함수 내부의 로컬 변수에 할당하지 않고 상위 클래스 인스턴스의 프로퍼티(`var cancellables = Set<AnyCancellable>()`)에 `.store(in: &cancellables)`로 저장해야 비동기 응답이 도착할 때까지 스트림이 유지됩니다.

### 4.2 에러 발생 시 스트림 조기 종료 방지
Combine의 Publisher는 한 번 `.failure` 이벤트를 방출하면 파이프라인 전체가 영구 종료됩니다. 지속적으로 이벤트를 처리해야 하는 스트림(예: UI 검색어 입력 파이프라인) 내부에서 네트워크 요청이 실패했을 때 전체 스트림이 중단되지 않도록 `catch`나 `replaceError` 연산자를 배치하여 에러를 격리해야 합니다.

```swift
// 에러 발생 시 스트림 중단 없이 기본값으로 복구하는 패턴
fetchPostPublisher(id: 999)
    .replaceError(with: Post(id: 0, title: "기본 제목", body: "내용 없음"))
    .sink { post in
        print("결과 처리: \(post.title)")
    }
    .store(in: &cancellables)
```

### 4.3 클로저 내부 순환 참조(Retain Cycle) 방지
`sink`의 `receiveValue` 클로저 내부에서 `self`의 메서드나 프로퍼티를 직접 참조할 경우 `self -> cancellables -> AnyCancellable -> sink closure -> self` 형태의 강한 참조 순환이 발생합니다. 클로저 선언부에 `[weak self]`를 명시하여 뷰 컨트롤러나 ViewModel이 정상적으로 메모리에서 해제되도록 설계해야 합니다.

```swift
.sink { [weak self] post in
    self?.updateUI(with: post)
}
.store(in: &cancellables)
```

---

## 5. 결론 (해당 기술의 기대효과 요약)

Combine 프레임워크를 도입함으로써 기존 iOS 비동기 처리의 구조적 한계를 다음과 같이 개선할 수 있습니다.

1. **비동기 인터페이스의 표준화**: 파편화되어 있던 Closure, Delegate, Notification 등의 비동기 소스를 `Publisher` 단일 추상화로 통합하여 코드베이스의 일관성을 확보합니다.
2. **높은 가독성과 조합성**: 데이터 가공, 디코딩, 스레드 전환을 선언형 체인으로 연결하여 비즈니스 로직의 흐름을 직관적으로 파악할 수 있습니다.
3. **타입 안전성 보장**: `Output`과 `Failure` 타입이 컴파일 시점에 검증되므로 옵셔널 언래핑 실수에 의한 런타임 오류를 방지합니다.
4. **일관된 리소스 생명주기 제어**: `AnyCancellable`을 통해 화면 전환 및 객체 소멸 시 잔존 비동기 작업을 자동으로 취소하여 메모리 누수를 방지합니다.