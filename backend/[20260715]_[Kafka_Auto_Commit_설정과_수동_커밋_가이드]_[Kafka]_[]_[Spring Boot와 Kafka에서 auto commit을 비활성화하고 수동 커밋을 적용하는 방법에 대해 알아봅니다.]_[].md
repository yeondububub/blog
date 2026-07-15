# Spring Boot & Kafka: Auto Commit 비활성화와 수동 커밋(Manual Commit) 적용 가이드

메시지 브로커로 **Apache Kafka**를 도입하여 마이크로서비스 간 이벤트를 발행/구독할 때 가장 중요하게 고려해야 하는 요소 중 하나는 바로 **메시지 처리의 신뢰성(Reliability)**입니다. 

카프카 컨슈머(Consumer)는 자신이 큐에서 읽어온 메시지의 위치인 **오프셋(Offset)**을 카프카 서버에 커밋하여 어디까지 처리했는지를 기록합니다. 이 오프셋 커밋 방식에는 자동으로 처리되는 **자동 커밋(Auto Commit)**과 개발자가 직접 제어하는 **수동 커밋(Manual Commit)**이 있습니다.

이번 글에서는 자동 커밋의 위험성을 알아보고, Spring Boot 환경에서 자동 커밋을 비활성화한 뒤 수동 커밋(Manual Commit)을 적용하는 방법을 설명합니다.

---

## 1. Auto Commit(자동 커밋)의 동작 메커니즘과 한계

카프카 컨슈머의 기본 설정은 자동 커밋(`enable.auto.commit = true`)입니다. 이 설정이 활성화되어 있으면 컨슈머는 일정한 시간 간격(`auto.commit.interval.ms`, 기본값 5초)마다 최근 `poll()` 메서드로 읽어온 가장 마지막 오프셋을 카프카 브로커에 자동으로 커밋합니다.

### 💡 자동 커밋의 위험성: 메시지 유실(Message Loss)과 중복 처리

자동 커밋은 구현이 매우 단순하다는 장점이 있지만, 실제 운영 환경에서는 다음과 같은 심각한 문제를 야기할 수 있습니다.

* **메시지 유실 (Message Loss):**
  * 컨슈머가 `poll()`을 통해 대량의 메시지를 가져온 후, 아직 비즈니스 로직(DB 저장, 외부 API 호출 등)을 처리하는 도중에 백그라운드 스레드에 의해 자동 커밋이 실행될 수 있습니다.
  * 만약 커밋이 발생한 직후 비즈니스 로직 처리 과정에서 에러가 발생하거나 애플리케이션 서버가 강제 종료(OOM, 배포 등으로 인한 셧다운)된다면 어떻게 될까요?
  * 브로커에는 이미 해당 오프셋이 성공적으로 처리된 것으로 기록되었기 때문에, 서버가 재시작된 후 컨슈머는 실패한 메시지 다음부터 읽게 됩니다. 결과적으로 **처리되지 못한 메시지가 유실**됩니다.
* **메시지 중복 처리 (Duplicate Processing):**
  * 반대로 메시지 처리는 완료되었으나 다음 자동 커밋이 돌기 전에 컨슈머가 다운된다면, 리밸런싱(Rebalancing) 이후 다른 컨슈머가 동일한 메시지를 다시 읽어와 **중복으로 처리**하게 됩니다.

> **결론:** 메시지 유실 없이 최소 한 번 배달(At-Least-Once Delivery)을 보장하려면, 비즈니스 로직이 완전히 성공한 시점에만 오프셋을 기록하는 **수동 커밋(Manual Commit)**이 필수적입니다.

---

## 2. YAML 설정을 통한 Auto Commit 비활성화

수동 커밋을 사용하려면 먼저 컨슈머 설정에서 자동 커밋을 꺼야 합니다. `application.yml` 파일에서 다음과 같이 `enable-auto-commit: false`를 설정합니다.

```yaml
  kafka:
    bootstrap-servers: localhost:9092
    consumer:
      group-id: notice-board-article-read-service
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      enable-auto-commit: false
```

* **`enable-auto-commit: false`:** 백그라운드 스레드에 의한 자동 오프셋 커밋 동작을 중단합니다.

---

## 3. Spring Kafka Container와 AckMode 설정

YAML에서 카프카 컨슈머 자체의 자동 커밋을 껐더라도, **Spring Kafka 라이브러리 레벨의 설정**이 추가로 필요합니다. 

Spring Kafka는 카프카의 raw 컨슈머를 래핑하여 메시지 리스너 컨테이너(`KafkaListenerContainerFactory`)를 관리합니다. 이 컨테이너는 메시지 수신 후 어떻게 오프셋을 커밋할지 결정하는 **`AckMode`** 설정을 가집니다.

```java
@Configuration
public class KafkaConfig {

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory(
            ConsumerFactory<String, String> consumerFactory
    ) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory = new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        
        // 오프셋 커밋을 개발자가 소스코드에서 수동으로 제어하도록 설정
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL);
        
        return factory;
    }
}
```

### 🔍 Spring Kafka의 주요 AckMode 설정값
Spring Kafka는 다양한 레벨의 오프셋 커밋 모드를 제공합니다. 상황에 맞게 적절한 방식을 선택해야 합니다.

