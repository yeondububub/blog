# Redis를 활용한 Spring Boot 조회수 캐싱 적용기

서비스를 운영하다 보면 조회수와 같이 빈번하게 변경되면서도 매우 자주 조회되는 데이터를 처리해야 할 때가 많습니다. 사용자가 게시글을 클릭할 때마다 매번 데이터베이스를 조회하거나 외부 API 서비스를 직접 호출한다면, 트래픽이 집중될 때 시스템 전체의 성능이 저하될 수 있습니다.

이러한 성능 병목을 해결하기 위해 메모리 기반 데이터 저장소인 **Redis**를 캐시로 도입하여 조회수를 효율적으로 캐싱하는 방법을 설명합니다.

---

## 1. 의존성 추가 및 Spring Cache 라이브러리 이해

Spring Boot에서 Redis를 이용한 캐싱을 구현하려면 먼저 관련된 의존성을 프로젝트에 추가해야 합니다.

### 의존성 설정 (`build.gradle`)
```groovy
dependencies {
    // Spring Boot의 캐시 추상화 라이브러리
    implementation 'org.springframework.boot:spring-boot-starter-cache'
    
    // Redis 연결 및 연동 라이브러리
    implementation 'org.springframework.boot:spring-boot-starter-data-redis'
}
```

### 💡 Spring Cache 추상화와 Redis의 역할
Spring 프레임워크는 캐싱 서비스를 매우 편리하게 사용할 수 있도록 **캐시 추상화(Cache Abstraction)** 레이어를 제공합니다. 이것이 바로 `spring-boot-starter-cache` 의존성의 역할입니다.

* **캐시 추상화 (`spring-boot-starter-cache`):** 
  * 개발자는 비즈니스 로직에 특정 캐시 기술(Redis, Ehcache, Caffeine 등)을 직접 의존시키지 않고, 캐시 제어 어노테이션(`@Cacheable`, `@CacheEvict`, `@CachePut`)을 사용하여 개발할 수 있게 도와줍니다.
  * 이 라이브러리만 단독으로 사용할 경우, Spring Boot는 애플리케이션의 JVM 메모리를 사용하는 로컬 캐시(`ConcurrentMapCache` 등)를 기본 캐시 매니저로 설정합니다.
* **캐시 구현체 (`spring-boot-starter-data-redis`):**
  * 다중 WAS 서버 환경(분산 환경)에서는 서버마다 메모리 내 캐시 데이터가 달라 데이터 정합성 문제가 생깁니다. 따라서 공통으로 참조할 외부 캐시 저장소인 Redis가 필요합니다.
  * `spring-boot-starter-data-redis` 의존성이 추가되면, Spring Boot는 클래스패스를 감지하여 캐시 추상화 레이어의 기본 구현체로 **`RedisCacheManager`를 자동으로 선택하고 활성화(Auto-Configuration)**합니다.

---

## 2. Redis 캐시 설정 (`CacheConfig`)

Spring Boot에서 캐싱 기능을 활성화하고, Redis를 캐시 저장소로 설정하기 위해 아래와 같이 `@Configuration` 클래스를 작성했습니다.

```java
@Configuration
@EnableCaching // Spring의 캐싱 기능 활성화 (Spring Cache AOP 프록시 활성화)
public class CacheConfig {

    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory redisConnectionFactory) {
        return RedisCacheManager.builder(redisConnectionFactory)
                .withInitialCacheConfigurations(
                        Map.of(
                                // articleViewCount 캐시에 대해 TTL(만료 시간)을 1초로 설정
                                "articleViewCount", RedisCacheConfiguration.defaultCacheConfig().entryTtl(Duration.ofSeconds(1))
                        )
                )
                .build();
    }
}
```

### 💡 핵심 포인트: TTL(Time-To-Live)을 1초로 설정한 이유
조회수는 사용자 활동에 따라 실시간으로 계속해서 증가하는 성격을 가집니다. 따라서 캐시 만료 시간을 너무 길게 잡으면 사용자가 본인의 조회수가 제대로 반영되지 않는 것처럼 느낄 수 있습니다. 

반면, **TTL을 단 1초**로만 설정하더라도 다음과 같은 극적인 효과를 얻을 수 있습니다.
* **API 호출 부하 감소:** 트래픽이 급증하여 초당 수천 명의 사용자가 동일한 게시글을 조회하더라도, 외부 서비스로의 실제 API 요청은 **1초에 단 1번**만 발생합니다.
* **일관성 확보:** 캐시 만료 주기가 1초에 불과하므로, 사용자는 거의 실시간에 가까운 최신 조회수 데이터를 확인할 수 있습니다.

---

