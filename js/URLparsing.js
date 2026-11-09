/**
 * URL 파싱 및 브라우저 히스토리(popstate) 라우팅 제어 모듈
 */
const defaultTitle = "ydbb";
const url = new URL(window.location.href);

// index.html 제거 후 기본 경로(Base Path) 정규화
const normalizedPath = window.location.pathname.replace(/\/index\.html$/, "").replace(/\/+$/, "") + "/";
const origin = url.origin + normalizedPath;
const pathParts = url.pathname.split("/").filter((part) => part.length > 0);

// 로컬 개발 환경(127.0.0.1, localhost) 여부 판별
const isLocal = url.hostname === "127.0.0.1" || url.hostname === "localhost";

// URL 끝에 /index.html이 포함된 경우 깔끔한 URL로 변경 (새로고침 없이 히스토리 상태 갱신)
if (window.location.pathname.endsWith("/index.html")) {
  pathParts.pop();
  const newPath = window.location.pathname.replace(/index\.html$/, "");
  history.replaceState(null, "", newPath + window.location.search + window.location.hash);
}

if (isLocal) {
  // 로컬 개발 환경 설정
  const $blogTitle = document.getElementById("blog-title");
  if ($blogTitle) {
    $blogTitle.innerText = siteConfig.blogTitle || defaultTitle;
  }
  document.title = siteConfig.blogTitle || defaultTitle;


} else {
  // GitHub Pages 배포 환경 설정
  if (!siteConfig.username || !siteConfig.repositoryName) {
    const urlConfig = extractFromUrl();
    siteConfig.username = siteConfig.username || urlConfig.username;
    siteConfig.repositoryName = siteConfig.repositoryName || urlConfig.repositoryName;
  }

  const $blogTitle = document.getElementById("blog-title");
  if ($blogTitle) {
    $blogTitle.innerText = siteConfig.blogTitle || defaultTitle;
  }
  document.title = siteConfig.blogTitle || defaultTitle;


}

/**
 * 브라우저 뒤로가기 / 앞으로가기 네비게이션 이벤트 핸들러
 */
window.addEventListener("popstate", () => {
  if (typeof handleRoute === "function") {
    handleRoute();
  }
});
