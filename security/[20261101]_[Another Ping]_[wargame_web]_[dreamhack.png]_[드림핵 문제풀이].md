# Another Ping

[문제 링크](https://dreamhack.io/wargame/challenges/2377)

## 문제 분석

이 문제는 사용자로부터 IP 주소를 입력받아 서버에서 `ping` 명령어를 실행하고, 그 실행 결과를 반환하는 웹 서비스입니다. 제공된 서버의 주요 소스코드는 다음과 같습니다.

```python
FILTERED_CHARS = [' ', ';', '|', '&', '>', '<', '(', ')', '[', ']', '{', '}', '\n', '\r']

def is_valid_ip(ip):
    ip_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
    return bool(re.match(ip_pattern, ip))

def filter_input(user_input):
    for char in FILTERED_CHARS:
        if char in user_input:
            return False, f"Invalid character detected: {char}"
    return True, "OK"

@app.route('/ping', methods=['POST'])
def ping():
    ip = request.form.get('ip', '').strip()
    
    if not ip:
        return jsonify({'error': 'IP address is required'}), 400
    
    is_valid, message = filter_input(ip)
    if not is_valid:
        return jsonify({'error': message}), 400
    
    try:
        cmd = f"ping -c 4 {ip}"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        
        return jsonify({
            'command': cmd,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        })
```

서버의 `/ping` 엔드포인트는 POST 요청의 `ip` 파라미터를 전달받아 처리합니다. 코드 상단에는 정규표현식으로 IP 주소 형식을 검사하는 `is_valid_ip` 함수가 선언되어 있으나, 실제 요청을 처리하는 `ping` 함수 내부에서는 호출되지 않습니다. 대신 `filter_input` 함수를 통해 사전에 정의된 특수 문자 포함 여부만 검사한 뒤, `subprocess.run`을 호출하여 `ping -c 4 {ip}` 명령어를 실행합니다.

---

## 취약점 분석

### 1. Command Injection 및 블랙리스트 필터링 우회

`subprocess.run` 함수 호출 시 `shell=True` 인자가 설정되어 있으면 파이썬은 입력된 명령어 문자열을 시스템 셸(`/bin/sh`)에 전달하여 실행합니다. 따라서 입력값에 셸 메타 문자가 포함될 경우 의도하지 않은 시스템 명령어가 실행되는 Command Injection 취약점이 발생합니다.

`FILTERED_CHARS` 리스트를 확인하면 세미콜론(`;`), 파이프(`|`), 앰퍼샌드(`&`), 소괄호(`(`, `)`) 등 다수의 메타 문자와 공백 문자(` `)가 차단되어 있습니다. 그러나 명령어 치환(Command Substitution)에 사용되는 백틱(`` ` ``)과 환경 변수 참조에 사용되는 달러 기호(`$`)는 필터링 대상에서 제외되어 있습니다.

* **백틱(`` ` ``)을 이용한 명령어 치환**: 셸은 백틱으로 감싸진 문자열을 먼저 실행한 후, 그 표준 출력(stdout) 결과를 원래 명령어의 해당 위치에 치환합니다. `$()` 구문 역시 동일한 동작을 수행하지만 소괄호가 필터링 목록에 포함되어 있으므로 백틱을 사용해야 합니다.
* **`$IFS`를 이용한 공백 문자 우회**: 공백 문자가 차단되어 있어 실행할 명령어와 인자를 일반적인 방식으로 구분할 수 없습니다. 리눅스 셸의 내부 필드 구분자 환경 변수인 `$IFS`(Internal Field Separator)는 기본값으로 공백, 탭, 개행 문자를 포함하고 있으므로 공백 대신 `$IFS`를 삽입하여 인자를 분리할 수 있습니다. 이때 중괄호(`{`, `}`)가 필터링되어 `${IFS}` 형태는 사용할 수 없으므로, 변수명 뒤에 알파벳이나 숫자가 아닌 마침표와 슬래시(`./`)를 이어 붙여 `$IFS./flag.txt` 형태로 작성함으로써 셸이 환경 변수 이름을 `$IFS`로 인식하도록 구성합니다.

### 2. 표준 에러(stderr)를 통한 실행 결과 노출

백틱 내부에서 플래그 파일을 읽는 명령어가 실행되면, 파일의 내용이 원래의 `ping` 명령어 인자 자리에 치환됩니다. 치환된 플래그 문자열은 유효한 IP 주소나 도메인 형식이 아니므로 `ping` 유틸리티는 호스트를 찾을 수 없다는 에러 메시지를 표준 에러(`stderr`) 스트림으로 출력합니다.

서버 코드는 `result.stderr` 값을 JSON 응답의 `stderr` 필드에 담아 클라이언트에게 반환하므로, 에러 메시지에 포함된 치환 문자열을 통해 플래그 값을 확인할 수 있습니다.

---

## 익스플로잇

### 페이로드 구성

앞서 분석한 우회 기법을 조합하여 다음과 같이 입력 페이로드를 작성합니다.

```text
8.8.8.8`cat$IFS./flag.txt`
```

위 페이로드가 서버에 전달되면 다음 순서로 동작합니다.

1. `filter_input` 함수에서 입력값을 검사합니다. 공백이나 금지된 괄호류 없이 허용된 문자와 백틱(`` ` ``), `$` 기호만 사용되었으므로 필터링을 통과합니다.
2. 실행될 명령어 문자열이 ``ping -c 4 8.8.8.8`cat$IFS./flag.txt` `` 형태로 생성되어 셸에 전달됩니다.
3. 셸은 백틱 내부의 `cat$IFS./flag.txt`를 우선 실행합니다. `$IFS`가 공백으로 치환되어 현재 디렉터리의 `flag.txt` 파일 내용을 읽어옵니다.
4. 읽어들인 플래그 값이 `8.8.8.8` 뒤에 결합되어 `ping -c 4 8.8.8.8DH{FLAG}` 명령어가 실행됩니다.
5. `ping` 명령어는 존재하지 않는 호스트 주소에 대해 에러를 발생시키며, 응답 JSON의 `stderr` 항목에 `ping: 8.8.8.8DH{FLAG}: Name or service not known` 형태의 메시지가 출력되어 플래그를 획득할 수 있습니다.

### 요청 및 응답 확인

웹 페이지의 입력창에 페이로드를 입력하거나 `curl`을 사용하여 `/ping` 경로로 POST 요청을 전송합니다.

```bash
# 백틱과 $IFS가 로컬 셸에서 먼저 해석되지 않도록 작은따옴표(')로 감싸서 전송함
curl -X POST http://host3.dreamhack.games:포트번호/ping \
     -d 'ip=8.8.8.8`cat$IFS./flag.txt`'
```

서버로부터 반환되는 JSON 응답의 `stderr` 필드에서 플래그를 확인할 수 있습니다.
