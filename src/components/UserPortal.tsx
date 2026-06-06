'use client';

import { useCallback, useEffect, useState } from 'react';
import EnrollmentParentFlow, { type UserInfo } from '@/src/components/enrollment/EnrollmentParentFlow';
import MessagesPanel from '@/src/components/messages/MessagesPanel';
import RenewalsBanner from '@/src/components/RenewalsBanner';
import MessagesTabLabel from '@/src/components/messages/MessagesTabLabel';
import { useUnreadMessagesCount } from '@/src/components/messages/useUnreadMessagesCount';

export type { UserInfo };

interface UserPortalProps {
  userInfo: UserInfo;
  onUserInfoUpdate: (updatedInfo: UserInfo) => void;
}

type FlashKind = 'success' | 'error' | 'info';
interface Flash {
  kind: FlashKind;
  message: string;
}

type PortalTab = 'enrollment' | 'messages' | 'group' | 'attendance' | 'payments';

const topTabs: Array<{ key: PortalTab; label: string }> = [
  { key: 'enrollment', label: 'Proces zapisu' },
  { key: 'messages', label: 'Wiadomości' },
  { key: 'group', label: 'Moja grupa' },
  { key: 'attendance', label: 'Obecności' },
  { key: 'payments', label: 'Płatności' },
];

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600">
      {message}
    </div>
  );
}

export default function UserPortal({ userInfo, onUserInfoUpdate }: UserPortalProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('enrollment');
  const [messagesListResetToken, setMessagesListResetToken] = useState(0);
  const { unreadCount: messagesUnreadCount, refresh: refreshMessagesUnreadCount } =
    useUnreadMessagesCount(messagesListResetToken);
  const [renewalsFlash, setRenewalsFlash] = useState<Flash | null>(null);

  const refreshUserAccessLevel = useCallback(async () => {
    try {
      const r = await fetch('/api/user/me', { cache: 'no-store' });
      if (!r.ok) return;
      const data = (await r.json()) as { user?: UserInfo };
      if (data.user) onUserInfoUpdate(data.user);
    } catch (err) {
      console.error('Nie udało się odświeżyć profilu rodzica', err);
    }
  }, [onUserInfoUpdate]);

  useEffect(() => {
    if (!renewalsFlash) return;
    const id = setTimeout(() => setRenewalsFlash(null), 6000);
    return () => clearTimeout(id);
  }, [renewalsFlash]);

  const renderMessagesTab = () => (
    <MessagesPanel
      mode="parent"
      currentUserId={userInfo.id}
      listResetToken={messagesListResetToken}
      onInboxChange={refreshMessagesUnreadCount}
    />
  );

  const renderGroupTab = () => (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Moja grupa</h2>
      <EmptyState message="Nie przypisano jeszcze do grupy." />
    </section>
  );

  const renderAttendanceTab = () => (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Obecności</h2>
      <div className="overflow-hidden rounded-2xl border border-zinc-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-700">
            <tr>
              <th className="px-4 py-3 font-semibold">Data</th>
              <th className="px-4 py-3 font-semibold">Obecność dziecka</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={2} className="px-4 py-8 text-center text-zinc-600">
                Brak danych o obecnościach.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderPaymentsTab = () => (
    <section className="space-y-4 rounded-3xl border border-emerald-100 bg-white p-5 md:p-6">
      <h2 className="text-xl font-bold text-zinc-900 md:text-2xl">Płatności</h2>
      {userInfo.complimentaryAccess ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-6 text-sm text-sky-900">
          <p className="font-semibold">Tryb bez opłat</p>
          <p className="mt-2">
            Twoje konto korzysta z dostępu do systemu bez generowania faktur i bez pobierania
            płatności.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Miesiąc</th>
                <th className="px-4 py-3 font-semibold">Kwota</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-zinc-600">
                  Brak danych o płatnościach.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );

  const renderContent = () => {
    if (activeTab === 'enrollment') {
      return (
        <EnrollmentParentFlow userInfo={userInfo} onUserInfoUpdate={onUserInfoUpdate} />
      );
    }
    if (activeTab === 'messages') return renderMessagesTab();
    if (activeTab === 'group') return renderGroupTab();
    if (activeTab === 'attendance') return renderAttendanceTab();
    return renderPaymentsTab();
  };

  return (
    <div className="space-y-4 pb-20 md:pb-4">
      <RenewalsBanner onFlash={setRenewalsFlash} onUpdated={refreshUserAccessLevel} />
      {renewalsFlash && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            renewalsFlash.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : renewalsFlash.kind === 'error'
                ? 'border-rose-200 bg-rose-50 text-rose-900'
                : 'border-sky-200 bg-sky-50 text-sky-900'
          }`}
        >
          {renewalsFlash.message}
        </div>
      )}
      <div className="rounded-3xl border border-emerald-100 bg-white">
        <nav className="no-scrollbar overflow-x-auto border-b border-emerald-100">
          <div className="flex min-w-max gap-2 p-2">
            {topTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  if (tab.key === 'messages' && activeTab === 'messages') {
                    setMessagesListResetToken((t) => t + 1);
                  }
                  setActiveTab(tab.key);
                }}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
                    : 'border-transparent bg-emerald-50/60 text-zinc-800 hover:border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                {tab.key === 'messages' ? (
                  <MessagesTabLabel
                    label={tab.label}
                    unreadCount={messagesUnreadCount}
                    isActive={activeTab === 'messages'}
                  />
                ) : (
                  tab.label
                )}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {renderContent()}
    </div>
  );
}
