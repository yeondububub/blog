# Spring Kafka를 활용한 메시지 전송과 수신 구현

주문 생성, 결제 완료와 같은 도메인 이벤트는 알림 발송, 재고 차감, 통계 집계 등 여러 후속 시스템에서 소비됩니다. 이 후속 처리를 동기 호출로 연결하면 호출 대상 시스템의 장애와 지연이 주문 처리 응답 시간에 그대로 전파됩니다. Apache Kafka는 이벤트를 토픽(Topic)에 기록하고 소비자가 각자의 속도로 읽어가는 구조를 제공하여 이 결합을 분리합니다.

Spring 환경에서는 Spring for Apache Kafka(`spring-kafka`)가 Kafka 클라이언트 API를 감싸 전송 측의 `KafkaTemplate`과 수신 측의 `@KafkaListener`를 제공합니다. 본 문서에서는 주문 생성 이벤트를 예시로 Kafka로 메시지를 전송하는 방법과 Kafka에서 메시지를 수신하는 방법을 구성부터 예외 처리까지 순서대로 다룹니다.

---

## 1. 기술적 배경 및 문제 제기 (기존 방식의 한계점)

`kafka-clients` 라이브러리를 직접 사용하면 전송과 수신 모두 인프라 코드가 비즈니스 코드와 섞입니다. 수신 측 코드는 다음과 같은 형태가 됩니다.

```kotlin
// kafka-clients를 직접 사용한 수신 코드: 폴링 루프, 오프셋 커밋, 종료 처리를 모두 직접 작성해야 함
val consumer = KafkaConsumer<String, String>(consumerProps)
consumer.subscribe(listOf("order.created"))

try {
    while (true) {
        // 브로커에서 메시지 배치를 가져오는 폴링 호출
        val records = consumer.poll(Duration.ofMillis(500))
        for (record in records) {
            handle(record.value())
        }
        // 배치 처리 완료 후 오프셋 커밋
        consumer.commitSync()
    }
} finally {
    consumer.close()
}
```

이 방식에는 다음과 같은 한계가 있습니다.

### 1.1 폴링 루프와 스레드 관리의 직접 구현
`poll()` 루프를 실행할 스레드 생성, 종료 시그널 처리, `KafkaConsumer`가 스레드 안전하지 않다는 제약에 따른 파티션 병렬 처리 설계를 개발자가 직접 구현해야 합니다.

### 1.2 직렬화와 오프셋 커밋 로직의 중복
메시지 객체를 바이트 배열로 변환하는 직렬화 코드와 오프셋 커밋 시점 제어 코드가 토픽마다 반복됩니다. 커밋 시점이 처리 완료 시점과 어긋나면 메시지 유실 또는 중복 처리가 발생합니다.

### 1.3 리밸런싱과 예외 처리의 일관성 부재
컨슈머 그룹 구성원이 변경되어 리밸런싱이 일어나는 상황과 처리 중 예외 발생 시 재시도, 실패 메시지 격리 정책을 호출 지점마다 개별 구현하게 되어 정책이 일관되지 않습니다.

Spring for Apache Kafka는 이 반복 코드를 메시지 리스너 컨테이너(Message Listener Container)와 템플릿 클래스로 대체합니다.

---

## 2. 핵심 개념 설명

전송과 수신 흐름에 참여하는 구성 요소의 관계는 다음과 같습니다.

