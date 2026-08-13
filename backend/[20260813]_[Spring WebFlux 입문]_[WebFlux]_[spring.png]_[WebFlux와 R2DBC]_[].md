# Spring WebFlux 입문 — 결제 서비스로 배우는 리액티브 프로그래밍

## 1. 왜 WebFlux인가?

Spring MVC를 써봤다면 이런 코드에 익숙할 것입니다.

```java
// Spring MVC 방식 (Blocking)
@PostMapping("/confirm")
public ResponseEntity<Result> confirm(@RequestBody Request req) {
    Result result = paymentService.confirm(req); // 여기서 스레드가 블로킹됨
    return ResponseEntity.ok(result);
}
```

이 코드에서 `paymentService.confirm(req)` 가 실행되는 동안, 해당 **스레드는 그냥 대기**합니다. DB 쿼리를 날리고 응답을 기다리는 동안, 외부 PG사 API를 호출하고 응답을 기다리는 동안 — 스레드는 아무것도 하지 않습니다.

이를 **Blocking I/O** 라고 합니다.

Spring MVC는 이 문제를 **스레드를 늘리는 방식**으로 해결합니다. 요청이 100개 동시에 들어오면 스레드도 100개를 만드는 식이죠. 하지만 스레드는 비싼 자원입니다. 각 스레드는 스택 메모리를 수백 KB씩 차지하며, 컨텍스트 스위칭 비용도 발생합니다.

### Non-Blocking I/O

```kotlin
// Spring WebFlux 방식 (Non-Blocking)
@PostMapping("/confirm")
fun confirm(@RequestBody request: TossPaymentConfirmRequest): Mono<ResponseEntity<ApiResponse<PaymentConfirmationResult>>> {
    val command = PaymentConfirmCommand(...)
    return paymentConfirmUseCase.confirm(command)
        .map { ResponseEntity.ok().body(ApiResponse.with(HttpStatus.OK, "", it)) }
}
```

WebFlux에서는 스레드가 블로킹되지 않습니다. DB 쿼리나 외부 API 호출을 *"나중에 결과가 오면 이걸 해줘"* 라는 식으로 **선언적으로** 등록해두고, 스레드는 다른 요청을 처리하러 갑니다.

이 덕분에 **소수의 스레드로 엄청난 수의 동시 요청**을 처리할 수 있습니다. 이것이 결제 서비스처럼 외부 PG사 API 호출이 많고 대기 시간이 긴 서비스에서 WebFlux가 빛을 발하는 이유입니다.


## 2. Publisher의 두 종류 — Mono와 Flux

리액티브 프로그래밍의 핵심은 **Publisher** 개념입니다. Publisher는 "나중에 데이터를 발행하겠다"는 약속입니다.

Project Reactor(WebFlux의 기반 라이브러리)에는 두 가지 Publisher가 있습니다.

| | Mono | Flux |
|---|---|---|
| 발행 데이터 수 | 0개 또는 1개 | 0개 ~ N개 |
| 사용 예 | 단건 조회, 저장 결과 | 목록 조회, 스트림 |
| 비유 | `Optional` / `CompletableFuture` | `Stream` / `List` |

```kotlin
// Mono 예시 — 결제 확인 결과 (항상 단건)
fun confirm(command: PaymentConfirmCommand): Mono<PaymentConfirmationResult>

// Flux 예시 — 미처리 결제 목록 조회 (여러 건)
fun getPendingPayments(): Flux<PendingPaymentEvent>
```

> **중요**: `Mono`와 `Flux`는 선언만 해도 아무 일도 일어나지 않습니다. **subscribe()** 가 호출될 때 비로소 실행됩니다. 이를 **Cold Stream** 이라고 합니다.


## 3. 리액티브 연산자 실전

가장 중요한 내용입니다. 실제 결제 확인 서비스 코드를 보면서 핵심 연산자들을 이해해 봅시다.

```kotlin
// PaymentConfirmService.kt
override fun confirm(command: PaymentConfirmCommand): Mono<PaymentConfirmationResult> {
    return paymentStatusUpdatePort.updatePaymentStatusToExecuting(command.orderId, command.paymentKey)
        .filterWhen { paymentValidationPort.isValid(command.orderId, command.amount) }
        .flatMap { paymentExecutorPort.execute(command) }
        .flatMap {
            paymentStatusUpdatePort.updatePaymentStatus(
                command = PaymentStatusUpdateCommand(...)
            ).thenReturn(it)
        }
        .map { PaymentConfirmationResult(status = it.paymentStatus(), failure = it.failure) }
        .onErrorResume { paymentErrorHandler.handlePaymentConfirmationError(it, command) }
}
```

