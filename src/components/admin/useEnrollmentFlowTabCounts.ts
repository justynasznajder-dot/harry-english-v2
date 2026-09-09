'use client';

import { useCallback, useEffect, useState } from 'react';

const POLL_MS = 60_000;

type TabCounts = {
  pipeline: number;
  renewals: number;
  signedContracts: number;
};

const EMPTY: TabCounts = { pipeline: 0, renewals: 0, signedContracts: 0 };

/**
 * Liczniki zakładek Zapisy (Status / Odnowienia / Umowy podpisane).
 * Zgłoszenia i Rezygnacje mają własne hooki.
 */
export function useEnrollmentFlowTabCounts(enabled = true, refreshToken = 0) {
  const [counts, setCounts] = useState<TabCounts>(EMPTY);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const [pipelineRes, renewalsRes, signedRes] = await Promise.all([
        fetch('/api/admin/pipeline?countOnly=1', {
          cache: 'no-store',
          credentials: 'include',
        }),
        fetch('/api/admin/renewals?countOnly=1', {
          cache: 'no-store',
          credentials: 'include',
        }),
        fetch('/api/admin/signed-contracts?countOnly=1', {
          cache: 'no-store',
          credentials: 'include',
        }),
      ]);
      const [pipelineData, renewalsData, signedData] = await Promise.all([
        pipelineRes.json().catch(() => ({})),
        renewalsRes.json().catch(() => ({})),
        signedRes.json().catch(() => ({})),
      ]);
      setCounts({
        pipeline:
          pipelineRes.ok && typeof pipelineData.count === 'number' ? pipelineData.count : 0,
        renewals:
          renewalsRes.ok && typeof renewalsData.count === 'number' ? renewalsData.count : 0,
        signedContracts:
          signedRes.ok && typeof signedData.count === 'number' ? signedData.count : 0,
      });
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshToken]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return { counts, refresh };
}
