'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import UserPortal from '@/src/components/UserPortal';
import LektorPortal from '@/src/components/LektorPortal';
import AdminPortal from '@/src/components/AdminPortal';
import ChildPortal from '@/src/components/ChildPortal';

interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
  accessLevel?: 'PENDING' | 'ACTIVE';
  mustChangePassword?: boolean;
  schoolId?: string | null;
  schoolName?: string | null;
  children?: Array<{
    childId?: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    active?: boolean;
  }>;
}

/** Np. „piątek, 24 kwietnia 2026” → „Piątek, 24 kwietnia 2026” */
function formatPolishLongDate(d: Date): string {
  const raw = d.toLocaleDateString('pl-PL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function panelRoleLabel(role: string | undefined): string {
  if (role === 'ADMIN') return 'PANEL SUPER ADMINA';
  if (role === 'MANAGER') return 'PANEL ZARZĄDCY SZKOŁY';
  if (role === 'TEACHER') return 'PANEL NAUCZYCIELA';
  if (role === 'CHILD') return 'PANEL UCZNIA';
  if (role === 'PARENT') return 'PANEL RODZICA';
  return 'PANEL';
}

function PortalHeaderUserBlock({ userInfo }: { userInfo: UserInfo | null }) {
  if (!userInfo) {
    return <p className="text-sm text-zinc-500">Ładowanie profilu…</p>;
  }
  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1f2933]">
        {panelRoleLabel(userInfo.role)}
      </p>
      <p className="mt-2 text-2xl font-bold leading-tight tracking-tight text-[#1e3a4c] sm:text-3xl">
        {[userInfo.firstName, userInfo.lastName].filter(Boolean).join(' ') || userInfo.email}
      </p>
      <p className="mt-2 text-sm font-semibold uppercase tracking-[0.12em] text-[#1f2933]">
        {(userInfo.schoolName?.trim() ||
          process.env.NEXT_PUBLIC_PORTAL_SITE_TAG ||
          'Harry English'
        ).toUpperCase()}
      </p>
      <p className="mt-2 text-sm text-[#1f2933]">{formatPolishLongDate(new Date())}</p>
    </>
  );
}

function PortalHeaderLogout({
  loading,
  onLogout,
}: {
  loading: boolean;
  onLogout: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={
        isHovered
          ? {
              backgroundColor: "#d8f3ea",
              borderColor: "#0f6e56",
              color: "#0f6e56",
            }
          : undefined
      }
      className="shrink-0 rounded-full border border-zinc-800/55 bg-white px-4 py-2.5 text-xs font-semibold text-[#1e3a4c] shadow-sm transition-colors duration-200 disabled:opacity-50 sm:px-6 sm:py-3 sm:text-sm"
    >
      {loading ? 'Wylogowywanie...' : 'Wyloguj się'}
    </button>
  );
}

export default function PortalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isHomeBtnHovered, setIsHomeBtnHovered] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/user/me', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        // Wymuś zmianę hasła przy pierwszym logowaniu po wygenerowaniu konta przez admina.
        if (data.user?.mustChangePassword === true) {
          router.replace('/portal/zmien-haslo');
          return;
        }
        setUserInfo(data.user);
        localStorage.setItem('userInfo', JSON.stringify(data.user));
        if (data.user.email) {
          localStorage.setItem('userEmail', data.user.email);
        }
      } else {
        const storedUserInfo = localStorage.getItem('userInfo');
        const storedEmail = localStorage.getItem('userEmail');
        if (storedUserInfo) {
          try {
            setUserInfo(JSON.parse(storedUserInfo));
          } catch (error) {
            console.error('Error parsing user info:', error);
            if (storedEmail) {
              setUserInfo({
                id: '',
                email: storedEmail,
                firstName: '',
                lastName: '',
              });
            }
          }
        } else if (storedEmail) {
          setUserInfo({
            id: '',
            email: storedEmail,
            firstName: '',
            lastName: '',
          });
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    }
  };

  useEffect(() => {
    fetchUserData();
  }, []);

  const handleLogout = async () => {
    setLoading(true);
    
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
      
      // Wyczyść localStorage
      localStorage.removeItem('userToken');
      localStorage.removeItem('userName');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userInfo');
      
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Logout error:', error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f3c33] to-[#175244] p-4">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <header className="mb-4 rounded-3xl border-t-[5px] border-[#0f3c33] bg-[#f8f6f3] p-4 shadow-xl sm:p-5">
          <div className="flex flex-row items-start justify-between gap-3 sm:gap-6 md:items-center">
            <div className="min-w-0 flex-1 pr-2 text-left">
              <PortalHeaderUserBlock userInfo={userInfo} />
            </div>
            <div className="flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
              {userInfo?.role === 'MANAGER' && (
                <Link
                  href="/"
                  onMouseEnter={() => setIsHomeBtnHovered(true)}
                  onMouseLeave={() => setIsHomeBtnHovered(false)}
                  style={
                    isHomeBtnHovered
                      ? {
                          backgroundColor: "#d8f3ea",
                          borderColor: "#0f6e56",
                          color: "#0f6e56",
                        }
                      : undefined
                  }
                  className="rounded-full border border-zinc-800/55 bg-white px-4 py-2.5 text-center text-xs font-semibold text-[#1e3a4c] shadow-sm transition-colors duration-200 sm:px-6 sm:py-3 sm:text-sm"
                >
                  Powrót na stronę główną
                </Link>
              )}
              <PortalHeaderLogout loading={loading} onLogout={handleLogout} />
            </div>
          </div>
        </header>

        {/* Render odpowiedniego portalu w zależności od typu konta */}
        {userInfo?.role === "ADMIN" || userInfo?.role === "MANAGER" ? (
          <AdminPortal />
        ) : userInfo?.role === "PARENT" ? (
          <UserPortal userInfo={userInfo} onUserInfoUpdate={setUserInfo} />
        ) : userInfo?.role === "TEACHER" ? (
          <LektorPortal />
        ) : userInfo?.role === "CHILD" ? (
          <ChildPortal />
        ) : userInfo ? (
          <UserPortal userInfo={userInfo} onUserInfoUpdate={setUserInfo} />
        ) : (
          <div className="text-center py-8 bg-[#f8f6f3] rounded-3xl p-8 shadow-xl">
            <p className="text-gray-600">Ładowanie danych użytkownika...</p>
          </div>
        )}
      </div>
    </div>
  );
}
