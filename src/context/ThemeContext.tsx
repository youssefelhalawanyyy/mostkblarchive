"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type ThemeMode = "dark" | "light";

interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = "mostkbl_archive_theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const initial: ThemeMode = saved === "light" ? "light" : "dark";
    setThemeState(initial);
    applyThemeClass(initial);
  }, []);

  const applyThemeClass = (mode: ThemeMode) => {
    const root = document.documentElement;
    if (mode === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
    }
  };

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    window.localStorage.setItem(STORAGE_KEY, mode);
    applyThemeClass(mode);
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

