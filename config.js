// 기본 설정 파일
const siteConfig = {
  username: "yeondububub", // GitHub 사용자 이름
  repositoryName: "blog", // GitHub 저장소 이름
  mainColor: "#3498db", // 사이트의 주 색상
  textColor: "#333333", // 기본 텍스트 색상
  blogTitle: "yddb", // 블로그 제목
  menuOrder: ["Backend.md", "Data.md", "Development.md", "Diary.md", "iOS.md", "Security.md", "About.md"], // 커스텀 메뉴 순서
};

// 카테고리별 배너 텍스트 설정
const categoryBanners = {
  "development": {
    description: "개발 전반적인 지식에 대해 작성하는 공간입니다."
  },
  "backend": {
    description: "백엔드 개발과 관련된 지식을 정리합니다."
  },
  "diary": {
    description: "일상을 기록하는 공간입니다."
  },
  "data": {
    description: "데이터 분석 및 처리 관련 지식을 기록합니다."
  },
  "ios": {
    description: "iOS 앱 개발 지식을 정리합니다."
  },
  "security": {
    description: "보안 관련 지식을 기록하는 공간입니다."
  }
};

// 여러명의 저자가 글을 쓸 경우 프로필 설정, default는 0번째 사용자
// 저자는 파일에서 숫자로 사용해야 함
const users = [
  {
    id: 0, // default author
    username: "ydbb",
    img: "img/user/profile.png",
  },
];

// 로컬 데이터 사용 여부
const localDataUsing = false;
