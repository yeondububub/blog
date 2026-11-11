# ApplicationEventPublisher와 TransactionalEventPublisher를 활용한 리액티브 트랜잭션 이벤트 발행

결제 승인이나 주문 처리와 같은 핵심 비즈니스 로직은 데이터베이스 상태 변경 이후 외부 메시지 브로커(Kafka, RabbitMQ)로 이벤트를 전송하거나 후속 알림을 발송하는 부가 작업을 동반합니다. 이때 핵심 도메인 로직과 부가 로직을 하나의 서비스 메서드 안에 직접 작성하면 컴포넌트 간 결합도가 높아지고 트랜잭션 경계가 모호해집니다.

Spring 프레임워크는 도메인 간 결합을 분리하기 위해 `ApplicationEventPublisher` 기반의 이벤트 발행 메커니즘을 제공합니다. 나아가 Spring WebFlux와 R2DBC 기반의 리액티브 프로그래밍 환경에서는 리액티브 스트림의 트랜잭션 컨텍스트와 이벤트 발행 시점을 동기화하기 위해 `TransactionalEventPublisher`를 함께 사용합니다.

본 문서에서는 리액티브 환경에서 기존 이벤트 발행 방식이 가지는 한계를 분석하고, `ApplicationEventPublisher`와 `TransactionalEventPublisher`의 동작 원리 및 구현 방식을 기술합니다.

---

## 1. 기술적 배경 및 문제 제기 (기존 방식의 한계점)

결제 상태 갱신과 메시지 발행 로직을 처리할 때 발생하는 기존 방식의 구조적 한계는 다음과 같습니다.

<div class="diagram-container">
<svg role="img" aria-labelledby="legacy-event-limit-title legacy-event-limit-desc" viewBox="0 0 960 320" xmlns="http://www.w3.org/2000/svg">
  <title id="legacy-event-limit-title">기존 이벤트 발행 방식의 구조적 한계 비교</title>
  <desc id="legacy-event-limit-desc">직접 호출 방식의 도메인 강결합 문제와 일반 ApplicationEventPublisher 호출 시 리액티브 트랜잭션 커밋 전 이벤트가 조기 발행되는 한계를 비교하는 다이어그램</desc>
  <defs>
    <marker id="arr-legacy-ink" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#4f5d75"/>
    </marker>
    <marker id="arr-legacy-accent" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#bf4520"/>
    </marker>
  </defs>

  <!-- Canvas Background -->
  <rect width="960" height="320" fill="#f5f5f5" rx="8"/>

  <!-- Left Zone: 1. 직접 호출 방식 -->
  <rect x="24" y="24" width="444" height="272" rx="6" fill="#ececec" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="5 3"/>
  <text x="44" y="48" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#4f5d75">1. 직접 호출 방식 (도메인 간 강한 결합)</text>

  <!-- Right Zone: 2. 일반 ApplicationEventPublisher 단독 호출 -->
  <rect x="492" y="24" width="444" height="272" rx="6" fill="#ececec" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="5 3"/>
  <text x="512" y="48" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#4f5d75">2. 일반 ApplicationEventPublisher 호출 (컨텍스트 단절)</text>

  <!-- 1. ARROWS (Drawn before boxes) -->
  <!-- Left Zone Arrows -->
  <path d="M 196 144 L 228 144 Q 236 144 236 136 L 236 116 Q 236 108 244 108 L 276 108" fill="none" stroke="#4f5d75" stroke-width="1.25" marker-end="url(#arr-legacy-ink)"/>
  <path d="M 196 168 L 228 168 Q 236 168 236 188 L 236 208 Q 236 216 244 216 L 276 216" fill="none" stroke="#4f5d75" stroke-width="1.25" marker-end="url(#arr-legacy-ink)"/>

  <!-- Right Zone Arrows -->
  <line x1="652" y1="108" x2="732" y2="108" stroke="#4f5d75" stroke-width="1.25" marker-end="url(#arr-legacy-ink)"/>
  <path d="M 822 136 L 822 160 Q 822 168 814 168 L 590 168 Q 582 168 582 176 L 582 188" fill="none" stroke="#4f5d75" stroke-width="1.25" stroke-dasharray="5 3" marker-end="url(#arr-legacy-ink)"/>
  <line x1="652" y1="216" x2="732" y2="216" stroke="#bf4520" stroke-width="1.75" marker-end="url(#arr-legacy-accent)"/>

  <!-- Arrow Label Mask & Text -->
  <rect x="612" y="152" width="176" height="20" rx="2" fill="#ececec"/>
  <text x="700" y="166" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="500" fill="#5a6580">Reactor Context 조회 불가</text>

  <!-- 2. NODES -->
  <!-- Left Zone Nodes -->
  <rect x="44" y="128" width="152" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="120" y="152" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">PaymentService</text>
  <text x="120" y="170" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">@Transactional</text>

  <rect x="276" y="80" width="172" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="362" y="104" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">R2DBC 상태 저장</text>
  <text x="362" y="122" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">PaymentRepository</text>

  <rect x="276" y="188" width="172" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="362" y="212" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Kafka 직접 전송</text>
  <text x="362" y="230" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">네트워크 지연 전파</text>

  <!-- Right Zone Nodes -->
  <rect x="512" y="80" width="140" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="582" y="104" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">PaymentService</text>
  <text x="582" y="122" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">Reactive Chain</text>

  <rect x="732" y="80" width="180" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="822" y="104" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">R2DBC 트랜잭션 진행 중</text>
  <text x="822" y="122" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">미커밋 상태 (Uncommitted)</text>

  <rect x="512" y="188" width="140" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="582" y="212" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142"> 동기 이벤트 발행</text>
  <text x="582" y="230" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">publishEvent() : Unit</text>

  <!-- Focal Problem Node (Accent) -->
  <rect x="732" y="188" width="180" height="56" rx="4" fill="rgba(191,69,32,0.08)" stroke="#bf4520" stroke-width="1.75"/>
  <text x="822" y="212" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#bf4520">커밋 전 리스너 조기 실행</text>
  <text x="822" y="230" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">롤백 시 유령 이벤트 발생</text>
