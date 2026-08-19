# SAGA 패턴을 활용한 분산 트랜잭션과 보상 트랜잭션 구현

마이크로서비스 아키텍처(MSA)에서는 서비스별로 독립된 데이터베이스를 보유하는 Database-per-Service 패턴이 일반적입니다. 이러한 분산 데이터 환경에서는 단일 데이터베이스의 로컬 ACID 트랜잭션을 적용할 수 없으므로, 여러 마이크로서비스에 걸쳐 실행되는 비즈니스 작업의 데이터 일관성을 유지하는 작업이 매우 복잡해집니다.

과거에 사용되던 2PC(Two-Phase Commit)나 XA 분산 트랜잭션은 모든 서비스 노드의 커밋 준비가 완료될 때까지 데이터베이스 락을 유지하므로 성능 저하와 가용성 결함을 유발합니다. 또한 Apache Kafka, AWS DynamoDB와 같은 클라우드 네이티브 인프라는 XA 트랜잭션을 지원하지 않습니다.

**SAGA 패턴은** 일련의 분산 로컬 트랜잭션을 순차적으로 실행하고, 중간 단계에서 실패가 발생할 경우 이전에 성공한 로컬 트랜잭션들을 역순으로 되돌리는 **보상 트랜잭션(Compensating Transaction)을** 실행하여 시스템의 최종 일관성(Eventual Consistency)을 달성하는 분산 아키텍처 설계 패턴입니다.

본 문서에서는 분산 환경에서 발생하는 트랜잭션 정합성 문제를 분석하고, Spring Boot와 Apache Kafka를 활용하여 오케스트레이션 기반 SAGA 패턴과 보상 트랜잭션을 구현하는 방법을 기술합니다.

---

## 1. 기술적 배경 및 문제 제기 (기존 방식의 한계점)

전통적인 모놀리식 아키텍처에서는 주문, 결제, 재고 차감 로직을 단일 데이터베이스의 `@Transactional` 경계 내에서 원자적으로 처리하였습니다. 그러나 각 도메인이 독립된 마이크로서비스로 분리되면 다음과 같은 기술적 한계에 직면합니다.

```mermaid
flowchart LR
    subgraph Traditional_2PC ["2PC (Two-Phase Commit) 분산 트랜잭션"]
        direction TB
        Coord["트랜잭션 코디네이터"] --> P1["1단계: 전체 서비스 Prepare 요청<br/>(Order, Payment, Inventory)"]
        P1 --> Lock["모든 노드 DB Lock 유지 (블로킹)"]
        Lock --> P2["2단계: 전체 서비스 Commit 확정"]
    end

    subgraph SAGA_Flow ["SAGA 패턴 (비동기 로컬 트랜잭션 체인)"]
        direction TB
        T1["1. Order 로컬 커밋"] --> T2["2. Payment 로컬 커밋"]
        T2 --> T3["3. Inventory 로컬 커밋 (실패)"]
        T3 -. "보상 트랜잭션 트리거" .-> C2["2'. Payment 취소 커밋"]
        C2 -.-> C1["1'. Order 취소 커밋"]
    end

    Traditional_2PC ~~~ SAGA_Flow
```

### 1.1 2PC(Two-Phase Commit)의 성능 및 가용성 한계
- **동기식 블로킹 오버헤드**: 2PC는 모든 참여 서비스가 응답할 때까지 데이터베이스 락(Lock)을 유지하므로, 네트워크 레이턴시가 누적되어 전체 시스템의 처리량(Throughput)이 급격히 저하됩니다.
- **단일 장애점(SPOF)**: 트랜잭션 코디네이터 노드에 장애가 발생하면 참여 노드들은 락을 해제하지 못하고 대기 상태(In-doubt State)에 빠집니다.
- **클라우드 인프라 비호환성**: 현대 메시지 브로커(Kafka, RabbitMQ) 및 NoSQL 데이터베이스는 XA 프로토콜을 지원하지 않으므로 이기종 분산 시스템 간 2PC 구성이 불가능합니다.

### 1.2 부분 실패(Partial Failure)로 인한 데이터 불일치
비동기 메시징 환경에서 주문 서비스가 주문을 생성하고 결제 서비스가 결제를 완료했으나, 재고 서비스에서 재고 부족으로 예외가 발생하면 결제 데이터만 남고 상품은 출고되지 않는 치명적인 비즈니스 결함이 발생합니다.

---

## 2. 핵심 개념 설명