<div class="diagram-container">
<svg role="img" aria-labelledby="kafka-send-receive-title kafka-send-receive-desc" viewBox="0 0 960 280" xmlns="http://www.w3.org/2000/svg">
  <title id="kafka-send-receive-title">Spring Kafka 메시지 전송과 수신 흐름</title>
  <desc id="kafka-send-receive-desc">Producer 애플리케이션의 KafkaTemplate이 Kafka 브로커의 토픽 파티션으로 메시지를 전송하고, Consumer 그룹의 KafkaListener가 파티션에서 메시지를 폴링하여 수신하는 구조를 나타내는 다이어그램</desc>
  <defs>
    <marker id="kafka-sr-arr-accent" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#bf4520"/>
    </marker>
  </defs>

  <!-- Canvas Background -->
  <rect width="960" height="280" fill="#f5f5f5" rx="8"/>

  <!-- Broker Zone -->
  <rect x="360" y="48" width="240" height="184" rx="6" fill="#ececec" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="5 3"/>
  <text x="480" y="72" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#4f5d75">Kafka 브로커 / order.created 토픽</text>

  <!-- ARROWS (drawn before nodes) -->
  <line x1="240" y1="136" x2="360" y2="136" stroke="#bf4520" stroke-width="1.75" marker-end="url(#kafka-sr-arr-accent)"/>
  <rect x="268" y="108" width="64" height="18" fill="#f5f5f5"/>
  <text x="300" y="121" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">send()</text>

  <line x1="600" y1="136" x2="720" y2="136" stroke="#bf4520" stroke-width="1.75" marker-end="url(#kafka-sr-arr-accent)"/>
  <rect x="628" y="108" width="64" height="18" fill="#f5f5f5"/>
  <text x="660" y="121" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">poll()</text>

  <!-- NODES -->
  <rect x="40" y="100" width="200" height="72" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="140" y="130" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Producer 애플리케이션</text>
  <text x="140" y="150" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">KafkaTemplate</text>

  <rect x="384" y="88" width="192" height="40" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="480" y="112" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Partition 0</text>

  <rect x="384" y="136" width="192" height="40" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="480" y="160" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Partition 1</text>

  <rect x="384" y="184" width="192" height="40" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="480" y="208" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Partition 2</text>

  <rect x="720" y="100" width="200" height="72" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="820" y="130" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Consumer 그룹</text>
  <text x="820" y="150" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">@KafkaListener</text>
</svg>
</div>

### 2.1 토픽, 파티션, 오프셋
토픽은 메시지가 기록되는 논리적 채널이며 하나 이상의 파티션으로 분할됩니다. 각 파티션 내부의 메시지는 기록 순서대로 오프셋(Offset)이라는 일련번호를 부여받고, 순서는 파티션 단위로만 보장됩니다.

### 2.2 메시지 키와 파티션 선택
메시지에 키를 지정하면 `Partitioner`가 키의 해시 값으로 대상 파티션을 결정합니다. 동일한 키를 가진 메시지는 항상 같은 파티션에 기록되므로 주문 번호를 키로 사용하면 동일 주문에 대한 이벤트의 순서가 유지됩니다.

### 2.3 컨슈머 그룹
동일한 `group.id`를 가진 컨슈머들은 하나의 그룹을 이루고, 토픽의 각 파티션은 그룹 내 하나의 컨슈머에게만 할당됩니다. 따라서 그룹 내 컨슈머를 늘려 병렬 처리량을 높일 수 있으며, 서로 다른 그룹은 같은 메시지를 각각 독립적으로 수신합니다.

### 2.4 Spring Kafka의 구성 요소

| 구성 요소 | 역할 |
| :--- | :--- |
| `KafkaTemplate` | `KafkaProducer`를 감싸 메시지 전송 API를 제공하며, 전송 결과를 비동기 `CompletableFuture`로 반환 |
| `ProducerFactory` / `ConsumerFactory` | 클라이언트 인스턴스 생성 시 `application.yml`의 설정을 적용 |
| `@KafkaListener` | 지정한 토픽을 구독하는 메서드를 선언하며, 내부적으로 리스너 컨테이너가 폴링 루프를 실행 |
| `ConcurrentMessageListenerContainer` | `concurrency` 값만큼 컨슈머 스레드를 생성하여 파티션을 병렬로 처리 |
| `DefaultErrorHandler` | 리스너 예외 발생 시 재시도와 실패 메시지 처리 정책을 담당 |

