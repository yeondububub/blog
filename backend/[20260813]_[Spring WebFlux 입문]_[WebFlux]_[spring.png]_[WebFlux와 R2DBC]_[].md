# Spring WebFlux 입문 — 결제 서비스 기반 리액티브 프로그래밍 분석

대규모 트래픽과 높은 동시성 처리가 요구되는 환경에서 Spring MVC의 전통적인 Thread-per-request 모델은 스레드 풀 고갈 및 리소스 경합 문제에 직면할 수 있다. 특히 외부 PG사 연동이나 분산 I/O 대기가 빈번한 결제 도메인에서는 I/O 대기로 인한 스레드 점유 비용이 시스템 전체의 성능 병목으로 작용한다.

본 문서는 Spring WebFlux의 핵심 아키텍처 및 동작 메커니즘을 분석하고, 실제 결제 승인 시스템(WebFlux, R2DBC, Sinks, Schedulers)을 기반으로 리액티브 파이프라인의 설계 및 구현 방식을 정리한다.

---

## 1. 아키텍처 비교: Spring MVC vs Spring WebFlux

### 1.1 Blocking I/O 모델 (Spring MVC)

Spring MVC는 기본적으로 요청당 하나의 스레드를 할당하는 Thread-per-request 모델을 사용한다.

```java
// Spring MVC (Blocking I/O)
@PostMapping("/confirm")
public ResponseEntity<Result> confirm(@RequestBody Request req) {
    Result result = paymentService.confirm(req); // 외부 API 및 DB I/O 동안 스레드 대기(Blocking)
    return ResponseEntity.ok(result);
}
```

- 클라이언트 요청 시 톰캣 스레드 풀에서 작업 스레드를 할당한다.
- 데이터베이스 쿼리 실행 및 외부 PG사 API 연동 등 I/O 작업이 진행되는 동안 해당 스레드는 대기(Blocked) 상태를 유지한다.
- 동시 요청 수가 스레드 풀의 상한에 도달하면 대기 큐잉 지연 및 컨텍스트 스위칭 오버헤드가 급증하며 메모리 자원(스레드당 스택 영역)이 소진된다.


### 1.2 Non-Blocking I/O 모델 (Spring WebFlux)

Spring WebFlux는 Netty 기반의 이벤트 루프(Event Loop) 아키텍처와 논블로킹 I/O를 활용한다.

```kotlin
// Spring WebFlux (Non-Blocking I/O)
@PostMapping("/confirm")
fun confirm(@RequestBody request: TossPaymentConfirmRequest): Mono<ResponseEntity<ApiResponse<PaymentConfirmationResult>>> {
    val command = PaymentConfirmCommand(...)
    return paymentConfirmUseCase.confirm(command)
        .map { ResponseEntity.ok().body(ApiResponse.with(HttpStatus.OK, "", it)) }
}
```

- I/O 작업 요청 시 호출 스레드가 결과를 대기하지 않고, 완료 시점에 실행될 파이프라인만 등록한 뒤 즉시 다음 작업을 처리한다.
- CPU 코어 수에 최적화된 소수의 이벤트 루프 스레드만으로 대량의 동시 연결 및 I/O 대기 작업을 효율적으로 수용할 수 있다.

---

### 1.3 Publisher 핵심 타입: Mono와 Flux

Reactive Streams 사양의 핵심은 데이터를 비동기적으로 발행하는 `Publisher<T>`이다. Project Reactor는 이를 `Mono`와 `Flux` 두 가지 타입으로 구현한다.

| 구분 | `Mono<T>` | `Flux<T>` |
|---|---|---|
| 발행 데이터 수 | 0 또는 1개 (`0..1`) | 0부터 N개 (`0..N`) |
| 대응 개념 | `Optional<T>`, `CompletableFuture<T>` | `List<T>`, `Stream<T>` |
| 주요 용도 | 단건 데이터 조회, CUD 처리 결과, HTTP 단건 응답 | 다건 데이터 스트리밍, 이벤트 피드, SSE |

```kotlin
// Mono: 결제 승인 단건 결과 반환
fun confirm(command: PaymentConfirmCommand): Mono<PaymentConfirmationResult>

// Flux: 미처리 결제 복구 대상 목록 스트림
fun getPendingPayments(): Flux<PendingPaymentEvent>
```

