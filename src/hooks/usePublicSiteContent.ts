"use client";

import { useEffect, useState } from "react";

export type PublicSiteContent = {
  teachers: { id: string; first_name: string; last_name: string }[];
  gallery: { image_path: string; caption: string | null }[];
  faqs: { question: string; answer: string }[];
  testimonials: {
    author_name: string;
    body: string;
    sort_label: string | null;
    rating: number;
  }[];
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
          setData({
            teachers: json.teachers ?? [],
            gallery: json.gallery ?? [],
            faqs: json.faqs ?? [],
            testimonials: json.testimonials ?? [],
          });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Błąd");
          setData({
            teachers: [],
            gallery: [],
            faqs: [],
            testimonials: [],
          });
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