SAGA 패턴은 분산 비즈니스 프로세스를 여러 개의 로컬 트랜잭션($T_1, T_2, \dots, T_n$)으로 분할하고, 각 로컬 트랜잭션에 대응하는 보상 트랜잭션($C_1, C_2, \dots, C_{n-1}$)을 정의합니다.

- **정상 흐름**: $T_1 \rightarrow T_2 \rightarrow \dots \rightarrow T_n$ (전체 성공 시 트랜잭션 완료)
- **실패 및 롤백 흐름**: $T_1 \rightarrow T_2 \rightarrow T_3(\text{실패}) \rightarrow C_2 \rightarrow C_1$ (역순으로 보상 트랜잭션을 실행하여 원복)

```mermaid
flowchart LR
    Orch["OrderSagaOrchestrator<br/>(중앙 제어 상태 머신)"]
    
    Orch -- "1. 결제 명령 (Command)" --> PaySvc["Payment Service"]
    PaySvc -- "2. 결제 완료 이벤트" --> Orch
    
    Orch -- "3. 재고 차감 명령 (Command)" --> InvSvc["Inventory Service"]
    InvSvc -- "4. 재고 부족 실패 이벤트" --> Orch
    
    Orch -. "5. 결제 취소 명령 (Compensate)" .-> PaySvc
    Orch -. "6. 주문 취소 명령 (Compensate)" .-> OrderSvc["Order Service"]
```

### 2.1 코레오그래피(Choreography) vs 오케스트레이션(Orchestration)

| 비교 항목 | 코레오그래피 (Choreography) | 오케스트레이션 (Orchestration) |
| :--- | :--- | :--- |
| **제어 방식** | 중앙 제어자 없이 각 서비스가 이벤트를 구독하여 다음 작업 실행 | 전담 오케스트레이터가 워크플로우와 상태를 중앙에서 제어 |
| **서비스 결합도** | 낮음 (이벤트 기반 느슨한 결합) | 오케스트레이터에 대한 의존성 존재 |
| **복잡도** | 서비스 수가 증가하면 이벤트 순환 참조 및 흐름 파악 어려움 | 전체 트랜잭션 상태 및 롤백 흐름 추적이 명확함 |
| **적합한 환경** | 참여 서비스가 2~3개인 단순 비즈니스 흐름 | 참여 서비스가 많고 롤백 분기가 복잡한 금융/주문 도메인 |

---

## 3. 코드 구현 및 라인별 상세 분석

본 구현은 **오케스트레이션 기반 SAGA 패턴**을 적용하여 주문 생성 시 결제 승인과 재고 차감을 조율하고, 재고 부족 시 결제를 환불하고 주문을 취소하는 예제입니다.

### 3.1 SAGA 상태 및 이벤트 모델 정의

```java
package com.example.blog.saga.model;

import java.io.Serializable;
import java.math.BigDecimal;

public class OrderSagaState implements Serializable {

    private static final long serialVersionUID = 1L;

    public enum SagaStatus {
        STARTED,
        PAYMENT_SUCCESS,
        INVENTORY_SUCCESS,
        COMPENSATING,
        FAILED,
        COMPLETED
    }

    private String sagaId;
    private Long orderId;
    private Long productId;
    private int quantity;
    private BigDecimal amount;
    private SagaStatus status;

    public OrderSagaState() {}

    public OrderSagaState(String sagaId, Long orderId, Long productId, int quantity, BigDecimal amount) {
        this.sagaId = sagaId;
        this.orderId = orderId;
        this.productId = productId;
        this.quantity = quantity;
        this.amount = amount;
        this.status = SagaStatus.STARTED;
    }

    public String getSagaId() { return sagaId; }
    public Long getOrderId() { return orderId; }
    public Long getProductId() { return productId; }
    public int getQuantity() { return quantity; }
    public BigDecimal getAmount() { return amount; }
    public SagaStatus getStatus() { return status; }
    public void setStatus(SagaStatus status) { this.status = status; }
}
```

### 3.2 SAGA 오케스트레이터 구현 (OrderSagaOrchestrator)

