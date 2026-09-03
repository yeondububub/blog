/**
 * 블로그 포스트 및 메뉴 목록 데이터 관리 모듈
 */
let blogList = [];
let blogMenu = [];
let isInitData = false;

/**
 * 로컬 JSON 파일의 절대 URL을 배포 환경(GitHub Pages) 및 로컬 환경에 맞게 안전하게 생성합니다.
 * @param {string} fileName - 파일명 (예: 'local_blogList.json')
 * @returns {string} 완성된 절대 URL
 */
function getLocalDataUrl(fileName) {
  const pathDir =
    window.location.pathname.replace(/\/[^\/]*\.[^\/]*$/, "").replace(/\/+$/, "") +
    "/";
  return `${window.location.origin}${pathDir}data/${fileName}`;
}

/**
 * 블로그 전체 포스트 목록을 비동기로 로드하고 정렬하여 초기화합니다.
 * 1. 메모리 캐시 및 sessionStorage 캐시 확인
 * 2. 배포 환경에서는 GitHub Contents API를 통해 동적 데이터 조회
 * 3. API 호출 실패 또는 Rate Limit 도달 시 local_blogList.json으로 자동 Fallback
 * @returns {Promise<Array>} 초기화된 포스트 목록 배열
 */
async function initDataBlogList() {
  if (blogList.length > 0) {
    return blogList;
  }

  // sessionStorage 캐시 확인 (불필요한 네트워크 트래픽 방지)
  const cachedBlogList = sessionStorage.getItem("blogList");
  if (cachedBlogList) {
    try {
      const parsed = JSON.parse(cachedBlogList);
      if (Array.isArray(parsed) && parsed.length > 0) {
        blogList = parsed;
        isInitData = true;
        return blogList;
      }
    } catch (e) {
      console.error("Failed to parse cached blogList:", e);
    }
  }

  isInitData = true;

  if (!siteConfig.username || !siteConfig.repositoryName) {
    const urlConfig = extractFromUrl();
    siteConfig.username = siteConfig.username || urlConfig.username;
    siteConfig.repositoryName =
      siteConfig.repositoryName || urlConfig.repositoryName;
  }

  // GitHub API 조회 또는 로컬 JSON 로드
  if (siteConfig.username && siteConfig.repositoryName && !localDataUsing) {
    const folders = [
      "blog",
      "diary",
      "security",
      "backend",
      "development",
      "ai",
      "ios",
    ];
    try {
      const fetchPromises = folders.map(async (folder) => {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${siteConfig.username}/${siteConfig.repositoryName}/contents/${folder}`
          );
          if (res.ok) {
            const data = await res.json();
            return Array.isArray(data) ? data : [];
          }
        } catch (e) {
          console.error(`Failed to fetch folder: ${folder}`, e);
        }
        return [];
      });
      const results = await Promise.all(fetchPromises);
      blogList = results.flat().filter((item) => item && item.name);
    } catch (err) {
      console.error("GitHub API fetch error:", err);
      blogList = [];
    }

    // GitHub API 제한(Rate Limit) 또는 네트워크 오류 시 로컬 데이터 Fallback
    if (blogList.length === 0) {
      console.warn(
        "GitHub API rate limit exceeded or empty response. Using local blog list instead."
      );
      try {
        const response = await fetch(getLocalDataUrl("local_blogList.json"));
        if (response.ok) {
          blogList = await response.json();
        }
      } catch (fallbackError) {
        console.error("Failed to load local_blogList.json fallback:", fallbackError);
      }
    }
  } else {
    // 로컬 개발 환경 또는 강제 로컬 데이터 사용 모드
    try {
      const response = await fetch(getLocalDataUrl("local_blogList.json"));
      if (response.ok) {
        blogList = await response.json();
      }
    } catch (e) {
      console.error("Failed to load local_blogList.json:", e);
    }
  }

  // 파일명 네이밍 규칙에 부합하는 파일만 필터링
  blogList = blogList.filter((post) => {
    const postInfo = extractFileInfo(post.name);
    return postInfo !== null;
  });

  // 최신 포스트 우선 정렬 (내림차순)
  blogList.sort((a, b) => b.name.localeCompare(a.name));

  // sessionStorage 캐싱
  if (blogList.length > 0) {
    sessionStorage.setItem("blogList", JSON.stringify(blogList));
  }

  return blogList;
}

/**
 * 상단 네비게이션 메뉴 목록을 비동기로 로드하고 정렬합니다.
 * @returns {Promise<Array>} 메뉴 항목 목록 배열
 */
async function initDataBlogMenu() {
  if (blogMenu.length > 0) {
    return blogMenu;
  }

  // sessionStorage 캐시 확인
  const cachedBlogMenu = sessionStorage.getItem("blogMenu");
  if (cachedBlogMenu) {
    try {
      const parsed = JSON.parse(cachedBlogMenu);
      if (Array.isArray(parsed) && parsed.length > 0) {
        blogMenu = parsed;
        return blogMenu;
      }
    } catch (e) {
      console.error("Failed to parse cached blogMenu:", e);
    }
  }

  if (!siteConfig.username || !siteConfig.repositoryName) {
    const urlConfig = extractFromUrl();
    siteConfig.username = siteConfig.username || urlConfig.username;
    siteConfig.repositoryName =
      siteConfig.repositoryName || urlConfig.repositoryName;
  }

  if (siteConfig.username && siteConfig.repositoryName && !localDataUsing) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${siteConfig.username}/${siteConfig.repositoryName}/contents/menu`
      );
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          blogMenu = data;
        }
      }
    } catch (e) {
      console.error("Failed to fetch menu via GitHub API:", e);
    }

    // API 호출 실패 시 로컬 메뉴 데이터 Fallback
    if (blogMenu.length === 0) {
      console.warn(
        "GitHub API rate limit exceeded or empty menu response. Using local menu data instead."
      );
      try {
        const res = await fetch(getLocalDataUrl("local_blogMenu.json"));
        if (res.ok) {
          blogMenu = await res.json();
        }
      } catch (fallbackError) {
        console.error("Failed to load local_blogMenu.json fallback:", fallbackError);
      }
    }
  } else {
    try {
      const response = await fetch(getLocalDataUrl("local_blogMenu.json"));
      if (response.ok) {
        blogMenu = await response.json();
      }
    } catch (e) {
      console.error("Failed to load local_blogMenu.json:", e);
    }
  }

  // config.js에 정의된 menuOrder 순서대로 정렬
  if (siteConfig.menuOrder && siteConfig.menuOrder.length > 0) {
    blogMenu.sort((a, b) => {
      const indexA = siteConfig.menuOrder.indexOf(a.name);
      const indexB = siteConfig.menuOrder.indexOf(b.name);
      const posA = indexA === -1 ? 9999 : indexA;
      const posB = indexB === -1 ? 9999 : indexB;
      return posA - posB;
    });
  }

  if (blogMenu.length > 0) {
    sessionStorage.setItem("blogMenu", JSON.stringify(blogMenu));
  }

  return blogMenu;
}