---

### 1.4 Cold Stream 동작 특성

Reactor의 기본 스트림은 Cold Stream 방식으로 동작한다.

- 파이프라인의 정의(연산자 체이닝)와 실행은 엄격히 분리된다.
- `subscribe()`가 호출되기 전까지는 쿼리 실행, 네트워크 호출 등 어떠한 비즈니스 로직도 실행되지 않는다.
- WebFlux 컨트롤러에서는 반환된 `Mono`/`Flux`를 프레임워크가 내부적으로 구독하여 클라이언트에 응답 스트림을 전송한다.

---

## 2. 결제 승인 파이프라인 및 핵심 리액티브 연산자 분석

결제 승인 프로세스는 상태 검증, 외부 PG 승인, 영속성 갱신 등의 연속적인 비동기 단계로 구성된다.

```
[결제 승인 파이프라인 단계]
1. DB 주문 상태를 '진행중(EXECUTING)'으로 갱신
   |
2. 주문 금액 및 유효성 비동기 검증 (filterWhen)
   |
3. 외부 PG사 승인 API 호출 (flatMap)
   |
4. 결제 결과 DB 영속화 (flatMap + thenReturn)
   |
5. 최종 응답 DTO 매핑 (map)
   | (예외 발생 시)
6. 에러 핸들링 및 실패 상태 기록 (onErrorResume)
```

### 2.1 결제 승인 서비스 구현체

```kotlin
// PaymentConfirmService.kt
@Service
class PaymentConfirmService(
    private val paymentStatusUpdatePort: PaymentStatusUpdatePort,
    private val paymentValidationPort: PaymentValidationPort,
    private val paymentExecutorPort: PaymentExecutorPort,
    private val paymentErrorHandler: PaymentErrorHandler
) : PaymentConfirmUseCase {

    override fun confirm(command: PaymentConfirmCommand): Mono<PaymentConfirmationResult> {
        return paymentStatusUpdatePort.updatePaymentStatusToExecuting(command.orderId, command.paymentKey)
            .filterWhen { paymentValidationPort.isValid(command.orderId, command.amount) }
            .flatMap { paymentExecutorPort.execute(command) }
            .flatMap {
                paymentStatusUpdatePort.updatePaymentStatus(
                    command = PaymentStatusUpdateCommand(
                        paymentKey = it.paymentKey,
                        orderId = it.orderId,
                        status = it.paymentStatus(),
                        extraDetails = it.extraDetails,
                        failure = it.failure
                    )
                ).thenReturn(it)
            }
            .map { PaymentConfirmationResult(status = it.paymentStatus(), failure = it.failure) }
            .onErrorResume { paymentErrorHandler.handlePaymentConfirmationError(it, command) }
    }
}
```

---

### 2.2 핵심 연산자 상세 분석

#### 1) `flatMap` vs `map`
- **`map`**: 동기 변환 함수 `(T) -> R`을 적용한다. 입력 요소를 다른 일반 객체로 1:1 변환할 때 사용한다.
- **`flatMap`**: 비동기 Publisher를 반환하는 함수 `(T) -> Publisher<R>`을 적용한다. 반환된 내부 Publisher를 구독하고 결과를 단일 스트림으로 평탄화(Flatten)한다. 비동기 작업 체이닝 시 중첩(`Mono<Mono<T>>`)을 방지하기 위해 필수적으로 사용된다.

```kotlin
// map: 일반 객체 변환
.map { result -> PaymentConfirmationResult(status = result.paymentStatus()) }

// flatMap: 비동기 작업 연계 (execute() 반환 타입: Mono<TossPaymentResponse>)
.flatMap { paymentExecutorPort.execute(command) }
```

#### 2) `filterWhen`
- 일반 `filter`는 동기식 `(T) -> Boolean`을 기반으로 평가한다.
- `filterWhen`은 `Mono<Boolean>`과 같은 비동기 조건식을 평가한다. DB 조회나 외부 API 검증 결과를 조건으로 활용할 때 사용하며, 평가 결과가 `false`일 경우 다운스트림으로 데이터를 방출하지 않고 스트림을 즉시 종료(Complete)한다.

```kotlin
.filterWhen { paymentValidationPort.isValid(command.orderId, command.amount) }
```

