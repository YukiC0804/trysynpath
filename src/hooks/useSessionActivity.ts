import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ActivityEvent } from '../../shared/ghost';

const STORAGE_KEY = 'synpath.agent.activity.session';

function load(): ActivityEvent[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useSessionActivity() {
  const [events, setEvents] = useState<ActivityEvent[]>(() =>
    typeof window === 'undefined' ? [] : load(),
  );

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  }, [events]);

  const push = useCallback((agent: string, summary: string, status?: string) => {
    const event: ActivityEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agent,
      summary,
      at: new Date().toISOString(),
      status,
    };
    setEvents((prev) => [event, ...prev].slice(0, 40));
    return event;
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  const recentKeys = useMemo(
    () => events.map((e) => e.summary),
    [events],
  );

  return { events, push, clear, recentKeys };
}
