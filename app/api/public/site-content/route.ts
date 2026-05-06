import { NextResponse } from "next/server";
import { getRegistrationSchoolId, queryDb } from "@/lib/db";
import type { QueryResultRow } from "pg";

function normalizePublicPath(path: string): string {
  const t = path.trim();
  if (!t) return t;
  return t.startsWith("/") ? t : `/${t}`;
}

async function optionalQuery<T extends QueryResultRow>(
  sql: string,
  params: unknown[]
): Promise<T[]> {
  try {
    const r = await queryDb<T>(sql, params);
    return r.rows;
  } catch (e) {
    console.warn("[public/site-content] optional query:", e);
    return [];
  }
}

/**
 * Treści strony głównej: nauczyciele z `users`, reszta z tabel marketing_* (jeśli istnieją).
 */
export async function GET() {
  try {
    const schoolId = getRegistrationSchoolId();
    if (!schoolId) {
      return NextResponse.json({
        teachers: [],
        gallery: [],
        faqs: [],
        testimonials: [],
      });
    }

    const teachers = await optionalQuery<{
      id: string;
      first_name: string;
      last_name: string;
    }>(
      `SELECT id, first_name, last_name
       FROM users
       WHERE school_id = $1 AND role = 'TEACHER' AND active = TRUE
       ORDER BY last_name ASC, first_name ASC`,
      [schoolId]
    );

    const galleryRows = await optionalQuery<{
      image_path: string;
      caption: string | null;
    }>(
      `SELECT image_path, caption
       FROM marketing_gallery
       WHERE school_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [schoolId]
    );

    const faqs = await optionalQuery<{ question: string; answer: string }>(
      `SELECT question, answer
       FROM marketing_faq
       WHERE school_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [schoolId]
    );

    const testimonials = await optionalQuery<{
      author_name: string;
      body: string;
      sort_label: string | null;
      rating: number | null;
    }>(
      `SELECT author_name, body, sort_label, rating
       FROM marketing_testimonial
       WHERE school_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [schoolId]
    );

    const gallery = galleryRows.map((row) => ({
      image_path: normalizePublicPath(row.image_path),
      caption: row.caption,
    }));

    return NextResponse.json({
      teachers,
      gallery,
      faqs,
      testimonials: testimonials.map((t) => ({
        author_name: t.author_name,
        body: t.body,
        sort_label: t.sort_label,
        rating: t.rating ?? 5,
      })),
    });
  } catch (e) {
    console.error("public/site-content GET:", e);
    return NextResponse.json({ message: "Nie udało się pobrać treści" }, { status: 500 });
  }
}
