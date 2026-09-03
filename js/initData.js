// GitHub API를 사용하여 폴더 내의 파일 목록 가져오기 (스키마 및 url 참고)
// https://api.github.com/repos/paullabkorea/github_blog/contents/menu
// https://api.github.com/repos/paullabkorea/github_blog/contents/blog
let blogList = [];
let blogMenu = [];
let isInitData = false;

// 로컬 JSON 파일의 절대/상대 URL을 배포 환경(GitHub Pages) 및 로컬 환경에 맞게 안전하게 생성
function getLocalDataUrl(fileName) {
    const pathDir = window.location.pathname.replace(/\/[^\/]*\.[^\/]*$/, "").replace(/\/+$/, "") + "/";
    return `${window.location.origin}${pathDir}data/${fileName}`;
}

async function initDataBlogList() {
    /*
    blogList를 초기화 하기 위한 함수
    if 로컬이거나 localDataUsing이면 blogList = /data/local_blogList.json 데이터 할당
    else if 배포상태이면 blogList = GitHub API 데이터 할당 (실패 시 local_blogList.json으로 자동 fallback)
    */
    if (blogList.length > 0) {
        // blogList 데이터가 이미 있을 경우 다시 로딩하지 않음(API 호출 최소화)
        return blogList;
    }

    // sessionStorage에서 캐시된 데이터 확인
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
            console.error("Failed to parse cached blogList", e);
        }
    }

    // 데이터 초기화를 한 번 했다는 것을 알리기 위한 변수
    isInitData = true;

    if (!siteConfig.username || !siteConfig.repositoryName) {
        const urlConfig = extractFromUrl();
        siteConfig.username = siteConfig.username || urlConfig.username;
        siteConfig.repositoryName =
            siteConfig.repositoryName || urlConfig.repositoryName;
    }

    // 깃허브 설정이 되어 있고 로컬 데이터 강제 사용이 아니면 깃허브 API 우선 조회
    if (siteConfig.username && siteConfig.repositoryName && !localDataUsing) {
        // 탐색할 폴더 목록
        const folders = ["blog", "diary", "security", "backend", "development", "ai", "ios"];
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
            blogList = results.flat().filter(item => item && item.name);
        } catch (err) {
            console.error("GitHub API fetch error:", err);
            blogList = [];
        }

        // GitHub API Rate limit 초과(403) 또는 네트워크 오류로 인해 목록이 비어있는 경우 로컬 데이터로 Fallback
        if (blogList.length === 0) {
            console.warn("GitHub API rate limit exceeded or empty response. Using local blog list instead.");
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
        // 깃허브 계정 정보가 없거나 localDataUsing인 경우 로컬 JSON 파일 참조
        try {
            const response = await fetch(getLocalDataUrl("local_blogList.json"));
            if (response.ok) {
                blogList = await response.json();
            }
        } catch (e) {
            console.error("Failed to load local_blogList.json:", e);
        }
    }

    // 정규표현식에 맞지 않는 파일은 제외하여 blogList에 재할당
    blogList = blogList.filter((post) => {
        const postInfo = extractFileInfo(post.name);
        return postInfo !== null;
    });

    blogList.sort(function (a, b) {
        return b.name.localeCompare(a.name);
    });

    // 세션 스토리지에 데이터 캐싱 (데이터가 있는 경우에만 캐시)
    if (blogList.length > 0) {
        sessionStorage.setItem("blogList", JSON.stringify(blogList));
    }

    return blogList;
}

async function initDataBlogMenu() {
    if (blogMenu.length > 0) {
        // blogMenu 데이터가 이미 있을 경우(API 호출 최소화)
        return blogMenu;
    }

    // sessionStorage에서 캐시된 데이터 확인
    const cachedBlogMenu = sessionStorage.getItem("blogMenu");
    if (cachedBlogMenu) {
        try {
            const parsed = JSON.parse(cachedBlogMenu);
            if (Array.isArray(parsed) && parsed.length > 0) {
                blogMenu = parsed;
                return blogMenu;
            }
        } catch (e) {
            console.error("Failed to parse cached blogMenu", e);
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

        // API 호출 실패 또는 rate limit 초과 시 로컬 fallback
        if (blogMenu.length === 0) {
            console.warn("GitHub API rate limit exceeded or empty menu response. Using local menu data instead.");
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

    if (siteConfig.menuOrder && siteConfig.menuOrder.length > 0) {
        blogMenu.sort((a, b) => {
            const indexA = siteConfig.menuOrder.indexOf(a.name);
            const indexB = siteConfig.menuOrder.indexOf(b.name);
            const posA = indexA === -1 ? 9999 : indexA;
            const posB = indexB === -1 ? 9999 : indexB;
            return posA - posB;
        });
    }

    // 세션 스토리지에 데이터 캐싱
    if (blogMenu.length > 0) {
        sessionStorage.setItem("blogMenu", JSON.stringify(blogMenu));
    }

    return blogMenu;
}