```java
package com.example.blog.saga.orchestrator;

import com.example.blog.saga.model.OrderSagaState;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 주문 분산 트랜잭션의 상태 머신을 관리하는 SAGA 오케스트레이터
 */
@Component
public class OrderSagaOrchestrator {

    private final KafkaTemplate<String, Object> kafkaTemplate;
    // 실무 환경에서는 Redis나 RDB에 Saga 상태를 영속화하여 관리합니다.
    private final Map<String, OrderSagaState> sagaRepository = new ConcurrentHashMap<>();

    public OrderSagaOrchestrator(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * SAGA 시작점: 결제 명령 발행
     */
    public void startSaga(OrderSagaState sagaState) {
        sagaRepository.put(sagaState.getSagaId(), sagaState);
        
        // 1. 결제 서비스로 결제 명령(Command)을 발행합니다.
        kafkaTemplate.send("payment-commands", sagaState.getSagaId(), sagaState);
    }

    /**
     * 결제 처리 결과 수신
     */
    @KafkaListener(topics = "payment-events", groupId = "saga-orchestrator-group")
    public void handlePaymentEvent(OrderSagaState event) {
        OrderSagaState state = sagaRepository.get(event.getSagaId());
        if (state == null) return;

        if (event.getStatus() == OrderSagaState.SagaStatus.PAYMENT_SUCCESS) {
            state.setStatus(OrderSagaState.SagaStatus.PAYMENT_SUCCESS);
            // 2. 결제 성공 시 다음 단계인 재고 차감 명령을 발행합니다.
            kafkaTemplate.send("inventory-commands", state.getSagaId(), state);
        } else {
            // 결제 실패 시 즉시 주문 취소 보상 트랜잭션을 실행합니다.
            state.setStatus(OrderSagaState.SagaStatus.FAILED);
            kafkaTemplate.send("order-cancel-commands", state.getSagaId(), state);
        }
    }

    /**
     * 재고 처리 결과 수신 및 보상 트랜잭션 조율
     */
    @KafkaListener(topics = "inventory-events", groupId = "saga-orchestrator-group")
    public void handleInventoryEvent(OrderSagaState event) {
        OrderSagaState state = sagaRepository.get(event.getSagaId());
        if (state == null) return;

        if (event.getStatus() == OrderSagaState.SagaStatus.INVENTORY_SUCCESS) {
            // 3. 재고 차감까지 성공하면 전체 SAGA 트랜잭션을 완료 처리합니다.
            state.setStatus(OrderSagaState.SagaStatus.COMPLETED);
            kafkaTemplate.send("order-complete-commands", state.getSagaId(), state);
        } else {
            // 4. 재고 차감 실패 시 역순으로 결제 환불 및 주문 취소 보상 트랜잭션을 트리거합니다.
            state.setStatus(OrderSagaState.SagaStatus.COMPENSATING);
            kafkaTemplate.send("payment-compensate-commands", state.getSagaId(), state);
            kafkaTemplate.send("order-cancel-commands", state.getSagaId(), state);
        }
    }
}
```

### 3.3 결제 서비스 및 보상 트랜잭션 리스너 (PaymentService)

```java
package com.example.blog.payment.service;

import com.example.blog.saga.model.OrderSagaState;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentService {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public PaymentService(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * 정상 결제 처리 로컬 트랜잭션
     */
    @Transactional
    @KafkaListener(topics = "payment-commands", groupId = "payment-service-group")
    public void processPayment(OrderSagaState command) {
        try {
            // 실제 결제 승인 비즈니스 로직 수행 (PG 연동 및 잔액 차감)
            boolean paymentSuccess = executePayment(command.getOrderId(), command.getAmount());

            if (paymentSuccess) {
                command.setStatus(OrderSagaState.SagaStatus.PAYMENT_SUCCESS);
            } else {
                command.setStatus(OrderSagaState.SagaStatus.FAILED);
            }
        } catch (Exception ex) {
            command.setStatus(OrderSagaState.SagaStatus.FAILED);
        }

        // 결과를 오케스트레이터 응답 토픽으로 전송합니다.
        kafkaTemplate.send("payment-events", command.getSagaId(), command);
    }

    /**
     * 결제 취소 보상 트랜잭션 (Compensating Transaction)
     */
    @Transactional
    @KafkaListener(topics = "payment-compensate-commands", groupId = "payment-service-group")
    public void compensatePayment(OrderSagaState command) {
        // 이미 승인된 결제 내역을 조회하여 환불 처리를 실행합니다.
        refundPayment(command.getOrderId(), command.getAmount());
    }

    private boolean executePayment(Long orderId, java.math.BigDecimal amount) {
        return true;
    }

    private void refundPayment(Long orderId, java.math.BigDecimal amount) {
        // 환불 API 호출 및 DB 결제 상태 CANCELLED 변경
    }
}
```

