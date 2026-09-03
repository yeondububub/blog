/**
 * 블로그 UI 렌더링 및 인터랙션 제어 모듈
 */

let currentFolder = "";

/**
 * 검색 키워드 및 필터 종류(카테고리, 폴더)에 따라 포스트 목록을 필터링하고 화면에 렌더링합니다.
 * @param {string} [keyword=""] - 검색 키워드 또는 카테고리/폴더명
 * @param {string} [kinds=""] - 검색 필터 유형 ('category' | 'folder' | '')
 */
function search(keyword, kinds) {
  keyword = keyword ? keyword.toLowerCase().trim() : "";

  // 카테고리(폴더) 진입 시 상단 배너 노출/숨김 처리
  if (kinds === "folder") {
    const banner = document.getElementById("category-banner");
    let bannerKey = keyword;
    if (keyword === "blog") bannerKey = "diary";

    if (
      banner &&
      typeof categoryBanners !== "undefined" &&
      categoryBanners[bannerKey]
    ) {
      document.getElementById("category-banner-desc").innerText =
        categoryBanners[bannerKey].description;
      banner.classList.remove("hidden");
    } else if (banner) {
      banner.classList.add("hidden");
    }
  } else {
    const banner = document.getElementById("category-banner");
    if (banner) banner.classList.add("hidden");
  }

  // 데이터가 아직 로드되지 않은 경우 초기화 후 재호출
  if (blogList.length === 0) {
    if (isInitData === false) {
      initDataBlogList().then(() => {
        search(keyword, kinds);
      });
      return;
    }
  } else {
    if (!keyword) {
      // 전체 포스트 보기 (홈)
      currentFolder = "";
      renderBlogCategory(blogList);

      const searchInput = document.getElementById("search-input");
      const searchKeyword = searchInput ? searchInput.value.toLowerCase() : "";
      const searchResult = blogList.filter((post) =>
        post.name.toLowerCase().includes(searchKeyword)
      );
      renderBlogList(searchResult);
    } else {
      if (kinds) {
        const searchResult = blogList.filter((post) => {
          if (kinds === "category") {
            const postInfo = extractFileInfo(post.name);

            // 특정 폴더 내에서 태그 검색 시 폴더 범위 한정
            if (currentFolder) {
              const inCurrentFolder =
                (post.path &&
                  post.path
                    .toLowerCase()
                    .startsWith(currentFolder.toLowerCase() + "/")) ||
                (post.download_url &&
                  post.download_url
                    .toLowerCase()
                    .includes(`/${currentFolder}/`));
              if (!inCurrentFolder) return false;
            }

            if (postInfo) {
              const categories = postInfo.category
                .split(",")
                .map((c) => c.trim().toLowerCase());
              if (categories.includes(keyword)) {
                return post;
              }
            }
          } else if (kinds === "folder") {
            // 폴더 경로 기반 필터링
            if (post.path) {
              if (
                post.path.toLowerCase().startsWith(keyword.toLowerCase() + "/")
              ) {
                return post;
              }
            } else if (
              post.download_url &&
              post.download_url.toLowerCase().includes(`/${keyword}/`)
            ) {
              return post;
            }
          }
        });

        if (kinds === "folder") {
          currentFolder = keyword;
          renderBlogCategory(searchResult);
        }

        renderBlogList(searchResult);
      } else {
        // 일반 텍스트 키워드 검색
        const searchKeyword = keyword.toLowerCase();
        const searchResult = blogList.filter((post) =>
          post.name.toLowerCase().includes(searchKeyword)
        );
        renderBlogList(searchResult);
      }
    }
  }
}

/**
 * 상단 네비게이션 메뉴 및 검색창 이벤트를 생성하고 바인딩합니다.
 */
