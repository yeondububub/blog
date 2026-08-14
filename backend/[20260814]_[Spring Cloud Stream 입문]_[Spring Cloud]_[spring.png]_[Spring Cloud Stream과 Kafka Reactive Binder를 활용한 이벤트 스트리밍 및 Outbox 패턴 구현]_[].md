# Spring Cloud Stream 입문 — 결제 서비스 기반 메시지 스트리밍 아키텍처

분산 시스템 및 마이크로서비스 아키텍처(MSA) 환경에서 서비스 간 비동기 통신과 이벤트 기반 아키텍처(EDA)를 구축하기 위해 메시지 브로커(Message Broker)의 활용은 필수적이다. 그러나 특정 브로커 클라이언트 라이브러리에 직접 의존할 경우, 인프라 변경 시 비즈니스 로직의 수정이 불가피하며 코드의 결합도가 증가한다.

본 문서는 **Spring Cloud Stream**의 추상화 계층과 **Kafka Reactive Binder**를 활용한 논블로킹 메시지 스트리밍 구조를 분석하고, 결제 도메인에서 데이터 정합성을 보장하기 위한 **트랜잭셔널 아웃박스(Transactional Outbox) 패턴** 및 **메시지 릴레이(Message Relay)** 구현 방식을 기술한다.

---

## 1. Spring Cloud Stream 아키텍처 및 도입 배경

### 1.1 브로커 직접 의존 방식의 한계

Kafka 클라이언트 라이브러리(`KafkaProducer`, `KafkaConsumer`)를 애플리케이션 계층에서 직접 호출할 경우 다음과 같은 문제가 발생한다.

```kotlin
// 메시지 브로커 클라이언트 직접 의존 예시
val props = Properties()
props["bootstrap.servers"] = "localhost:9092"
props["key.serializer"] = StringSerializer::class.java.name
props["value.serializer"] = StringSerializer::class.java.name

val producer = KafkaProducer<String, String>(props)
producer.send(ProducerRecord("payment-topic", key, value))
producer.close()
```

- **강한 결합도(Tight Coupling)**: 비즈니스 계층이 특정 메시지 브로커의 세부 구현 기술(직렬화, 프로듀서 API, 연결 설정)에 종속된다.
- **인프라 교체 비용 증가**: 브로커를 RabbitMQ, AWS SQS, Pulsar 등으로 변경하거나 멀티 클라우드로 전환할 때 프로듀서/컨슈머 코드를 전면 재작성해야 한다.
- **공통 관심사 중복**: 파티셔닝, 재시도, 직렬화/역직렬화, 에러 핸들링 로직이 서비스 전반에 파편화된다.

---

### 1.2 Spring Cloud Stream 추상화 모델

Spring Cloud Stream은 메시지 브로커의 연결 및 통신을 **Binder(바인더)**라는 추상화 계층 뒤로 격리한다.

```
[ 애플리케이션 계층 ] <---> [ Spring Cloud Stream 추상화 ] <---> [ Binder ] <---> [ Message Broker ]
  (Supplier / Function)            (채널 바인딩 및 직렬화)             (Kafka Binder)      (Kafka Cluster)
```

개발자는 표준 함수형 인터페이스(`Supplier`, `Function`, `Consumer`)를 통해 비즈니스 로직을 작성하며, 실제 브로커와의 통신은 프레임워크와 바인더가 전담한다.

```kotlin
// build.gradle.kts 의존성 구성
dependencies {
    implementation("org.springframework.cloud:spring-cloud-stream")
    implementation("org.springframework.cloud:spring-cloud-stream-binder-kafka-reactive")
}
```

---

## 2. 함수형 바인딩 모델 (Functional Binding Model)

Spring Cloud Stream 3.x 이후부터는 Java 8의 함수형 인터페이스를 기반으로 메시지 채널을 정의한다.

| 함수형 인터페이스 | 역할 | 메시지 흐름 |
|---|---|---|
| `Supplier<T>` | 메시지 생산 (Producer) | 애플리케이션 ---> 메시지 브로커 |
| `Function<T, R>` | 메시지 변환 및 처리 (Processor) | 메시지 브로커 ---> 가공/변환 ---> 메시지 브로커 |
| `Consumer<T>` | 메시지 소비 (Consumer) | 메시지 브로커 ---> 애플리케이션 |

### 2.1 리액티브 스트림과의 결합

Reactive Binder 환경에서는 각 함수형 인터페이스의 입출력 타입으로 Project Reactor의 `Flux` 및 `Mono`를 사용한다.