### 3.4 재고 서비스 및 로컬 트랜잭션 (InventoryService)

```java
package com.example.blog.inventory.service;

import com.example.blog.saga.model.OrderSagaState;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class InventoryService {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public InventoryService(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    /**
     * 재고 차감 로컬 트랜잭션
     */
    @Transactional
    @KafkaListener(topics = "inventory-commands", groupId = "inventory-service-group")
    public void deductInventory(OrderSagaState command) {
        boolean stockDeducted = executeDeduct(command.getProductId(), command.getQuantity());

        if (stockDeducted) {
            command.setStatus(OrderSagaState.SagaStatus.INVENTORY_SUCCESS);
        } else {
            // 재고가 부족하여 실패 상태를 오케스트레이터로 반환합니다.
            command.setStatus(OrderSagaState.SagaStatus.FAILED);
        }

        kafkaTemplate.send("inventory-events", command.getSagaId(), command);
    }

    private boolean executeDeduct(Long productId, int quantity) {
        // DB 재고 수량 확인 및 차감 쿼리 실행 (재고 부족 시 false 반환)
        return false; // 재고 부족 실패 시나리오 재현
    }
}
```

- **코드 분석 및 효율성**:
  - **비동기 이벤트 기반 상태 전이**: 동기식 HTTP 통신 대신 Kafka 토픽을 활용하여 서비스 간 타임아웃 전파를 차단하고 장애 격리를 구현합니다.
  - **독립 로컬 트랜잭션 커밋**: 각 서비스는 자신의 데이터베이스 트랜잭션만 짧게 점유하고 커밋하므로 락 경합 없이 처리량을 극대화합니다.
  - **역순 보상 체인 보장**: 재고 차감 실패 시 오케스트레이터가 `payment-compensate-commands`와 `order-cancel-commands`를 즉시 트리거하여 최종 일관성을 보장합니다.

---

## 4. 적용 시 고려해야 할 점 (주의사항 및 예외 처리)

### 4.1 ACID 격리성(Isolation) 부재와 세만틱 락(Semantic Lock)
SAGA 패턴은 각 단계의 로컬 트랜잭션이 즉시 커밋되므로, 전체 프로세스가 완료되기 전의 중간 상태가 외부 조회 쿼리에 노출될 수 있습니다.
- **대응 방안**: 엔티티에 `PENDING` 상태 플래그를 도입(예: `ORDER_PENDING`)하여, SAGA가 완전히 완료되기 전까지는 해당 엔티티에 대한 다른 트랜잭션의 수정이나 중복 결제를 제한하는 **Semantic Lock**을 적용해야 합니다.

### 4.2 보상 트랜잭션의 절대적 성공 보장 (Idempotent Consumer)
보상 트랜잭션은 롤백할 대상이 없으므로 **반드시 성공해야 합니다**.
- 네트워크 장애로 인해 동일한 보상 명령이 중복 인입되더라도 중복 환불이 발생하지 않도록 **컨슈머 멱등성(Idempotency)을** 필수로 구현해야 합니다.
- 시스템 장애로 보상 트랜잭션이 실패할 경우, 무한 재시도(Exponential Backoff) 및 Dead Letter Topic(DLT) 격리 후 운영자 알림 파이프라인을 구축해야 합니다.

### 4.3 피벗 트랜잭션(Pivot Transaction) 설계
SAGA 흐름에서 보상 불가능한 액션(예: 실제 이메일 발송, 외부 제휴사 API 확정)은 반드시 전체 비즈니스 흐름의 **가장 마지막 단계(피벗 이후)에** 배치해야 합니다.

---

## 5. 결론 (해당 기술의 기대효과 요약)

SAGA 패턴은 분산 마이크로서비스 환경에서 2PC 분산 트랜잭션의 성능 병목을 해결하는 핵심 아키텍처 패턴입니다.

1. **무손실 데이터 최종 일관성 확보**: 분산 노드 장애나 비즈니스 예외 발생 시 자동화된 보상 트랜잭션을 통해 시스템 상태를 안전하게 원복합니다.
2. **서비스 독립성 및 확장성 극대화**: 동기식 락 대기 없이 서비스별 로컬 트랜잭션만 커밋하므로 대규모 트래픽 환경에서도 안정적인 처리량을 유지합니다.
3. **복원력(Resilience) 강화**: 일시적인 서비스 지연이나 장애가 전체 시스템 셧다운으로 전파되지 않고 비동기 큐를 통해 안전하게 격리됩니다.
