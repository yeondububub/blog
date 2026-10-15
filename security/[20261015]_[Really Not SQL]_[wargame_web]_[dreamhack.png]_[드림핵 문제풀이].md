# Really Not SQL

[문제 링크](https://dreamhack.io/wargame/challenges/2105)

## 문제 분석

이 문제는 데이터베이스를 사용하지 않고, 웹 서버 로컬 파일 시스템의 `/user/{username}.json` 파일에 사용자 정보(아이디 및 암호화된 비밀번호)를 저장하여 로그인을 처리합니다.

사용자가 로그인을 요청하면 서버는 입력된 아이디에 해당하는 JSON 파일을 읽어와 비밀번호의 SHA-256 해시값을 대조합니다. 최종적으로 플래그를 획득하기 위해서는 `admin` 계정으로 로그인하여 `flag.php`에 접근해야 합니다. 하지만 `admin.json`에 저장된 본래 비밀번호 해시값은 복호화하기 어렵습니다.

문제 환경의 아파치 웹 서버 설정 파일인 `000-default.conf`를 확인하면 다음과 같습니다.

```conf
<VirtualHost *:80>
  ServerAdmin webmaster@localhost
  DocumentRoot /var/www/html

  ErrorLog ${APACHE_LOG_DIR}/error.log
  CustomLog ${APACHE_LOG_DIR}/access.log combined

  <Directory /var/www/html/>
    AllowOverride None
    Require all granted
  </Directory>

  <Directory /var/www/html/user/>
    DAV On
    Options Indexes
    AllowOverride All
    Require all granted
  </Directory>
</VirtualHost>
```

---

## 취약점 분석

### WebDAV 활성화 및 인가 제어 부재

`/var/www/html/user/` 디렉터리에 대해 WebDAV 기능(`DAV On`)이 활성화되어 있으며, `Require all granted` 설정으로 인해 외부의 모든 접근이 허용되어 있습니다.

WebDAV는 HTTP 확장을 통해 원격 서버의 파일을 관리할 수 있도록 지원하는 프로토콜입니다. WebDAV가 활성화되면 클라이언트는 `PUT`, `DELETE` 등의 HTTP 메서드를 사용하여 서버 내부의 파일을 직접 생성, 수정, 삭제할 수 있게 됩니다.

해당 문제 환경의 `.htaccess` 설정에서는 `DELETE` 메서드만 차단되어 있으며, 리소스를 생성하고 덮어쓰는 `PUT` 메서드는 별도의 인증 없이 허용되어 있습니다. 따라서 공격자는 WebDAV `PUT` 메서드를 악용하여 `/user/` 경로에 저장된 JSON 파일을 임의로 변조할 수 있습니다.

---

## 익스플로잇 구상

1. 로그인에 사용할 임의의 평문 비밀번호(예: `admin`)를 선정하고, 이에 대응하는 SHA-256 해시값을 생성합니다.
   - 평문: `admin`
   - SHA-256 해시값: `84983c60f7daadc1cb8698621f802c0d9f9a3c3c295c810748fb048115c186ec`

2. WebDAV의 `PUT` 메서드를 사용하여 `/user/admin.json` 경로로 요청을 전송합니다. 요청 본문에는 관리자 계정의 `password` 필드를 앞서 생성한 해시값으로 설정한 JSON 데이터를 포함합니다.

3. 파일 덮어쓰기가 완료되면, 웹 애플리케이션 로그인 페이지에서 `admin` 계정과 선정한 비밀번호(`admin`)로 로그인을 수행합니다.

4. 관리자 권한의 세션을 획득한 후 `flag.php`에 접근하여 플래그를 확인합니다.

---

## 익스플로잇

Burp Suite 등의 도구를 활용하여 `/user/admin.json` 엔드포인트로 HTTP `PUT` 요청을 전송합니다.

```http
PUT /user/admin.json HTTP/1.1
Host: host3.dreamhack.games:20180
User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36
Accept: application/json
Content-Type: application/json
Content-Length: 106
Connection: close

{"no": 0, "id": "admin", "password": "84983c60f7daadc1cb8698621f802c0d9f9a3c3c295c810748fb048115c186ec"}
```

요청 전송 후 서버로부터 `204 No Content` 응답이 반환되면 `admin.json` 파일이 정상적으로 덮어써진 것입니다.

이후 브라우저에서 로그인 페이지로 이동하여 `admin` / `admin` 계정 정보로 로그인을 요청하면 인증을 통과하게 되며, `flag.php` 페이지로 이동하여 플래그를 획득할 수 있습니다.