import { useCallback, useEffect, useState } from 'react';

export type WorkspaceTheme = 'dark' | 'light';

const STORAGE_KEY = 'synpath-demo-theme';

function readStoredTheme(): WorkspaceTheme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function useWorkspaceTheme() {
  const [theme, setTheme] = useState<WorkspaceTheme>(readStoredTheme);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setWorkspaceTheme = useCallback((next: WorkspaceTheme) => {
    setTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, setWorkspaceTheme, toggleTheme };
}
