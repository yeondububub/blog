/**
 * 마크다운 및 Jupyter Notebook 본문 스타일링, KaTeX 수식, Mermaid 다이어그램, TOC(목차) 렌더링 모듈
 */

// CommonMark 명세상 문장부호(예: ')') 뒤 닫는 '**'에 한글 조사 등이 바로 붙으면
// Right-flanking delimiter 조건을 만족하지 못해 볼드체가 파싱되지 않는 문제를 보완합니다.
if (typeof marked !== "undefined" && typeof marked.use === "function") {
  marked.use({
    extensions: [
      {
        name: "strongKorean",
        level: "inline",
        start(src) {
          return src.indexOf("**");
        },
        tokenizer(src) {
          const match =
            /^\*\*([^\s*](?:(?:[^*\n]|\\\*|\*(?!\*))*?[^\s*])?)\*\*(?=[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9])/.exec(
              src
            );
          if (match) {
            return {
              type: "strong",
              raw: match[0],
              text: match[1],
              tokens: this.lexer.inlineTokens(match[1]),
            };
          }
        },
      },
    ],
  });
}

/**
 * 다이어그램(.diagram-container, .diagram-card, .mermaid, svg) 내부 요소 여부를 판별합니다.
 * @param {Element} el
 * @returns {boolean}
 */
function isInsideDiagramElement(el) {
  return Boolean(el.closest(".diagram-container, .diagram-card, .mermaid, svg"));
}

/**
 * 본문 컨테이너 내부의 마크다운/노트북 HTML 요소에 공통 타이포그래피 스타일과 반응형 래퍼를 적용합니다.
 * @param {HTMLElement} rootEl - 스타일을 적용할 대상 루트 요소
 */
function applyPostTypography(rootEl) {
  const tagStyleMap = [
    ["h1", posth1Style],
    ["h2", posth2Style],
    ["h3", posth3Style],
    ["h4", posth4Style],
    ["h5", posth5Style],
    ["h6", posth6Style],
    ["p", postpStyle],
    ["img", postimgStyle],
    ["a", postaStyle],
    ["ul", postulStyle],
    ["ol", postolStyle],
    ["li", postliStyle],
    ["blockquote", postblockquoteStyle],
    ["thead", posttheadStyle],
    ["th", postthStyle],
    ["tbody", posttbodyStyle],
    ["td", posttdStyle],
    ["hr", posthrStyle],
    ["em", postemStyle],
    ["strong", poststrongStyle],
  ];

  tagStyleMap.forEach(([selector, styleClasses]) => {
    const classes = styleClasses.split(" ");
    rootEl.querySelectorAll(selector).forEach((el) => {
      if (!isInsideDiagramElement(el)) el.classList.add(...classes);
    });
  });

  // 단독 인라인 SVG 다이어그램을 반응형 .diagram-container 래퍼로 자동 감싸기
  rootEl.querySelectorAll("svg").forEach((svg) => {
    if (
      !svg.closest(
        ".diagram-container, .diagram-card, .mermaid, a, button, #title_section"
      ) &&
      !svg.parentElement?.closest("svg")
    ) {
      const wrapper = document.createElement("div");
      wrapper.className = "diagram-container";
      svg.parentNode.insertBefore(wrapper, svg);
      wrapper.appendChild(svg);
    }
  });

  // 테이블 반응형 래퍼 및 스타일 적용
  rootEl.querySelectorAll("table").forEach((table) => {
    if (isInsideDiagramElement(table)) return;
    table.classList.add(...posttableStyle.split(" "));
    const tableWrapper = document.createElement("div");
    tableWrapper.classList.add(
      "w-auto",
      "max-w-[990px]",
      "overflow-auto",
      "overflow-y-visible"
    );
    table.parentNode.insertBefore(tableWrapper, table);
    tableWrapper.appendChild(table);
  });
}