#### 3) `thenReturn`
- 비동기 체인 중간의 작업(예: DB 저장)이 완료된 후, 해당 작업의 반환값 대신 선행 단계의 데이터 객체를 유지하여 다음 연산자로 전달할 때 사용한다.

```kotlin
.flatMap {
    // updatePaymentStatus()의 반환값(Mono<Boolean>) 대신 PG 승인 응답 객체(it)를 다운스트림으로 전달
    paymentStatusUpdatePort.updatePaymentStatus(command = ...).thenReturn(it)
}
```

#### 4) `handle`
- 개별 요소 단위로 세부적인 조건 검사, 데이터 매핑, 비즈니스 예외 방출을 하나의 연산자 내에서 처리할 수 있는 기능을 제공한다.

```kotlin
// R2DBCPaymentStatusUpdateRepository.kt
private fun checkPreviousPaymentOrderStatus(orderId: String): Mono<List<Pair<Long, String>>> {
    return selectPaymentOrderStatus(orderId)
        .handle { paymentOrder, sink ->
            when (paymentOrder.second) {
                PaymentStatus.NOT_STARTED.name,
                PaymentStatus.UNKNOWN.name,
                PaymentStatus.EXECUTING.name -> sink.next(paymentOrder)

                PaymentStatus.SUCCESS.name -> sink.error(
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

---

## 3. 리액티브 예외 처리 메커니즘

비동기 논블로킹 환경에서는 호출 스레드와 실행 스레드가 분리되므로 일반적인 `try-catch` 구문으로 예외를 제어할 수 없다. 스트림 레벨의 에러 처리 연산자를 적용해야 한다.

### 3.1 `onErrorResume`: Fallback 스트림 전환

파이프라인 실행 중 예외가 발생했을 때 기존 스트림을 대체 스트림으로 전환한다. 결제 시스템에서는 에러 발생 시 결제 상태를 `FAILURE` 또는 `UNKNOWN`으로 DB에 기록하고 정형화된 응답을 반환하는 데 사용된다.

```kotlin
// PaymentErrorHandler.kt
@Component
class PaymentErrorHandler(
    private val paymentStatusUpdatePort: PaymentStatusUpdatePort
) {
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

        val paymentStatusUpdateCommand = PaymentStatusUpdateCommand(...)

        // 에러 발생 건에 대해 DB 상태 업데이트를 수행한 후 최종 DTO 반환
        return paymentStatusUpdatePort.updatePaymentStatus(paymentStatusUpdateCommand)
            .map { PaymentConfirmationResult(status, failure) }
    }
}
```

### 3.2 `onErrorContinue`: 항목별 예외 격리

스트림 전체를 중단시키지 않고, 에러를 유발한 개별 항목만 로깅하거나 건너뛴 뒤 후속 데이터 처리를 지속한다.

```kotlin
// PaymentEventMessageSender.kt
sender.asFlux()
    .onErrorContinue { err, value ->
        Logger.error("sendEventMessage", "메시지 발송 실패: value=$value, err=${err.message}", err)
    }
```

---

## 4. 논블로킹 영속성 계층 및 트랜잭션 (R2DBC)

WebFlux 환경에서 기존 JDBC 드라이버(JPA, MyBatis)를 사용할 경우 데이터베이스 I/O 구간에서 스레드 블로킹이 발생하여 리액티브의 성능적 이점이 무효화된다. 이를 방지하기 위해 완전한 비동기 논블로킹 드라이버인 **R2DBC(Reactive Relational Database Connectivity)**를 적용한다.

### 4.1 JDBC vs R2DBC 비교

| 비교 항목 | JDBC (전통적 방식) | R2DBC (리액티브 방식) |
|---|---|---|
| I/O 방식 | Blocking I/O | Non-Blocking I/O |
| 데이터 반환 형태 | `T`, `List<T>` | `Mono<T>`, `Flux<T>` |
| 스레드 점유 | 쿼리 응답 수신 시까지 스레드 대기 | 이벤트 루프 유지, 응답 도착 시 콜백 수행 |
| 트랜잭션 전파 | ThreadLocal 기반 (`@Transactional`) | Reactor Context 기반 (`TransactionalOperator`) |

---

### 4.2 `DatabaseClient`를 통한 쿼리 실행 및 스트리밍

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
            .all() // 각 Row를 Flux<Map<String, Any>> 형태로 비동기 스트리밍 수신
            .groupBy { it["payment_event_id"] as Long }
            .flatMap { groupedFlux ->
                groupedFlux.collectList().map { results ->
                    PendingPaymentEvent(
                        paymentEventId = groupedFlux.key(),
                        paymentOrders = results.map { ... }
                    )
                }
            }
    }
}
```

