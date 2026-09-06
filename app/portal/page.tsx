'use client';

import { Suspense } from 'react';
import UserPortal from '@/src/components/UserPortal';
import LektorPortal from '@/src/components/LektorPortal';
import AdminPortal from '@/src/components/AdminPortal';
import SuperAdminPortal from '@/src/components/SuperAdminPortal';
import ChildPortal from '@/src/components/ChildPortal';
import AccountantPortal from '@/src/components/AccountantPortal';
import PortalAppShell from '@/src/components/PortalAppShell';
import type { UserInfo } from '@/src/components/UserPortal';

export default function PortalPage() {
  return (
    <PortalAppShell>
      {({ userInfo, onUserInfoUpdate }) => {
        if (userInfo?.role === 'ADMIN') {
          return <SuperAdminPortal />;
        }
        if (userInfo?.role === 'MANAGER') {
          return (
            <Suspense
              fallback={
                <div className="rounded-3xl bg-[#f8f6f3] p-8 text-center shadow-xl">
                  <p className="text-gray-600">Ładowanie panelu…</p>
                </div>
              }
            >
              <AdminPortal />
            </Suspense>
          );
        }
        if (userInfo?.role === 'ACCOUNTANT') {
          return <AccountantPortal />;
        }
        if (userInfo?.role === 'PARENT') {
          return (
            <UserPortal
              userInfo={userInfo as UserInfo}
              onUserInfoUpdate={onUserInfoUpdate as (u: UserInfo) => void}
            />
          );
        }
        if (userInfo?.role === 'TEACHER') {
          return <LektorPortal />;
        }
        if (userInfo?.role === 'CHILD') {
          return <ChildPortal />;
        }
        if (userInfo) {
          return (
            <UserPortal
              userInfo={userInfo as UserInfo}
              onUserInfoUpdate={onUserInfoUpdate as (u: UserInfo) => void}
            />
          );
        }
        return (
          <div className="rounded-3xl bg-[#f8f6f3] p-8 py-8 text-center shadow-xl">
            <p className="text-gray-600">Ładowanie danych użytkownika...</p>
          </div>
        );
      }}
    </PortalAppShell>
  );
}
