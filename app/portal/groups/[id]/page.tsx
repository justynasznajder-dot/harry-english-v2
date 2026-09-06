'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PortalAppShell from '@/src/components/PortalAppShell';
import AdminPortal from '@/src/components/AdminPortal';

export default function GroupPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  return (
    <PortalAppShell>
      <div className="mb-4">
        <Link
          href="/portal?tab=organization"
          className="text-sm font-semibold text-[#fdfaf3]/90 underline-offset-4 hover:text-[#ffc94a] hover:underline"
        >
          ← Powrót do panelu
        </Link>
      </div>
      <Suspense
        fallback={
          <div className="rounded-3xl bg-[#f8f6f3] p-8 text-center shadow-xl">
            <p className="text-gray-600">Ładowanie grupy…</p>
          </div>
        }
      >
        <AdminPortal initialGroupId={id} />
      </Suspense>
    </PortalAppShell>
  );
}