async function renderMenu() {
  blogMenu.forEach((menu) => {
    const link = document.createElement("a");
    link.classList.add(...menuListStyle.split(" "));
    link.classList.add(`${menu.name}`);
    link.href = menu.download_url;

    // 파일 확장자(.md)를 제외한 메뉴명 표시
    const menuName = menu.name.split(".")[0];
    link.innerText = menuName;

    link.onclick = (event) => {
      event.preventDefault();

      const handleFolderMenuClick = (targetFolder) => {
        if (blogList.length === 0) {
          initDataBlogList().then(() => {
            search(targetFolder, "folder");
          });
        } else {
          search(targetFolder, "folder");
        }
        const nextUrl = new URL(origin);
        nextUrl.searchParams.set("menu", menu.name);
        window.history.pushState({}, "", nextUrl);
      };

      if (menu.name === "Diary.md") {
        handleFolderMenuClick("blog");
      } else if (menu.name === "Development.md") {
        handleFolderMenuClick("development");
      } else if (menu.name === "AI.md") {
        handleFolderMenuClick("ai");
      } else if (menu.name === "Backend.md") {
        handleFolderMenuClick("backend");
      } else if (menu.name === "iOS.md") {
        handleFolderMenuClick("ios");
      } else if (menu.name === "Security.md") {
        handleFolderMenuClick("security");
      } else {
        renderOtherContents(menu);
      }
    };
    document.getElementById("menu").appendChild(link);
  });

  // 모바일 검색창 토글 인터랙션
  const searchButton = document.getElementById("search-button");
  const searchCont = document.querySelector(".search-cont");
  let searchInputShow = false;

  window.addEventListener("click", (event) => {
    if (window.innerWidth <= 768) {
      if (event.target == searchButton) {
        searchInputShow = !searchInputShow;
        if (searchInputShow) {
          searchButton.classList.add("active");
          searchCont.classList.remove("hidden");
          searchCont.classList.add("block");
        } else {
          searchButton.classList.remove("active");
          searchCont.classList.add("hidden");
          searchInputShow = false;
        }
      } else if (event.target == searchCont) {
      } else {
        searchButton.classList.remove("active");
        searchCont.classList.add("hidden");
        searchInputShow = false;
      }
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 768) {
      searchButton.classList.add("active");
      searchCont.classList.remove("hidden");
      searchInputShow = true;
    } else {
      searchButton.classList.remove("active");
      searchCont.classList.add("hidden");
    }
  });

  // 검색 입력창 엔터 및 클릭 이벤트
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.onkeyup = (event) => {
      if (event.key === "Enter") {
        search();
      }
    };
    searchInput.onclick = (event) => {
      event.stopPropagation();
    };
  }

  const searchInputButton = document.querySelector(".search-inp-btn");
  if (searchInputButton) {
    searchInputButton.onclick = (event) => {
      event.stopPropagation();
      search();
    };
  }

  const resetInputButton = document.querySelector(".reset-inp-btn");
  if (resetInputButton && searchInput) {
    searchInput.addEventListener("input", () => {
      if (searchInput.value) {
        resetInputButton.classList.remove("hidden");
      } else {
        resetInputButton.classList.add("hidden");
      }
    });
    resetInputButton.addEventListener("click", (event) => {
      event.stopPropagation();
      searchInput.value = "";
      resetInputButton.classList.add("hidden");
    });
  }
}

/**
 * 포스트 메타데이터를 기반으로 카드 UI 엘리먼트를 생성합니다.
 * @param {object} fileInfo - 파싱된 포스트 정보 객체
 * @param {number} index - 목록 내 인덱스 (첫 번째 카드는 강조 레이아웃 적용)
 * @returns {HTMLDivElement} 생성된 카드 DOM 엘리먼트
 */