- **`.fetch().all()`**: 쿼리 결과 전체 행을 `Flux`로 스트리밍 수신한다.
- **`.fetch().first()`**: 첫 번째 행만 `Mono`로 수신한다.
- **`.fetch().rowsUpdated()`**: DML 실행에 의해 영향받은 행 수를 `Mono<Long>`으로 수신한다.

---

### 4.3 `TransactionalOperator`를 통한 리액티브 트랜잭션 관리

전통적인 Spring의 `@Transactional`은 `ThreadLocal`에 데이터베이스 커넥션을 보관한다. 반면 WebFlux는 파이프라인 수행 도중 스레드가 전환될 수 있으므로 `ThreadLocal` 방식이 유효하지 않다.

따라서 Reactor Context를 통해 트랜잭션을 전파하는 `TransactionalOperator`를 활용한다.

```kotlin
// R2DBCPaymentStatusUpdateRepository.kt
override fun updatePaymentStatusToExecuting(orderId: String, paymentKey: String): Mono<Boolean> {
    return checkPreviousPaymentOrderStatus(orderId)
        .flatMap { insertPaymentHistory(it, PaymentStatus.EXECUTING, "PAYMENT_CONFIRMATION_START") }
        .flatMap { updatePaymentOrderStatus(orderId, PaymentStatus.EXECUTING) }
        .flatMap { updatePaymentKey(orderId, paymentKey) }
        .`as`(transactionalOperator::transactional) // 일련의 비동기 DB 작업을 단일 트랜잭션으로 바인딩
        .thenReturn(true)
}
```

체인 내 `.as(transactionalOperator::transactional)` 적용 시 모든 하위 R2DBC 쿼리가 하나의 트랜잭션으로 원자성을 보장받으며, 실패 시 자동 롤백된다.

Spring WebFlux 5.2+ 및 Spring Data R2DBC 환경에서는 리액티브용 `@Transactional` 어노테이션도 지원된다. 내부적으로 Reactor Context를 활용해 동일하게 동작하지만, 연산자 체인의 명시적 흐름과 원리를 파악하기 위해 `TransactionalOperator`의 동작 방식을 이해해 두는 것이 권장된다.

---

## 5. 이벤트 브릿지 및 트랜잭셔널 아웃박스 연동 (Sinks)

### 5.1 `Sinks`의 역할

`Sinks`는 명령형(Imperative) 코드나 비-리액티브 이벤트 리스너에서 리액티브 스트림(`Flux`/`Mono`)으로 데이터를 동적으로 주입하기 위한 진입점(Bridge) 역할을 수행한다.

```
[명령형 코드 / 이벤트 리스너] ---> sink.emitNext(data) ---> [ Sinks 내부 버퍼 ] ---> Flux 스트림 (Kafka 전송 등)
```

### 5.2 Sinks 주요 구성 방식
- **`unicast`**: 단일 구독자만 허용하는 파이프라인.
- **`multicast`**: 다수의 구독자에게 데이터를 브로드캐스트하는 파이프라인.
- **`replay`**: 신규 구독자에게 이전 N개의 데이터를 재전송하는 파이프라인.

---

### 5.3 트랜잭션 완료 후 이벤트 발행 구현

결제 시스템에서는 DB 트랜잭션 커밋 완료가 확인된 이후 메시지 브로커(Kafka)로 이벤트를 발행해야 데이터 정합성이 보장된다.