```kotlin
// 1. Supplier: 메시지 발행 스트림 (Producer)
fun send(): Supplier<Flux<Message<PaymentEventMessage>>>

// 2. Function: 리액티브 메시지 소비 및 완료 처리 (Consumer)
fun consume(): Function<Flux<Message<String>>, Mono<Void>>
```

### 2.2 바인딩 채널 명명 규칙

스프링 컨텍스트에 등록된 함수형 Bean의 이름을 기준으로 채널 이름이 자동 매핑된다.

- **출력 채널(Producer)**: `<beanName>-out-<index>` (예: `send-out-0`)
- **입력 채널(Consumer)**: `<beanName>-in-<index>` (예: `consume-in-0`)

---

## 3. Producer 구현: Supplier와 Sinks를 통한 이벤트 발행

결제 처리 완료 시점에 비동기 이벤트를 발행하는 프로듀서 구성 방식이다.

```kotlin
// PaymentEventMessageSender.kt
@Configuration
@StreamAdapter
class PaymentEventMessageSender(
    private val paymentOutboxRepository: PaymentOutboxRepository
) : DispatchEventMessagePort {

    // 명령형 코드의 이벤트를 리액티브 스트림으로 주입하기 위한 Sinks 파이프라인
    private val sender = Sinks.many().unicast().onBackpressureBuffer<Message<PaymentEventMessage>>()

    // Spring Cloud Stream이 구독할 Flux 소스를 Bean으로 노출
    @Bean
    fun send(): Supplier<Flux<Message<PaymentEventMessage>>> {
        return Supplier {
            sender.asFlux()
                .onErrorContinue { err, _ -> 
                    Logger.error("sendEventMessage", err.message ?: "메시지 발행 중 에러 발생", err) 
                }
        }
    }

    override fun dispatch(paymentEventMessage: PaymentEventMessage) {
        sender.emitNext(
            createEventMessage(paymentEventMessage), 
            Sinks.EmitFailureHandler.FAIL_FAST
        )
    }
}
```

### 3.1 메시지 발행 파이프라인 동작 단계

```
1. 비즈니스 계층에서 dispatch() 호출
   |
2. sender.emitNext()를 통해 Sinks 내부 버퍼로 이벤트 주입 (명령형 -> 리액티브 변환)
   |
3. sender.asFlux()를 통해 Flux 스트림 생성
   |
4. send() Supplier Bean을 Spring Cloud Stream 프레임워크가 구독
   |
5. Kafka Reactive Binder가 브로커 토픽으로 레코드 전송
```

비즈니스 로직 계층은 메시지 브로커의 세부 API를 직접 참조하지 않고, `DispatchEventMessagePort` 인터페이스와 `Sinks`를 통해 데이터를 전달한다.

---

## 4. Consumer 구현: Function 기반 리액티브 메시지 소비

```kotlin
// PaymentServiceApplication.kt
@SpringBootApplication
class PaymentServiceApplication {

    @Bean
    fun consume(): Function<Flux<Message<String>>, Mono<Void>> {
        return Function { messages ->
            messages.map {
                Logger.info("PaymentServiceApplication", "수신 메시지: ${it.payload}")
                it
            }.then() // 전체 스트림 처리 완료 신호(Mono<Void>) 반환
        }
    }
}
```

- `Function<Flux<Message<String>>, Mono<Void>>`는 인입되는 메시지 스트림을 비동기적으로 처리하는 리액티브 컨슈머 역할을 수행한다.
- `.then()` 연산자는 인입된 메시지 파이프라인이 정상적으로 완료되었음을 나타내는 `Mono<Void>`를 반환하여 프레임워크가 메시지 처리 완료를 인지할 수 있도록 한다.

---

## 5. 인프라 바인딩 설정 (`application.yml`)

Spring Cloud Stream의 논리적 바인딩 채널과 실제 Kafka 토픽 및 컨슈머 그룹을 매핑하는 설정 명세이다.

```yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          brokers: localhost:9092

      bindings:
        send-out-0:
          destination: payment-confirmation-success
          
        consume-in-0:
          destination: payment-confirmation-success
          group: payment-service
```

### 5.1 바인딩 매핑 구조

| Bean 이름 | 인터페이스 타입 | 방향 | 채널 명 | 매핑 대상 (Destination / Group) |
|---|---|---|---|---|
| `send` | `Supplier` | 출력 | `send-out-0` | 토픽: `payment-confirmation-success` |
| `consume` | `Function` | 입력 | `consume-in-0` | 토픽: `payment-confirmation-success` / 그룹: `payment-service` |

