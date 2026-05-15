'use client';

export default function MessagesTabLabel({
  label,
  unreadCount,
  isActive,
}: {
  label: string;
  unreadCount: number;
  isActive: boolean;
}) {
  const showBadge = unreadCount > 0;
  const badgeText = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {showBadge && (
        <span
          className={
            isActive
              ? 'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#ffc94a] px-1 text-[10px] font-bold leading-none text-[#3b2a10]'
              : 'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#0f6e56] px-1 text-[10px] font-bold leading-none text-white'
          }
          aria-label={
            unreadCount === 1
              ? '1 nieprzeczytana wiadomość'
              : `${unreadCount} nieprzeczytanych wiadomości`
          }
        >
          {badgeText}
        </span>
      )}
    </span>
  );
}
