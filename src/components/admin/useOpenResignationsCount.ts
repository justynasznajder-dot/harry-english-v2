'use client';

import { useCallback, useEffect, useState } from 'react';

const POLL_MS = 60_000;

export function useOpenResignationsCount(refreshToken = 0) {
  const [openCount, setOpenCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/resignations?countOnly=1', {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = (await res.json()) as { openCount?: number };
      if (res.ok) setOpenCount(typeof data.openCount === 'number' ? data.openCount : 0);
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

  return { openCount, refresh };
}