이 코드 한 줄 한 줄을 뜯어봅시다.

### `flatMap` — 비동기 연산 체이닝

가장 많이 쓰이는 연산자입니다. `map`과의 차이가 핵심입니다.

```kotlin
// map: 동기 변환 (결과가 일반 값)
.map { result -> PaymentConfirmationResult(status = result.paymentStatus()) }

// flatMap: 비동기 변환 (결과가 또 다른 Mono/Flux)
.flatMap { paymentExecutorPort.execute(command) }
//         └── 이 메서드가 Mono<TossPaymentResponse>를 반환함
```

`flatMap`은 내부에서 새로운 `Mono`를 반환할 때 사용합니다. 만약 `map`으로 `Mono`를 반환하면 `Mono<Mono<T>>`가 되어버립니다. `flatMap`은 이를 자동으로 **평탄화(flatten)** 해줍니다.

### `filterWhen` — 비동기 조건 필터링

```kotlin
.filterWhen { paymentValidationPort.isValid(command.orderId, command.amount) }
```

`filter`는 `Boolean`을 반환하는 동기 조건에 사용하지만, `filterWhen`은 `Mono<Boolean>`을 반환하는 **비동기 조건**에 사용합니다. DB에서 결제 금액 유효성을 확인해야 하므로 여기선 `filterWhen`이 맞습니다.

조건이 `false`면 스트림이 조용히 **완료(complete)** 됩니다.

### `thenReturn` — 결과를 다른 값으로 교체

```kotlin
.flatMap { 
    paymentStatusUpdatePort.updatePaymentStatus(command = ...).thenReturn(it) 
}
```

`updatePaymentStatus()`의 반환값은 `Mono<Boolean>`이지만, 이전 단계의 `it` (결제 실행 결과)을 계속 흘려보내야 합니다. `.thenReturn(it)`은 "업데이트가 끝나면, 결과 대신 `it`을 흘려보내"라는 의미입니다.


## 4. R2DBC — 비동기 DB 접근

JDBC는 블로킹입니다. WebFlux의 논블로킹 이점을 살리려면 DB 접근도 논블로킹이어야 합니다. **R2DBC(Reactive Relational Database Connectivity)** 가 그 역할을 합니다.

```kotlin
// R2DBCPaymentRepository.kt
@Repository
class R2DBCPaymentRepository(
    private val databaseClient: DatabaseClient,
    private val transactionalOperator: TransactionalOperator
) : PaymentRepository {

    override fun getPendingPayments(): Flux<PendingPaymentEvent> {
        return databaseClient.sql(SELECT_PENDING_PAYMENT_QUERY)
            .bind("updatedAt", LocalDateTime.now().format(MySQLDateTimeFormatter))
            .fetch()
            .all()                          // Flux<Map<String, Any>>로 행(row)을 스트림으로 받음
            .groupBy { it["payment_event_id"] as Long }  // payment_event_id로 그룹핑
            .flatMap { groupedFlux ->
                groupedFlux.collectList().map { results ->
                    PendingPaymentEvent(    // 그룹별로 도메인 객체로 변환
                        paymentEventId = groupedFlux.key(),
                        ...
                    )
                }
            }
    }
}
```

### JDBC vs R2DBC 핵심 차이

| | JDBC | R2DBC |
|---|---|---|
| I/O 방식 | Blocking | Non-Blocking |
| 반환 타입 | `List<T>`, `T` | `Flux<T>`, `Mono<T>` |
| 스레드 | 결과 올 때까지 대기 | 결과 오면 콜백 실행 |
| 트랜잭션 | `@Transactional` | `TransactionalOperator` |

### `.fetch().all()` vs `.fetch().first()`

```kotlin
// 여러 행을 Flux로 스트리밍
databaseClient.sql(query).fetch().all()    // Flux<Map<String, Any>>

// 첫 번째 행만 Mono로
databaseClient.sql(query).fetch().first()  // Mono<Map<String, Any>>

// 업데이트/삽입된 행 수
databaseClient.sql(query).fetch().rowsUpdated()  // Mono<Long>
```


## 5. 리액티브 트랜잭션 처리

Spring MVC에서 익숙한 `@Transactional`은 **스레드-로컬(ThreadLocal)** 기반입니다. WebFlux에서는 요청이 여러 스레드를 넘나들기 때문에 이 방식이 동작하지 않습니다.

대신 **`TransactionalOperator`** 를 사용합니다.

