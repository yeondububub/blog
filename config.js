/**
 * 블로그 전역 기본 환경 설정
 */
const siteConfig = {
  username: "yeondububub", // GitHub 사용자 계정명
  repositoryName: "blog", // GitHub 저장소(Repository) 이름
  mainColor: "#3498db", // 블로그 주요 테마 색상
  textColor: "#333333", // 기본 텍스트 색상
  blogTitle: "ydbb", // 블로그 메인 타이틀
  menuOrder: [
    "Backend.md",
    "AI.md",
    "Development.md",
    "Diary.md",
    "iOS.md",
    "Security.md",
    "About.md",
  ], // 네비게이션 메뉴 정렬 순서
};

/**
 * 카테고리(게시판)별 상단 배너 설명 설정
 */
const categoryBanners = {
  development: {
    description: "개발 전반적인 지식에 대해 작성하는 공간입니다.",
  },
  backend: {
    description: "백엔드 개발과 관련된 지식을 정리합니다.",
  },
  diary: {
    description: "일상을 기록하는 공간입니다.",
  },
  ai: {
    description: "인공지능 및 머신러닝 관련 지식을 기록하는 공간입니다.",
  },
  ios: {
    description: "iOS 앱 개발 지식을 정리합니다.",
  },
  security: {
    description: "보안 관련 지식을 기록하는 공간입니다.",
  },
};

/**
 * 블로그 작성자(Author) 프로필 정보 목록
 * 파일명 포맷의 저자 ID 번호(예: _[0])와 매핑됩니다.
 */
const users = [
  {
    id: 0,
    username: "ydbb",
    img: "img/user/profile.png",
  },
];

/**
 * 로컬 데이터 강제 사용 플래그
 * - false: GitHub API를 통한 동적 조회를 우선 시도하며, 실패 시 로컬 JSON으로 Fallback
 * - true: GitHub API를 호출하지 않고 로컬 JSON(data/local_blogList.json)만 사용
 */
const localDataUsing = false;