</svg>
</div>

### 1.1 직접 호출로 인한 도메인 간 강한 결합과 단일 책임 원칙 위반
결제 완료 후 Kafka로 메시지를 전송하는 컴포넌트를 비즈니스 서비스(`PaymentService`)가 직접 참조하여 호출하면, 메시지 브로커의 전송 방식이나 스키마가 변경될 때 결제 도메인 코드까지 함께 수정되어야 합니다. 또한 외부 브로커의 일시적인 네트워크 지연이 데이터베이스 트랜잭션의 점유 시간을 늘려 커넥션 풀 고갈을 유발합니다.

### 1.2 ThreadLocal 기반 트랜잭션 동기화의 한계
전통적인 Spring MVC(JDBC) 환경에서는 `@Transactional`의 트랜잭션 상태가 `ThreadLocal` 기반의 `TransactionSynchronizationManager`에 저장됩니다. 따라서 `ApplicationEventPublisher.publishEvent()`를 호출하면 현재 스레드의 `ThreadLocal`을 참조하여 트랜잭션 커밋 이후(`AFTER_COMMIT`)에 리스너가 실행되도록 지연시킬 수 있습니다.

반면 Spring WebFlux와 R2DBC 환경에서는 하나의 요청 파이프라인이 여러 이벤트 루프 스레드를 오가며 비동기로 실행됩니다. 리액티브 트랜잭션의 상태는 `ThreadLocal`이 아닌 Project Reactor의 구독 컨텍스트(`ContextView`) 내부에 보관됩니다.