## 3. Deep Dive: `@Cacheable` 어노테이션의 내부 구조와 동작 메커니즘

Spring이 제공하는 `@Cacheable` 어노테이션의 실제 코드를 들여다보면, 캐싱 동작을 상세히 제어할 수 있는 다양한 속성들이 정의되어 있습니다. 코드를 분석하여 유용하게 쓰이는 설정 값들을 살펴보겠습니다.

### 🔍 `@Cacheable` 인터페이스 소스코드
```java
package org.springframework.cache.annotation;

import java.lang.annotation.*;
import java.util.concurrent.Callable;
import org.springframework.aot.hint.annotation.Reflective;
import org.springframework.core.annotation.AliasFor;

@Target({ElementType.TYPE, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
@Reflective
public @interface Cacheable {

    @AliasFor("cacheNames")
    String[] value() default {};

    @AliasFor("value")
    String[] cacheNames() default {};

    String key() default "";

    String keyGenerator() default "";

    String cacheManager() default "";

    String cacheResolver() default "";

    String condition() default "";

    String unless() default "";

    boolean sync() default false;
}
```

### ⚙️ 주요 속성 분석 및 활용법

#### ① `value` & `cacheNames`
* **역할:** 데이터를 저장할 캐시의 **영역(그룹) 이름**을 지정합니다. (이 둘은 서로의 별칭입니다.)
* **특징:** 여러 개의 캐시 이름을 지정하면 캐시 Hit 여부를 순서대로 판단합니다. 미스 시에는 지정한 모든 캐시 영역에 해당 값이 저장됩니다.

#### ② `key`
* **역할:** 캐시 그룹 내에서 특정 데이터를 식별할 **고유 식별자**를 생성합니다.
* **특징:** 기본값은 빈 문자열(`""`)로 설정되어 있어 메서드의 모든 파라미터 조합을 사용해 키를 연산합니다.
* **SpEL(Spring Expression Language) 지원:** `#` 기호로 시작하여 매개변수 이름을 동적으로 가져오거나, 다음과 같은 특수 메타데이터를 참조할 수 있습니다.
  * `#root.methodName`: 호출된 메서드 이름
  * `#root.args[0]` 또는 `#p0`: 첫 번째 매개변수 값
  * `#root.target`: 대상 객체

#### ③ `condition` vs `unless`
* **`condition` (사전 검사):** 
  * 메서드가 실행되기 전에 조건식이 `true`인 경우에만 캐시 조회 및 저장을 시도합니다.
  * 예: 특정 파라미터가 비어있지 않거나 0보다 클 때만 캐싱하려는 경우 사용
* **`unless` (사후 검사):**
  * 메서드가 실행된 **이후**에 조건을 평가하여, 조건이 `true`이면 결과값을 캐시에 저장하지 않습니다. (즉, 캐싱을 거부할 조건)
  * 실행 결과값인 `#result`를 SpEL 조건에 사용할 수 있습니다.
  * 예: `@Cacheable(value="users", unless="#result == null")` -> 결과가 null이 아닐 때만 캐싱하려는 경우

#### ④ `sync`
* **역할:** 다수의 스레드가 동시에 캐시 Miss를 겪었을 때, 원본 데이터를 읽어오는 로직을 동기화(Lock)할지 여부를 결정합니다.
* **실무적 중요성 (Cache Stampede 방지):** 
  * 트래픽이 폭증할 때 캐시가 만료되면, 모든 요청 스레드가 동시에 `Cache Miss`를 감지하고 데이터베이스나 외부 API로 몰려들게 됩니다. 이를 **캐시 스탬피드(Cache Stampede)** 현상이라고 부릅니다.
  * `sync = true` 옵션을 켜두면, 하나의 스레드만 메서드를 실행하여 값을 읽어오고 다른 스레드들은 대기하다가 캐시에 값이 생성되는 즉시 가져가게 되므로 서버 폭증 부하를 완벽하게 차단할 수 있습니다.

---

## 4. 적용 예시 (`ViewClient`)

설정한 캐시 매니저를 바탕으로, 외부의 조회수 서비스와 통신하는 클라이언트 클래스에 `@Cacheable` 어노테이션을 적용했습니다.

```java
@Slf4j
@Component
@RequiredArgsConstructor
public class ViewClient {

    private RestClient restClient;

    @Value("${endpoints.notice-board-view-service.url}")
    private String viewServiceUrl;

    @PostConstruct
    public void initRestClient(){
        restClient = RestClient.create(viewServiceUrl);
    }

    /**
     * 게시글의 조회수를 가져옵니다.
     * Redis 캐시를 우선 조회하고, 없으면 외부 API를 호출한 뒤 캐시에 저장합니다.
     */
    @Cacheable(key = "#articleId", value = "articleViewCount")
    public long count(Long articleId) {
        log.info("[ViewClient.count] articleId={}", articleId);
        try {
            return restClient.get()
                    .uri("/v1/article-views/articles/{articleId}/count", articleId)
                    .retrieve()
                    .body(Long.class);
        } catch (Exception e) {
            log.error("[ViewClient.count] articleId={}", articleId, e);
            return 0; // 예외 발생 시 0 반환 (Fallback 처리)
        }
    }
}
```

