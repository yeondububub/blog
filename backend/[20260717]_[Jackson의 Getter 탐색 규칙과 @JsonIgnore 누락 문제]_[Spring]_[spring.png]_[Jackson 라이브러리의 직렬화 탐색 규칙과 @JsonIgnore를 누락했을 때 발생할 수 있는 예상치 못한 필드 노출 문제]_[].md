# Jackson의 Getter 탐색 규칙과 @JsonIgnore 누락으로 인한 직렬화 문제

백엔드 개발을 하다 보면 Java 객체를 JSON으로 직렬화(Serialization)하거나 JSON을 Java 객체로 역직렬화(Deserialization)하는 과정에서 **Jackson 라이브러리**를 기본적으로 사용하게 됩니다. Spring Boot에서도 기본 JSON mapper로 채택하고 있을 만큼 친숙한 도구입니다.

이번에는 Jackson이 객체의 프로퍼티를 어떻게 탐색하는지 알아보고, `@JsonIgnore`를 누락했을 때 어떤 문제가 발생할 수 있는지 설명하겠습니다.

---

## 1. Jackson은 객체를 어떻게 JSON으로 만들까?

보통 객체를 JSON으로 변환할 때, 단순히 **'객체의 필드(멤버 변수)'**가 JSON의 키(Key)가 된다고 생각하기 쉽습니다. 
하지만 Jackson은 기본적으로 필드 자체에 직접 접근하기보다는, **공용(public) Getter 메서드**를 기준으로 프로퍼티를 탐색하여 JSON을 구성합니다. (물론 설정에 따라 필드 직접 접근도 가능합니다.)

Jackson의 기본 getter 탐색 규칙은 다음과 같습니다.
- `get`으로 시작하는 파라미터가 없는 메서드: `get` 이후의 이름을 소문자로 시작하도록 변환하여 프로퍼티로 인식합니다.
  - ex) `getData()` ➜ `"data": ...`
  - ex) `getExpiredAt()` ➜ `"expiredAt": ...`
- **`is`로 시작하는 파라미터가 없는 메서드 (보통 boolean 타입)**: `is` 이후의 이름을 소문자로 시작하도록 변환하여 프로퍼티로 인식합니다.
  - ex) `isExpired()` ➜ `"expired": ...`
  - ex) `isActive()` ➜ `"active": ...`

문제는 이 규칙이 우리가 의도한 "데이터 접근용 Getter"뿐만 아니라, **객체 내부 상태를 확인하기 위해 만든 순수 비즈니스 로직용 메서드**에도 동일하게 적용된다는 점입니다.

---

## 2. 갑자기 등장한 유령 필드 "expired"

다음은 쿠폰 정보를 응답하는 DTO입니다. 내부 로직에서 쿠폰이 만료되었는지 쉽게 확인하기 위해 다음과 같은 편의 메서드를 하나 추가했습니다.

```java
public class CouponResponse {
    private Long id;
    private String name;
    private LocalDateTime expiredAt;

    // ... 기본 생성자 및 겟터(getId, getName, getExpiredAt) ...

    // 추가된 편의 메서드 (비즈니스 로직 확인용)
    public boolean isExpired() {
        return expiredAt != null && expiredAt.isBefore(LocalDateTime.now());
    }
}
```

의도는 단순히 서비스 레이어나 뷰 렌더링 시점에 `coupon.isExpired()`를 호출해서 만료 여부를 체크하려는 것이었습니다. 데이터베이스 컬럼이나 API 스펙에 `"expired"`라는 필드를 추가할 생각은 전혀 없었죠.

하지만 API 테스트를 해보면 JSON 응답이 다음과 같이 나오게 됩니다.

```json
{
  "id": 1,
  "name": "웰컴 쿠폰",
  "expiredAt": "2026-07-16T23:59:59",
  "expired": true 
}
```

---

## 3. 원인 파악과 해결 방법: @JsonIgnore의 부재

원인은 바로 앞서 살펴본 **Jackson의 탐색 규칙** 때문이었습니다.
Jackson 입장에서는 `isExpired()`라는 파라미터 없는 공용(public) 메서드를 발견했으니, 당연히 `"expired"`라는 boolean 타입의 프로퍼티가 있다고 판단하고 JSON 결과물에 강제로 포함시킨 것입니다. 

이처럼 **API 응답으로 노출하고 싶지 않은 내부 로직용 메서드나 필드**가 JSON으로 직렬화되는 것을 막으려면 명시적인 처리가 필요합니다. 이때 사용하는 것이 바로 `@JsonIgnore` 애노테이션입니다.

### 문제 해결

`isExpired()` 메서드에 `@JsonIgnore`를 붙여 Jackson이 직렬화 과정에서 이 메서드를 무시하도록 처리했습니다.

```java
public class CouponResponse {
    private Long id;
    private String name;
    private LocalDateTime expiredAt;

    // ... 생략 ...

    // Jackson 직렬화 대상에서 제외
    @JsonIgnore
    public boolean isExpired() {
        return expiredAt != null && expiredAt.isBefore(LocalDateTime.now());
    }
}
```

이렇게 수정하고 나니 JSON 응답에서 불필요한 `"expired"` 필드가 깔끔하게 사라지게 됩니다.