### 1.3 리액티브 스트림에서 일반 `ApplicationEventPublisher` 호출 시 발생하는 문제
`ApplicationEventPublisher.publishEvent(Object)` 메서드는 반환 타입이 `void`(Kotlin의 `Unit`)인 동기 메서드입니다. 리액티브 체인 내부에서 이 메서드를 직접 호출하면 다음과 같은 문제가 발생합니다.
- **리액티브 Context 접근 불가**: `Mono`나 `Flux` 체인에 연결되지 않는 일반 메서드이므로 Reactor의 `ContextView`에 저장된 리액티브 트랜잭션 정보를 읽어올 수 없습니다.
- **트랜잭션 커밋 전 조기 발행**: 활성화된 리액티브 트랜잭션을 인식하지 못하므로, 데이터베이스 커밋이 완료되기 전에 이벤트가 즉시 발행됩니다. 이후 단계에서 R2DBC 트랜잭션이 롤백되더라도 이미 발행된 이벤트는 취소할 수 없어 데이터 정합성이 깨집니다.

---

## 2. 핵심 개념 설명

리액티브 파이프라인에서 트랜잭션 생명주기와 이벤트 발행을 결합하는 두 핵심 컴포넌트의 역할은 다음과 같습니다.

<div class="diagram-container">
<svg role="img" aria-labelledby="reactive-tx-seq-title reactive-tx-seq-desc" viewBox="0 0 960 400" xmlns="http://www.w3.org/2000/svg">
  <title id="reactive-tx-seq-title">TransactionalEventPublisher와 리액티브 트랜잭션 컨텍스트 동작 시퀀스</title>
  <desc id="reactive-tx-seq-desc">PaymentService가 TransactionalEventPublisher를 구독하여 Reactor ContextView에 트랜잭션 동기화를 등록하고 R2DBC 커밋 직후 ApplicationEventPublisher를 통해 리스너로 이벤트를 전달하는 과정</desc>
  <defs>
    <marker id="seq-arr-ink" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#2d3142"/>
    </marker>
    <marker id="seq-arr-muted" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#4f5d75"/>
    </marker>
    <marker id="seq-arr-accent" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#bf4520"/>
    </marker>
  </defs>

  <!-- Canvas Background -->
  <rect width="960" height="400" fill="#f5f5f5" rx="8"/>

  <!--Lifelines (Vertical dashed lines at x = 104, 296, 488, 680, 864) -->
  <line x1="104" y1="76" x2="104" y2="368" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="296" y1="76" x2="296" y2="368" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="488" y1="76" x2="488" y2="368" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="680" y1="76" x2="680" y2="368" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="3 4"/>
  <line x1="864" y1="76" x2="864" y2="368" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="3 4"/>

  <!-- Activation Bars (Width 8px, centered on lifelines) -->
  <rect x="100" y="100" width="8" height="196" rx="1" fill="#ececec" stroke="#2d3142" stroke-width="1"/>
  <rect x="292" y="112" width="8" height="128" rx="1" fill="rgba(191,69,32,0.08)" stroke="#bf4520" stroke-width="1"/>
  <rect x="484" y="156" width="8" height="168" rx="1" fill="#ececec" stroke="#2d3142" stroke-width="1"/>
  <rect x="676" y="308" width="8" height="44" rx="1" fill="#ececec" stroke="#2d3142" stroke-width="1"/>
  <rect x="860" y="328" width="8" height="24" rx="1" fill="#ececec" stroke="#2d3142" stroke-width="1"/>

  <!-- 1. SEQUENCE MESSAGES (Arrows drawn with mask rects behind labels) -->
  <!-- Step 1: Service -> TEP -->
  <line x1="108" y1="120" x2="292" y2="120" stroke="#2d3142" stroke-width="1.25" marker-end="url(#seq-arr-ink)"/>
  <rect x="120" y="96" width="160" height="18" fill="#f5f5f5"/>
  <text x="200" y="109" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="500" fill="#2d3142">1. publishEvent() 구독</text>

  <!-- Step 2: TEP -> TSM -->
  <line x1="300" y1="164" x2="484" y2="164" stroke="#bf4520" stroke-width="1.5" marker-end="url(#seq-arr-accent)"/>
  <rect x="302" y="140" width="180" height="18" fill="#f5f5f5"/>
  <text x="392" y="153" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="500" fill="#bf4520">2. ContextView 동기화 등록</text>

  <!-- Step 3: TSM -->> TEP -->
  <line x1="484" y1="208" x2="300" y2="208" stroke="#4f5d75" stroke-width="1.25" stroke-dasharray="5 3" marker-end="url(#seq-arr-muted)"/>
  <rect x="312" y="184" width="160" height="18" fill="#f5f5f5"/>
  <text x="392" y="197" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#4f5d75">registerSynchronization()</text>

  <!-- Step 4: TEP -->> Service -->
  <line x1="292" y1="236" x2="108" y2="236" stroke="#4f5d75" stroke-width="1.25" stroke-dasharray="5 3" marker-end="url(#seq-arr-muted)"/>
  <rect x="120" y="212" width="160" height="18" fill="#f5f5f5"/>
  <text x="200" y="225" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#4f5d75">thenReturn(eventMessage)</text>

  <!-- Step 5: Service -> TSM -->
  <line x1="108" y1="280" x2="484" y2="280" stroke="#2d3142" stroke-width="1.25" marker-end="url(#seq-arr-ink)"/>
  <rect x="216" y="256" width="160" height="18" fill="#f5f5f5"/>
  <text x="296" y="269" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="500" fill="#2d3142">3. R2DBC 트랜잭션 커밋</text>

  <!-- Step 6: TSM -> AEP -->
  <line x1="492" y1="316" x2="676" y2="316" stroke="#bf4520" stroke-width="1.75" marker-end="url(#seq-arr-accent)"/>
  <rect x="494" y="292" width="180" height="18" fill="#f5f5f5"/>
  <text x="584" y="305" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#bf4520">4. afterCommit() 위임 발행</text>

  <!-- Step 7: AEP -> Listener -->
  <line x1="684" y1="340" x2="860" y2="340" stroke="#2d3142" stroke-width="1.25" marker-end="url(#seq-arr-ink)"/>
  <rect x="696" y="316" width="152" height="18" fill="#f5f5f5"/>
  <text x="772" y="329" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="500" fill="#2d3142">5. AFTER_COMMIT 수신</text>

  <!-- 2. PARTICIPANT HEADER BOXES -->
  <rect x="24" y="24" width="160" height="52" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="104" y="46" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">PaymentService</text>
  <text x="104" y="64" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">@Transactional</text>

  <!-- Focal Participant: TransactionalEventPublisher -->
  <rect x="192" y="24" width="208" height="52" rx="4" fill="rgba(191,69,32,0.08)" stroke="#bf4520" stroke-width="1.75"/>
  <text x="296" y="46" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#bf4520">TransactionalEventPublisher</text>
  <text x="296" y="64" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">Reactive Adapter</text>

  <rect x="412" y="24" width="152" height="52" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="488" y="46" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">TransactionContext</text>
  <text x="488" y="64" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">Reactor ContextView</text>

  <rect x="580" y="24" width="200" height="52" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="680" y="46" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">ApplicationEventPublisher</text>
  <text x="680" y="64" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">Event Delegate</text>

  <rect x="792" y="24" width="144" height="52" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="864" y="46" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">EventStreamSender</text>
  <text x="864" y="64" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">AFTER_COMMIT</text>