```kotlin
// R2DBCPaymentStatusUpdateRepository.kt
override fun updatePaymentStatusToExecuting(orderId: String, paymentKey: String): Mono<Boolean> {
    return checkPreviousPaymentOrderStatus(orderId)
        .flatMap { insertPaymentHistory(it, PaymentStatus.EXECUTING, "PAYMENT_CONFIRMATION_START") }
        .flatMap { updatePaymentOrderStatus(orderId, PaymentStatus.EXECUTING) }
        .flatMap { updatePaymentKey(orderId, paymentKey) }
        .`as`(transactionalOperator::transactional)  // ← 여기서 트랜잭션 적용
        .thenReturn(true)
}
```

`.as(transactionalOperator::transactional)` 한 줄로 위의 모든 비동기 DB 작업을 **하나의 트랜잭션**으로 묶습니다. 중간에 에러가 나면 자동으로 롤백됩니다.

> 참고로 Spring WebFlux 5.2+부터는 R2DBC와 함께 `@Transactional`을 사용할 수 있습니다. 내부적으로 Reactor Context를 통해 트랜잭션 컨텍스트를 전파합니다. 하지만 동작 원리를 이해하기 위해 `TransactionalOperator`를 직접 다뤄보는 것을 추천합니다.


## 6. Sinks — 리액티브 이벤트 브릿지

`Sinks`는 **명령형 코드와 리액티브 스트림을 연결**하는 브릿지입니다. 쉽게 말하면, "일반 코드에서 리액티브 스트림에 데이터를 밀어 넣는" 도구입니다.

결제 서비스에서 Kafka로 이벤트를 보내는 코드를 보겠습니다.

```kotlin
// PaymentEventMessageSender.kt
class PaymentEventMessageSender : DispatchEventMessagePort {

    // Sinks 생성 — 메시지를 담을 "파이프"
    private val sender = Sinks.many().unicast().onBackpressureBuffer<Message<PaymentEventMessage>>()
    private val sendResult = Sinks.many().unicast().onBackpressureBuffer<SenderResult<String>>()

    // Kafka로 흘려보낼 Flux를 Bean으로 등록
    @Bean
    fun send(): Supplier<Flux<Message<PaymentEventMessage>>> {
        return Supplier { sender.asFlux() }
    }

    // 트랜잭션 커밋 후에 Sink에 데이터를 밀어넣음
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun dispatchAfterCommit(paymentEventMessage: PaymentEventMessage) {
        dispatch(paymentEventMessage)
    }

    override fun dispatch(paymentEventMessage: PaymentEventMessage) {
        sender.emitNext(
            createEventMessage(paymentEventMessage), 
            Sinks.EmitFailureHandler.FAIL_FAST
        )
    }
}
```

### Sinks의 종류

```kotlin
// unicast: 구독자가 단 1명인 파이프
Sinks.many().unicast().onBackpressureBuffer()

// multicast: 여러 구독자에게 브로드캐스트
Sinks.many().multicast().onBackpressureBuffer()

// replay: 새 구독자에게도 과거 데이터를 재전송
Sinks.many().replay().limit(10)
```

이 코드에서 `AFTER_COMMIT` 이 중요합니다. DB 트랜잭션이 **커밋된 이후에** Kafka 이벤트를 발행하므로, DB에는 저장됐지만 Kafka 전송은 실패한 경우를 처리하기 위한 **Outbox 패턴**을 함께 사용하고 있습니다.


## 7. Schedulers — 스레드 모델 이해하기

WebFlux는 기본적으로 **Netty**의 이벤트 루프 스레드(소수)로 동작합니다. 연산자 체인은 기본적으로 subscribe가 발생한 스레드에서 실행됩니다.

`Schedulers`를 사용하면 특정 연산을 다른 스레드 풀에서 실행할 수 있습니다.

```kotlin
// PaymentRecoveryService.kt — 주기적 미결제 복구
@Scheduled(fixedDelay = 180, initialDelay = 180, timeUnit = TimeUnit.SECONDS)
override fun recovery() {
    loadPendingPaymentPort.getPendingPayments()
        .parallel(2)                      // 병렬로 2개 레일 생성
        .runOn(Schedulers.parallel())     // 각 레일을 병렬 스레드 풀에서 실행
        .flatMap { command ->
            paymentExecutorPort.execute(it)
        }
        .sequential()                     // 다시 순차 스트림으로 합침
        .subscribeOn(scheduler)           // 전체 구독을 특정 스레드에서 시작
        .subscribe()
}
```

### 주요 Schedulers

| Scheduler | 특징 | 사용처 |
|---|---|---|
| `Schedulers.parallel()` | CPU 코어 수만큼 스레드 | CPU 집약 작업 |
| `Schedulers.boundedElastic()` | 유연한 스레드 풀 (최대 제한) | Blocking I/O 래핑 |
| `Schedulers.newSingle("name")` | 단일 스레드 | 순서 보장이 필요한 작업 |
| `Schedulers.immediate()` | 현재 스레드 | 테스트, 기본값 |