---

## 3. 코드 구현 및 라인별 상세 분석

주문이 생성되면 `order.created` 토픽으로 이벤트를 전송하고, 알림 서비스가 이를 수신하여 처리하는 흐름을 구현합니다.

### 3.1 의존성 (`build.gradle.kts`)

```kotlin
dependencies {
    // Spring Boot가 spring-kafka 버전을 관리하므로 버전을 명시하지 않음
    implementation("org.springframework.kafka:spring-kafka")
    // Kotlin data class의 JSON 직렬화 및 역직렬화에 필요한 모듈
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    // 임베디드 Kafka 브로커 기반 통합 테스트용
    testImplementation("org.springframework.kafka:spring-kafka-test")
}
```

### 3.2 설정 파일 (`application.yml`)

```yaml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      # 리더와 모든 ISR 복제본에 기록된 이후에 전송 성공으로 판단
      acks: all
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      properties:
        # 재전송 시 브로커 측에서 중복 기록을 제거
        enable.idempotence: true
        # 패키지 경로를 담은 타입 헤더를 붙이지 않아 수신 측과의 클래스 경로 결합을 제거
        spring.json.add.type.headers: false
    consumer:
      group-id: order-notification-group
      # 저장된 오프셋이 없는 그룹은 토픽의 처음부터 읽음
      auto-offset-reset: earliest
      # 오프셋 커밋 시점을 리스너 코드에서 직접 제어
      enable-auto-commit: false
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      # 역직렬화 실패를 예외로 전파하지 않고 컨테이너가 처리하도록 감싸는 역직렬화기
      value-deserializer: org.springframework.kafka.support.serializer.ErrorHandlingDeserializer
      properties:
        spring.deserializer.value.delegate.class: org.springframework.kafka.support.serializer.JsonDeserializer
        # 타입 헤더 대신 수신 측에서 지정한 클래스로 역직렬화
        spring.json.use.type.headers: false
        spring.json.value.default.type: com.example.order.event.OrderCreatedEvent
        spring.json.trusted.packages: com.example.order.event
    listener:
      # 리스너에서 Acknowledgment.acknowledge()를 호출할 때 오프셋 커밋
      ack-mode: manual
      # 컨슈머 스레드 수. 토픽 파티션 수 이하로 설정해야 모든 스레드가 파티션을 할당받음
      concurrency: 3
```

- **구현 상세 분석 및 효율성**:
  - `spring.json.add.type.headers: false`와 `spring.json.use.type.headers: false` 조합은 전송 측 클래스의 패키지 경로가 메시지 헤더에 포함되어 수신 측에 동일한 클래스 경로를 요구하는 문제를 제거합니다. 서비스가 분리된 환경에서 이벤트 클래스를 각 서비스가 독립적으로 정의할 수 있습니다.
  - `ErrorHandlingDeserializer`로 감싸지 않으면 형식이 맞지 않는 메시지를 만났을 때 역직렬화 예외가 `poll()` 단계에서 반복 발생하여 해당 오프셋을 넘어가지 못하고 컨슈머가 같은 위치에서 정지합니다.

### 3.3 토픽 선언과 이벤트 모델

```kotlin
package com.example.order.event

/** 토픽 이름을 한 곳에서 관리하여 전송 측과 수신 측의 문자열 불일치를 방지 */
object KafkaTopics {
    const val ORDER_CREATED = "order.created"
}

/** 주문 생성 이벤트. 전송과 수신이 같은 구조를 공유함 */
data class OrderCreatedEvent(
    val orderId: String,
    val userId: Long,
    val totalAmount: Long,
    val occurredAt: Long // epoch millis. 시간대 설정에 영향받지 않는 단일 정수 값으로 전달
)
```