</svg>
</div>

### 2.1 `ApplicationEventPublisher`의 역할
Spring의 `ApplicationContext`가 구현하는 인터페이스로, 옵저버 패턴(Observer Pattern)을 기반으로 애플리케이션 내부에서 발생한 이벤트를 등록된 리스너(`@EventListener`, `@TransactionalEventListener`)에게 브로드캐스팅하는 역할을 담당합니다. 이벤트를 발행하는 주체(Publisher)는 이벤트를 누가 수신하여 처리하는지(Consumer) 알 필요가 없으므로 도메인 간 의존성이 분리됩니다.

### 2.2 `TransactionalEventPublisher`의 역할
`org.springframework.transaction.reactive.TransactionalEventPublisher`는 내부에 `ApplicationEventPublisher`를 위임(Delegate) 객체로 보유하며, 리액티브 스트림 환경에서 트랜잭션 컨텍스트를 인식하여 이벤트를 발행하는 어댑터 클래스입니다.
- **리액티브 반환 타입(`Mono<Void>`)**: 동기식 `void` 대신 `Mono<Void>`를 반환하여 리액티브 체인의 연산자(`flatMap`, `then` 등)와 결합됩니다.
- **Reactor Context 기반 트랜잭션 감지**: 구독 시점에 Reactor의 `ContextView`에서 `ReactiveTransactionSynchronization`을 조회합니다. 활성 트랜잭션이 존재하면 이벤트를 즉시 발행하지 않고 트랜잭션 동기화 콜백에 등록하여 트랜잭션 커밋 또는 롤백 시점과 이벤트 발행 시점을 일치시킵니다.

