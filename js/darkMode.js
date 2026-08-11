(function () {
  function getPreferredTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    updateToggleButton(theme);
  }

  function updateToggleButton(theme) {
    const toggleBtn = document.getElementById('dark-mode-toggle');
    if (!toggleBtn) return;
    const iconSun = toggleBtn.querySelector('.icon-sun');
    const iconMoon = toggleBtn.querySelector('.icon-moon');
    
    if (theme === 'dark') {
      if (iconSun) iconSun.classList.remove('hidden');
      if (iconMoon) iconMoon.classList.add('hidden');
      toggleBtn.setAttribute('aria-label', '라이트 모드로 변경');
    } else {
      if (iconSun) iconSun.classList.add('hidden');
      if (iconMoon) iconMoon.classList.remove('hidden');
      toggleBtn.setAttribute('aria-label', '다크 모드로 변경');
    }
  }

  window.toggleDarkMode = function () {
    const isDark = document.documentElement.classList.contains('dark');
    const nextTheme = isDark ? 'light' : 'dark';
    localStorage.setItem('theme', nextTheme);
    applyTheme(nextTheme);
  };

  // Immediate execution for anti-FOUC
  const initialTheme = getPreferredTheme();
  if (initialTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }

  document.addEventListener('DOMContentLoaded', function () {
    updateToggleButton(getPreferredTheme());

    // Listen for OS theme preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
      if (!localStorage.getItem('theme')) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  });
})();
