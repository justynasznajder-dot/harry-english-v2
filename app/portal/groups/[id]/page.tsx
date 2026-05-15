import Link from 'next/link';
import AdminPortal from '@/src/components/AdminPortal';

interface GroupPageProps {
  params: Promise<{ id: string }>;
}

export default async function GroupPage({ params }: GroupPageProps) {
  const { id } = await params;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] p-4">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-2xl border border-emerald-100 bg-white p-4">
          <Link
            href="/portal"
            className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
          >
            ← Powrót do panelu
          </Link>
        </div>
        <AdminPortal initialGroupId={id} />
      </div>
    </div>
  );
}