### 2.3 두 방식의 비교

| 구분 | `ApplicationEventPublisher` 단독 사용 | `TransactionalEventPublisher` 래핑 사용 |
| :--- | :--- | :--- |
| **메서드 시그니처** | `fun publishEvent(event: Any): Unit` | `fun publishEvent(event: Any): Mono<Void>` |
| **트랜잭션 컨텍스트 참조** | `ThreadLocal` 참조 (Spring MVC / JDBC 환경) | Reactor `ContextView` 참조 (WebFlux / R2DBC 환경) |
| **리액티브 체인 결합** | 체인 외부에서 동기 실행 (`doOnNext` 등 필요) | `flatMap`, `delayUntil` 등 연산자에 직접 연결 |
| **R2DBC 트랜잭션 연동** | 리액티브 트랜잭션 감지 불가 | 리액티브 트랜잭션 커밋/롤백 단계와 연동 가능 |

---

## 3. 코드 구현 및 라인별 상세 분석

결제 도메인에서 결제 이벤트를 리액티브 트랜잭션 컨텍스트에 맞춰 발행하는 퍼블리셔와 서비스, 리스너의 구현 코드는 다음과 같습니다.

### 3.1 결제 이벤트 메시지 모델 및 퍼블리셔 (`PaymentEventMessagePublisher.kt`)

```kotlin
package com.example.payment.adapter.out.stream

import com.example.payment.domain.PaymentEventMessage
import org.springframework.context.ApplicationEventPublisher
import org.springframework.stereotype.Component
import org.springframework.transaction.reactive.TransactionalEventPublisher
import reactor.core.publisher.Mono

/**
 * 리액티브 트랜잭션 컨텍스트와 연동하여 결제 이벤트를 발행하는 컴포넌트
 */
@Component
class PaymentEventMessagePublisher(
    publisher: ApplicationEventPublisher
) {
    // Spring의 기본 ApplicationEventPublisher를 감싸서 리액티브 트랜잭션을 인식하도록 구성함
    private val transactionalEventPublisher = TransactionalEventPublisher(publisher)

    /**
     * 결제 이벤트 메시지를 리액티브 스트림 내에서 발행하고 원본 메시지를 다음 체인으로 전달합니다.
     */
    fun publishEvent(paymentEventMessage: PaymentEventMessage): Mono<PaymentEventMessage> {
        // 1. publishEvent(Object)는 현재 Reactor Context의 트랜잭션에 이벤트를 등록하고 Mono<Void>를 반환함
        // 2. thenReturn()을 통해 완료 신호 직후 원본 paymentEventMessage 객체를 스트림에 다시 방출함
        return transactionalEventPublisher.publishEvent(paymentEventMessage)
            .thenReturn(paymentEventMessage)
    }
}
```