/**
 * 본문 최상단의 중복 대제목(H1)을 제거하고 포스트 상단 헤더(#title_section) 엘리먼트를 생성합니다.
 * @param {HTMLElement} rootEl - 본문 루트 컨테이너
 * @param {object} title_info - 포스트 메타데이터 정보 객체
 * @returns {HTMLDivElement}
 */
function createPostHeader(rootEl, title_info) {
  const firstH1 = rootEl.querySelector("h1");
  if (firstH1) {
    const h1Text = firstH1.textContent.trim().toLowerCase();
    const metaTitle = (title_info.title || "").trim().toLowerCase();
    if (h1Text === metaTitle || firstH1 === rootEl.firstElementChild) {
      firstH1.remove();
    }
  }

  const title_section = document.createElement("div");

  const categoryContainer = document.createElement("div");
  categoryContainer.className = "flex flex-wrap gap-2 mb-3";
  const categories = (title_info.category || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  categories.forEach((cat) => {
    const category = document.createElement("a");
    category.classList.add(...postcategoryStyle.split(" "));
    category.textContent = cat;
    category.href = "#";

    category.onclick = (event) => {
      event.preventDefault();
      const nextUrl = new URL(siteBaseUrl);
      if (
        typeof currentFolder !== "undefined" &&
        currentFolder &&
        typeof folderMenuMap !== "undefined"
      ) {
        const menuFileName = folderMenuMap[currentFolder];
        if (menuFileName) nextUrl.searchParams.set("menu", menuFileName);
      }
      nextUrl.searchParams.set("search", cat);
      window.history.pushState({}, "", nextUrl);
      if (typeof handleRoute === "function") {
        handleRoute();
      }
    };
    categoryContainer.appendChild(category);
  });
  title_section.appendChild(categoryContainer);

  const title = document.createElement("h1");
  title.classList.add(...posttitleStyle.split(" "));
  title.textContent = title_info.title;
  title_section.appendChild(title);

  const author_date = document.createElement("div");
  author_date.classList.add(...postauthordateDivStyle.split(" "));
  title_section.appendChild(author_date);

  const authorDiv = document.createElement("div");
  authorDiv.classList.add(...postauthorDivStyle.split(" "));
  author_date.appendChild(authorDiv);

  const authorIndex =
    title_info.author >= 0 && title_info.author < users.length
      ? title_info.author
      : 0;
  const authorImg = document.createElement("img");
  authorImg.src = users[authorIndex]["img"];
  authorImg.alt = users[authorIndex]["username"];
  authorImg.classList.add(...postauthorImgStyle.split(" "));
  authorDiv.appendChild(authorImg);

  const author = document.createElement("div");
  author.classList.add(...postauthorStyle.split(" "));
  author.textContent = users[authorIndex]["username"];
  authorDiv.appendChild(author);

  const date = document.createElement("div");
  date.classList.add(...postdateStyle.split(" "));
  date.textContent = formatDate(title_info.date);
  author_date.appendChild(date);

  if (title_info.thumbnail) {
    const image = document.createElement("img");
    image.src = title_info.thumbnail;
    image.alt = title_info.title;
    image.classList.add(...postimgtitleStyle.split(" "));
    title_section.appendChild(image);
  }

  title_section.classList.add(...postsectionStyle.split(" "));
  title_section.setAttribute("id", "title_section");
  return title_section;
}

/**
 * 코드 블록(<pre>)에 지정된 스타일과 클립보드 복사 버튼을 추가합니다.
 * @param {HTMLElement} rootEl
 * @param {string} preStyleClasses
 */
function attachPreCopyButtons(rootEl, preStyleClasses) {
  rootEl.querySelectorAll("pre").forEach((pre) => {
    pre.classList.add(...preStyleClasses.split(" "));

    const codeEl = pre.querySelector("code");
    const codeText = codeEl ? codeEl.innerText : pre.innerText;

    const copyButton = document.createElement("button");
    copyButton.innerHTML = '<span class="sr-only">코드 복사하기</span>';
    copyButton.classList.add(...notebookcopyButtonStyle.split(" "));
    copyButton.setAttribute("aria-label", "코드 복사하기");

    copyButton.addEventListener("click", async function (event) {
      event.stopPropagation();
      try {
        await navigator.clipboard.writeText(codeText);
        alert("복사되었습니다.");
      } catch (err) {
        console.error("Failed to copy text: ", err);
        alert("복사에 실패했습니다.");
      }
    });

    pre.appendChild(copyButton);
  });
}

/**
 * 마크다운 텍스트를 파싱하여 Tailwind CSS 스타일이 적용된 HTML로 렌더링합니다.
 * @param {'post'|'menu'} kinds - 본문 유형 ('post': 블로그 게시글, 'menu': 단독 페이지)
 * @param {string} text - 원본 마크다운 문자열
 * @param {object|null} [title_info=null] - 포스트 메타데이터 정보 객체
 */
function styleMarkdown(kinds, text, title_info = null) {
  const tempDiv = document.createElement("div");
  const html = marked.parse(text);
  tempDiv.innerHTML = html;

  // 1. Mermaid 다이어그램 코드 블록 변환 (pre 스타일링 전에 수행)
  tempDiv.querySelectorAll("code").forEach((codeEl) => {
    if (
      codeEl.classList.contains("language-mermaid") ||
      codeEl.classList.contains("lang-mermaid") ||
      codeEl.classList.contains("mermaid")
    ) {
      const pre = codeEl.parentElement;
      const mermaidDiv = document.createElement("div");
      mermaidDiv.className = "mermaid flex justify-center my-6 overflow-x-auto";
      mermaidDiv.textContent = codeEl.textContent;
      if (pre && pre.tagName.toLowerCase() === "pre") {
        pre.replaceWith(mermaidDiv);
      } else {
        codeEl.replaceWith(mermaidDiv);
      }
    }
  });

  // 2. 공통 본문 타이포그래피, 다이어그램 래퍼 및 테이블 스타일 적용
  applyPostTypography(tempDiv);

  // 3. 소스 코드 블록 스타일링 및 복사(Copy) 버튼 추가
  attachPreCopyButtons(tempDiv, postpreStyle);
  tempDiv
    .querySelectorAll("code")
    .forEach((code) => code.classList.add(...postcodeStyle.split(" ")));

  // 4. 블로그 포스트 상단 헤더 섹션(카테고리, 제목, 작성자, 날짜, 썸네일) 생성
  if (kinds === "post" && title_info) {
    tempDiv.insertBefore(createPostHeader(tempDiv, title_info), tempDiv.firstChild);
  }

  // 7. #contents 컨테이너 렌더링
  const contentsDiv = document.getElementById("contents");
  while (contentsDiv.firstChild) {
    contentsDiv.removeChild(contentsDiv.firstChild);
  }
  contentsDiv.appendChild(tempDiv);

  // 코드 하이라이팅 적용
  hljs.highlightAll();

  // KaTeX 수식 렌더링
  renderMath(contentsDiv);

  // Mermaid 다이어그램 렌더링
  if (window.mermaid) {
    try {
      if (typeof mermaid.run === "function") {
        mermaid.run({ querySelector: "#contents .mermaid" });
      } else if (typeof mermaid.init === "function") {
        mermaid.init(undefined, "#contents .mermaid");
      }
    } catch (e) {
      console.error("Mermaid render error:", e);
    }
  }

  // 본문 목차(TOC) 생성
  renderTOC();
}

/**
 * 요소 내부의 LaTeX 수식 기호를 KaTeX로 파싱 및 렌더링합니다.
 * @param {HTMLElement} element - 수식을 렌더링할 상위 DOM 엘리먼트
 */
function renderMath(element) {
  if (!element) return;
  const tryRender = () => {
    if (typeof renderMathInElement === "function") {
      try {
        renderMathInElement(element, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
          ],
          ignoredTags: [
            "script",
            "noscript",
            "style",
            "textarea",
            "pre",
            "code",
            "option",
          ],
          throwOnError: false,
        });
      } catch (e) {
        console.error("KaTeX render error:", e);
      }
    }
  };

  if (typeof renderMathInElement === "function") {
    tryRender();
  } else {
    setTimeout(tryRender, 200);
  }
}