```kotlin
// PaymentEventMessageRelayService.kt
private val scheduler = Schedulers.newSingle("message-relay")

// PaymentRecoveryService.kt
private val scheduler = Schedulers.newSingle("recovery")
```

복구 서비스와 메시지 릴레이 서비스가 각각 **전용 단일 스레드**를 가지는 이유는, 스케줄링 작업이 이벤트 루프 스레드를 점유하는 것을 막기 위해서입니다.

---

## 8. 에러 처리

### `onErrorResume` — 에러를 다른 스트림으로 대체

```kotlin
// PaymentConfirmService.kt
.onErrorResume { paymentErrorHandler.handlePaymentConfirmationError(it, command) }
```

에러가 발생하면 스트림이 종료되는 대신, `handlePaymentConfirmationError`가 반환하는 새로운 `Mono`로 **대체**합니다.

```kotlin
// PaymentErrorHandler.kt
fun handlePaymentConfirmationError(
    error: Throwable,
    command: PaymentConfirmCommand
): Mono<PaymentConfirmationResult> {
    val (status, failure) = when (error) {
        is PSPConfirmationException   -> Pair(error.paymentStatus(), PaymentFailure(...))
        is PaymentValidationException -> Pair(PaymentStatus.FAILURE, PaymentFailure(...))
        is PaymentAlreadyProcessedException -> return Mono.just(PaymentConfirmationResult(...))
        is TimeoutException           -> Pair(PaymentStatus.UNKNOWN, PaymentFailure(...))
        else                          -> Pair(PaymentStatus.UNKNOWN, PaymentFailure(...))
    }
    
    return paymentStatusUpdatePort.updatePaymentStatus(paymentStatusUpdateCommand)
        .map { PaymentConfirmationResult(status, failure) }
}
```

에러 타입별로 다른 처리를 하고, **에러 상황도 결제 상태(FAILURE, UNKNOWN)로 DB에 기록**하는 것이 포인트입니다.

### `handle` — 요소별 성공/에러 제어

```kotlin
// R2DBCPaymentStatusUpdateRepository.kt
private fun checkPreviousPaymentOrderStatus(orderId: String): Mono<List<Pair<Long, String>>> {
    return selectPaymentOrderStatus(orderId)
        .handle { paymentOrder, sink ->
            when (paymentOrder.second) {
                PaymentStatus.NOT_STARTED.name,
                PaymentStatus.UNKNOWN.name,
                PaymentStatus.EXECUTING.name -> sink.next(paymentOrder)  // 정상 통과

                PaymentStatus.SUCCESS.name -> sink.error(               // 에러 발생
                    PaymentAlreadyProcessedException("이미 처리 성공한 결제입니다.", PaymentStatus.SUCCESS)
                )

                PaymentStatus.FAILURE.name -> sink.error(
                    PaymentAlreadyProcessedException("이미 처리 실패한 결제입니다.", PaymentStatus.FAILURE)
                )
            }
        }
        .collectList()
}
```

`handle`은 각 요소를 보면서 `sink.next()`로 다음 요소를 내보내거나 `sink.error()`로 에러를 발생시키는 강력한 연산자입니다. `filter`와 `flatMap`의 기능을 동시에 수행합니다.

### `onErrorContinue` — 에러 건너뛰기

```kotlin
// PaymentEventMessageSender.kt
sender.asFlux()
    .onErrorContinue { err, _ ->
        Logger.error("sendEventMessage", err.message ?: "failed to send eventMessage", err)
    }
```

`onErrorResume`은 스트림 전체를 대체하지만, `onErrorContinue`는 **에러를 일으킨 요소만 건너뛰고 스트림을 계속** 진행합니다. 이벤트 전송에서 특정 메시지 전송 실패가 전체 스트림을 멈추게 하면 안 되므로 적절한 선택입니다.


## 9. 마치며 — WebFlux를 써야 할 때와 아닐 때


### WebFlux가 유리한 경우
- **I/O 집약적 서비스**: 외부 API 호출, DB 쿼리 등 대기 시간이 많은 경우
- **높은 동시성이 필요한 경우**: 적은 자원으로 많은 동시 요청을 처리해야 할 때
- **스트리밍**: 실시간 데이터 스트림을 다룰 때

### WebFlux가 불리한 경우
- **CPU 집약적 작업**: CPU를 오래 쓰는 계산은 이벤트 루프를 블로킹시킬 수 있음
- **팀 경험이 부족할 때**: 리액티브 패러다임은 학습 곡선이 가파름
- **간단한 CRUD**: 복잡성 대비 얻는 게 적을 수 있음