- **구현 상세 분석 및 효율성**:
  - **생성자 주입과 인스턴스화**: `TransactionalEventPublisher`는 별도의 Spring Bean으로 자동 등록되지 않는 헬퍼 클래스이므로, 생성자에서 주입받은 `ApplicationEventPublisher`를 인자로 전달하여 필드로 초기화합니다. 매 호출마다 객체를 새로 생성하지 않고 싱글톤 컴포넌트의 필드로 재사용하여 불필요한 메모리 할당을 방지합니다.
  - **`thenReturn(paymentEventMessage)`의 사용 이유**: `transactionalEventPublisher.publishEvent()`의 반환 타입은 `Mono<Void>`입니다. `Mono<Void>`는 작업 완료 신호(`onComplete`)만 전달하고 데이터 항목(`onNext`)은 방출하지 않으므로, 뒤에 이어지는 `map`이나 `flatMap` 연산자에서 이벤트 객체에 접근할 수 없게 됩니다. 따라서 `.thenReturn(paymentEventMessage)`를 체이닝하여 이벤트 발행 등록이 끝난 직후 원본 `PaymentEventMessage`를 스트림 하류로 그대로 흘려보내 파이프라인의 연속성을 유지합니다.

### 3.2 비즈니스 서비스에서의 트랜잭션 결합 (`PaymentRecoveryService.kt`)

```kotlin
package com.example.payment.application.service

import com.example.payment.adapter.out.stream.PaymentEventMessagePublisher
import com.example.payment.application.port.out.PaymentRepositoryPort
import com.example.payment.domain.PaymentConfirmationResult
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import reactor.core.publisher.Mono

@Service
class PaymentStatusUpdateService(
    private val paymentRepositoryPort: PaymentRepositoryPort,
    private val paymentEventMessagePublisher: PaymentEventMessagePublisher
) {

    /**
     * 결제 상태를 업데이트하고, 동일한 리액티브 트랜잭션 컨텍스트 내에서 이벤트를 발행합니다.
     */
    @Transactional
    fun updatePaymentStatusToSuccess(result: PaymentConfirmationResult): Mono<Boolean> {
        return paymentRepositoryPort.updateStatusAndCreateEventMessage(result)
            // 생성된 PaymentEventMessage를 리액티브 체인 내부에서 발행 등록함
            .flatMap { eventMessage ->
                paymentEventMessagePublisher.publishEvent(eventMessage)
            }
            // thenReturn 덕분에 전달받은 eventMessage를 기반으로 후속 변환이나 로깅 수행 가능
            .thenReturn(true)
    }
}
```

- **구현 상세 분석**:
  - `@Transactional`이 선언된 메서드가 반환하는 `Mono`에는 R2DBC의 리액티브 트랜잭션 컨텍스트가 바인딩됩니다.
  - `flatMap` 내부에서 `paymentEventMessagePublisher.publishEvent(eventMessage)`를 호출하여 반환된 `Mono`를 체인에 연결했기 때문에, `TransactionalEventPublisher`가 상위 스트림의 트랜잭션 컨텍스트를 그대로 상속받아 트랜잭션 동기화 작업을 등록합니다.

### 3.3 트랜잭션 커밋 이후 이벤트를 수신하는 리스너 (`PaymentEventStreamSender.kt`)

```kotlin
package com.example.payment.adapter.out.stream

import com.example.payment.domain.PaymentEventMessage
import org.springframework.stereotype.Component
import org.springframework.transaction.event.TransactionPhase
import org.springframework.transaction.event.TransactionalEventListener
import reactor.core.publisher.Sinks

/**
 * R2DBC 트랜잭션이 정상 커밋된 이후에만 결제 이벤트를 수신하여 외부 스트림으로 전송하는 리스너
 */
@Component
class PaymentEventStreamSender(
    private val paymentEventSink: Sinks.Many<PaymentEventMessage>
) {

    /**
     * 트랜잭션 커밋 완료(AFTER_COMMIT) 시점에 호출되어 인메모리 Sink 또는 메시지 브로커로 전달함
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    fun handlePaymentEvent(eventMessage: PaymentEventMessage) {
        // DB 커밋이 확정된 상태이므로 롤백으로 인한 유령 이벤트(Phantom Event)가 발생하지 않음
        paymentEventSink.tryEmitNext(eventMessage)
    }
}
```

