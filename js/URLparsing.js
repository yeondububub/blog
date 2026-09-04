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
 * 카테고리(게시판) 메뉴 파일명과 실제 폴더 경로 매핑 테이블
 */
const categoryFolderMap = {
  "Diary.md": "blog",
  "Development.md": "development",
  "AI.md": "ai",
  "Backend.md": "backend",
  "iOS.md": "ios",
  "Security.md": "security",
};

/**
 * 브라우저 뒤로가기 / 앞으로가기 네비게이션 이벤트 핸들러
 */
window.addEventListener("popstate", () => {
  const currentUrl = new URL(window.location.href);
  const searchParams = currentUrl.searchParams;

  const postParam = searchParams.get("post");
  const menuParam = searchParams.get("menu");
  const searchParam = searchParams.get("search");

  if (postParam) {
    // 1. 블로그 상세 포스트 화면 복원
    document.getElementById("contents").style.display = "block";
    document.getElementById("blog-posts").style.display = "none";
    const paginationEl = document.getElementById("pagination");
    if (paginationEl) {
      paginationEl.style.display = "none";
      paginationEl.innerHTML = "";
    }

    const banner = document.getElementById("category-banner");
    if (banner) banner.classList.add("hidden");

    const postNameDecode = decodeURIComponent(postParam).replaceAll("+", " ");
    const postInfo = extractFileInfo(postNameDecode);

    const renderPost = () => {
      const targetPost =
        typeof blogList !== "undefined"
          ? blogList.find((p) => p.name === postNameDecode)
          : null;
      const fetchUrl = targetPost
        ? getPostDownloadUrl(targetPost)
        : getPostDownloadUrl(`blog/${postNameDecode}`);

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
    };

    if (typeof blogList !== "undefined" && blogList.length === 0) {
      initDataBlogList().then(renderPost);
    } else {
      renderPost();
    }
  } else if (menuParam && menuParam !== "blog.md") {
    // 2. 카테고리 게시판(폴더) 또는 단독 마크다운 메뉴(About 등) 화면 복원
    if (categoryFolderMap[menuParam]) {
      // 카테고리 게시판(폴더) 복원: 텍스트 파일 fetch 대신 글 목록 렌더링
      document.getElementById("contents").style.display = "none";
      document.getElementById("blog-posts").style.display = "grid";

      const targetFolder = categoryFolderMap[menuParam];
      const doCategorySearch = () => {
        if (searchParam) {
          currentFolder = targetFolder;
          const decodedSearch = decodeURIComponent(searchParam).replaceAll("+", " ");
          const searchInput = document.getElementById("search-input");
          if (searchInput) searchInput.value = decodedSearch;
          search(decodedSearch.toLowerCase(), "category");
        } else {
          search(targetFolder, "folder");
        }
      };

      if (typeof blogList !== "undefined" && blogList.length === 0) {
        initDataBlogList().then(doCategorySearch);
      } else {
        doCategorySearch();
      }
    } else {
      // About 등 단독 마크다운 메뉴 화면 복원
      document.getElementById("blog-posts").style.display = "none";
      document.getElementById("contents").style.display = "block";
      const paginationEl = document.getElementById("pagination");
      if (paginationEl) {
        paginationEl.style.display = "none";
        paginationEl.innerHTML = "";
      }

      const banner = document.getElementById("category-banner");
      if (banner) banner.classList.add("hidden");

      const menuFetchUrl = getPostDownloadUrl(`menu/${menuParam}`);
      fetch(menuFetchUrl)
        .then((response) => response.text())
        .then((text) => {
          styleMarkdown("menu", text);
        })
        .catch(() => {
          styleMarkdown("menu", "# 메뉴 로딩 실패");
        });
    }
  } else if (searchParam) {
    // 3. 태그/키워드 검색 상태 복원
    document.getElementById("contents").style.display = "none";
    document.getElementById("blog-posts").style.display = "grid";
    const banner = document.getElementById("category-banner");
    if (banner) banner.classList.add("hidden");

    const decodedSearch = decodeURIComponent(searchParam).replaceAll("+", " ");
    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.value = decodedSearch;
    const resetInputButton = document.querySelector(".reset-inp-btn");
    if (resetInputButton) resetInputButton.classList.remove("hidden");

    currentFolder = "";
    const doSearch = () => {
      search(decodedSearch.toLowerCase(), "category");
    };

    if (typeof blogList !== "undefined" && blogList.length === 0) {
      initDataBlogList().then(doSearch);
    } else {
      doSearch();
    }
  } else {
    // 4. 메인 포스트 목록(전체 글 보기) 복원
    document.getElementById("contents").style.display = "none";
    document.getElementById("blog-posts").style.display = "grid";

    if (typeof search === "function") {
      search();
    } else if (typeof renderBlogList === "function") {
      renderBlogList();
    }
  }
});
