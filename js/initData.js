// GitHub API를 사용하여 폴더 내의 파일 목록 가져오기 (스키마 및 url 참고)
// https://api.github.com/repos/paullabkorea/github_blog/contents/menu
// https://api.github.com/repos/paullabkorea/github_blog/contents/blog
let blogList = [];
let blogMenu = [];
let isInitData = false;

async function initDataBlogList() {
    /*
    blogList를 초기화 하기 위한 함수
    if 로컬이라면 blogList = /data/local_blogList.json 데이터 할당
    else if 배포상태이면 blogList = GitHub에 API 데이터 할당
    */
    if (blogList.length > 0) {
        // blogList 데이터가 이미 있을 경우 다시 로딩하지 않기 위함(API 호출 최소화)
        return blogList;
    }

    // sessionStorage에서 캐시된 데이터 확인
    const cachedBlogList = sessionStorage.getItem("blogList");
    if (cachedBlogList) {
        blogList = JSON.parse(cachedBlogList);
        isInitData = true;
        return blogList;
    }

    // 데이터 초기화를 한 번 했다는 것을 알리기 위한 변수
    isInitData = true;

    if (!siteConfig.username || !siteConfig.repositoryName) {
        const urlConfig = extractFromUrl();
        siteConfig.username = siteConfig.username || urlConfig.username;
        siteConfig.repositoryName =
            siteConfig.repositoryName || urlConfig.repositoryName;
    }

    // 깃허브 설정이 되어 있고 로컬 데이터 강제 사용이 아니면 무조건 깃허브 API를 우선 사용하여 실시간 조회
    if (siteConfig.username && siteConfig.repositoryName && !localDataUsing) {
        // 탐색할 폴더 목록
        const folders = ["blog", "security", "backend", "development", "data", "ios"];
        const fetchPromises = folders.map(async (folder) => {
            try {
                const res = await fetch(
                    `https://api.github.com/repos/${siteConfig.username}/${siteConfig.repositoryName}/contents/${folder}`
                );
                if (res.ok) {
                    return await res.json();
                }
            } catch (e) {
                console.error(`Failed to fetch folder: ${folder}`, e);
            }
            return [];
        });
        const results = await Promise.all(fetchPromises);
        blogList = results.flat().filter(item => item && item.name);
    } else {
        // 깃허브 계정 정보가 없거나 localDataUsing인 경우 로컬 JSON 파일 참조
        const response = await fetch(
            url.origin + "/data/local_blogList.json"
        );
        blogList = await response.json();
    }

    // console.log(blogList);

    // 정규표현식에 맞지 않는 파일은 제외하여 blogList에 재할당
    blogList = blogList.filter((post) => {
        const postInfo = extractFileInfo(post.name);
        if (postInfo) {
            return post;
        }
    });

    blogList.sort(function (a, b) {
        return b.name.localeCompare(a.name);
    });

    // 세션 스토리지에 데이터 캐싱
    sessionStorage.setItem("blogList", JSON.stringify(blogList));

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
        blogMenu = JSON.parse(cachedBlogMenu);
        return blogMenu;
    }

    if (!siteConfig.username || !siteConfig.repositoryName) {
        const urlConfig = extractFromUrl();
        siteConfig.username = siteConfig.username || urlConfig.username;
        siteConfig.repositoryName =
            siteConfig.repositoryName || urlConfig.repositoryName;
    }

    if (siteConfig.username && siteConfig.repositoryName && !localDataUsing) {
        const response = await fetch(
            `https://api.github.com/repos/${siteConfig.username}/${siteConfig.repositoryName}/contents/menu`
        );
        let data = await response.json();
        if (Array.isArray(data)) {
            blogMenu = data;
        } else {
            console.warn("GitHub API rate limit exceeded. Using local menu data instead.");
            const res = await fetch(url.origin + "/data/local_blogMenu.json");
            blogMenu = await res.json();
        }
    } else {
        const response = await fetch(
            url.origin + "/data/local_blogMenu.json"
        );
        blogMenu = await response.json();
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
    sessionStorage.setItem("blogMenu", JSON.stringify(blogMenu));

    return blogMenu;
}