```kotlin
package com.example.order.config

import com.example.order.event.KafkaTopics
import org.apache.kafka.clients.admin.NewTopic
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.kafka.config.TopicBuilder

@Configuration
class KafkaTopicConfig {

    /**
     * 애플리케이션 시작 시 KafkaAdmin이 토픽이 없으면 생성함.
     * 파티션 수는 이후 컨슈머 병렬 처리의 상한이 되므로 예상 컨슈머 수를 기준으로 정함
     */
    @Bean
    fun orderCreatedTopic(): NewTopic =
        TopicBuilder.name(KafkaTopics.ORDER_CREATED)
            .partitions(3)
            .replicas(1)
            .build()
}
```

### 3.4 Kafka로 메시지 전송 (`OrderEventProducer.kt`)

```kotlin
package com.example.order.producer

import com.example.order.event.KafkaTopics
import com.example.order.event.OrderCreatedEvent
import org.slf4j.LoggerFactory
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.stereotype.Component

@Component
class OrderEventProducer(
    private val kafkaTemplate: KafkaTemplate<String, OrderCreatedEvent>
) {
    private val log = LoggerFactory.getLogger(javaClass)

    fun send(event: OrderCreatedEvent) {
        // 세 번째 인자가 메시지 본문, 두 번째 인자가 메시지 키
        // 주문 번호를 키로 지정하여 동일 주문의 이벤트가 같은 파티션에 순서대로 기록되도록 함
        kafkaTemplate.send(KafkaTopics.ORDER_CREATED, event.orderId, event)
            // send()는 즉시 반환되는 비동기 호출이므로 성공과 실패는 콜백에서 확인
            .whenComplete { result, exception ->
                if (exception != null) {
                    log.error("주문 이벤트 전송 실패. orderId={}", event.orderId, exception)
                    return@whenComplete
                }
                val metadata = result.recordMetadata
                log.info(
                    "주문 이벤트 전송 성공. orderId={}, partition={}, offset={}",
                    event.orderId, metadata.partition(), metadata.offset()
                )
            }
    }
}
```

- **구현 상세 분석 및 효율성**:
  - `KafkaTemplate`은 내부의 `KafkaProducer`를 하나만 유지하며 스레드 안전합니다. 호출마다 프로듀서를 생성하지 않으므로 커넥션과 버퍼를 재사용합니다.
  - `send()`는 레코드를 프로듀서 버퍼에 넣고 반환하며, 배치 전송은 `linger.ms`, `batch.size` 설정에 따라 별도의 I/O 스레드가 수행합니다. 호출 스레드가 브로커 응답을 기다리지 않으므로 요청 처리 스레드의 점유 시간이 늘어나지 않습니다.
  - 전송 실패는 예외로 던져지지 않고 `CompletableFuture`로 전달됩니다. 콜백을 등록하지 않으면 실패가 로그에도 남지 않으므로 `whenComplete`로 결과를 반드시 확인해야 합니다.

### 3.5 Kafka에서 메시지 수신 (`OrderEventConsumer.kt`)

```kotlin
package com.example.order.consumer

import com.example.order.event.KafkaTopics
import com.example.order.event.OrderCreatedEvent
import org.slf4j.LoggerFactory
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.kafka.support.Acknowledgment
import org.springframework.kafka.support.KafkaHeaders
import org.springframework.messaging.handler.annotation.Header
import org.springframework.messaging.handler.annotation.Payload
import org.springframework.stereotype.Component

@Component
class OrderEventConsumer(
    private val notificationService: OrderNotificationService
) {
    private val log = LoggerFactory.getLogger(javaClass)

    @KafkaListener(
        topics = [KafkaTopics.ORDER_CREATED],
        groupId = "order-notification-group"
    )
    fun consume(
        @Payload event: OrderCreatedEvent,
        @Header(KafkaHeaders.RECEIVED_PARTITION) partition: Int,
        @Header(KafkaHeaders.OFFSET) offset: Long,
        acknowledgment: Acknowledgment
    ) {
        log.info("주문 이벤트 수신. orderId={}, partition={}, offset={}", event.orderId, partition, offset)

        // 비즈니스 로직이 정상 종료된 이후에 오프셋을 커밋
        // 예외가 발생하면 이 줄에 도달하지 않으므로 커밋되지 않고 에러 핸들러가 재시도를 수행
        notificationService.notify(event)
        acknowledgment.acknowledge()
    }
}
```

