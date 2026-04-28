import { useEffect } from 'react';

export function ThemeInitializer() {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  return null;
}