/**
 * Jupyter Notebook (.ipynb) 데이터를 파싱하여 스타일이 적용된 HTML로 렌더링합니다.
 * @param {'post'|'menu'} kinds - 본문 유형
 * @param {string} text - .ipynb 파일 JSON 텍스트
 * @param {object|null} [title_info=null] - 포스트 메타데이터 정보 객체
 */
function styleJupyter(kinds, text, title_info = null) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = convertIpynbToHtml(text);

  tempDiv.querySelectorAll(".markdown-cell").forEach((markdownCell) => {
    applyPostTypography(markdownCell);
  });

  attachPreCopyButtons(tempDiv, notebookpreStyle);

  tempDiv
    .querySelectorAll("code")
    .forEach((code) => code.classList.add(...notebookcodeStyle.split(" ")));

  const contentsDiv = document.getElementById("contents");
  while (contentsDiv.firstChild) {
    contentsDiv.removeChild(contentsDiv.firstChild);
  }

  // 상단 헤더 섹션 생성
  if (kinds === "post" && title_info) {
    contentsDiv.insertBefore(
      createPostHeader(tempDiv, title_info),
      contentsDiv.firstChild
    );
  }

  // 노트북 원본 다운로드 버튼 추가
  const downloadButton = document.createElement("button");
  downloadButton.textContent = "Notebook Download";
  downloadButton.classList.add(...notebookdownloadButtonStyle.split(" "));
  downloadButton.addEventListener("click", function (event) {
    event.stopPropagation();
    const blob = new Blob([text], { type: "text/plain" });
    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = (title_info ? title_info.title : "notebook") + ".ipynb";
    a.click();
    window.URL.revokeObjectURL(blobUrl);
  });
  contentsDiv.appendChild(downloadButton);
  contentsDiv.appendChild(tempDiv);

  hljs.highlightAll();
  renderMath(contentsDiv);

  if (window.mermaid) {
    try {
      if (typeof mermaid.run === "function") {
        mermaid.run({ querySelector: "#contents .mermaid" });
      } else if (typeof mermaid.init === "function") {
        mermaid.init(undefined, "#contents .mermaid");
      }
    } catch (e) {
      console.error("Mermaid render error:", e);
    }
  }

  renderTOC();
}

