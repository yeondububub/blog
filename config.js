/**
 * 카테고리(게시판) 및 상단 네비게이션 메뉴 통합 설정
 * 새로운 카테고리를 추가하거나 순서를 변경할 때 이 배열만 수정하면 전체 모듈에 자동 반영됩니다.
 * - menu: menu/ 폴더 내 마크다운 파일명 (배열 순서대로 상단 메뉴 정렬)
 * - folder: 포스트가 저장되는 실제 디렉터리 경로 (About.md 등 단독 페이지는 null)
 * - description: 카테고리 진입 시 상단 배너에 표시할 설명 문구
 */
const categoriesConfig = [
  {
    menu: "Backend.md",
    folder: "backend",
    description: "백엔드 개발과 관련된 지식을 정리합니다.",
  },
  {
    menu: "AI.md",
    folder: "ai",
    description: "인공지능 및 머신러닝 관련 지식을 기록하는 공간입니다.",
  },
  {
    menu: "Development.md",
    folder: "development",
    description: "개발 전반적인 지식에 대해 작성하는 공간입니다.",
  },
  {
    menu: "Diary.md",
    folder: "blog",
    description: "일상을 기록하는 공간입니다.",
  },
  {
    menu: "iOS.md",
    folder: "ios",
    description: "iOS 앱 개발 지식을 정리합니다.",
  },
  {
    menu: "Security.md",
    folder: "security",
    description: "보안 관련 지식을 기록하는 공간입니다.",
  },
  {
    menu: "About.md",
    folder: null,
    description: "",
  },
];

/**
 * categoriesConfig로부터 파생되는 전역 매핑 객체 및 배열 (자동 생성)
 */
const categoryFolderMap = {};
const folderMenuMap = {};
const categoryBanners = {};
const postFolders = [];

categoriesConfig.forEach((item) => {
  if (item.folder) {
    categoryFolderMap[item.menu] = item.folder;
    folderMenuMap[item.folder] = item.menu;
    postFolders.push(item.folder);
    if (item.description) {
      categoryBanners[item.folder] = { description: item.description };
    }
  }
});

/**
 * 블로그 전역 기본 환경 설정
 */
const siteConfig = {
  username: "yeondububub", // GitHub 사용자 계정명
  repositoryName: "blog", // GitHub 저장소(Repository) 이름
  mainColor: "#3498db", // 블로그 주요 테마 색상
  textColor: "#333333", // 기본 텍스트 색상
  blogTitle: "ydbb", // 블로그 메인 타이틀
  menuOrder: categoriesConfig.map((item) => item.menu), // 네비게이션 메뉴 정렬 순서
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
 * - true: GitHub API를 호출하지 않고 정적 JSON(data/local_blogList.json)을 직접 로드 (Rate Limit 방지 및 로딩 속도 개선)
 * - false: GitHub API를 통한 동적 조회를 우선 시도하며, 실패 시 로컬 JSON으로 Fallback
 */
const localDataUsing = true;
