"use client";

import { useEffect, useState } from "react";

export type PublicSiteContent = {
  teachers: { id: string; first_name: string; last_name: string }[];
};

export function usePublicSiteContent() {
  const [data, setData] = useState<PublicSiteContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/public/site-content");
        const json = (await res.json()) as PublicSiteContent & { message?: string };
        if (!res.ok) throw new Error(json.message ?? "Nie udało się pobrać treści");
        if (!cancelled) {
          setData({ teachers: json.teachers ?? [] });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Błąd");
          setData({ teachers: [] });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error };
}
