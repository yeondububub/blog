function styleMarkdown(kinds, text, title_info = null) {
  /* 
    메뉴와 블로그 상세 목록을 globalStyle.js에 정의된 tailwind css로 스타일링 합니다. 
    */
  // console.log(kinds, text, title_info);

  const tempDiv = document.createElement("div");
  const html = marked.parse(text);
  tempDiv.innerHTML = html;

  tempDiv
    .querySelectorAll("h1")
    .forEach((h1) => h1.classList.add(...posth1Style.split(" ")));
  tempDiv
    .querySelectorAll("h2")
    .forEach((h2) => h2.classList.add(...posth2Style.split(" ")));
  tempDiv
    .querySelectorAll("h3")
    .forEach((h3) => h3.classList.add(...posth3Style.split(" ")));
  tempDiv
    .querySelectorAll("h4")
    .forEach((h4) => h4.classList.add(...posth4Style.split(" ")));
  tempDiv
    .querySelectorAll("h5")
    .forEach((h5) => h5.classList.add(...posth5Style.split(" ")));
  tempDiv
    .querySelectorAll("h6")
    .forEach((h6) => h6.classList.add(...posth6Style.split(" ")));

  tempDiv
    .querySelectorAll("p")
    .forEach((p) => p.classList.add(...postpStyle.split(" ")));
  tempDiv
    .querySelectorAll("img")
    .forEach((img) => img.classList.add(...postimgStyle.split(" ")));
  tempDiv
    .querySelectorAll("a")
    .forEach((a) => a.classList.add(...postaStyle.split(" ")));

  tempDiv
    .querySelectorAll("ul")
    .forEach((ul) => ul.classList.add(...postulStyle.split(" ")));
  tempDiv
    .querySelectorAll("ol")
    .forEach((ol) => ol.classList.add(...postolStyle.split(" ")));
  tempDiv
    .querySelectorAll("li")
    .forEach((li) => li.classList.add(...postliStyle.split(" ")));

  tempDiv
    .querySelectorAll("blockquote")
    .forEach((blockquote) =>
      blockquote.classList.add(...postblockquoteStyle.split(" "))
    );

  // mermaid 코드 블록 처리
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

  tempDiv.querySelectorAll("pre").forEach((pre) => {
    pre.classList.add(...postpreStyle.split(" "));

    const code = pre.textContent;

    // 복사 버튼 생성
    const copyButton = document.createElement("button");
    copyButton.innerHTML = '<span class="sr-only">코드 복사하기</span>';
    copyButton.classList.add(...notebookcopyButtonStyle.split(" "));
    copyButton.setAttribute("id", "copy-button");

    // 복사 버튼 클릭 이벤트, pre에 텍스트가 있는 경우에만 활성화
    copyButton.addEventListener("click", async function (event) {
      event.stopPropagation(); // 이벤트 버블링을 막습니다.
      try {
        await navigator.clipboard.writeText(code);
        alert("복사되었습니다");
      } catch (err) {
        console.error("Failed to copy text: ", err);
        alert("복사에 실패했습니다.");
      }
    });

    // pre 요소 안에 버튼 삽입
    pre.appendChild(copyButton);
  });
  tempDiv
    .querySelectorAll("code")
    .forEach((code) => code.classList.add(...postcodeStyle.split(" ")));

  tempDiv
    .querySelectorAll("table")
    .forEach((table) => table.classList.add(...posttableStyle.split(" ")));
  tempDiv.querySelectorAll("table").forEach((table) => {
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

  tempDiv
    .querySelectorAll("thead")
    .forEach((thead) => thead.classList.add(...posttheadStyle.split(" ")));
  tempDiv
    .querySelectorAll("th")
    .forEach((th) => th.classList.add(...postthStyle.split(" ")));
  tempDiv
    .querySelectorAll("tbody")
    .forEach((tbody) => tbody.classList.add(...posttbodyStyle.split(" ")));
  tempDiv
    .querySelectorAll("td")
    .forEach((td) => td.classList.add(...posttdStyle.split(" ")));

  tempDiv
    .querySelectorAll("hr")
    .forEach((hr) => hr.classList.add(...posthrStyle.split(" ")));
  tempDiv
    .querySelectorAll("em")
    .forEach((em) => em.classList.add(...postemStyle.split(" ")));
  tempDiv
    .querySelectorAll("strong")
    .forEach((strong) => strong.classList.add(...poststrongStyle.split(" ")));

  if (kinds === "post") {
    // 일반 마크다운 블로그 포스트
    const title_section = document.createElement("div");

    // category
    // category는 클릭하면 해당 카테고리의 블로그 리스트를 렌더링
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
        search(cat.toLowerCase(), "category");
        const url = new URL(origin);
        url.searchParams.set("search", cat);
        window.history.pushState({}, "", url);
      };
      categoryContainer.appendChild(category);
    });
    title_section.appendChild(categoryContainer);

    // title
    const title = document.createElement("h1");
    title.classList.add(...posttitleStyle.split(" "));
    // console.log(title_info)
    title.textContent = title_info.title;
    title_section.appendChild(title);

    // author와 date를 담는 div
    const author_date = document.createElement("div");
    author_date.classList.add(...postauthordateDivStyle.split(" "));
    title_section.appendChild(author_date);

    // author
    const authorDiv = document.createElement("div");
    authorDiv.classList.add(...postauthorDivStyle.split(" "));
    author_date.appendChild(authorDiv);

    const authorImg = document.createElement("img");
    authorImg.src = users[title_info.author]["img"];
    authorImg.alt = users[title_info.author]["username"];
    authorImg.classList.add(...postauthorImgStyle.split(" "));
    authorDiv.appendChild(authorImg);

    const author = document.createElement("div");
    author.classList.add(...postauthorStyle.split(" "));
    author.textContent = users[title_info.author]["username"];
    authorDiv.appendChild(author);

    // date
    const date = document.createElement("div");
    date.classList.add(...postdateStyle.split(" "));
    date.textContent = formatDate(title_info.date);
    author_date.appendChild(date);

    // image
    const image = document.createElement("img");
    image.src = title_info.thumbnail;
    image.alt = title_info.title;
    image.classList.add(...postimgtitleStyle.split(" "));
    title_section.appendChild(image);

    // section styling
    title_section.classList.add(...postsectionStyle.split(" "));
    title_section.setAttribute("id", "title_section");

    tempDiv.insertBefore(title_section, tempDiv.firstChild);
  } else if (kinds === "menu") {
  }

  // innerHTML을 사용하면 click이벤트가 사라지므로, appendChild를 사용하여 렌더링
  const contentsDiv = document.getElementById("contents");
  while (contentsDiv.firstChild) {
    contentsDiv.removeChild(contentsDiv.firstChild);
  }
  contentsDiv.appendChild(tempDiv);

  hljs.highlightAll();

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

  // 본문 렌더링 후 목차(TOC) 생성
  renderTOC();
}

