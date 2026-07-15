const menuButton = document.getElementById("menu-button");
const menu = document.getElementById("menu");

/*
모바일 환경에서 menu, 이 menu는 이벤트 위임으로 최적화하면 불필요한 코드가 많은 함수입니다. 시간상 최적화하지 않고 넘깁니다.
*/
const mobileMenu = document.getElementById("mobileMenu");

window.addEventListener("click", (event) => {
    if (event.target === menuButton) {
        if (mobileMenu.innerHTML === "") {
            mobileMenu.innerHTML = menu.innerHTML;
            const menuItems = mobileMenu.querySelectorAll("a");
            menuItems.forEach((item, index) => {
                item.classList.add(...mobileMenuStyle.split(" "));
                if (index == 0) {
                    item.classList.add("mt-1.5");
                }
                item.style.animation = `slideDown forwards ${index * 0.2}s`;
            });
        } else {
            mobileMenu.innerHTML = "";
        }
    } else if (event.target.parentNode === mobileMenu) {
        event.preventDefault();

        const menuName = event.target.innerText + ".md";
        
        if (menuName === "Diary.md") {
            search("blog", "folder");
        } else if (menuName === "Development.md") {
            search("development", "folder");
        } else if (menuName === "Data.md") {
            search("data", "folder");
        } else if (menuName === "Backend.md") {
            search("backend", "folder");
        } else if (menuName === "iOS.md") {
            search("ios", "folder");
        } else if (menuName === "Security.md") {
            search("security", "folder");
        } else {
            renderOtherContents(menuName);
        }

        const url = new URL(origin);
        url.searchParams.set("menu", menuName);
        window.history.pushState({}, "", url);
        mobileMenu.innerHTML = "";
    } else {
        mobileMenu.innerHTML = "";
    }
});
