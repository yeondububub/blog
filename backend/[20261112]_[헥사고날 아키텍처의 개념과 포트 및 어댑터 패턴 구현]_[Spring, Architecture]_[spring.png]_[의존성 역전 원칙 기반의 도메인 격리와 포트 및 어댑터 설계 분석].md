# 헥사고날 아키텍처의 개념과 포트 및 어댑터 패턴 구현

비즈니스 요구사항을 구현하는 백엔드 애플리케이션은 웹 컨트롤러, 관계형 데이터베이스, 메시지 브로커, 외부 결제 API 등 다양한 인프라 기술과 연결됩니다. 프로젝트 초기에는 컨트롤러가 서비스를 호출하고 서비스가 영속성 리포지토리를 직접 호출하는 3계층(Layered) 구조로 빠르게 기능을 구현할 수 있습니다. 그러나 비즈니스 규칙이 복잡해지고 연동하는 외부 시스템이 늘어날수록 도메인 로직이 특정 데이터베이스 기술이나 웹 프레임워크의 제약에 종속되는 현상이 발생합니다.

앨리스터 코번(Alistair Cockburn)이 제시한 헥사고날 아키텍처(Hexagonal Architecture), 즉 포트와 어댑터(Ports and Adapters) 아키텍처는 비즈니스 로직을 애플리케이션의 중심에 배치하고 외부 세계와의 모든 상호작용을 인터페이스(Port)와 구현체(Adapter)로 분리하는 설계 방식입니다.

본 문서에서는 기존 계층형 아키텍처가 가지는 구조적 한계를 살펴보고, 헥사고날 아키텍처의 핵심 구성 요소와 Kotlin 및 Spring 환경에서의 구현 방법을 분석합니다.

---

## 1. 기술적 배경 및 문제 제기 (기존 방식의 한계점)

전통적인 3계층 아키텍처(Controller - Service - Repository)에서 의존성이 흐르는 방향과 이로 인해 발생하는 문제는 다음과 같습니다.

<div class="diagram-container">
<svg role="img" aria-labelledby="layered-vs-hex-limit-title layered-vs-hex-limit-desc" viewBox="0 0 960 280" xmlns="http://www.w3.org/2000/svg">
  <title id="layered-vs-hex-limit-title">계층형 아키텍처의 단방향 의존성과 데이터베이스 종속 구조</title>
  <desc id="layered-vs-hex-limit-desc">전통적인 3계층 아키텍처에서 비즈니스 서비스가 영속성 계층과 외부 인프라 클라이언트에 직접 의존하여 도메인 오염이 발생하는 한계를 비교하는 다이어그램</desc>
  <defs>
    <marker id="arr-layered-ink" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#4f5d75"/>
    </marker>
    <marker id="arr-layered-accent" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#bf4520"/>
    </marker>
  </defs>

  <!-- Canvas Background -->
  <rect width="960" height="280" fill="#f5f5f5" rx="8"/>

  <!-- Zone: 전통적인 3계층 아키텍처 -->
  <rect x="24" y="20" width="912" height="240" rx="6" fill="#ececec" stroke="#bfc0c0" stroke-width="1" stroke-dasharray="5 3"/>
  <text x="48" y="44" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#4f5d75">전통적인 3계층 아키텍처 (의존성이 하위 인프라 계층으로 직결됨)</text>

  <!-- 1. ARROWS -->
  <line x1="220" y1="88" x2="332" y2="88" stroke="#4f5d75" stroke-width="1.25" marker-end="url(#arr-layered-ink)"/>
  <rect x="236" y="62" width="80" height="18" fill="#ececec"/>
  <text x="276" y="75" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="500" fill="#5a6580">직접 호출</text>

  <line x1="532" y1="76" x2="700" y2="76" stroke="#bf4520" stroke-width="1.75" marker-end="url(#arr-layered-accent)"/>
  <rect x="556" y="50" width="120" height="18" fill="#ececec"/>
  <text x="616" y="63" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="500" fill="#bf4520">JPA 엔티티 강결합</text>

  <path d="M 432 116 L 432 192 Q 432 200 440 200 L 700 200" fill="none" stroke="#bf4520" stroke-width="1.75" marker-end="url(#arr-layered-accent)"/>
  <rect x="516" y="174" width="112" height="18" fill="#ececec"/>
  <text x="572" y="187" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="500" fill="#bf4520">외부 SDK 종속</text>

  <!-- 2. NODES -->
  <rect x="44" y="60" width="176" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="132" y="84" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Presentation 계층</text>
  <text x="132" y="102" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">OrderController</text>

  <rect x="332" y="60" width="200" height="56" rx="4" fill="rgba(191,69,32,0.08)" stroke="#bf4520" stroke-width="1.75"/>
  <text x="432" y="84" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#bf4520">Business Logic 계층</text>
  <text x="432" y="102" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">OrderService (인프라 의존 집중)</text>

  <rect x="700" y="52" width="212" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="806" y="76" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Data Access 계층</text>
  <text x="806" y="94" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">OrderJpaRepository / @Entity</text>

  <rect x="700" y="172" width="212" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="806" y="196" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">External Infra 계층</text>
  <text x="806" y="214" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">KafkaTemplate / FeignClient</text>
