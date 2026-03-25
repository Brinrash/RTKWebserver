const THEME_STORAGE_KEY = 'ui_theme';
const DEFAULT_THEME = 'dark';

function getStoredTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : DEFAULT_THEME;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  syncThemeToggle(theme);
}

function syncThemeToggle(theme = getStoredTheme()) {
  const nextTheme = theme === 'dark' ? 'light' : 'dark';
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.dataset.nextTheme = nextTheme;
    button.textContent = theme === 'dark' ? 'Светлая тема' : 'Тёмная тема';
    button.setAttribute('aria-label', `Переключить на ${nextTheme === 'light' ? 'светлую' : 'тёмную'} тему`);
  });
}

function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme || getStoredTheme();
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

function bootstrapThemeToggle() {
  const initialTheme = document.documentElement.dataset.theme || getStoredTheme();
  applyTheme(initialTheme);
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', toggleTheme);
  });
}

bootstrapThemeToggle();
