'use client';

import { useState } from 'react';
import EnrollmentParentFlow, { type UserInfo } from '@/src/components/enrollment/EnrollmentParentFlow';
import MessagesPanel from '@/src/components/messages/MessagesPanel';
import MessagesTabLabel from '@/src/components/messages/MessagesTabLabel';
import { useUnreadMessagesCount } from '@/src/components/messages/useUnreadMessagesCount';
import ParentAttendanceTab from '@/src/components/parent/ParentAttendanceTab';
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
  | 'attendance'
  | 'payments'
  | 'calendar'
  | 'documents'
  | 'profile';

const topTabs: Array<{ key: PortalTab; label: string }> = [
  { key: 'enrollment', label: 'Proces zapisu' },
  { key: 'messages', label: 'Wiadomości' },
  { key: 'group', label: 'Moja grupa' },
  { key: 'attendance', label: 'Obecności' },
  { key: 'calendar', label: 'Kalendarz' },
  { key: 'payments', label: 'Płatności' },
  { key: 'documents', label: 'Dokumenty' },
  { key: 'profile', label: 'Profil' },
];

export default function UserPortal({ userInfo, onUserInfoUpdate }: UserPortalProps) {
  const [activeTab, setActiveTab] = useState<PortalTab>('enrollment');
  const [messagesListResetToken, setMessagesListResetToken] = useState(0);
  const { unreadCount: messagesUnreadCount, refresh: refreshMessagesUnreadCount } =
    useUnreadMessagesCount(messagesListResetToken);

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

  const renderContent = () => {
    if (activeTab === 'enrollment') {
      return (
        <EnrollmentParentFlow userInfo={userInfo} onUserInfoUpdate={onUserInfoUpdate} />
      );
    }
    if (activeTab === 'messages') return renderMessagesTab();
    if (activeTab === 'group') return <ParentGroupTab />;
    if (activeTab === 'attendance') return <ParentAttendanceTab userInfo={userInfo} />;
    if (activeTab === 'calendar') return <ParentCalendarTab userInfo={userInfo} />;
    if (activeTab === 'payments') {
      return <ParentPaymentsTab complimentaryAccess={userInfo.complimentaryAccess} />;
    }
    if (activeTab === 'documents') return <ParentDocumentsTab />;
    if (activeTab === 'profile') {
      return <ParentProfileSection />;
    }
    return null;
  };

  return (
    <div className="space-y-4 pb-20 md:pb-4">
      <div className="rounded-3xl border border-emerald-100 bg-white">
        <nav className="no-scrollbar overflow-x-auto">
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