</svg>
</div>

### 1.1 데이터베이스 주도 설계와 도메인 모델의 오염
계층형 아키텍처에서는 상위 계층이 하위 계층을 직접 참조합니다. 비즈니스 로직을 담당하는 `Service` 계층이 `Data Access` 계층의 `JpaRepository`를 직접 주입받아 호출하므로, 도메인 개념을 표현해야 할 클래스가 `@Entity`, `@Table`, `@ManyToOne` 같은 ORM 매핑 애노테이션과 기본 생성자 제약, 지연 로딩(Lazy Loading) 프록시 규칙에 묶이게 됩니다. 결과적으로 객체지향적인 도메인 행위를 설계하기보다 데이터베이스 테이블 구조를 먼저 정의하고 이에 맞춰 서비스 코드를 절차지향적으로 작성하게 됩니다.

### 1.2 외부 인프라 변경에 따른 파급 효과
비즈니스 서비스 클래스가 `JpaRepository`, `KafkaTemplate`, 외부 HTTP 클라이언트 구현체를 직접 참조하면 인프라 기술이 변경될 때 비즈니스 로직 코드까지 함께 수정되어야 합니다. 예를 들어 동기 HTTP 호출을 비동기 메시지 발행으로 전환하거나 RDBMS 테이블 스키마를 변경할 때, 도메인 규칙과 무관한 기술적 변경이 서비스 계층 전반으로 전파됩니다.

### 1.3 단위 테스트 작성 비용 증가
핵심 비즈니스 규칙 하나를 검증하려고 해도 서비스가 의존하는 영속성 리포지토리, 캐시 클라이언트, 메시지 프로듀서를 모두 모킹(Mocking)하거나 무거운 스프링 컨테이너(`@SpringBootTest`)를 띄워야 합니다. 인프라 계층과의 결합도가 높을수록 테스트 실행 속도가 느려지고, 데이터베이스 상태에 의존하는 깨지기 쉬운 테스트가 만들어집니다.

---

## 2. 핵심 개념 설명

헥사고날 아키텍처는 시스템을 내부 영역(Application Core)과 외부 영역(Adapters)으로 구분하고, 모든 의존성이 외부에서 내부를 향하도록 의존성 역전 원칙(Dependency Inversion Principle, DIP)을 적용합니다.