function createCardElement(fileInfo, index) {
  const card = document.createElement("div");
  if (index === 0) {
    card.classList.add(...bloglistFirstCardStyle.split(" "));
  } else {
    card.classList.add(...bloglistCardStyle.split(" "));
  }

  if (fileInfo.thumbnail) {
    const img = document.createElement("img");
    img.src = fileInfo.thumbnail;
    img.alt = fileInfo.title;
    if (index === 0) {
      img.classList.add(...bloglistFirstCardImgStyle.split(" "));
    } else {
      img.classList.add(...bloglistCardImgStyle.split(" "));
    }
    card.appendChild(img);
  }

  const cardBody = document.createElement("div");
  cardBody.classList.add(...bloglistCardBodyStyle.split(" "));

  const categoryContainer = document.createElement("div");
  categoryContainer.className = "flex flex-wrap gap-2 mb-3";
  const categories = fileInfo.category
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  categories.forEach((cat) => {
    const category = document.createElement("span");
    category.classList.add(...bloglistCardCategoryStyle.split(" "));
    category.classList.remove("mb-3");
    category.textContent = cat;

    category.onclick = (event) => {
      event.stopPropagation();
      search(cat.toLowerCase(), "category");
    };
    categoryContainer.appendChild(category);
  });
  cardBody.appendChild(categoryContainer);

  const title = document.createElement("h2");
  title.classList.add(...bloglistCardTitleStyle.split(" "));
  title.textContent = fileInfo.title;
  cardBody.appendChild(title);

  const description = document.createElement("p");
  if (index == 0) {
    description.classList.add(...bloglistFirstCardDescriptionStyle.split(" "));
  } else {
    description.classList.add(...bloglistCardDescriptionStyle.split(" "));
  }
  description.textContent = fileInfo.description;
  cardBody.appendChild(description);

  const authorDiv = document.createElement("div");
  authorDiv.classList.add(...bloglistCardAuthorDivStyle.split(" "));
  cardBody.appendChild(authorDiv);

  const authorIndex =
    fileInfo.author >= 0 && fileInfo.author < users.length
      ? fileInfo.author
      : 0;
  const authorImg = document.createElement("img");
  authorImg.src = users[authorIndex]["img"];
  authorImg.alt = users[authorIndex]["username"];
  authorImg.classList.add(...bloglistCardAuthorImgStyle.split(" "));
  authorDiv.appendChild(authorImg);

  const author = document.createElement("p");
  author.classList.add(...bloglistCardAuthorStyle.split(" "));
  author.textContent = users[authorIndex]["username"];
  authorDiv.appendChild(author);

  const date = document.createElement("p");
  date.classList.add(...bloglistCardDateStyle.split(" "));
  date.textContent = formatDate(fileInfo.date);
  cardBody.appendChild(date);

  card.appendChild(cardBody);
  return card;
}

/**
 * 블로그 포스트 카드 목록을 페이징 처리하여 화면에 렌더링합니다.
 * @param {Array|null} [searchResult=null] - 필터링된 포스트 목록 (null이면 전체 blogList 사용)
 * @param {number} [currentPage=1] - 렌더링할 페이지 번호
 */
function renderBlogList(searchResult = null, currentPage = 1) {
  const pageUnit = 10;
  const targetList = searchResult !== null ? searchResult : blogList;

  document.getElementById("blog-posts").style.display = "grid";
  document.getElementById("blog-posts").innerHTML = "";

  const totalPage = Math.ceil(targetList.length / pageUnit);
  initPagination(totalPage);
  renderPagination(totalPage, currentPage, targetList);

  const startIndex = (currentPage - 1) * pageUnit;
  const endIndex = currentPage * pageUnit;

  targetList.slice(startIndex, endIndex).forEach((post, index) => {
    const postInfo = extractFileInfo(post.name);
    if (postInfo) {
      const cardElement = createCardElement(postInfo, index);

      cardElement.onclick = (event) => {
        event.preventDefault();
        document.getElementById("contents").style.display = "block";
        document.getElementById("blog-posts").style.display = "none";
        document.getElementById("pagination").style.display = "none";

        const postDownloadUrl = getPostDownloadUrl(post);
        fetch(postDownloadUrl)
          .then((response) => response.text())
          .then((text) =>
            postInfo.fileType === "md"
              ? styleMarkdown("post", text, postInfo)
              : styleJupyter("post", text, postInfo)
          )
          .then(() => {
            const nextUrl = new URL(origin);
            nextUrl.searchParams.set("post", post.name);
            window.history.pushState({}, "", nextUrl);
          })
          .catch(() => {
            styleMarkdown("post", "# Error입니다. 파일명을 확인해주세요.");
          });
      };
      document.getElementById("blog-posts").appendChild(cardElement);
    }
  });

  document.getElementById("contents").style.display = "none";
}

/**
 * About 등 단독 마크다운 메뉴 페이지를 렌더링합니다.
 * @param {object|string} menu - 메뉴 객체 또는 메뉴 파일명 문자열
 */