---

## 6. 전송 결과 처리 및 비동기 상태 추적 (@ServiceActivator)

Kafka로 메시지를 발행한 이후, 브로커로부터의 ACK/NACK 응답 결과를 비동기로 수신하여 상태를 추적해야 한다.

```kotlin
// PaymentEventMessageSender.kt (전송 결과 처리 확장)
private val sendResult = Sinks.many().unicast().onBackpressureBuffer<SenderResult<String>>()

@Bean(name = ["payment-result"])
fun sendResultChannel(): FluxMessageChannel {
    return FluxMessageChannel()
}

@ServiceActivator(inputChannel = "payment-result")
fun receiveSendResult(results: SenderResult<String>) {
    if (results.exception() != null) {
        Logger.error("sendEventMessage", results.exception().message ?: "전송 실패", results.exception())
    }
    sendResult.emitNext(results, Sinks.EmitFailureHandler.FAIL_FAST)
}

@PostConstruct
fun handleSendResult() {
    sendResult.asFlux()
        .flatMap {
            when (it.recordMetadata() != null) {
                true  -> paymentOutboxRepository.markMessageAsSent(it.correlationMetadata())
                false -> paymentOutboxRepository.markMessageAsFailure(it.correlationMetadata())
            }
        }
        .subscribeOn(Schedulers.newSingle("handle-send-result-event-message"))
        .subscribe()
}
```

```
[전송 결과 비동기 피드백 파이프라인]
1. dispatch() ---> Sinks ---> Kafka 전송 수행
2. Kafka Binder로부터 전송 결과가 payment-result 채널로 인입
3. @ServiceActivator가 결과를 가로채 sendResult Sinks로 전달
4. handleSendResult() 파이프라인에서 Outbox 테이블 레코드 상태를 SENT 또는 FAILURE로 갱신
```

전송 결과 처리 로직은 독립된 단일 스레드(`Schedulers.newSingle`)로 격리되어 메인 I/O 이벤트 루프의 블로킹을 방지한다.

---

## 7. 순서 보장을 위한 메시지 파티셔닝 전략

결제 시스템에서는 동일한 주문 식별자(`orderId`)를 가진 이벤트가 생성 순서대로 처리되어야 한다. Kafka에서 순서 보장의 최소 단위는 **파티션(Partition)**이므로, 동일 주문의 모든 메시지를 동일 파티션으로 라우팅해야 한다.

### 7.1 파티션 키 계산 모듈

```kotlin
// PartitionKeyUtil.kt
@Component
class PartitionKeyUtil {
    val PARTITION_KEY_COUNT = 6

    fun createPartitionKey(number: Int): Int {
        return abs(number) % PARTITION_KEY_COUNT
    }
}
```

### 7.2 메시지 헤더 주입

```kotlin
private fun createEventMessage(paymentEventMessage: PaymentEventMessage): Message<PaymentEventMessage> {
    return MessageBuilder.withPayload(paymentEventMessage)
        .setHeader(IntegrationMessageHeaderAccessor.CORRELATION_ID, paymentEventMessage.payload["orderId"])
        .setHeader(KafkaHeaders.PARTITION, paymentEventMessage.metadata["partitionKey"] ?: 0)
        .build()
}
```

`orderId.hashCode()`를 기반으로 계산된 파티션 번호를 `KafkaHeaders.PARTITION` 헤더에 명시적으로 지정하여 동일 주문에 대한 이벤트 순차성을 보장한다.

---

## 8. 트랜잭셔널 아웃박스(Transactional Outbox) 패턴 및 릴레이 메커니즘

### 8.1 이중 쓰기(Dual-Write) 문제

데이터베이스 갱신과 메시지 브로커 전송은 서로 다른 분산 리소스이므로 단일 로컬 트랜잭션으로 원자성을 보장할 수 없다.

```
[이중 쓰기 불일치 시나리오]
1. DB 결제 상태 SUCCESS 커밋 완료
2. Kafka 브로커 전송 시도 중 네트워크 장애 또는 프로세스 강제 종료
-> DB에는 결제 성공이 반영되었으나, 메시지는 브로커로 유실되어 다운스트림 시스템의 후속 처리가 영구 누락됨
```

---

### 8.2 Outbox 패턴을 통한 원자성 확보

동일한 DB 로컬 트랜잭션 내에서 비즈니스 엔티티 변경과 발행할 메시지(Outbox 엔티티)를 함께 영속화한다.