<div class="diagram-container">
<svg role="img" aria-labelledby="hexagonal-core-flow-title hexagonal-core-flow-desc" viewBox="0 0 960 360" xmlns="http://www.w3.org/2000/svg">
  <title id="hexagonal-core-flow-title">헥사고날 아키텍처의 포트와 어댑터 의존성 방향</title>
  <desc id="hexagonal-core-flow-desc">인바운드 어댑터가 인바운드 포트를 호출하고 애플리케이션 코어가 아웃바운드 포트를 호출하며 아웃바운드 어댑터가 아웃바운드 포트를 구현하여 모든 의존성이 도메인 코어 내부로 향하는 구조</desc>
  <defs>
    <marker id="arr-hex-ink" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#2d3142"/>
    </marker>
    <marker id="arr-hex-accent" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="7" markerHeight="5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#bf4520"/>
    </marker>
  </defs>

  <!-- Canvas Background -->
  <rect width="960" height="360" fill="#f5f5f5" rx="8"/>

  <!-- Center Zone: Application Core (Hexagon-represented Core Boundary) -->
  <rect x="240" y="28" width="480" height="304" rx="8" fill="#ececec" stroke="#2d3142" stroke-width="1.5"/>
  <text x="480" y="56" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Application Core (외부 프레임워크 비의존 영역)</text>

  <!-- 1. ARROWS (All dependency arrows point INWARD to Application Core) -->
  <!-- Inbound Adapter -> Inbound Port -->
  <line x1="188" y1="144" x2="264" y2="144" stroke="#2d3142" stroke-width="1.25" marker-end="url(#arr-hex-ink)"/>
  <line x1="188" y1="264" x2="264" y2="264" stroke="#2d3142" stroke-width="1.25" marker-end="url(#arr-hex-ink)"/>

  <!-- Inbound Port -> Service -->
  <line x1="396" y1="144" x2="424" y2="144" stroke="#4f5d75" stroke-width="1.25" stroke-dasharray="4 3" marker-end="url(#arr-hex-ink)"/>
  <line x1="396" y1="264" x2="424" y2="264" stroke="#4f5d75" stroke-width="1.25" stroke-dasharray="4 3" marker-end="url(#arr-hex-ink)"/>

  <!-- Service -> Domain -->
  <line x1="492" y1="172" x2="492" y2="236" stroke="#2d3142" stroke-width="1.25" marker-end="url(#arr-hex-ink)"/>

  <!-- Service -> Outbound Port -->
  <line x1="560" y1="144" x2="588" y2="144" stroke="#2d3142" stroke-width="1.25" marker-end="url(#arr-hex-ink)"/>
  <path d="M 560 160 L 572 160 Q 580 160 580 168 L 580 256 Q 580 264 588 264" fill="none" stroke="#2d3142" stroke-width="1.25" marker-end="url(#arr-hex-ink)"/>

  <!-- Outbound Adapter -> Outbound Port (DIP: Implements) -->
  <line x1="784" y1="144" x2="716" y2="144" stroke="#bf4520" stroke-width="1.75" stroke-dasharray="5 3" marker-end="url(#arr-hex-accent)"/>
  <rect x="720" y="116" width="60" height="18" fill="#f5f5f5"/>
  <text x="750" y="129" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">구현(DIP)</text>

  <line x1="784" y1="264" x2="716" y2="264" stroke="#bf4520" stroke-width="1.75" stroke-dasharray="5 3" marker-end="url(#arr-hex-accent)"/>
  <rect x="720" y="236" width="60" height="18" fill="#f5f5f5"/>
  <text x="750" y="249" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">구현(DIP)</text>

  <!-- 2. NODES -->
  <!-- Left: Inbound Adapters -->
  <rect x="28" y="116" width="160" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="108" y="140" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Web Adapter</text>
  <text x="108" y="158" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">OrderController</text>

  <rect x="28" y="236" width="160" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="108" y="260" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Consumer Adapter</text>
  <text x="108" y="278" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">KafkaListener</text>

  <!-- Inside Left: Inbound Ports -->
  <rect x="264" y="116" width="132" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="330" y="140" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Inbound Port</text>
  <text x="330" y="158" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">CreateOrderUseCase</text>

  <rect x="264" y="236" width="132" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="330" y="260" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Inbound Port</text>
  <text x="330" y="278" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">CancelOrderUseCase</text>

  <!-- Center: Application Service & Domain Model -->
  <rect x="424" y="116" width="136" height="56" rx="4" fill="rgba(191,69,32,0.08)" stroke="#bf4520" stroke-width="1.75"/>
  <text x="492" y="140" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#bf4520">Application Service</text>
  <text x="492" y="158" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#bf4520">OrderCreateService</text>

  <rect x="424" y="236" width="136" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="492" y="260" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Domain Model</text>
  <text x="492" y="278" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">Order / OrderStatus</text>

  <!-- Inside Right: Outbound Ports -->
  <rect x="588" y="116" width="128" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="652" y="140" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Outbound Port</text>
  <text x="652" y="158" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">SaveOrderPort</text>

  <rect x="588" y="236" width="128" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="652" y="260" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Outbound Port</text>
  <text x="652" y="278" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">PublishEventPort</text>

  <!-- Right: Outbound Adapters -->
  <rect x="784" y="116" width="152" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="860" y="140" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Persistence Adapter</text>
  <text x="860" y="158" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">OrderPersistenceAdapter</text>

  <rect x="784" y="236" width="152" height="56" rx="4" fill="#ffffff" stroke="#2d3142" stroke-width="1.25"/>
  <text x="860" y="260" text-anchor="middle" font-family="'Geist', 'Noto Sans KR', sans-serif" font-size="12" font-weight="600" fill="#2d3142">Message Adapter</text>
  <text x="860" y="278" text-anchor="middle" font-family="'Geist Mono', monospace" font-size="9" fill="#5a6580">OrderKafkaProducer</text>
