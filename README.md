# 개발 BLOG

## 1. 블로그 포스트 작성법

### 1.1 파일 저장 위치 및 명명 규칙
각 카테고리 폴더(`backend`, `development`, `security`, `data`, `ios`, `blog`) 내에 마크다운(`.md`) 또는 주피터 노트북(`.ipynb`) 파일로 작성합니다.

- **파일명 형식 (5개 블록)**:
  ```text
  [YYYYMMDD]_[제목]_[태그]_[썸네일]_[요약설명].md
  ```

| 영역 | 설명 | 작성 예시 |
| :--- | :--- | :--- |
| **`[YYYYMMDD]`** | 8자리 작성 일자 | `[20260816]` |
| **`[제목]`** | 포스트 제목 | `[Transactional Outbox 패턴]` |
| **`[태그]`** | 단일 또는 쉼표(`,`)로 구분된 다중 태그 | `[Spring]` 또는 `[Spring, Kafka]` |
| **`[썸네일]`** | `img/` 폴더 내 썸네일 파일명 (미사용 시 빈 괄호 `[]`) | `[spring.png]` 또는 `[]` |
| **`[요약설명]`** | 목록 카드에 표시될 1~2줄 요약 설명 | `[분산 시스템 환경에서 정합성을 보장하는 아웃박스 패턴 구현]` |

- **작성 예시**:
  ```text
  [20260815]_[Transactional Outbox 패턴]_[Spring, Kafka]_[spring.png]_[분산 시스템 환경에서 이중 쓰기 문제를 해결하는 트랜잭셔널 아웃박스 패턴 구현].md
  ```

### 1.2 블로그 목록 등록
새 글을 작성한 후에는 `data/local_blogList.json` 파일에 해당 포스트 정보를 등록합니다.

```json
{
    "name": "[20260815]_[Transactional Outbox 패턴]_[Spring, Kafka]_[spring.png]_[분산 시스템 환경에서 이중 쓰기 문제를 해결하는 트랜잭셔널 아웃박스 패턴 구현].md",
    "download_url": "/backend/[20260815]_[Transactional Outbox 패턴]_[Spring, Kafka]_[spring.png]_[분산 시스템 환경에서 이중 쓰기 문제를 해결하는 트랜잭셔널 아웃박스 패턴 구현].md"
}
```

---

## 2. 메뉴 및 카테고리 관리

- **메뉴 생성**: `menu/` 폴더에 `[메뉴이름].md` (예: `Backend.md`, `Security.md`)를 추가합니다.
- **메뉴 노출 순서**: `config.js`의 `siteConfig.menuOrder` 배열을 통해 상단 네비게이션 노출 순서를 제어합니다.
- **카테고리 배너**: `config.js`의 `categoryBanners` 객체에 폴더별 배너 설명을 설정합니다.

---

## 3. 스타일 및 디자인

- **스타일 시트**: `style/style.css`에서 다크모드, Mermaid 다이어그램 카드 스타일, 스크롤바 등을 관리합니다.
- **테마 토큰**: `style/globalStyle.js`에서 Tailwind CSS 기반의 폰트, 카드, 버튼 공통 스타일을 커스텀할 수 있습니다.
