'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import PortalAppShell from '@/src/components/PortalAppShell';
import AdminParentProfilePanel from '@/src/components/admin/AdminParentProfilePanel';

export default function AdminParentEditPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';

  return (
    <PortalAppShell
      showManagerNav
      managerActiveTab="families"
      maxWidthClassName="max-w-6xl"
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link
            href="/portal?tab=families"
            className="text-sm font-semibold text-[#fdfaf3]/90 underline-offset-4 hover:text-[#ffc94a] hover:underline"
          >
            ← Powrót do panelu
          </Link>
        </div>
        {id ? <AdminParentProfilePanel parentId={id} /> : null}
      </div>
    </PortalAppShell>
  );
}