function renderOtherContents(menu) {
  const banner = document.getElementById("category-banner");
  if (banner) banner.classList.add("hidden");

  document.getElementById("blog-posts").style.display = "none";
  document.getElementById("contents").style.display = "block";
  if (document.getElementById("pagination")) {
    document.getElementById("pagination").style.display = "none";
    document.getElementById("pagination").innerHTML = "";
  }

  let menuDownloadUrl;
  let menuName;
  if (typeof menu === "string") {
    menuName = menu.split("/").pop();
    menuDownloadUrl = getPostDownloadUrl(`menu/${menuName}`);
  } else {
    menuName = menu.name;
    menuDownloadUrl = getPostDownloadUrl(menu.download_url || `menu/${menu.name}`);
  }

  fetch(menuDownloadUrl)
    .then((response) => response.text())
    .then((text) => styleMarkdown("menu", text, undefined))
    .then(() => {
      const nextUrl = new URL(origin);
      nextUrl.searchParams.set("menu", menuName);
      window.history.pushState({}, "", nextUrl);
    })
    .catch(() => {
      styleMarkdown("menu", "# Error입니다. 파일명을 확인해주세요.", undefined);
    });
}

/**
 * 현재 포스트 목록에서 태그/카테고리를 집계하여 Aside 사이드바에 렌더링합니다.
 * @param {Array} [targetList=blogList] - 집계 대상 포스트 목록
 */
function renderBlogCategory(targetList = blogList) {
  if (typeof clearTOCScrollListener === "function") {
    clearTOCScrollListener();
  }

  const categoryWrapper = document.querySelector(".category-aside");
  const categoryTitle = categoryWrapper
    ? categoryWrapper.querySelector(".aside-tit")
    : null;
  if (categoryTitle) {
    categoryTitle.textContent = "Category";
  }

  const categoryMap = {};
  targetList.forEach((post) => {
    const postInfo = extractFileInfo(post.name);
    if (postInfo) {
      const categories = postInfo.category
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      categories.forEach((cat) => {
        const catKey = cat.toLowerCase();
        if (categoryMap[catKey]) {
          categoryMap[catKey].count += 1;
        } else {
          categoryMap[catKey] = {
            displayName: cat,
            count: 1,
          };
        }
      });
    }
  });

  const categoryKeys = Object.keys(categoryMap);
  categoryKeys.sort();

  const categoryContainer = document.querySelector("aside");
  if (!categoryContainer) return;
  categoryContainer.innerHTML = "";
  categoryContainer.className = "";
  categoryContainer.classList.add(...categoryContainerStyle.split(" "));

  // All (전체보기) 항목 생성
  const allItem = document.createElement("div");
  allItem.classList.add(...categoryItemStyle.split(" "));
  allItem.textContent = "All";
  allItem.onclick = () => {
    if (currentFolder) {
      search(currentFolder, "folder");
    } else {
      search();
    }
  };
  const allCount = document.createElement("span");
  allCount.classList.add(...categoryItemCountStyle.split(" "));
  allCount.textContent = `(${targetList.length})`;
  allItem.appendChild(allCount);
  categoryContainer.appendChild(allItem);

  // 개별 태그 항목 생성
  categoryKeys.forEach((catKey) => {
    const item = categoryMap[catKey];
    const categoryItem = document.createElement("div");
    categoryItem.classList.add(...categoryItemStyle.split(" "));
    categoryItem.textContent = item.displayName;
    categoryItem.onclick = () => {
      search(catKey, "category");
    };

    const categoryCount = document.createElement("span");
    categoryCount.classList.add(...categoryItemCountStyle.split(" "));
    categoryCount.textContent = `(${item.count})`;

    categoryItem.appendChild(categoryCount);
    categoryContainer.appendChild(categoryItem);
  });
}

/**
 * 페이지네이션 컨트롤러 DOM 구조를 초기화합니다.
 * @param {number} totalPage - 전체 페이지 수
 */
