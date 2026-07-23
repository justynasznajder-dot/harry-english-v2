'use client';

import { useCallback, useEffect, useState } from 'react';

const POLL_MS = 60_000;

export function usePendingEnrollmentsCount(refreshToken = 0) {
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enrollment?countOnly=1', {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = (await res.json()) as { pendingCount?: number };
      if (res.ok) setPendingCount(typeof data.pendingCount === 'number' ? data.pendingCount : 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  useEffect(() => {
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  return { pendingCount, refresh };
}
