'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import UserPortal from '@/src/components/UserPortal';
import LektorPortal from '@/src/components/LektorPortal';
import AdminPortal from '@/src/components/AdminPortal';

interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  accountType?: string;
  students?: Array<{
    studentId?: string;
    firstName: string;
    lastName: string;
    birthYear: string;
    location: string;
    active?: boolean;
  }>;
}

export default function PortalPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    // Funkcja do pobrania danych z API
    const fetchUserData = async () => {
      try {
        const response = await fetch('/api/user/me');
        if (response.ok) {
          const data = await response.json();
          setUserInfo(data.user);
          // Zaktualizuj localStorage
          localStorage.setItem('userInfo', JSON.stringify(data.user));
          if (data.user.email) {
            localStorage.setItem('userEmail', data.user.email);
          }
        } else {
          // Jeśli API nie działa, użyj localStorage jako fallback
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
        // Fallback do localStorage
        const storedUserInfo = localStorage.getItem('userInfo');
        const storedEmail = localStorage.getItem('userEmail');
        
        if (storedUserInfo) {
          try {
            setUserInfo(JSON.parse(storedUserInfo));
          } catch (err) {
            if (storedEmail) {
              setUserInfo({
                id: '',
                email: storedEmail,
                firstName: '',
                lastName: '',
              });
            }
          }
        }
      }
    };

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
        <header className="bg-[#f8f6f3] rounded-3xl p-6 shadow-xl mb-8">
          <div className="flex flex-col gap-4">
            {/* Top row - title and logout */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-[#1f2933]">
                  🦒 Portal Harry English
                </h1>
                <p className="text-sm text-[#4b5563] mt-1">
                  {userInfo?.accountType === 'admin' && 'Panel administratora'}
                  {userInfo?.accountType === 'lektor' && 'Panel lektora'}
                  {(!userInfo?.accountType || userInfo?.accountType === 'user') && 'Witaj w panelu ucznia!'}
                </p>
              </div>
              <button
                onClick={handleLogout}
                disabled={loading}
                className="px-6 py-3 bg-red-500 text-white font-semibold rounded-full hover:bg-red-600 transition-all disabled:opacity-50 self-start sm:self-auto"
              >
                {loading ? 'Wylogowywanie...' : 'Wyloguj się'}
              </button>
            </div>

            {/* User info - if available */}
            {userInfo && (
              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-5 h-5 text-[#175244]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="text-gray-700 font-medium">
                    Zalogowano jako:
                  </span>
                  <span className="text-[#175244] font-semibold">
                    {userInfo.email}
                  </span>
                </div>
                {userInfo.firstName && userInfo.lastName && (
                  <div className="mt-2 text-sm text-gray-600">
                    <span className="font-medium">Rodzic:</span> {userInfo.firstName} {userInfo.lastName}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Render odpowiedniego portalu w zależności od typu konta */}
        {userInfo?.accountType === 'admin' ? (
          <AdminPortal />
        ) : userInfo?.accountType === 'lektor' ? (
          <LektorPortal />
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