function initPagination(totalPage) {
  const pagination = document.getElementById("pagination");
  if (!pagination) return;

  pagination.style.display = "flex";
  pagination.classList.add(...paginationStyle.split(" "));

  const prevButton = document.createElement("button");
  prevButton.setAttribute("id", "page-prev");
  prevButton.classList.add(...pageMoveButtonStyle.split(" "));

  const pageNav =
    pagination.querySelector("nav") || document.createElement("nav");
  pageNav.innerHTML = "";
  pageNav.setAttribute("id", "pagination-list");
  pageNav.classList.add(...pageNumberListStyle.split(" "));

  const docFrag = document.createDocumentFragment();
  for (let i = 0; i < totalPage; i++) {
    if (i === 7) break;
    const page = document.createElement("button");
    page.classList.add(...pageNumberStyle.split(" "));
    docFrag.appendChild(page);
  }
  pageNav.appendChild(docFrag);

  const nextButton = document.createElement("button");
  nextButton.setAttribute("id", "page-next");
  nextButton.classList.add(...pageMoveButtonStyle.split(" "));

  if (!pagination.innerHTML) {
    pagination.append(prevButton, pageNav, nextButton);
  }
  if (totalPage <= 1) {
    pagination.style.display = "none";
  }
}

/**
 * 페이지네이션 번호 및 이동 버튼의 활성화 상태를 갱신합니다.
 * @param {number} totalPage - 전체 페이지 수
 * @param {number} currentPage - 현재 활성화된 페이지 번호
 * @param {Array|null} [targetList=null] - 현재 페이징 중인 데이터 목록
 */
function renderPagination(totalPage, currentPage, targetList = null) {
  const prevButton = document.getElementById("page-prev");
  const nextButton = document.getElementById("page-next");

  if (currentPage === 1) {
    prevButton.setAttribute("disabled", true);
    nextButton.removeAttribute("disabled");
  } else if (currentPage === totalPage) {
    nextButton.setAttribute("disabled", true);
    prevButton.removeAttribute("disabled");
  } else {
    prevButton.removeAttribute("disabled");
    nextButton.removeAttribute("disabled");
  }

  prevButton.onclick = (event) => {
    event.preventDefault();
    renderBlogList(targetList, currentPage - 1);
    renderPagination(totalPage, currentPage - 1, targetList);
  };
  nextButton.onclick = (event) => {
    event.preventDefault();
    renderBlogList(targetList, currentPage + 1);
    renderPagination(totalPage, currentPage + 1, targetList);
  };

  const pageNav = document.querySelector("#pagination nav");
  if (!pageNav) return;
  const pageList = pageNav.querySelectorAll("button");

  if (totalPage <= 7) {
    pageList.forEach((page, index) => {
      page.textContent = index + 1;
      if (index + 1 === currentPage) {
        page.classList.remove("font-normal");
        page.classList.add(...pageNumberActiveStyle.split(" "));
      } else {
        page.classList.remove(...pageNumberActiveStyle.split(" "));
        page.classList.add("font-normal");
      }
      page.onclick = () => {
        renderBlogList(targetList, index + 1);
        renderPagination(totalPage, index + 1, targetList);
      };
    });
  } else {
    if (currentPage <= 4) {
      ellipsisPagination(pageList, [1, 2, 3, 4, 5, "...", totalPage], targetList);
    } else if (currentPage > totalPage - 4) {
      ellipsisPagination(
        pageList,
        [
          1,
          "...",
          totalPage - 4,
          totalPage - 3,
          totalPage - 2,
          totalPage - 1,
          totalPage,
        ],
        targetList
      );
    } else {
      ellipsisPagination(
        pageList,
        [
          1,
          "...",
          currentPage - 1,
          currentPage,
          currentPage + 1,
          "...",
          totalPage,
        ],
        targetList
      );
    }
  }

  function ellipsisPagination(pageList, indexList, listData = null) {
    pageList.forEach((page, index) => {
      page.textContent = indexList[index];
      if (indexList[index] === currentPage) {
        page.classList.remove("font-normal");
        page.classList.add(...pageNumberActiveStyle.split(" "));
      } else {
        page.classList.remove(...pageNumberActiveStyle.split(" "));
        page.classList.add("font-normal");
      }
      if (indexList[index] === "...") {
        page.style.pointerEvents = "none";
        page.onclick = (event) => event.preventDefault();
      } else {
        page.style.pointerEvents = "all";
        page.onclick = () => {
          renderPagination(totalPage, indexList[index], listData);
        };
      }
    });
  }
}

/**
 * 최초 페이지 진입 시 URL 파라미터를 분석하여 알맞은 화면을 렌더링하는 초기화 함수
 */