</svg>
</div>

### 2.1 애플리케이션 코어 (Domain & Application Service)
비즈니스 상태와 핵심 규칙을 담는 `Domain Model`과 유스케이스 흐름을 조율하는 `Application Service`로 구성됩니다. 코어 내부에는 Spring Web(`@RestController`), JPA(`@Entity`), Kafka 등 외부 기술 라이브러리에 대한 의존성이 존재하지 않으며, 오직 순수 언어 코드로만 작성됩니다.

### 2.2 포트 (Ports)
애플리케이션 코어와 외부 세계가 통신하기 위해 코어 내부에 정의된 인터페이스입니다. 방향에 따라 두 가지로 나뉩니다.
- **인바운드 포트 (Inbound / Driving Port)**: 외부에서 애플리케이션 코어의 기능을 실행하기 위해 호출하는 인터페이스입니다. 주로 유스케이스(`CreateOrderUseCase`) 단위로 정의되며, `Application Service`가 이 인터페이스를 구현합니다.
- **아웃바운드 포트 (Outbound / Driven Port)**: 애플리케이션 코어가 비즈니스 로직을 수행하는 과정에서 데이터베이스 저장이나 외부 메시지 전송이 필요할 때 호출하는 인터페이스입니다. 인터페이스는 코어 내부에 선언되지만, 실제 구현체는 외부 영역인 아웃바운드 어댑터에 위치합니다.

### 2.3 어댑터 (Adapters)
외부 기술의 데이터 형식과 프로토콜을 애플리케이션 코어의 포트 인터페이스 규격으로 변환하는 계층입니다.
- **인바운드 어댑터 (Driving Adapter)**: 웹 요청을 처리하는 REST 컨트롤러(`@RestController`), 배치 스케줄러, 메시지 컨슈머(`@KafkaListener`) 등이 해당합니다. 외부 입력을 받아 인바운드 포트의 메서드를 호출합니다.
- **아웃바운드 어댑터 (Driven Adapter)**: 데이터베이스 리포지토리를 감싼 영속성 어댑터, Kafka 프로듀서 어댑터, 외부 API 호출 어댑터 등이 해당합니다. 코어에 선언된 아웃바운드 포트 인터페이스를 구현(`implements`)하여 의존성 방향을 외부에서 내부로 역전시킵니다.

### 2.4 계층형 아키텍처와 헥사고날 아키텍처 비교

| 구분 | 전통적 3계층 아키텍처 | 헥사고날 아키텍처 (Ports & Adapters) |
| :--- | :--- | :--- |
| **의존성 방향** | Controller -> Service -> Repository (DB를 향함) | 모든 Adapter -> Application Core (도메인을 향함) |
| **도메인 모델과 DB 엔티티** | 단일 `@Entity` 클래스로 겸용하는 경우가 많음 | 순수 도메인 모델(`Order`)과 영속성 엔티티(`OrderJpaEntity`) 분리 |
| **인프라 교체 영향 범위** | DB나 브로커 변경 시 `Service` 코드 수정 발생 | 해당 아웃바운드 어댑터 구현체만 교체하며 코어는 무변경 |
| **단위 테스트 방식** | 인프라 구현체 모킹 또는 스프링 통합 테스트 필요 | 포트 인터페이스 대역(Fake/Stub) 주입으로 순수 단위 테스트 가능 |

