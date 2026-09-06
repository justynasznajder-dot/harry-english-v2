'use client';

import Link from 'next/link';
import MessagesTabLabel from '@/src/components/messages/MessagesTabLabel';
import { useUnreadMessagesCount } from '@/src/components/messages/useUnreadMessagesCount';
import { useOpenResignationsCount } from '@/src/components/admin/useOpenResignationsCount';
import { usePendingEnrollmentsCount } from '@/src/components/admin/usePendingEnrollmentsCount';

export type ManagerTabKey =
  | 'dashboard'
  | 'organization'
  | 'families'
  | 'classes'
  | 'enrollments'
  | 'announcements'
  | 'billing'
  | 'settlements';

const topTabs: Array<{ key: ManagerTabKey; label: string }> = [
  { key: 'dashboard', label: 'Pulpit' },
  { key: 'organization', label: 'Organizacja szkoły' },
  { key: 'families', label: 'Rodzice/dzieci' },
  { key: 'classes', label: 'Zajęcia' },
  { key: 'enrollments', label: 'Zapisy / rezygnacje' },
  { key: 'announcements', label: 'Wiadomości' },
  { key: 'billing', label: 'Rozliczenia' },
  { key: 'settlements', label: 'Podsumowanie miesiąca' },
];

type ManagerTopNavProps = {
  /** Aktywna zakładka — na stronach szczegółów zwykle brak (żadna podświetlona). */
  activeTab?: ManagerTabKey | null;
  /** Gdy podane, kliknięcie wywołuje callback zamiast nawigacji (główny panel). */
  onTabSelect?: (tab: ManagerTabKey) => void;
};

export default function ManagerTopNav({ activeTab = null, onTabSelect }: ManagerTopNavProps) {
  const { unreadCount: messagesUnreadCount } = useUnreadMessagesCount(0);
  const { openCount: resignationsOpenCount } = useOpenResignationsCount();
  const { pendingCount: enrollmentsPendingCount } = usePendingEnrollmentsCount();

  const tabClass = (key: ManagerTabKey) =>
    `admin-top-tab rounded-full px-4 py-2 text-sm font-semibold transition ${
      activeTab === key
        ? 'bg-[#0f6e56] text-white shadow-sm'
        : 'bg-emerald-50/60 text-zinc-800 hover:bg-emerald-50'
    }`;

  const label = (tab: (typeof topTabs)[number]) => {
    if (tab.key === 'announcements') {
      return (
        <MessagesTabLabel
          label={tab.label}
          unreadCount={messagesUnreadCount}
          isActive={activeTab === 'announcements'}
        />
      );
    }
    if (tab.key === 'enrollments') {
      return (
        <span className="inline-flex items-center gap-1.5">
          <MessagesTabLabel
            label="Zapisy"
            unreadCount={enrollmentsPendingCount}
            isActive={activeTab === 'enrollments'}
            badgeAriaLabel={(n) =>
              n === 1 ? '1 nowe zgłoszenie' : `${n} nowych zgłoszeń`
            }
          />
          <span aria-hidden>/</span>
          <MessagesTabLabel
            label="rezygnacje"
            unreadCount={resignationsOpenCount}
            isActive={activeTab === 'enrollments'}
            badgeAriaLabel={(n) =>
              n === 1
                ? '1 otwarte zgłoszenie rezygnacji'
                : `${n} otwartych zgłoszeń rezygnacji`
            }
          />
        </span>
      );
    }
    return tab.label;
  };

  return (
    <nav className="admin-top-nav no-scrollbar overflow-x-auto rounded-3xl bg-white p-2 shadow-sm">
      <div className="flex min-w-max gap-2">
        {topTabs.map((tab) =>
          onTabSelect ? (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabSelect(tab.key)}
              className={tabClass(tab.key)}
            >
              {label(tab)}
            </button>
          ) : (
            <Link
              key={tab.key}
              href={`/portal?tab=${tab.key}`}
              className={tabClass(tab.key)}
            >
              {label(tab)}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}

export { topTabs };