```kotlin
// R2DBCPaymentStatusUpdateRepository.kt
private fun updatePaymentStatusToSuccess(command: PaymentStatusUpdateCommand): Mono<Boolean> {
    return selectPaymentOrderStatus(command.orderId).collectList()
        .flatMap { insertPaymentHistory(it, command.status, "PAYMENT_CONFIRMATION_DONE") }
        .flatMap { updatePaymentOrderStatus(command.orderId, command.status) }
        .flatMap { updatePaymentEventExtraDetails(command) }
        .flatMap { paymentOutboxRepository.insertOutbox(command) } // DB 트랜잭션 내부에서 Outbox 레코드 생성
        .flatMap { paymentEventMessagePublisher.publishEvent(it) } // 스프링 애플리케이션 이벤트 발행
        .`as`(transactionalOperator::transactional)               // 전체 작업을 단일 트랜잭션으로 바인딩
        .thenReturn(true)
}
```

```kotlin
// PaymentEventMessageSender.kt
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
fun dispatchAfterCommit(paymentEventMessage: PaymentEventMessage) {
    dispatch(paymentEventMessage) // DB 트랜잭션 커밋 완료 확인 후에만 브로커 전송 시도
}
```

---

### 8.3 메시지 릴레이(Message Relay) 서비스를 통한 장애 복구

트랜잭션 커밋 직후 브로커 장애 등으로 전송되지 못한 메시지는 백그라운드 릴레이 스케줄러가 주기적으로 재전송한다.

```kotlin
// PaymentEventMessageRelayService.kt
@Service
class PaymentEventMessageRelayService(
    private val loadPendingPaymentEventMessagePort: LoadPendingPaymentEventMessagePort,
    private val dispatchEventMessagePort: DispatchEventMessagePort
) {
    private val scheduler = Schedulers.newSingle("payment-message-relay")

    @Scheduled(fixedDelay = 180, initialDelay = 180, timeUnit = TimeUnit.SECONDS)
    fun relay() {
        loadPendingPaymentEventMessagePort.getPendingPaymentEventMessage()
            .map { dispatchEventMessagePort.dispatch(it) }
            .onErrorContinue { err, _ -> 
                Logger.error("messageRelay", err.message ?: "메시지 릴레이 재전송 실패", err) 
            }
            .subscribeOn(scheduler)
            .subscribe()
    }
}
```

```sql
-- 릴레이 대상 조회 쿼리: INIT 또는 FAILURE 상태이면서 생성 후 임계 시간이 경과한 건
SELECT * FROM outboxes
WHERE (status = 'INIT' OR status = 'FAILURE')
  AND created_at <= :createdAt - INTERVAL 1 MINUTE
  AND type = 'PAYMENT_CONFIRMATION_SUCCESS';
```

```
[최종 메시지 신뢰성 보장 수명주기]
1. DB 로컬 트랜잭션: 결제 데이터 갱신 + outboxes 테이블 레코드 삽입 (status = INIT)
2. 트랜잭션 커밋 완료 (AFTER_COMMIT)
3. 브로커 전송 시도:
   ├── 전송 성공: outboxes 상태 -> SENT
   └── 전송 실패 / 타임아웃: outboxes 상태 -> FAILURE 또는 INIT 유지
4. 백그라운드 릴레이: 1분 이상 미완료된 outboxes 레코드 폴링 후 브로커 재발행
```

---

## 9. 결론 및 아키텍처적 고려사항

1. **브로커 비의존성 및 유지보수성**: Spring Cloud Stream 추상화 모델을 적용하여 비즈니스 로직과 메시징 인프라 간의 결합도를 분리하였으며, 바인더 교체만으로 다양한 메시징 시스템으로의 전환이 가능하다.
2. **리액티브 파이프라인의 통합**: `Supplier<Flux<T>>` 및 `Sinks` 모델을 통해 WebFlux 논블로킹 런타임과 메시징 스트림을 자연스럽게 결합하였다.
3. **분산 데이터 정합성 보장**: 단순 메시지 발행 방식의 이중 쓰기 한계를 극복하기 위해 Transactional Outbox 패턴 및 메시지 릴레이 스케줄러를 적용하여 **최소 1회 전송(At-Least-Once Delivery)**을 보장한다.
4. **컨슈머 멱등성(Idempotency) 필수성**: 메시지 릴레이에 의한 재전송 발생 가능성에 대비하여, 메시지를 수신하는 컨슈머 측에서도 중복 메시지 수신 시 멱등성을 보장하는 구조(고유 이벤트 ID 기반 중복 검증)가 수반되어야 한다.
