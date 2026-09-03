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

  if ($blogTitle) {
    $blogTitle.onclick = () => {
      const mainUrl = new URL(`http://127.0.0.1${url.port ? ":" + url.port : ""}`);
      window.history.pushState({}, "", mainUrl);
      renderBlogList();
    };
  }
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

  if ($blogTitle) {
    $blogTitle.onclick = () => {
      const deployUrl = new URL(`https://${siteConfig.username}.github.io/${siteConfig.repositoryName}/`);
      window.history.pushState({}, "", deployUrl);
      renderBlogList();
    };
  }
}

/**
 * 브라우저 뒤로가기 / 앞으로가기 네비게이션 이벤트 핸들러
 */
window.addEventListener("popstate", () => {
  const currentUrl = new URL(window.location.href);
  const searchParam = currentUrl.search;

  if (!searchParam.split("=")[1] || searchParam.split("=")[1] === "blog.md") {
    // 1. 메인 포스트 목록 화면 복원
    renderBlogList();
  } else if (searchParam.split("=")[0] === "?menu") {
    // 2. 단독 메뉴(About 등) 화면 복원
    document.getElementById("blog-posts").style.display = "none";
    document.getElementById("contents").style.display = "block";
    const menuFileName = searchParam.split("=")[1];
    fetch(origin + "menu/" + menuFileName)
      .then((response) => response.text())
      .then((text) => {
        styleMarkdown("menu", text);
      })
      .catch(() => {
        styleMarkdown("menu", "# 메뉴 로딩 실패");
      });
  } else if (searchParam.split("=")[0] === "?post") {
    // 3. 블로그 상세 포스트 화면 복원
    document.getElementById("contents").style.display = "block";
    document.getElementById("blog-posts").style.display = "none";
    const postNameDecode = decodeURIComponent(searchParam.split("=")[1]).replaceAll("+", " ");
    const postInfo = extractFileInfo(postNameDecode);

    const targetPost = typeof blogList !== "undefined" ? blogList.find((p) => p.name === postNameDecode) : null;
    const fetchUrl = targetPost ? getPostDownloadUrl(targetPost) : getPostDownloadUrl(`blog/${postNameDecode}`);

    fetch(fetchUrl)
      .then((response) => response.text())
      .then((text) =>
        postInfo && postInfo.fileType === "md"
          ? styleMarkdown("post", text, postInfo)
          : styleJupyter("post", text, postInfo)
      )
      .catch(() => {
        styleMarkdown("post", "# Error입니다. 파일명을 확인해주세요.");
      });
  } else {
    alert("잘못된 URL입니다.");
  }
});
