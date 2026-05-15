'use client';

import { useEffect, useState } from 'react';
import MessagesPanel from '@/src/components/messages/MessagesPanel';
import MessagesTabLabel from '@/src/components/messages/MessagesTabLabel';
import { useUnreadMessagesCount } from '@/src/components/messages/useUnreadMessagesCount';

type LektorTab = 'materials' | 'groups' | 'messages';

const tabs: Array<{ key: LektorTab; label: string }> = [
  { key: 'materials', label: 'Materiały' },
  { key: 'groups', label: 'Moje grupy' },
  { key: 'messages', label: 'Wiadomości' },
];

export default function LektorPortal() {
  const [activeTab, setActiveTab] = useState<LektorTab>('messages');
  const [messagesListResetToken, setMessagesListResetToken] = useState(0);
  const { unreadCount: messagesUnreadCount, refresh: refreshMessagesUnreadCount } =
    useUnreadMessagesCount(messagesListResetToken);
  const [userId, setUserId] = useState('');

  useEffect(() => {
    fetch('/api/user/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.id) setUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      <nav className="no-scrollbar overflow-x-auto rounded-3xl border border-emerald-100 bg-[#f8f6f3] p-2 shadow-xl">
        <div className="flex min-w-max gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.key === 'messages' && activeTab === 'messages') {
                  setMessagesListResetToken((t) => t + 1);
                }
                setActiveTab(tab.key);
              }}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-[#175244] text-white'
                  : 'bg-white text-[#1f2933] hover:bg-emerald-50'
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

      {activeTab === 'messages' && (
        <MessagesPanel
          mode="teacher"
          currentUserId={userId || undefined}
          listResetToken={messagesListResetToken}
          onInboxChange={refreshMessagesUnreadCount}
        />
      )}

      {activeTab === 'materials' && (
        <div className="rounded-3xl bg-[#f8f6f3] p-8 shadow-xl">
          <h2 className="mb-6 text-2xl font-bold text-[#1f2933]">Materiały do nauki</h2>
          <p className="text-gray-600">
            Tutaj znajdziesz materiały edukacyjne, ćwiczenia i zasoby do prowadzenia zajęć.
          </p>
        </div>
      )}

      {activeTab === 'groups' && (
        <div className="rounded-3xl bg-[#f8f6f3] p-8 shadow-xl">
          <h2 className="mb-6 text-2xl font-bold text-[#1f2933]">Moje grupy</h2>
          <p className="text-gray-600">
            Przeglądaj listy uczniów w swoich grupach i zarządzaj ich postępami.
          </p>
        </div>
      )}
    </div>
  );
}