function styleJupyter(kinds, text, title_info = null) {
  /* 
    주피터 노트북 파일 내용을 globalStyle.js에 정의된 tailwind css로 스타일링 합니다. 
    */
  const tempDiv = document.createElement("div");
  const html = convertIpynvToHtml(text);
  // const html = marked.parse(text);
  tempDiv.innerHTML = html;

  tempDiv.querySelectorAll(".markdown-cell").forEach((markdownCell) => {
    markdownCell
      .querySelectorAll("h1")
      .forEach((h1) => h1.classList.add(...posth1Style.split(" ")));
    markdownCell
      .querySelectorAll("h2")
      .forEach((h2) => h2.classList.add(...posth2Style.split(" ")));
    markdownCell
      .querySelectorAll("h3")
      .forEach((h3) => h3.classList.add(...posth3Style.split(" ")));
    markdownCell
      .querySelectorAll("h4")
      .forEach((h4) => h4.classList.add(...posth4Style.split(" ")));
    markdownCell
      .querySelectorAll("h5")
      .forEach((h5) => h5.classList.add(...posth5Style.split(" ")));
    markdownCell
      .querySelectorAll("h6")
      .forEach((h6) => h6.classList.add(...posth6Style.split(" ")));

    markdownCell
      .querySelectorAll("p")
      .forEach((p) => p.classList.add(...postpStyle.split(" ")));
    markdownCell
      .querySelectorAll("img")
      .forEach((img) => img.classList.add(...postimgStyle.split(" ")));
    markdownCell
      .querySelectorAll("a")
      .forEach((a) => a.classList.add(...postaStyle.split(" ")));

    markdownCell
      .querySelectorAll("ul")
      .forEach((ul) => ul.classList.add(...postulStyle.split(" ")));
    markdownCell
      .querySelectorAll("ol")
      .forEach((ol) => ol.classList.add(...postolStyle.split(" ")));
    markdownCell
      .querySelectorAll("li")
      .forEach((li) => li.classList.add(...postliStyle.split(" ")));

    markdownCell
      .querySelectorAll("blockquote")
      .forEach((blockquote) =>
        blockquote.classList.add(...postblockquoteStyle.split(" "))
      );
    markdownCell
      .querySelectorAll("pre")
      .forEach((pre) => pre.classList.add(...postpreStyle.split(" ")));
    markdownCell
      .querySelectorAll("code")
      .forEach((code) => code.classList.add(...postcodeStyle.split(" ")));

    markdownCell
      .querySelectorAll("table")
      .forEach((table) => table.classList.add(...posttableStyle.split(" ")));
    markdownCell
      .querySelectorAll("thead")
      .forEach((thead) => thead.classList.add(...posttheadStyle.split(" ")));
    markdownCell
      .querySelectorAll("th")
      .forEach((th) => th.classList.add(...postthStyle.split(" ")));
    markdownCell
      .querySelectorAll("tbody")
      .forEach((tbody) => tbody.classList.add(...posttbodyStyle.split(" ")));
    markdownCell
      .querySelectorAll("td")
      .forEach((td) => td.classList.add(...posttdStyle.split(" ")));

    markdownCell
      .querySelectorAll("hr")
      .forEach((hr) => hr.classList.add(...posthrStyle.split(" ")));
    markdownCell
      .querySelectorAll("em")
      .forEach((em) => em.classList.add(...postemStyle.split(" ")));
    markdownCell
      .querySelectorAll("strong")
      .forEach((strong) => strong.classList.add(...poststrongStyle.split(" ")));
  });

  // mermaid 코드 블록 처리
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

  tempDiv.querySelectorAll("code").forEach((code) => {
    code.classList.add(...notebookcodeStyle.split(" "));
  });
  tempDiv.querySelectorAll("pre").forEach((pre) => {
    pre.classList.add(...notebookpreStyle.split(" "));
    const code = pre.textContent;

    // 복사 버튼 생성
    const copyButton = document.createElement("button");
    copyButton.innerHTML = '<span class="sr-only">코드 복사하기</span>';
    copyButton.classList.add(...notebookcopyButtonStyle.split(" "));
    copyButton.setAttribute("id", "copy-button");

    // 복사 버튼 클릭 이벤트, pre에 텍스트가 있는 경우에만 활성화
    copyButton.addEventListener("click", async function (event) {
      event.stopPropagation(); // 이벤트 버블링을 막습니다.
      try {
        await navigator.clipboard.writeText(code);
        alert("복사되었습니다");
      } catch (err) {
        console.error("Failed to copy text: ", err);
        alert("복사에 실패했습니다.");
      }
    });

    // pre 요소 안에 버튼 삽입
    pre.appendChild(copyButton);
  });

  const contentsDiv = document.getElementById("contents");
  while (contentsDiv.firstChild) {
    contentsDiv.removeChild(contentsDiv.firstChild);
  }

  if (kinds === "post") {
    // 일반 마크다운 블로그 포스트
    const title_section = document.createElement("div");

    // category
    // category는 클릭하면 해당 카테고리의 블로그 리스트를 렌더링
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
        search(cat.toLowerCase(), "category");
        const url = new URL(origin);
        url.searchParams.set("search", cat);
        window.history.pushState({}, "", url);
      };
      categoryContainer.appendChild(category);
    });
    title_section.appendChild(categoryContainer);

    // title
    const title = document.createElement("h1");
    title.classList.add(...posttitleStyle.split(" "));
    // console.log(title_info)
    title.textContent = title_info.title;
    title_section.appendChild(title);

    // author와 date를 담는 div
    const author_date = document.createElement("div");
    author_date.classList.add(...postauthordateDivStyle.split(" "));
    title_section.appendChild(author_date);

    // author
    const authorDiv = document.createElement("div");
    authorDiv.classList.add(...postauthorDivStyle.split(" "));
    author_date.appendChild(authorDiv);

    const authorImg = document.createElement("img");
    authorImg.src = users[title_info.author]["img"];
    authorImg.alt = users[title_info.author]["username"];
    authorImg.classList.add(...postauthorImgStyle.split(" "));
    authorDiv.appendChild(authorImg);

    const author = document.createElement("div");
    author.classList.add(...postauthorStyle.split(" "));
    author.textContent = users[title_info.author]["username"];
    authorDiv.appendChild(author);

    // date
    const date = document.createElement("div");
    date.classList.add(...postdateStyle.split(" "));
    date.textContent = formatDate(title_info.date);
    author_date.appendChild(date);

    // image
    const image = document.createElement("img");
    image.src = title_info.thumbnail;
    image.alt = title_info.title;
    image.classList.add(...postimgtitleStyle.split(" "));
    title_section.appendChild(image);

    // section styling
    title_section.classList.add(...postsectionStyle.split(" "));
    title_section.setAttribute("id", "title_section");

    contentsDiv.insertBefore(title_section, contentsDiv.firstChild);
  }

  // 노트북 다운로드 버튼 추가
  const downloadButton = document.createElement("button");
  downloadButton.textContent = "Notebook Download";
  downloadButton.classList.add(...notebookdownloadButtonStyle.split(" "));
  downloadButton.addEventListener("click", function (event) {
    event.stopPropagation(); // 이벤트 버블링을 막습니다.
    const blob = new Blob([text], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = title_info.title + ".ipynb";
    a.click();
    window.URL.revokeObjectURL(url);
  });
  contentsDiv.appendChild(downloadButton);
  contentsDiv.appendChild(tempDiv);
  hljs.highlightAll();

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

  // 본문 렌더링 후 목차(TOC) 생성
  renderTOC();
}

