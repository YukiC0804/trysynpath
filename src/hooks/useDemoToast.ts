import { useCallback, useEffect, useRef, useState } from 'react';

export function useDemoToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback((next: string) => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setMessage(next);
    timerRef.current = window.setTimeout(() => setMessage(null), 2800);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    [],
  );

  return { message, showToast };
}
