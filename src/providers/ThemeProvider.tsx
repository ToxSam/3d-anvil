'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Force dark mode by default (light mode disabled for now)
  const [theme, setTheme] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Force dark mode - ignore localStorage and system preferences
    setTheme('dark');
    document.documentElement.classList.add('dark');
    
    // To re-enable theme switching, uncomment the code below and remove the lines above:
    // const saved = localStorage.getItem('theme') as Theme | null;
    // if (saved) {
    //   setTheme(saved);
    //   document.documentElement.classList.toggle('dark', saved === 'dark');
    // } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    //   setTheme('dark');
    //   document.documentElement.classList.add('dark');
    // }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
  };

  // Prevent flash of incorrect theme
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