/**
 * 목차(TOC) 스크롤스파이(Scrollspy) 리스너 핸들러 변수
 */
let tocScrollHandler = null;

/**
 * 기존에 등록된 TOC 스크롤 이벤트 리스너를 해제합니다.
 */
function clearTOCScrollListener() {
  if (tocScrollHandler) {
    window.removeEventListener("scroll", tocScrollHandler);
    tocScrollHandler = null;
  }
}

/**
 * 본문(#contents)의 헤딩 태그를 탐색하여 오른쪽 Aside 영역에 인터랙티브 목차(TOC)를 생성합니다.
 */
function renderTOC() {
  clearTOCScrollListener();

  const asideWrapper = document.querySelector(".category-aside");
  const asideContainer = document.querySelector("aside");
  const asideTit = asideWrapper ? asideWrapper.querySelector(".aside-tit") : null;

  if (!asideContainer) return;

  if (asideTit) {
    asideTit.textContent = "Content";
  }

  asideContainer.innerHTML = "";
  asideContainer.className = "";
  asideContainer.classList.add(...tocContainerStyle.split(" "));

  // 본문(#contents) 내 헤딩 태그 추출 (#title_section 및 다이어그램 내부 헤딩 제외)
  const allHeadings = Array.from(
    document.querySelectorAll(
      "#contents h1, #contents h2, #contents h3, #contents h4, #contents h5, #contents h6"
    )
  ).filter(
    (h) =>
      !h.closest("#title_section, .diagram-container, .diagram-card, .mermaid, svg")
  );

  if (allHeadings.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className =
      "px-4 py-3 text-xs text-gray-400 dark:text-gray-500 text-center";
    emptyMsg.textContent = "목차가 없습니다.";
    asideContainer.appendChild(emptyMsg);
    return;
  }

  // 최상위 depth 기준 상대 레벨 계산
  const depths = allHeadings.map((h) => parseInt(h.tagName.substring(1), 10));
  const minDepth = Math.min(...depths);

  const tocList = document.createElement("div");
  tocList.className = "flex flex-col gap-0.5 w-full";

  const tocItems = [];

  allHeadings.forEach((heading, idx) => {
    const depth = parseInt(heading.tagName.substring(1), 10);
    const relativeLevel = depth - minDepth;
    const headingId = `toc-heading-${idx}`;
    heading.id = headingId;
    heading.classList.add("scroll-mt-24");

    const tocItem = document.createElement("a");
    tocItem.href = `#${headingId}`;
    tocItem.dataset.targetId = headingId;
    tocItem.classList.add(...tocItemBaseStyle.split(" "));

    const headingText = heading.textContent.trim();
    tocItem.textContent = headingText;
    tocItem.title = headingText;

    // 레벨별 들여쓰기 클래스 추가
    if (relativeLevel === 0) {
      tocItem.classList.add(
        "font-medium",
        "text-gray-800",
        "dark:text-gray-200"
      );
    } else if (relativeLevel === 1) {
      tocItem.classList.add("pl-6", "text-gray-600", "dark:text-gray-400");
    } else if (relativeLevel === 2) {
      tocItem.classList.add(
        "pl-9",
        "text-[12px]",
        "text-gray-500",
        "dark:text-gray-500"
      );
    } else {
      tocItem.classList.add(
        "pl-12",
        "text-[12px]",
        "text-gray-400",
        "dark:text-gray-500"
      );
    }

    tocItem.addEventListener("click", (e) => {
      e.preventDefault();
      heading.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState(null, "", `#${headingId}`);
      setActiveTOC(headingId);
    });

    tocList.appendChild(tocItem);
    tocItems.push({ heading, item: tocItem });
  });

  asideContainer.appendChild(tocList);

  function setActiveTOC(activeId) {
    const activeClasses = tocItemActiveStyle.split(" ");
    tocItems.forEach(({ item }) => {
      if (item.dataset.targetId === activeId) {
        item.classList.add(...activeClasses);
        item.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        item.classList.remove(...activeClasses);
      }
    });
  }

  // 첫 번째 항목 활성화
  if (tocItems.length > 0) {
    setActiveTOC(tocItems[0].heading.id);
  }

  // 실시간 스크롤 스파이(Scrollspy) 감지
  let isTicking = false;
  tocScrollHandler = () => {
    if (!isTicking) {
      window.requestAnimationFrame(() => {
        const topThreshold = 140;
        let currentHeading = allHeadings[0];

        if (
          window.innerHeight + window.scrollY >=
          document.documentElement.scrollHeight - 50
        ) {
          currentHeading = allHeadings[allHeadings.length - 1];
        } else {
          for (let i = 0; i < allHeadings.length; i++) {
            const rect = allHeadings[i].getBoundingClientRect();
            if (rect.top <= topThreshold) {
              currentHeading = allHeadings[i];
            } else {
              break;
            }
          }
        }

        if (currentHeading) {
          setActiveTOC(currentHeading.id);
        }
        isTicking = false;
      });
      isTicking = true;
    }
  };

  window.addEventListener("scroll", tocScrollHandler, { passive: true });
}