- **구현 상세 분석 및 효율성**:
  - `@KafkaListener`가 선언된 메서드는 리스너 컨테이너가 `poll()` 루프를 실행하고 역직렬화된 객체를 메서드 인자로 전달합니다. 폴링, 스레드 관리, 리밸런싱 처리 코드를 작성하지 않아도 됩니다.
  - `acknowledge()`를 처리 완료 이후에 호출하는 구조는 최소 한 번(At-least-once) 처리를 보장합니다. 처리 도중 프로세스가 종료되면 커밋되지 않은 오프셋부터 다시 수신하므로 메시지 유실이 없는 대신 중복 수신이 발생할 수 있습니다.
  - `concurrency: 3` 설정에 따라 컨테이너는 컨슈머 스레드 3개를 생성하고 각 스레드가 서로 다른 파티션을 담당합니다. 파티션이 3개일 때 한 스레드당 한 파티션이 할당됩니다.

### 3.6 실패 메시지 처리 (`KafkaErrorHandlerConfig.kt`)

```kotlin
package com.example.order.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer
import org.springframework.kafka.listener.DefaultErrorHandler
import org.springframework.util.backoff.FixedBackOff

@Configuration
class KafkaErrorHandlerConfig {

    /**
     * 리스너에서 예외가 발생하면 1초 간격으로 2회 재시도하고,
     * 모두 실패하면 원본 토픽명에 .DLT가 붙은 토픽으로 메시지를 이동시킨 뒤 다음 오프셋으로 진행함
     */
    @Bean
    fun errorHandler(template: KafkaTemplate<Any, Any>): DefaultErrorHandler {
        val recoverer = DeadLetterPublishingRecoverer(template)
        return DefaultErrorHandler(recoverer, FixedBackOff(1000L, 2L))
    }
}
```

- **구현 상세 분석**:
  - Spring Boot는 `CommonErrorHandler` 타입의 빈을 리스너 컨테이너 팩토리에 자동으로 적용하므로 별도의 팩토리 설정이 필요하지 않습니다.
  - 에러 핸들러가 없으면 기본 설정은 즉시 재시도를 9회 수행한 뒤 해당 메시지를 로그만 남기고 건너뜁니다. 실패 메시지가 보존되지 않으므로 명시적인 복구 정책이 필요합니다.

### 3.7 동작 확인

애플리케이션 실행 후 Kafka 콘솔 컨슈머로 토픽에 기록된 메시지를 확인합니다.

```bash
# 키와 파티션을 함께 출력하여 동일 키가 같은 파티션에 기록되는지 확인
kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic order.created \
  --from-beginning \
  --property print.key=true \
  --property print.partition=true
```

---

## 4. 적용 시 고려해야 할 점 (주의사항 및 예외 처리)

### 4.1 컨슈머 수와 파티션 수의 관계
한 파티션은 컨슈머 그룹 내 하나의 컨슈머에만 할당됩니다. 파티션이 3개인 토픽에 `concurrency`를 5로 설정하면 2개의 스레드는 파티션을 할당받지 못하고 유휴 상태가 됩니다. 처리량을 높이려면 파티션 수를 먼저 늘려야 하며, 파티션 수는 늘릴 수만 있고 줄일 수 없습니다.

### 4.2 메시지 순서 보장 범위
순서는 파티션 내부에서만 보장됩니다. 키를 지정하지 않으면 메시지가 파티션에 분산되어 동일 주문의 이벤트라도 순서가 뒤바뀔 수 있습니다. 또한 파티션 수를 변경하면 키와 파티션의 매핑이 달라지므로 운영 중인 토픽의 파티션 수 변경은 순서 보장에 영향을 줍니다.