---

## 4. 적용 시 고려해야 할 점 (주의사항 및 예외 처리)

### 4.1 반드시 리액티브 체인에 구독(Subscribe)을 연결해야 함
`TransactionalEventPublisher.publishEvent()`는 Cold Publisher인 `Mono<Void>`를 반환합니다. 다음과 같이 리액티브 체인에 연결하지 않고 단독으로 호출하면 아무런 동작도 수행되지 않습니다.

```kotlin
// 잘못된 작성 예시: 반환된 Mono가 리액티브 파이프라인에 연결되지 않아 구독이 일어나지 않음
fun brokenPublish(message: PaymentEventMessage): Mono<PaymentEventMessage> {
    transactionalEventPublisher.publishEvent(message) // 실행되지 않고 무시됨
    return Mono.just(message)
}
```

반드시 `flatMap`, `delayUntil`, 또는 `thenReturn`을 통해 메인 리액티브 스트림의 일부로 체이닝해야 실제 구독과 이벤트 발행이 실행됩니다.

### 4.2 활성 트랜잭션이 없는 경우의 동작 확인
`TransactionalEventPublisher`는 호출 시점에 활성화된 리액티브 트랜잭션이 존재하지 않으면 내부적으로 `ApplicationEventPublisher.publishEvent()`를 즉시 호출합니다. 이때 리스너 측에 `@TransactionalEventListener(fallbackExecution = false)`(기본값)가 설정되어 있다면, 트랜잭션이 없는 상태에서 발행된 이벤트는 리스너에서 무시됩니다. 트랜잭션 유무와 무관하게 리스너를 실행해야 하는 경우에는 `fallbackExecution = true` 옵션을 명시해야 합니다.

### 4.3 `AFTER_COMMIT` 이후의 메시지 유실 대비 (Outbox 연계)
`@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)`는 데이터베이스 커밋이 성공한 직후에 실행되므로 롤백된 데이터가 외부로 발행되는 문제는 차단합니다. 그러나 DB 커밋 직후 리스너가 Kafka로 메시지를 전송하는 순간에 네트워크 단절이나 프로세스 종료가 발생하면 메시지가 유실될 수 있습니다.

따라서 높은 수준의 전달 보장이 필요한 결제 시스템에서는 `updatePaymentStatusToSuccess` 트랜잭션 내부에서 Outbox 테이블에 이벤트 레코드를 먼저 `INSERT`해 두고, `TransactionalEventPublisher`를 통해서는 즉시 전송을 시도하되 실패 시 백그라운드 스케줄러가 미전송 Outbox 레코드를 재발행하는 하이브리드 구조로 구성해야 합니다.

---

## 5. 결론

`ApplicationEventPublisher`와 `TransactionalEventPublisher`를 결합하여 도입함으로써 얻을 수 있는 아키텍처상의 이점은 다음과 같습니다.

1. **도메인 로직과 외부 인프라 관심사의 분리**: 결제 상태 변경 로직이 메시지 브로커 전송 구현체에 직접 의존하지 않으므로 코드의 응집도가 높아지고 단위 테스트 작성이 단순해집니다.
2. **리액티브 트랜잭션과 이벤트 발행 시점의 정합성 확보**: `ThreadLocal`을 사용할 수 없는 WebFlux 및 R2DBC 환경에서 Reactor `ContextView`를 통해 트랜잭션 경계를 정확히 추적하고, DB 커밋 완료 이후(`AFTER_COMMIT`)에만 후속 작업이 실행되도록 보장합니다.
3. **선언적 파이프라인 흐름 유지**: `Mono<Void>`에 `.thenReturn()`을 결합한 퍼블리셔 구조를 통해 기존 리액티브 연산자 체인을 끊지 않고 이벤트 발행 단계를 선언적으로 삽입할 수 있습니다.