---

## 3. 코드 구현 및 라인별 상세 분석

주문 생성(`Order`) 유스케이스를 기준으로 패키지 구조와 각 계층의 구현 코드를 작성합니다.

### 3.1 전체 패키지 구조

```text
com.example.order
├── domain
│   ├── Order.kt                       // 순수 도메인 엔티티
│   └── OrderStatus.kt                 // 도메인 상태 열거형
├── application
│   ├── port
│   │   ├── in
│   │   │   ├── CreateOrderUseCase.kt  // 인바운드 포트 (유스케이스 인터페이스)
│   │   │   └── CreateOrderCommand.kt  // 유스케이스 입력 모델 (자체 검증 포함)
│   │   └── out
│   │       ├── SaveOrderPort.kt       // 아웃바운드 포트 (영속성 저장)
│   │       └── PublishOrderEventPort.kt // 아웃바운드 포트 (이벤트 발행)
│   └── service
│       └── OrderCreateService.kt      // 유스케이스 구현체
└── adapter
    ├── in
    │   └── web
    │       ├── OrderController.kt     // 인바운드 웹 어댑터
    │       └── CreateOrderRequest.kt  // 웹 계층 전용 HTTP 요청 DTO
    └── out
        └── persistence
            ├── OrderPersistenceAdapter.kt // 아웃바운드 영속성 어댑터
            ├── OrderJpaEntity.kt          // JPA 전용 데이터베이스 매핑 엔티티
            └── SpringDataOrderRepository.kt // Spring Data JPA 인터페이스
```

### 3.2 도메인 모델 구현 (`Order.kt`)

```kotlin
package com.example.order.domain

import java.time.LocalDateTime
import java.util.UUID

enum class OrderStatus {
    PENDING, PAID, CANCELLED
}

/**
 * JPA 등 외부 프레임워크 애노테이션을 전혀 포함하지 않는 순수 도메인 모델
 */
class Order private constructor(
    val id: String,
    val userId: Long,
    val productId: Long,
    val quantity: Int,
    val unitPrice: Long,
    var status: OrderStatus,
    val createdAt: LocalDateTime
) {
    // 주문 총액 계산과 같은 핵심 비즈니스 규칙을 도메인 내부에 응집시킴
    val totalAmount: Long
        get() = unitPrice * quantity

    init {
        // 도메인 불변식(Invariant) 검증: 잘못된 상태의 도메인 객체 생성을 원천 차단함
        require(quantity > 0) { "주문 수량은 1개 이상이어야 합니다." }
        require(unitPrice >= 0) { "상품 단가는 0원 이상이어야 합니다." }
    }

    /**
     * 결제 완료 처리 도메인 비즈니스 메서드
     */
    fun markAsPaid() {
        check(status == OrderStatus.PENDING) { "대기 상태의 주문만 결제 완료 처리할 수 있습니다." }
        this.status = OrderStatus.PAID
    }

    companion object {
        /** 신규 주문 도메인 객체를 생성하는 정적 팩토리 메서드 */
        fun create(userId: Long, productId: Long, quantity: Int, unitPrice: Long): Order {
            return Order(
                id = UUID.randomUUID().toString(),
                userId = userId,
                productId = productId,
                quantity = quantity,
                unitPrice = unitPrice,
                status = OrderStatus.PENDING,
                createdAt = LocalDateTime.now()
            )
        }

        /** 영속성 계층에서 조회한 데이터를 도메인 객체로 복원할 때 사용하는 팩토리 메서드 */
        fun reconstruct(
            id: String,
            userId: Long,
            productId: Long,
            quantity: Int,
            unitPrice: Long,
            status: OrderStatus,
            createdAt: LocalDateTime
        ): Order {
            return Order(id, userId, productId, quantity, unitPrice, status, createdAt)
        }
    }
}
```