async function initialize() {
  const currentUrl = new URL(window.location.href);
  const searchParam = currentUrl.search;

  if (!searchParam.split("=")[1] || searchParam.split("=")[1] === "Diary.md") {
    await initDataBlogMenu();
    renderMenu();

    await initDataBlogList();

    const menuParam = currentUrl.searchParams.get("menu");
    if (menuParam === "Diary.md") {
      search("blog", "folder");
    } else {
      search();
    }
  } else {
    await initDataBlogMenu();
    renderMenu();

    if (searchParam.split("=")[0] === "?menu") {
      const menuName = searchParam.split("=")[1];
      const categoryMap = {
        "iOS.md": "ios",
        "Security.md": "security",
        "Backend.md": "backend",
        "Development.md": "development",
        "AI.md": "ai",
      };

      if (categoryMap[menuName]) {
        document.getElementById("contents").style.display = "none";
        await initDataBlogList();
        search(categoryMap[menuName], "folder");
      } else {
        document.getElementById("blog-posts").style.display = "none";
        document.getElementById("contents").style.display = "block";
        if (document.getElementById("pagination")) {
          document.getElementById("pagination").style.display = "none";
          document.getElementById("pagination").innerHTML = "";
        }
        const menuFetchUrl = getPostDownloadUrl(`menu/${menuName}`);
        fetch(menuFetchUrl)
          .then((response) => response.text())
          .then((text) => styleMarkdown("menu", text))
          .then(() => {
            window.history.pushState({}, "", currentUrl);
          })
          .catch(() => {
            styleMarkdown("menu", "# Error입니다. 파일명을 확인해주세요.");
          });
      }
    } else if (searchParam.split("=")[0] === "?post") {
      document.getElementById("contents").style.display = "block";
      document.getElementById("blog-posts").style.display = "none";
      if (document.getElementById("pagination")) {
        document.getElementById("pagination").style.display = "none";
        document.getElementById("pagination").innerHTML = "";
      }
      await initDataBlogList();

      const postNameDecode = decodeURIComponent(searchParam.split("=")[1]).replaceAll(
        "+",
        " "
      );
      const postInfo = extractFileInfo(postNameDecode);
      const targetPost = blogList.find((p) => p.name === postNameDecode);
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
        .then(() => {
          window.history.pushState({}, "", currentUrl);
        })
        .catch(() => {
          styleMarkdown("post", "# Error입니다. 파일명을 확인해주세요.");
        });
    }
  }
}

// 애플리케이션 초기화 실행
initialize();

// 모바일 환경 카테고리/목차 Aside 토글 이벤트
const categoryWrapper = document.querySelector(".category-aside");
const categoryTitle = categoryWrapper
  ? categoryWrapper.querySelector(".aside-tit")
  : null;
const categoryButton = document.getElementById("aside-button");
const categoryContainer = document.querySelector("aside");

if (categoryWrapper && categoryButton) {
  window.addEventListener("click", (evt) => {
    if (categoryButton.contains(evt.target)) {
      categoryWrapper.classList.toggle("active");
      if (categoryTitle) categoryTitle.classList.toggle("sr-only");
      if (categoryContainer) categoryContainer.classList.toggle("md:flex");
    } else if (
      categoryWrapper.classList.contains("active") &&
      !categoryWrapper.contains(evt.target)
    ) {
      categoryWrapper.classList.remove("active");
      if (categoryTitle) categoryTitle.classList.add("sr-only");
      if (categoryContainer) categoryContainer.classList.remove("md:flex");
    }
  });
}

// 블로그 메인 타이틀 클릭 시 홈(전체 목록)으로 리셋 이동
const blogTitle = document.getElementById("blog-title");
if (blogTitle) {
  blogTitle.addEventListener("click", () => {
    const nextUrl = new URL(origin);
    window.history.pushState({}, "", nextUrl);

    document.getElementById("contents").style.display = "none";
    document.getElementById("blog-posts").style.display = "grid";
    search();
  });
}

// 카테고리 상단 배너 닫기 버튼 이벤트
const categoryBanner = document.getElementById("category-banner");
const categoryBannerClose = document.getElementById("category-banner-close");

if (categoryBannerClose && categoryBanner) {
  categoryBannerClose.addEventListener("click", () => {
    categoryBanner.classList.add("hidden");
  });
}