| AckMode 설정값 | 설명 |
| :--- | :--- |
| **`RECORD`** | 리스너가 레코드(메시지) 하나를 처리한 후 즉시 커밋합니다. |
| **`BATCH`** | `poll()`을 통해 가져온 레코드 배치 전체가 성공적으로 처리되면 커밋합니다. (Spring Kafka의 기본값) |
| **`TIME`** | 이전 커밋 이후 설정한 시간(`ackTime`)이 지나면 커밋합니다. |
| **`COUNT`** | 이전 커밋 이후 설정한 개수(`ackCount`)만큼 레코드가 처리되면 커밋합니다. |
| **`COUNT_TIME`** | `TIME` 또는 `COUNT` 조건 중 하나라도 충족되면 커밋합니다. |
| **`MANUAL`** | 리스너 스레드가 직접 `Acknowledgment.acknowledge()`를 호출하면 오프셋을 커밋 큐에 대기시킵니다. 이후 다음 `poll()`이 호출되거나 리스너가 반환될 때 커밋이 수행됩니다. |
| **`MANUAL_IMMEDIATE`** | 리스너 스레드가 `Acknowledgment.acknowledge()`를 호출하는 즉시 브로커에 동기 커밋을 요청합니다. |

여기서는 메시지 처리 완료 시점의 명확한 제어를 위해 **`AckMode.MANUAL`** 방식을 선택했습니다.

---

## 4. 수동 커밋(Manual Commit) 컨슈머 구현

이제 `@KafkaListener`가 적용된 컨슈머 클래스에서 메시지 처리가 정상 완료된 후 직접 오프셋을 커밋하도록 작성합니다.

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class HotArticleEventConsumer {
    private final HotArticleService hotArticleService;

    @KafkaListener(topics = {
            EventType.Topic.NOTICE_BOARD_ARTICLE,
            EventType.Topic.NOTICE_BOARD_COMMENT,
            EventType.Topic.NOTICE_BOARD_LIKE,
            EventType.Topic.NOTICE_BOARD_VIEW
    })
    public void listen(String message, Acknowledgment ack) {
        log.info("[HotArticleEventConsumer.listen] received message: {}", message);
        
        // 1. 메시지 역직렬화 및 파싱
        Event<EventPayload> event = Event.fromJson(message);
        
        if (event != null) {
            // 2. 비즈니스 로직 수행 (HotArticle 처리 서비스 호출)
            hotArticleService.handleEvent(event);
        }
        
        // 3. 수동 오프셋 커밋 수행
        // 비즈니스 로직이 예외 없이 성공적으로 끝났을 때만 실행됩니다.
        ack.acknowledge();
    }
}
```

### 💡 핵심 포인트 분석

1. **`Acknowledgment` 파라미터 주입:** 
   * 리스너 메서드의 파라미터로 `org.springframework.kafka.support.Acknowledgment` 객체를 추가합니다.
   * `AckMode.MANUAL` 또는 `MANUAL_IMMEDIATE` 설정 시 Spring이 적절한 `Acknowledgment` 객체를 동적으로 주입해 줍니다.
2. **`ack.acknowledge()` 호출:**
   * 비즈니스 로직(`hotArticleService.handleEvent(event)`)이 예외 없이 완전히 끝난 시점에 이 메서드를 호출하여 오프셋을 커밋합니다.
   * 만약 비즈니스 로직 수행 중 런타임 예외가 발생하면 `ack.acknowledge()`는 호출되지 않습니다. 따라서 해당 오프셋은 커밋되지 않고 남아 있어 실패한 이벤트를 다시 소비(Retry/Redelivery)할 수 있는 안전장치가 마련됩니다.

---

## 5. 수동 커밋 도입 시 주의할 점: 멱등성(Idempotency)

수동 커밋을 통해 메시지 유실(Message Loss)을 방지하더라도, 네트워크 장애나 리밸런싱 과정에서 **중복 소비(Duplicate Consumption)**가 발생할 가능성은 여전히 존재합니다.

예를 들어, `hotArticleService.handleEvent(event)`는 성공적으로 완료되었으나 `ack.acknowledge()`가 브로커에 도달하기 전에 네트워크 순단으로 컨슈머의 세션이 끊기면 브로커는 해당 메시지가 처리되지 않았다고 판단합니다. 이후 재할당된 다른 컨슈머가 동일한 메시지를 다시 처리하게 됩니다.

따라서 수동 커밋을 도입할 때는 반드시 **컨슈머 비즈니스 로직이 멱등성(Idempotency)을 유지**하도록 설계해야 합니다.
* **이벤트 ID 중복 체크:** 처리한 이벤트 UUID를 저장하여 이미 처리된 이벤트인 경우 무시(Deduplication)합니다.
* **Upsert 연산 활용:** DB에 단순히 추가하는 대신, 식별자를 기준으로 데이터가 있으면 업데이트하고 없으면 추가하는 방식을 사용합니다.

---

## 요약 및 정리

* **자동 커밋**은 간단하지만 비즈니스 로직의 성공 여부와 상관없이 주기적으로 커밋이 되므로 **메시지 유실**이 발생할 위험이 있습니다.
* 이를 보장하기 위해 `enable-auto-commit: false` 및 `AckMode.MANUAL` 설정을 적용하여 **수동 커밋**으로 변경합니다.
* 리스너 코드의 마지막에 `ack.acknowledge()`를 명시적으로 호출해 **최소 한 번 이상의 처리(At-least-once)**를 안전하게 달성합니다.
* 중복 메시지 처리 부작용을 막기 위해 비즈니스 로직에 **멱등성 대책**을 세웁니다.
