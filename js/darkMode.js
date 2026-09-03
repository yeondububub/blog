/**
 * 다크 모드 / 라이트 모드 테마 토글 및 로컬 스토리지 동기화 모듈
 */
(function () {
  /**
   * 로컬 스토리지에 저장된 테마 또는 OS 선호 테마를 가져옵니다.
   * @returns {'dark'|'light'}
   */
  function getPreferredTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme) {
      return savedTheme;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  /**
   * HTML 최상단 태그에 dark 클래스를 적용/해제하고 토글 버튼 UI를 갱신합니다.
   * @param {'dark'|'light'} theme
   */
  function applyTheme(theme) {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    updateToggleButton(theme);
  }

  /**
   * 다크모드 토글 버튼 내 해/달 아이콘 및 aria-label을 상태에 맞게 갱신합니다.
   * @param {'dark'|'light'} theme
   */
  function updateToggleButton(theme) {
    const toggleBtn = document.getElementById("dark-mode-toggle");
    if (!toggleBtn) return;
    const iconSun = toggleBtn.querySelector(".icon-sun");
    const iconMoon = toggleBtn.querySelector(".icon-moon");

    if (theme === "dark") {
      if (iconSun) iconSun.classList.remove("hidden");
      if (iconMoon) iconMoon.classList.add("hidden");
      toggleBtn.setAttribute("aria-label", "라이트 모드로 변경");
    } else {
      if (iconSun) iconSun.classList.add("hidden");
      if (iconMoon) iconMoon.classList.remove("hidden");
      toggleBtn.setAttribute("aria-label", "다크 모드로 변경");
    }
  }

  /**
   * 사용자가 테마 토글 버튼을 클릭했을 때 호출되는 전역 함수
   */
  window.toggleDarkMode = function () {
    const isDark = document.documentElement.classList.contains("dark");
    const nextTheme = isDark ? "light" : "dark";
    localStorage.setItem("theme", nextTheme);
    applyTheme(nextTheme);
  };

  // 페이지 깜빡임(FOUC, Flash of Unstyled Content) 방지를 위한 즉시 실행
  const initialTheme = getPreferredTheme();
  if (initialTheme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  // DOM 로드 완료 후 버튼 상태 및 OS 테마 변경 감지기 등록
  document.addEventListener("DOMContentLoaded", function () {
    updateToggleButton(getPreferredTheme());

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", function (e) {
        if (!localStorage.getItem("theme")) {
          applyTheme(e.matches ? "dark" : "light");
        }
      });
  });
})();