// 목차(TOC) 스크롤 리스너 관리 변수
let tocScrollHandler = null;

function clearTOCScrollListener() {
  if (tocScrollHandler) {
    window.removeEventListener("scroll", tocScrollHandler);
    tocScrollHandler = null;
  }
}

function renderTOC() {
  clearTOCScrollListener();

  const asideWrapper = document.querySelector(".category-aside");
  const asideContainer = document.querySelector("aside");
  const asideTit = asideWrapper ? asideWrapper.querySelector(".aside-tit") : null;

  if (!asideContainer) return;

  // aside 타이틀을 'Content'로 변경
  if (asideTit) {
    asideTit.textContent = "Content";
  }

  // 기존 aside 내부 초기화 및 스타일 설정
  asideContainer.innerHTML = "";
  asideContainer.className = "";
  asideContainer.classList.add(...tocContainerStyle.split(" "));

  // 본문(#contents) 내의 모든 heading 추출 (#title_section의 타이틀은 제외)
  const allHeadings = Array.from(
    document.querySelectorAll(
      "#contents h1, #contents h2, #contents h3, #contents h4, #contents h5, #contents h6"
    )
  ).filter((h) => !h.closest("#title_section"));

  if (allHeadings.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "px-4 py-3 text-xs text-gray-400 dark:text-gray-500 text-center";
    emptyMsg.textContent = "목차가 없습니다.";
    asideContainer.appendChild(emptyMsg);
    return;
  }

  // 최상위 depth 계산 (예: H1이 없으면 H2가 0레벨)
  const depths = allHeadings.map((h) => parseInt(h.tagName.substring(1), 10));
  const minDepth = Math.min(...depths);

  const tocList = document.createElement("div");
  tocList.className = "flex flex-col gap-0.5 w-full";

  const tocItems = [];

  allHeadings.forEach((heading, idx) => {
    const depth = parseInt(heading.tagName.substring(1), 10);
    const relativeLevel = depth - minDepth; // 0, 1, 2...
    const headingId = `toc-heading-${idx}`;
    heading.id = headingId;
    heading.classList.add("scroll-mt-24");

    const tocItem = document.createElement("a");
    tocItem.href = `#${headingId}`;
    tocItem.dataset.targetId = headingId;
    tocItem.classList.add(...tocItemBaseStyle.split(" "));

    const headingText = heading.textContent.trim();
    tocItem.textContent = headingText;
    tocItem.title = headingText; // hover 툴팁으로 전체 제목 확인 가능

    // 계층별 들여쓰기 설정
    if (relativeLevel === 0) {
      tocItem.classList.add("font-medium", "text-gray-800", "dark:text-gray-200");
    } else if (relativeLevel === 1) {
      tocItem.classList.add("pl-6", "text-gray-600", "dark:text-gray-400");
    } else if (relativeLevel === 2) {
      tocItem.classList.add("pl-9", "text-[12px]", "text-gray-500", "dark:text-gray-500");
    } else {
      tocItem.classList.add("pl-12", "text-[12px]", "text-gray-400", "dark:text-gray-500");
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

  // 초기 활성화 (첫 번째 항목)
  if (tocItems.length > 0) {
    setActiveTOC(tocItems[0].heading.id);
  }

  // Scrollspy (스크롤 시 활성 헤딩 실시간 감지 및 하이라이트)
  let isTicking = false;
  tocScrollHandler = () => {
    if (!isTicking) {
      window.requestAnimationFrame(() => {
        const topThreshold = 140; // 상단 헤더 여백 기준점
        let currentHeading = allHeadings[0];

        // 페이지 맨 아래 도달 시 마지막 헤딩 선택
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50) {
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