- **구현 상세 분석 및 효율성**:
  - `@Entity`나 JPA용 기본 생성자를 두지 않고 `private constructor`와 정적 팩토리 메서드(`create`, `reconstruct`)로 객체 생성 경로를 통제합니다.
  - 스프링 컨테이너를 실행하지 않고도 `Order.create()`와 `markAsPaid()`를 호출하여 비즈니스 규칙을 밀리초 단위로 단위 테스트할 수 있습니다.

### 3.3 인바운드 및 아웃바운드 포트 정의

```kotlin
package com.example.order.application.port.`in`

import com.example.order.domain.Order

/**
 * 인바운드 어댑터가 애플리케이션 코어로 값을 전달할 때 사용하는 입력 커맨드 객체
 */
data class CreateOrderCommand(
    val userId: Long,
    val productId: Long,
    val quantity: Int,
    val unitPrice: Long
) {
    init {
        // 애플리케이션 코어 진입 시점의 입력 유효성 검증 수행
        require(userId > 0) { "유효하지 않은 사용자 식별자입니다." }
        require(productId > 0) { "유효하지 않은 상품 식별자입니다." }
    }
}

/**
 * 인바운드 포트: 주문 생성 유스케이스의 진입점 인터페이스
 */
interface CreateOrderUseCase {
    fun createOrder(command: CreateOrderCommand): Order
}
```

```kotlin
package com.example.order.application.port.out

import com.example.order.domain.Order

/**
 * 아웃바운드 포트: 도메인 객체를 영속화하기 위해 코어가 외부 어댑터에 요구하는 명세
 */
interface SaveOrderPort {
    fun save(order: Order): Order
}

/**
 * 아웃바운드 포트: 주문 생성 이벤트를 외부 메시징 시스템으로 발행하기 위한 명세
 */
interface PublishOrderEventPort {
    fun publishOrderCreated(order: Order)
}
```

- **구현 상세 분석 및 효율성**:
  - `SaveOrderPort`는 JPA, R2DBC, MongoDB 중 어떤 기술이 사용되는지 알지 못하며 오직 순수 도메인 객체인 `Order`만 주고받습니다.
  - 저장소와 이벤트 발행이라는 역할별로 아웃바운드 포트 인터페이스를 분리(인터페이스 분리 원칙, ISP)하여, 서비스가 자신이 실제로 사용하는 메서드에만 의존하도록 제한합니다.

### 3.4 애플리케이션 서비스 구현 (`OrderCreateService.kt`)

```kotlin
package com.example.order.application.service

import com.example.order.application.port.`in`.CreateOrderCommand
import com.example.order.application.port.`in`.CreateOrderUseCase
import com.example.order.application.port.out.PublishOrderEventPort
import com.example.order.application.port.out.SaveOrderPort
import com.example.order.domain.Order
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

/**
 * 인바운드 포트를 구현하고 아웃바운드 포트를 호출하여 유스케이스 흐름을 조율하는 서비스
 */
@Service
class OrderCreateService(
    private val saveOrderPort: SaveOrderPort,
    private val publishOrderEventPort: PublishOrderEventPort
) : CreateOrderUseCase {

    @Transactional
    override fun createOrder(command: CreateOrderCommand): Order {
        // 1. 순수 도메인 모델을 통해 주문 객체 생성 및 비즈니스 규칙 검증
        val order = Order.create(
            userId = command.userId,
            productId = command.productId,
            quantity = command.quantity,
            unitPrice = command.unitPrice
        )

        // 2. 아웃바운드 포트를 호출하여 상태 저장 (구체적인 DB 기술과 분리됨)
        val savedOrder = saveOrderPort.save(order)

        // 3. 아웃바운드 포트를 호출하여 후속 이벤트 발행
        publishOrderEventPort.publishOrderCreated(savedOrder)

        return savedOrder
    }
}
```

### 3.5 인바운드 웹 어댑터 구현 (`OrderController.kt`)