```kotlin
// PaymentEventMessageSender.kt
@Component
class PaymentEventMessageSender : DispatchEventMessagePort {

    private val sender = Sinks.many().unicast().onBackpressureBuffer<Message<PaymentEventMessage>>()

    @Bean
    fun send(): Supplier<Flux<Message<PaymentEventMessage>>> {
        return Supplier { sender.asFlux() }
    }

    // DB 트랜잭션이 성공적으로 커밋된 시점에만 실행 (Transactional Outbox 연계)
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

---

## 6. 스레드 모델 및 작업 격리 전략 (Schedulers)

### 6.1 Netty 이벤트 루프 보호 원칙

Netty의 이벤트 루프 스레드는 CPU 코어 수 단위(보통 4~16개)로 한정되어 있다. 이벤트 루프 스레드 내에서 블로킹 연산(`Thread.sleep`, 동기 파일 I/O 등)이나 장시간의 CPU 집약적 연산을 수행할 경우 해당 스레드가 처리 중이던 수천 건의 네트워크 I/O가 동시에 지연된다.

이러한 작업을 격리하기 위해 적절한 `Scheduler` 풀로 작업을 오프로딩(Offloading)해야 한다.

---

### 6.2 주요 Scheduler 종류 및 용도

| Scheduler | 스레드 풀 구조 | 주요 용도 |
|---|---|---|
| `Schedulers.parallel()` | CPU 코어 수 기반 고정 스레드 풀 | 대량 연산, 병렬 데이터 파티셔닝 |
| `Schedulers.boundedElastic()` | 동적 확장 및 상한선 기반 스레드 풀 | 레거시 블로킹 I/O, 블로킹 드라이버 래핑 |
| `Schedulers.newSingle("name")` | 지정된 이름의 전용 단일 스레드 | 순차성 보장 작업, 백그라운드 주기적 배치 격리 |
| `Schedulers.immediate()` | 호출 스레드 직접 사용 | 테스트 및 즉각적 실행 |

---

### 6.3 미처리 결제 복구 배치에서의 병렬 처리 구현

```kotlin
// PaymentRecoveryService.kt
@Service
class PaymentRecoveryService(
    private val loadPendingPaymentPort: LoadPendingPaymentPort,
    private val paymentExecutorPort: PaymentExecutorPort
) {
    // 배치 작업 전용 독립 스레드 할당 (이벤트 루프 간섭 차단)
    private val scheduler = Schedulers.newSingle("payment-recovery")

    @Scheduled(fixedDelay = 180, initialDelay = 180, timeUnit = TimeUnit.SECONDS)
    fun recovery() {
        loadPendingPaymentPort.getPendingPayments()
            .parallel(2)                      // 1. 스트림을 2개의 병렬 레일(ParallelFlux)로 분할
            .runOn(Schedulers.parallel())     // 2. 각 레일을 parallel 스레드 풀에서 동시 실행
            .flatMap { command ->
                paymentExecutorPort.execute(command)
            }
            .sequential()                     // 3. 병렬 처리 완료 후 단일 스트림으로 재병합
            .subscribeOn(scheduler)           // 4. 전체 구독 및 실행 트리거를 복구 전용 스레드에서 수행
            .subscribe()
    }
}
```

- `subscribeOn(scheduler)`를 통해 스케줄링 주기가 메인 이벤트 루프 스레드에 부하를 주지 않도록 전용 스레드로 격리한다.
- `parallel(N)` 및 `runOn(Schedulers.parallel())`을 결합하여 다수의 복구 대상 건을 멀티코어 환경에서 병렬 분산 처리한다.

---

## 7. 종합 평가 및 도입 기준

### 7.1 WebFlux 도입이 권장되는 환경
- **I/O Bound 고동시성 시스템**: 외부 API 연동이 빈번하고 네트워크 레이턴시 대기 비중이 높은 게이트웨이 및 결제 서비스.
- **스트리밍 서비스**: 실시간 데이터 스트림(SSE, WebSocket) 및 대용량 이벤트 처리 파이프라인.
- **자원 최적화 요구**: 적은 수의 인스턴스로 대량의 동시 커넥션을 유지해야 하는 클라우드 인프라 환경.

### 7.2 WebFlux 도입 시 고려사항 및 제약
- **학습 곡선**: 리액티브 스트림 사양, 디버깅 복잡도, 비동기 컨텍스트 전파에 대한 러닝 커브 존재.
- **블로킹 의존성**: 전 구간(드라이버, 로깅, 서드파티 라이브러리)에서 논블로킹이 유지되지 않을 경우 리액티브의 성능상 이점이 상쇄됨.
- **단순 CRUD 시스템**: I/O 대기가 적고 트래픽 밀도가 낮은 환경에서는 아키텍처 복잡도 증가 대비 실익이 제한적일 수 있음.
