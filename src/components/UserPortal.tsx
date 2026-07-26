'use client';

import { useEffect, useRef, useState } from 'react';
import EnrollmentParentFlow, { type UserInfo } from '@/src/components/enrollment/EnrollmentParentFlow';
import MessagesPanel from '@/src/components/messages/MessagesPanel';
import MessagesTabLabel from '@/src/components/messages/MessagesTabLabel';
import { useUnreadMessagesCount } from '@/src/components/messages/useUnreadMessagesCount';
import ParentCalendarTab from '@/src/components/parent/ParentCalendarTab';
import ParentDocumentsTab from '@/src/components/parent/ParentDocumentsTab';
import ParentGroupTab from '@/src/components/parent/ParentGroupTab';
import ParentPaymentsTab from '@/src/components/parent/ParentPaymentsTab';
import ParentProfileSection from '@/src/components/parent/ParentProfileSection';

export type { UserInfo };

interface UserPortalProps {
  userInfo: UserInfo;
  onUserInfoUpdate: (updatedInfo: UserInfo) => void;
}

type PortalTab =
  | 'enrollment'
  | 'messages'
  | 'group'
  | 'payments'
  | 'calendar'
  | 'documents'
  | 'profile';

const ALL_TOP_TABS: Array<{ key: PortalTab; label: string }> = [
  { key: 'enrollment', label: 'Proces zapisu' },
  { key: 'messages', label: 'Wiadomości' },
  { key: 'group', label: 'Moja grupa' },
  { key: 'calendar', label: 'Kalendarz' },
  { key: 'payments', label: 'Płatności' },
  { key: 'documents', label: 'Dokumenty' },
  { key: 'profile', label: 'Profil' },
];

function BurgerIcon({ open }: { open: boolean }) {
  return (
    <span className="relative block h-4 w-5" aria-hidden>
      <span
        className={`absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition ${
          open ? 'translate-y-[7px] rotate-45' : ''
        }`}
      />
      <span
        className={`absolute left-0 top-[7px] h-0.5 w-5 rounded-full bg-current transition ${
          open ? 'opacity-0' : ''
        }`}
      />
      <span
        className={`absolute left-0 top-[14px] h-0.5 w-5 rounded-full bg-current transition ${
          open ? 'translate-y-[-7px] -rotate-45' : ''
        }`}
      />
    </span>
  );
}

export default function UserPortal({ userInfo, onUserInfoUpdate }: UserPortalProps) {
  const complimentaryAccess = userInfo.complimentaryAccess === true;
  const topTabs = complimentaryAccess
    ? ALL_TOP_TABS.filter((tab) => tab.key !== 'payments')
    : ALL_TOP_TABS;

  const [activeTab, setActiveTab] = useState<PortalTab>('enrollment');
  const [menuOpen, setMenuOpen] = useState(false);
  const [messagesListResetToken, setMessagesListResetToken] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const { unreadCount: messagesUnreadCount, refresh: refreshMessagesUnreadCount } =
    useUnreadMessagesCount(messagesListResetToken);

  const activeTabMeta = topTabs.find((t) => t.key === activeTab) ?? topTabs[0];

  useEffect(() => {
    if (complimentaryAccess && activeTab === 'payments') {
      setActiveTab('enrollment');
    }
  }, [complimentaryAccess, activeTab]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node | null;
      if (menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const selectTab = (key: PortalTab) => {
    if (key === 'messages' && activeTab === 'messages') {
      setMessagesListResetToken((t) => t + 1);
    }
    setActiveTab(key);
    setMenuOpen(false);
  };

  const activeChildren = (userInfo.children ?? [])
    .filter((c) => c.active !== false && c.childId)
    .map((c) => ({
      id: c.childId as string,
      firstName: c.firstName,
      lastName: c.lastName,
    }));

  const renderMessagesTab = () => (
    <MessagesPanel
      mode="parent"
      currentUserId={userInfo.id}
      listResetToken={messagesListResetToken}
      onInboxChange={refreshMessagesUnreadCount}
      parentChildren={activeChildren}
    />
  );

  const renderTabLabel = (tab: { key: PortalTab; label: string }, isActive: boolean) =>
    tab.key === 'messages' ? (
      <MessagesTabLabel
        label={tab.label}
        unreadCount={messagesUnreadCount}
        isActive={isActive}
      />
    ) : (
      tab.label
    );

  const renderContent = () => {
    if (activeTab === 'enrollment') {
      return (
        <EnrollmentParentFlow
          userInfo={userInfo}
          onUserInfoUpdate={onUserInfoUpdate}
          onNavigateToDocuments={() => setActiveTab('documents')}
        />
      );
    }
    if (activeTab === 'messages') return renderMessagesTab();
    if (activeTab === 'group') return <ParentGroupTab />;
    if (activeTab === 'calendar') return <ParentCalendarTab userInfo={userInfo} />;
    if (activeTab === 'payments') {
      if (complimentaryAccess) return null;
      return <ParentPaymentsTab complimentaryAccess={false} />;
    }
    if (activeTab === 'documents') {
      return <ParentDocumentsTab complimentaryAccess={complimentaryAccess} />;
    }
    if (activeTab === 'profile') {
      return (
        <ParentProfileSection
          complimentaryAccess={complimentaryAccess}
          children={userInfo.children ?? []}
        />
      );
    }
    return null;
  };

  return (
    <div className="space-y-4 pb-20 md:pb-4">
      <div className="rounded-3xl border border-emerald-100 bg-white">
        {/* Mobile: burger menu */}
        <div ref={menuRef} className="relative md:hidden">
          <div className="flex items-center gap-2 p-2">
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="parent-portal-menu"
              aria-label={menuOpen ? 'Zamknij menu' : 'Otwórz menu'}
              onClick={() => setMenuOpen((open) => !open)}
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${
                menuOpen
                  ? 'border-[#0f6e56] bg-[#0f6e56] text-white'
                  : 'border-emerald-200 bg-emerald-50 text-[#0f6e56]'
              }`}
            >
              <BurgerIcon open={menuOpen} />
            </button>
            <div className="min-w-0 flex-1 rounded-full border border-[#0f6e56] bg-[#0f6e56] px-4 py-2.5 text-sm font-semibold text-white">
              {renderTabLabel(activeTabMeta, true)}
            </div>
          </div>

          {menuOpen ? (
            <div
              id="parent-portal-menu"
              role="menu"
              className="absolute inset-x-2 top-full z-40 mt-1 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-lg"
            >
              <div className="flex flex-col p-1.5">
                {topTabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="menuitem"
                      onClick={() => selectTab(tab.key)}
                      className={`rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${
                        isActive
                          ? 'bg-[#0f6e56] text-white'
                          : 'text-zinc-800 hover:bg-emerald-50'
                      }`}
                    >
                      {renderTabLabel(tab, isActive)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        {/* Desktop: horizontal tabs */}
        <nav className="no-scrollbar hidden overflow-x-auto md:block">
          <div className="flex min-w-max gap-2 p-2">
            {topTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => selectTab(tab.key)}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  activeTab === tab.key
                    ? 'border-[#0f6e56] bg-[#0f6e56] text-white shadow-sm'
                    : 'border-transparent bg-emerald-50/60 text-zinc-800 hover:border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                {renderTabLabel(tab, activeTab === tab.key)}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {renderContent()}
    </div>
  );
}