### 🔑 위 코드의 캐시 키 적용 설명
* **`value = "articleViewCount"`**에 의해 `CacheConfig`에 지정된 **1초 TTL** 설정 정책이 적용됩니다.
* **`key = "#articleId"`**에 의해 메서드 파라미터 `Long articleId` 값을 동적으로 수집합니다. 
* 최종적으로 Redis에는 **`articleViewCount::[articleId]`**의 키 형식으로 저장되며, 1초 동안은 외부 API를 추가 호출하지 않고 즉시 Redis에서 값을 반환하여 병목 현상을 방어합니다.

---

## 5. Redis CLI에서 캐시 데이터 직접 조회 및 검증하기

로컬 환경이나 서버 환경에서 Redis에 캐시가 적절한 수명으로 보관되어 있는지 확인하기 위해 **Redis CLI(Command Line Interface)**를 사용하여 직접 값을 조회하고 검증할 수 있습니다.

### 🔌 1. Redis CLI 접속하기
터미널을 열고 다음 명령어를 실행하여 Redis 콘솔에 접속합니다.
```bash
redis-cli
```

### 🔍 2. 등록된 캐시 키 조회하기
조회수 캐시를 구성할 때 접두사를 `articleViewCount`로 잡았으므로, 관련된 키 목록을 찾기 위해 검색합니다.
```bash
keys articleViewCount*
```
* **출력 예시:**
  ```text
  1) "articleViewCount::123"
  2) "articleViewCount::124"
  ```

### 📊 3. 특정 키의 값 조회하기
`get` 명령어를 사용하여 저장된 실제 조회수 데이터를 확인합니다.
```bash
get articleViewCount::123
```

> **⚠️ 주의: 값이 이상하게 깨져서 보여요!**
> Spring Data Redis 캐시는 기본적으로 자바 직렬화 방식(`JdkSerializationRedisSerializer`)을 이용해 바이너리 데이터로 변환 후 Redis에 저장합니다. 따라서 CLI에서 단순히 `get`으로 확인하면 `\xac\xed\x00\x05...` 처럼 사람이 읽기 어려운 문자로 표현됩니다.
>
> 💡 **해결법 (JSON 직렬화 적용):**
> 만약 CLI에서도 원본 데이터를 깔끔하게(예: JSON 또는 일반 텍스트) 보고 싶다면, `CacheConfig` 설정에 Jackson과 같은 JSON 직렬화 옵션을 수동으로 결합해 주어야 합니다.
> ```java
> // JSON 포맷으로 직렬화 설정을 결합한 예시
> RedisCacheConfiguration.defaultCacheConfig()
>     .entryTtl(Duration.ofSeconds(1))
>     .serializeValuesWith(
>         RedisSerializationContext.SerializationPair.fromSerializer(new GenericJackson2JsonRedisSerializer())
>     );
> ```

### ⏳ 4. 캐시 만료 시간(TTL) 확인하기
설정한 TTL이 실제로 1초로 잘 등록되어 만료 카운트다운이 돌아가고 있는지 검증합니다.
```bash
ttl articleViewCount::123
```
* 반환값이 **`0` 또는 양수(초)**이면 아직 만료되지 않고 캐시에 보관되어 있는 남은 시간을 뜻합니다.
* 반환값이 **`-2`**인 경우 이미 TTL이 만료되어 캐시가 소멸했음을 나타냅니다.

---

## 6. 마치며

이번 캐싱 적용을 통해 다음과 같은 이점을 얻을 수 있었습니다.

1. **외부 서비스 부하 차단:** 짧은 TTL을 적용해 데이터 일관성을 해치지 않으면서도 외부 서비스에 가해지는 트래픽 부하를 대폭 줄였습니다.
2. **응답 속도 개선:** 캐싱된 요청에 대해서는 네트워크 I/O 비용이 매우 낮은 인메모리 Redis에서 즉시 응답하므로 사용자 경험(UX)이 향상되었습니다.

단순히 DB 부하를 낮추는 용도 외에도, 짧은 TTL 캐싱 기법은 대규모 트래픽 분산과 API 게이트웨이성 서비스의 병목 해결에 매우 유용하게 쓰일 수 있음.