### 4.3 중복 수신에 대한 멱등 처리
수신 측은 최소 한 번 처리 모델이므로 같은 메시지가 두 번 이상 전달될 수 있습니다. 리밸런싱 직후나 커밋 직전의 프로세스 종료 시 이 상황이 발생합니다. 알림 발송, 포인트 적립과 같이 중복 실행이 문제가 되는 로직은 주문 번호 등 이벤트의 고유 식별자를 기준으로 처리 이력을 저장하여 중복을 걸러내야 합니다. 본 블로그의 Idempotency Key 게시글에서 다룬 방식을 동일하게 적용할 수 있습니다.

### 4.4 DB 트랜잭션과 Kafka 전송의 원자성 부재
DB 저장과 `kafkaTemplate.send()`는 서로 다른 시스템에 대한 작업이므로 하나의 트랜잭션으로 묶이지 않습니다. DB 커밋은 성공했으나 전송이 실패하거나, 전송은 성공했으나 DB 트랜잭션이 롤백되는 불일치가 발생할 수 있습니다. 이 문제는 Transactional Outbox 패턴으로 해결하며, 해당 내용은 본 블로그의 Transactional Outbox 패턴 게시글에서 다룹니다.

### 4.5 Dead Letter Topic 사용 시 제약
`DeadLetterPublishingRecoverer`는 기본적으로 원본 메시지와 같은 파티션 번호로 `.DLT` 토픽에 기록합니다. DLT 토픽의 파티션 수가 원본 토픽보다 적으면 전송에 실패하므로 파티션 수를 같거나 크게 구성해야 합니다. 또한 `ErrorHandlingDeserializer`가 처리한 역직렬화 실패 메시지는 값이 원본 바이트 배열이므로, JSON 직렬화기를 사용하는 템플릿으로는 DLT에 기록할 수 없습니다. 이 경우 바이트 배열용 `ByteArraySerializer` 템플릿을 별도로 구성하여 `DeadLetterPublishingRecoverer`에 전달해야 합니다.

### 4.6 처리 시간 초과에 따른 리밸런싱
리스너 하나의 처리 시간이 `max.poll.interval.ms`(기본 5분)를 초과하면 브로커는 해당 컨슈머가 종료된 것으로 판단하고 리밸런싱을 일으킵니다. 외부 API 호출과 같이 처리 시간이 긴 로직을 리스너에서 직접 수행하면 같은 메시지가 반복 수신되는 상황이 발생하므로, 처리 시간의 상한을 기준으로 `max.poll.interval.ms`와 `max.poll.records`를 함께 조정해야 합니다.

---

## 5. 결론

Spring for Apache Kafka를 사용하면 다음과 같은 효과를 얻을 수 있습니다.

1. **인프라 코드의 제거**: 전송은 `KafkaTemplate.send()` 한 줄, 수신은 `@KafkaListener` 메서드 하나로 구성되어 폴링 루프, 스레드 관리, 직렬화 코드가 비즈니스 코드에서 분리됩니다.
2. **설정 중심의 동작 제어**: `acks`, `enable.idempotence`, `ack-mode`, `concurrency`를 `application.yml`에서 조정하므로 전송 신뢰성과 병렬 처리량을 코드 수정 없이 변경할 수 있습니다.
3. **일관된 실패 처리 정책**: `DefaultErrorHandler`와 Dead Letter Topic 구성으로 재시도 횟수와 실패 메시지 보관 위치를 전역 정책으로 관리할 수 있습니다.
4. **서비스 간 결합도 감소**: 주문 서비스는 알림 서비스의 장애 여부와 무관하게 이벤트를 기록하고, 알림 서비스는 자신의 처리 속도에 맞춰 메시지를 수신합니다.