```kotlin
package com.example.order.adapter.`in`.web

import com.example.order.application.port.`in`.CreateOrderCommand
import com.example.order.application.port.`in`.CreateOrderUseCase
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

/** 웹 계층 전용 요청 DTO */
data class CreateOrderRequest(
    val userId: Long,
    val productId: Long,
    val quantity: Int,
    val unitPrice: Long
)

/** 웹 계층 전용 응답 DTO */
data class CreateOrderResponse(
    val orderId: String,
    val totalAmount: Long,
    val status: String
)

/**
 * 인바운드 어댑터: HTTP 요청을 유스케이스 Command로 변환하여 인바운드 포트를 호출함
 */
@RestController
@RequestMapping("/api/v1/orders")
class OrderController(
    private val createOrderUseCase: CreateOrderUseCase
) {

    @PostMapping
    fun createOrder(@RequestBody request: CreateOrderRequest): ResponseEntity<CreateOrderResponse> {
        val command = CreateOrderCommand(
            userId = request.userId,
            productId = request.productId,
            quantity = request.quantity,
            unitPrice = request.unitPrice
        )

        val createdOrder = createOrderUseCase.createOrder(command)

        val response = CreateOrderResponse(
            orderId = createdOrder.id,
            totalAmount = createdOrder.totalAmount,
            status = createdOrder.status.name
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(response)
    }
}
```

- **구현 상세 분석**:
  - `OrderController`는 구체 클래스인 `OrderCreateService`가 아니라 인바운드 포트 인터페이스인 `CreateOrderUseCase`를 주입받습니다.
  - 웹 요청 스펙(`CreateOrderRequest`)과 유스케이스 입력 모델(`CreateOrderCommand`)을 분리하여, 추후 gRPC 어댑터나 CLI 어댑터가 추가되더라도 동일한 `CreateOrderUseCase`를 재사용할 수 있습니다.

### 3.6 아웃바운드 영속성 어댑터 구현 (`OrderPersistenceAdapter.kt`)

```kotlin
package com.example.order.adapter.out.persistence

import com.example.order.application.port.out.SaveOrderPort
import com.example.order.domain.Order
import com.example.order.domain.OrderStatus
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.Id
import jakarta.persistence.Table
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Component
import java.time.LocalDateTime

/**
 * 데이터베이스 테이블 매핑만을 담당하는 JPA 전용 엔티티
 */
@Entity
@Table(name = "orders")
class OrderJpaEntity(
    @Id
    @Column(name = "order_id", length = 36)
    val id: String,

    @Column(nullable = false)
    val userId: Long,

    @Column(nullable = false)
    val productId: Long,

    @Column(nullable = false)
    val quantity: Int,

    @Column(nullable = false)
    val unitPrice: Long,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    val status: OrderStatus,

    @Column(nullable = false)
    val createdAt: LocalDateTime
) {
    /** 도메인 객체를 JPA 엔티티로 변환하는 매핑 메서드 */
    companion object {
        fun fromDomain(order: Order): OrderJpaEntity {
            return OrderJpaEntity(
                id = order.id,
                userId = order.userId,
                productId = order.productId,
                quantity = order.quantity,
                unitPrice = order.unitPrice,
                status = order.status,
                createdAt = order.createdAt
            )
        }
    }

    /** JPA 엔티티를 순수 도메인 객체로 복원하는 매핑 메서드 */
    fun toDomain(): Order {
        return Order.reconstruct(
            id = this.id,
            userId = this.userId,
            productId = this.productId,
            quantity = this.quantity,
            unitPrice = this.unitPrice,
            status = this.status,
            createdAt = this.createdAt
        )
    }
}

interface SpringDataOrderRepository : JpaRepository<OrderJpaEntity, String>

/**
 * 아웃바운드 어댑터: 코어의 SaveOrderPort를 구현하며 도메인 모델과 JPA 엔티티 간 변환을 수행함
 */
@Component
class OrderPersistenceAdapter(
    private val orderRepository: SpringDataOrderRepository
) : SaveOrderPort {

    override fun save(order: Order): Order {
        val jpaEntity = OrderJpaEntity.fromDomain(order)
        val savedEntity = orderRepository.save(jpaEntity)
        return savedEntity.toDomain()
    }
}
```

