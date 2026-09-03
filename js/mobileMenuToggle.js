/**
 * 모바일 화면 햄버거 메뉴 토글 및 네비게이션 제어 모듈
 */
const menuButton = document.getElementById("menu-button");
const menu = document.getElementById("menu");
const mobileMenu = document.getElementById("mobileMenu");

window.addEventListener("click", (event) => {
  // 햄버거 버튼 클릭 시 모바일 메뉴 열기/닫기
  if (menuButton && menuButton.contains(event.target)) {
    if (mobileMenu.innerHTML === "") {
      mobileMenu.innerHTML = menu.innerHTML;
      const menuItems = mobileMenu.querySelectorAll("a");
      menuItems.forEach((item, index) => {
        item.classList.add(...mobileMenuStyle.split(" "));
        if (index === 0) {
          item.classList.add("mt-1.5");
        }
        item.style.animation = `slideDown forwards ${index * 0.2}s`;
      });
    } else {
      mobileMenu.innerHTML = "";
    }
  } else if (mobileMenu && event.target.parentNode === mobileMenu) {
    // 모바일 메뉴 항목 클릭 시 해당 카테고리/페이지로 이동
    event.preventDefault();

    const menuName = event.target.innerText.trim() + ".md";

    const handleMobileMenuClick = (targetFolder) => {
      if (blogList.length === 0) {
        initDataBlogList().then(() => {
          search(targetFolder, "folder");
        });
      } else {
        search(targetFolder, "folder");
      }
    };

    if (menuName === "Diary.md") {
      handleMobileMenuClick("blog");
    } else if (menuName === "Development.md") {
      handleMobileMenuClick("development");
    } else if (menuName === "AI.md") {
      handleMobileMenuClick("ai");
    } else if (menuName === "Backend.md") {
      handleMobileMenuClick("backend");
    } else if (menuName === "iOS.md") {
      handleMobileMenuClick("ios");
    } else if (menuName === "Security.md") {
      handleMobileMenuClick("security");
    } else {
      renderOtherContents(menuName);
    }

    const nextUrl = new URL(origin);
    nextUrl.searchParams.set("menu", menuName);
    window.history.pushState({}, "", nextUrl);
    mobileMenu.innerHTML = "";
  } else {
    // 메뉴 바깥 클릭 시 메뉴 닫기
    if (mobileMenu) {
      mobileMenu.innerHTML = "";
    }
  }
});
