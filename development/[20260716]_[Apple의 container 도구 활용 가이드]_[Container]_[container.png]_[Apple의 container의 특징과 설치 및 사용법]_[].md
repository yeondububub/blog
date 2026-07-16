# macOS에서 Linux 컨테이너 구동하기: Apple의 container 도구 활용 가이드

macOS 환경에서 Linux 컨테이너를 실행하는 것은 많은 개발자에게 필수적인 작업입니다. 그동안 우리는 Docker Desktop, OrbStack, Lima 등 다양한 타사 솔루션에 의존해 왔습니다. 

최근 Apple은 macOS에서 Linux 컨테이너를 가볍고 빠르게 구동하기 위한 공식 오픈소스 도구인 [apple/container](https://github.com/apple/container)를 공개했습니다. 이 글에서는 Apple이 macOS에서 컨테이너 가상화 성능과 보안을 어떻게 향상시켰는지 그 아키텍처적 특징과 구체적인 설치 및 사용법에 대해 알아보겠습니다.

---

## 1. Apple은 macOS에서 container 기능을 어떻게 향상시켰는가?

Apple의 `container`는 기존의 컨테이너 도구들과 비교했을 때 macOS 아키텍처에 훨씬 밀접하게 내장되어 있으며, 다음과 같은 핵심 기술적 개선을 보여줍니다.

### Swift 작성 및 Apple Silicon 최적화
이 도구는 기본적으로 **Swift**로 작성되었으며, Apple Silicon(M1, M2, M3, M4 등) 아키텍처에 완벽하게 최적화되어 있습니다. 기존 솔루션들이 다양한 크로스 플랫폼 환경을 지원하기 위해 무거운 계층을 두었던 것과 달리, macOS 하드웨어 및 칩셋에 딱 맞춘 최적화된 기계어 명령으로 구동되어 오버헤드가 극도로 적습니다.

### 컨테이너별 독립 가상 머신(One VM per Container) 격리
기존 Docker Desktop 등은 macOS 상에 하나의 큰 리눅스 VM(가상 머신)을 띄우고, 그 내부에서 모든 컨테이너를 공유하여 실행하는 방식을 사용했습니다. 
반면 Apple의 `container`는 **각 컨테이너마다 아주 가볍고 독립된 전용 VM(Dedicated VM)을 하드웨어 수준에서 격리하여 실행**합니다.
* **장점**: 컨테이너 간의 보안 경계가 하드웨어 가상화 수준에서 엄격하게 보장되므로, 멀티테넌트 환경이나 보안이 중요한 애플리케이션 개발 시 성능 저하 없이 강력한 프라이버시와 격리(Isolation) 혜택을 누릴 수 있습니다.

### macOS 네이티브 시스템 기술 활용
Apple은 macOS 시스템 최신 프레임워크인 `Virtualization.framework`와 `vmnet` 라이브러리를 직접 활용하여 가상 네트워크 및 프로세스 수명 주기를 제어합니다.
* 무거운 백그라운드 Daemon 프로세스를 항상 띄워둘 필요가 없습니다.
* 필요할 때 `launchd`가 관리하는 초경량 API 서버(`container-apiserver`)가 호출되어 컨테이너를 효율적으로 오케스트레이션합니다.
* 이에 따라 배터리 소모량이 혁신적으로 줄어들며, 개발 장비의 발열과 리소스 점유율을 크게 낮춰줍니다.

### OCI(Open Container Initiative) 표준 준수
Apple의 `container`는 OCI 규격을 완벽하게 따릅니다. 따라서 Docker Hub, GitHub Container Registry(ghcr.io) 등 기존 OCI 규격의 모든 컨테이너 이미지를 그대로 내려받아 실행할 수 있으며, 이 도구로 빌드한 이미지 역시 다른 OCI 호환 런타임에서 문제없이 작동합니다.

---

## 2. macOS에서 container 설치 및 시작하기

### 요구 사양
* **하드웨어**: Apple Silicon 프로세서가 탑재된 Mac (M 시리즈)
* **운영체제**: macOS 26 이상 (가장 최신의 가상화 및 네트워킹 개선 사항이 적용되어 있습니다)

### 설치 단계
1. [Apple container GitHub Releases](https://github.com/apple/container/releases) 페이지에 접속하여 최신 버전의 서명된 `.pkg` 설치 패키지를 다운로드합니다.
2. 다운로드한 `.pkg` 파일을 더블클릭하고 설치 안내를 따릅니다.
3. 설치 중 관리자 비밀번호를 입력하면, 실행 파일이 `/usr/local/bin/container` 경로에 설치됩니다.

### 서비스 백그라운드 서버 구동
`container` CLI는 백그라운드 API 서버가 켜져 있어야 작동합니다. 터미널을 열고 다음 명령어를 입력하여 시스템 서비스를 활성화합니다.
```bash
container system start
```
현재 상태를 확인하려면 아래 명령을 사용합니다.
```bash
container system status
```

---

## 3. 기본 CLI 명령어 및 사용법

`container` CLI는 Docker 명령어 체계와 매우 유사하게 설계되어 있어, 기존에 컨테이너 기술을 사용해 본 개발자라면 학습 곡선 없이 바로 사용할 수 있습니다.

### 이미지 관리 (Pull & List)
Docker Hub 등에서 이미지를 가져오고 확인할 수 있습니다.
```bash
# Alpine 리눅스 이미지 가져오기
container image pull alpine

# 로컬 이미지 목록 확인
container images ls
```

### 컨테이너 실행 및 관리 (Run, List, Stop, RM)
컨테이너를 즉시 구동하거나 백그라운드에서 실행하고 관리하는 명령어입니다.
```bash
# Alpine 컨테이너를 인터랙티브 쉘로 실행
container run -it alpine sh

# 백그라운드(Detached) 모드로 컨테이너 실행
container run -d --name web-app nginx

# 실행 중인 컨테이너 목록 확인
container ls

# 컨테이너 중지 및 삭제
container stop web-app
container rm web-app
```

### 컨테이너 내부 명령 실행 및 로그 확인
```bash
# 실행 중인 컨테이너에 명령어 전달
container exec web-app ls -la

# 컨테이너 로그 출력
container logs web-app
```

### 이미지 빌드 (Build)
프로젝트 디렉토리 내에 `Dockerfile`이 존재하는 경우, OCI 호환 이미지를 직접 빌드할 수 있습니다.
```bash
# 현재 디렉토리의 Dockerfile 기반으로 이미지 빌드
container build -t my-custom-app:latest .
```

### 영구적인 Linux 머신 모드 (Machine Mode)
마치 Windows의 WSL2처럼 macOS 파일 시스템과 마운트되어 지속적으로 실행되는 Linux 환경이 필요한 경우, `machine` 서브 명령어를 통해 영구 인스턴스를 관리할 수도 있습니다.

---

## 4. 마치며

 `apple/container`는 macOS가 지닌 하드웨어와 OS 소프트웨어의 가능성을 최대로 끌어올려, 가상화 오버헤드를 극소화하는 데 성공한 프로젝트입니다. 

Docker Desktop의 무거운 자원 점유율에 피로감을 느꼈거나, 컨테이너별 물리적인 격리를 통해 보안성 높은 개발 환경을 구축하고 싶다면 Apple Silicon Mac 환경에서 `container` 도구를 도입해 보시는 것을 적극 권장합니다.