- **구현 상세 분석 및 효율성**:
  - JPA 관련 애노테이션(`@Entity`, `@Table`, `@Column`)은 `adapter.out.persistence` 패키지 내부의 `OrderJpaEntity`에만 국한됩니다.
  - 테이블 컬럼명이 변경되거나 데이터베이스를 MongoDB 또는 R2DBC로 교체하더라도 `OrderPersistenceAdapter`만 수정하면 되며, `Order` 도메인 클래스와 `OrderCreateService`는 단 한 줄도 수정되지 않습니다.

---

## 4. 적용 시 고려해야 할 점 (주의사항 및 예외 처리)

### 4.1 계층 간 객체 매핑 비용과 보일러플레이트 증가
웹 요청 DTO(`CreateOrderRequest`), 애플리케이션 입력 모델(`CreateOrderCommand`), 도메인 엔티티(`Order`), 영속성 엔티티(`OrderJpaEntity`)를 모두 분리하면 각 경계를 넘을 때마다 객체를 변환하는 매핑 코드가 발생합니다. 비즈니스 규칙이 거의 없는 단순 데이터 조회(CRUD) 위주의 애플리케이션에 동일한 수준의 분리를 일괄 적용하면 클래스 수만 늘어나고 생산성이 저하됩니다. 따라서 상태 전이와 도메인 규칙이 복잡한 핵심 도메인에 우선 적용하고, 단순 조회 화면은 쿼리 전용 포트(CQRS의 Query 분리)로 단순화하는 전략이 필요합니다.

### 4.2 도메인 경계 누수(Leaky Abstraction) 방지
포트 인터페이스의 파라미터나 반환 타입에 `Pageable`, `ResultSet`, `HttpServletRequest`, 또는 `OrderJpaEntity` 같은 외부 프레임워크 및 인프라 전용 타입을 노출하면 헥사고날 아키텍처의 격리 목적이 무너집니다. 모든 포트의 메서드 시그니처는 반드시 도메인 모델이나 순수 언어 타입만 사용해야 합니다.

### 4.3 패키지 가시성과 아키텍처 규칙 강제
시간이 지나면서 개발자가 편의를 위해 컨트롤러에서 `SpringDataOrderRepository`를 직접 주입받거나 도메인 클래스에서 외부 라이브러리를 임포트하는 규칙 위반이 발생할 수 있습니다. 이를 방지하려면 Gradle 멀티 모듈(`domain`, `application`, `adapter-in-web`, `adapter-out-persistence`)로 물리적 의존성을 분리하거나, 단일 모듈 환경에서는 `ArchUnit` 테스트를 작성하여 패키지 간 의존성 방향을 빌드 시점에 검증해야 합니다.

```kotlin
// ArchUnit을 이용해 domain 패키지가 adapter나 springframework에 의존하지 않는지 검증하는 예시
val domainLayerRule = noClasses()
    .that().resideInAPackage("..domain..")
    .should().dependOnClassesThat()
    .resideInAnyPackage("..adapter..", "org.springframework..")
```

---

## 5. 결론

헥사고날 아키텍처를 도입함으로써 얻을 수 있는 설계상의 효과는 다음과 같습니다.

1. **도메인 로직의 순수성 보존**: 비즈니스 규칙을 담은 도메인 코어가 웹 프레임워크나 ORM 기술로부터 격리되어, 기술적 제약 없이 도메인 모델 자체의 응집도와 불변식을 유지할 수 있습니다.
2. **외부 인프라 교체의 유연성 확보**: 데이터베이스, 메시지 브로커, 외부 API 연동 방식이 변경되더라도 해당 아웃바운드 어댑터만 새로 구현하면 되므로 비즈니스 코어에 미치는 변경 파급이 차단됩니다.
3. **빠르고 독립적인 테스트 환경 구축**: 스프링 컨텍스트나 외부 데이터베이스 없이도 인바운드 포트를 호출하고 아웃바운드 포트에 인메모리 대역(Fake) 객체를 주입하여 핵심 비즈니스 시나리오를 즉시 검증할 수 있습니다.
