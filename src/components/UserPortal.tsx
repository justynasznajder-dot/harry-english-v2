'use client';

import { useState } from 'react';

interface UserInfo {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  children?: Array<{
    childId?: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    active?: boolean;
    resignationRequested?: boolean;
    resignationReason?: string | null;
  }>;
}

interface UserPortalProps {
  userInfo: UserInfo;
  onUserInfoUpdate: (updatedInfo: UserInfo) => void;
}

export default function UserPortal({ userInfo, onUserInfoUpdate }: UserPortalProps) {
  const [showAddStudentForm, setShowAddStudentForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addStudentErrors, setAddStudentErrors] = useState<Record<string, string>>({});
  const [showContactForm, setShowContactForm] = useState(false);
  const [submittingContact, setSubmittingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    subject: '' as '' | 'postepy' | 'rezygnacja' | 'inne',
    studentId: '',
    message: '',
  });
  const [showPayments, setShowPayments] = useState(false);
  
  const [newChild, setNewChild] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
  });

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddStudentErrors({});

    const errors: Record<string, string> = {};
    const currentYear = new Date().getFullYear();
    const birthDate = newChild.birthDate;

    if (!newChild.firstName.trim()) {
      errors.firstName = 'Pole wymagane';
    }
    if (!newChild.lastName.trim()) {
      errors.lastName = 'Pole wymagane';
    }
    if (!birthDate) {
      errors.birthDate = "Wybierz datę urodzenia";
    }

    if (Object.keys(errors).length > 0) {
      setAddStudentErrors(errors);
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch('/api/children/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newChild),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.children) {
          const updatedInfo = { ...userInfo, children: data.children };
          onUserInfoUpdate(updatedInfo);
          localStorage.setItem('userInfo', JSON.stringify(updatedInfo));
        }
        
        setNewChild({
          firstName: '',
          lastName: '',
          birthDate: '',
        });
        setShowAddStudentForm(false);
        setAddStudentErrors({});
      } else {
        setAddStudentErrors({ form: data.message || 'Wystąpił błąd podczas dodawania ucznia' });
      }
    } catch (error) {
      setAddStudentErrors({ form: 'Wystąpił błąd. Spróbuj ponownie.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contactForm.message.trim()) {
      alert('Proszę wypełnić pole z opisem sprawy');
      return;
    }

    if (contactForm.subject === 'rezygnacja' && !contactForm.studentId) {
      alert('Proszę wybrać dziecko');
      return;
    }

    setSubmittingContact(true);

    try {
      if (contactForm.subject === 'rezygnacja') {
        // Wysyłamy rezygnację przez dedykowany endpoint
        const response = await fetch('/api/children/resign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            childId: contactForm.studentId,
            reason: contactForm.message.trim(),
          }),
        });

        const data = await response.json();

        if (response.ok) {
          alert('Rezygnacja została zgłoszona pomyślnie. Skontaktujemy się z Tobą wkrótce.');
          setShowContactForm(false);
          setContactForm({ subject: '', studentId: '', message: '' });
          
          // Odśwież dane użytkownika
          const meResponse = await fetch('/api/user/me');
          if (meResponse.ok) {
            const meData = await meResponse.json();
            if (meData.user) {
              const updatedInfo = {
                ...userInfo,
                children: meData.user.children || userInfo.children,
              };
              onUserInfoUpdate(updatedInfo);
              localStorage.setItem('userInfo', JSON.stringify(updatedInfo));
            }
          }
        } else {
          alert(data.message || 'Wystąpił błąd podczas zgłaszania rezygnacji');
        }
      } else {
        // Wysyłamy zwykłą wiadomość kontaktową
        const subjectMap: { [key: string]: string } = {
          postepy: 'Zapytanie o postępy dziecka',
          inne: 'Inne',
        };

        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: userInfo.email,
            subject: contactForm.subject,
            message: contactForm.message.trim(),
          }),
        });

        const data = await response.json();

        if (response.ok) {
          alert('Wiadomość została wysłana pomyślnie. Odpowiemy najszybciej jak to możliwe.');
          setShowContactForm(false);
          setContactForm({ subject: '', studentId: '', message: '' });
        } else {
          alert(data.error || 'Wystąpił błąd podczas wysyłania wiadomości');
        }
      }
    } catch (error) {
      alert('Wystąpił błąd. Spróbuj ponownie.');
    } finally {
      setSubmittingContact(false);
    }
  };

  return (
    <>
      {/* Lista dzieci */}
      <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-xl mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-[#1f2933]">📋 Zgłoszone dzieci</h2>
          <button
            onClick={() => setShowAddStudentForm(!showAddStudentForm)}
            className="px-6 py-3 bg-[#ffc94a] text-[#3b2a10] font-semibold rounded-full hover:bg-[#ffd76f] transition-all"
          >
            {showAddStudentForm ? '✕ Anuluj' : '+ Dodaj dziecko'}
          </button>
        </div>

        {/* Formularz dodawania dziecka */}
        {showAddStudentForm && (
          <form onSubmit={handleAddStudent} className="mb-6 p-6 bg-white rounded-xl border-2 border-[#175244] space-y-4 relative">
            {submitting && (
              <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center z-10">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#175244]"></div>
                  <p className="text-gray-700 font-medium text-sm">Dodawanie dziecka...</p>
                </div>
              </div>
            )}
            {addStudentErrors.form && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                {addStudentErrors.form}
              </div>
            )}

            <h3 className="text-lg font-semibold text-gray-900 mb-4">Dane nowego dziecka</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Imię dziecka *
                </label>
                <input
                  type="text"
                  value={newChild.firstName}
                  onChange={(e) => setNewChild({ ...newChild, firstName: e.target.value })}
                  className={`w-full rounded-lg border ${addStudentErrors.firstName ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                  placeholder="Ania"
                  required
                />
                {addStudentErrors.firstName && <p className="mt-1 text-xs text-red-600">{addStudentErrors.firstName}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Nazwisko dziecka *
                </label>
                <input
                  type="text"
                  value={newChild.lastName}
                  onChange={(e) => setNewChild({ ...newChild, lastName: e.target.value })}
                  className={`w-full rounded-lg border ${addStudentErrors.lastName ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                  placeholder="Kowalska"
                  required
                />
                {addStudentErrors.lastName && <p className="mt-1 text-xs text-red-600">{addStudentErrors.lastName}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Data urodzenia *
                </label>
                <input
                  type="date"
                  value={newChild.birthDate}
                  onChange={(e) => setNewChild({ ...newChild, birthDate: e.target.value })}
                  className={`w-full rounded-lg border ${addStudentErrors.birthDate ? 'border-red-300' : 'border-gray-300'} px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all`}
                  required
                />
                {addStudentErrors.birthDate && <p className="mt-1 text-xs text-red-600">{addStudentErrors.birthDate}</p>}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-[#175244] px-6 py-3 text-white font-semibold hover:bg-[#144a37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Dodawanie...' : 'Dodaj dziecko'}
            </button>
          </form>
        )}

        {/* Lista dzieci */}
        {userInfo?.children && userInfo.children.length > 0 ? (
          <div className="space-y-4">
            {userInfo.children.map((student, index) => {
              const hasResignationRequested = (student as any).resignationRequested;
              
              return (
                <div key={student.childId || index} className="p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-[#1f2933]">
                        {student.firstName} {student.lastName}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Data urodzenia: {student.birthDate}
                      </p>
                      {student.childId && (
                        <p className="text-xs text-gray-500 mt-1">ID: {student.childId}</p>
                      )}
                      {hasResignationRequested && (
                        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                          ⚠️ Rezygnacja zgłoszona - skontaktujemy się z Tobą
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {student.active !== undefined && (
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          student.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {student.active ? 'Aktywny' : 'Nieaktywny'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-600 text-center py-8">Brak zgłoszonych dzieci. Dodaj pierwsze dziecko używając przycisku powyżej.</p>
        )}
      </div>

      {/* Content */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Karta 1 - Harmonogram */}
        <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-shadow">
          <div className="text-4xl mb-4">📅</div>
          <h2 className="text-2xl font-bold text-[#1f2933] mb-4">
            Harmonogram
          </h2>
          <p className="text-[#4b5563] mb-6">
            Plan zajęć, terminy spotkań i nadchodzące wydarzenia w szkole.
          </p>
          <button className="px-6 py-3 bg-[#1a5c44] text-white rounded-full hover:bg-[#144a37] transition-all">
            Zobacz harmonogram
          </button>
        </div>

        {/* Karta 2 - Płatności */}
        <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-shadow">
          <div className="text-4xl mb-4">💳</div>
          <h2 className="text-2xl font-bold text-[#1f2933] mb-4">
            Płatności
          </h2>
          <p className="text-[#4b5563] mb-6">
            Historia płatności i opłacanie zajęć za dany miesiąc.
          </p>
          <div className="space-y-3">
            <button 
              onClick={() => setShowPayments(true)}
              className="w-full px-6 py-3 bg-[#1a5c44] text-white rounded-full hover:bg-[#144a37] transition-all"
            >
              Historia płatności
            </button>
            <button 
              onClick={() => setShowPayments(true)}
              className="w-full px-6 py-3 bg-[#ffc94a] text-[#3b2a10] rounded-full hover:bg-[#ffd76f] transition-all font-semibold"
            >
              Opłać za {new Date().toLocaleString('pl-PL', { month: 'long', year: 'numeric' })}
            </button>
          </div>
        </div>

        {/* Karta 3 - Kontakt z nami */}
        <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-xl hover:shadow-2xl transition-shadow">
          <div className="text-4xl mb-4">💬</div>
          <h2 className="text-2xl font-bold text-[#1f2933] mb-4">
            Kontakt z nami
          </h2>
          <p className="text-[#4b5563] mb-6">
            Zadaj pytanie, umów dodatkowe konsultacje lub skontaktuj się z nami.
          </p>
          <button 
            onClick={() => setShowContactForm(true)}
            className="px-6 py-3 bg-[#1a5c44] text-white rounded-full hover:bg-[#144a37] transition-all"
          >
            Napisz wiadomość
          </button>
        </div>
      </div>

      {/* Modal formularza kontaktowego */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#1f2933]">Kontakt z nami</h2>
              <button
                onClick={() => {
                  setShowContactForm(false);
                  setContactForm({ subject: '', studentId: '', message: '' });
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
                disabled={submittingContact}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Temat *
                </label>
                <select
                  value={contactForm.subject}
                  onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value as typeof contactForm.subject, studentId: e.target.value !== 'rezygnacja' ? '' : contactForm.studentId })}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all"
                  required
                  disabled={submittingContact}
                >
                  <option value="">Wybierz temat</option>
                  <option value="postepy">Zapytanie o postępy dziecka</option>
                  <option value="rezygnacja">Chęć rezygnacji</option>
                  <option value="inne">Inne</option>
                </select>
              </div>

              {contactForm.subject === 'rezygnacja' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Wybierz dziecko *
                  </label>
                  <select
                    value={contactForm.studentId}
                    onChange={(e) => setContactForm({ ...contactForm, studentId: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all"
                    required
                    disabled={submittingContact}
                  >
                    <option value="">Wybierz dziecko</option>
                    {userInfo.children?.filter(s => !s.resignationRequested).map((student) => (
                      <option key={student.childId} value={student.childId}>
                        {student.firstName} {student.lastName}
                      </option>
                    ))}
                  </select>
                  {userInfo.children?.filter(s => !s.resignationRequested).length === 0 && (
                    <p className="text-sm text-gray-500 mt-1">Wszystkie dzieci mają już zgłoszoną rezygnację</p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Opisz sprawę *
                </label>
                <textarea
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  placeholder={contactForm.subject === 'rezygnacja' ? 'Podaj powód rezygnacji...' : 'Opisz swoją sprawę...'}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-gray-900 focus:border-[#175244] focus:ring-2 focus:ring-[#175244]/20 outline-none transition-all resize-none"
                  rows={6}
                  required
                  disabled={submittingContact}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={submittingContact}
                  className="flex-1 px-6 py-3 bg-[#175244] text-white rounded-full hover:bg-[#144a37] transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {submittingContact ? 'Wysyłanie...' : 'Wyślij wiadomość'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowContactForm(false);
                    setContactForm({ subject: '', studentId: '', message: '' });
                  }}
                  disabled={submittingContact}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition-colors disabled:opacity-50 font-semibold"
                >
                  Anuluj
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal płatności */}
      {showPayments && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-[#1f2933]">Płatności</h2>
              <button
                onClick={() => setShowPayments(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              {/* Historia płatności */}
              <div>
                <h3 className="text-xl font-semibold text-[#1f2933] mb-4">Historia płatności</h3>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-gray-600 text-center py-8">
                    Historia płatności będzie dostępna wkrótce.
                  </p>
                </div>
              </div>

              {/* Płatność za bieżący miesiąc */}
              <div>
                <h3 className="text-xl font-semibold text-[#1f2933] mb-4">
                  Opłać za {new Date().toLocaleString('pl-PL', { month: 'long', year: 'numeric' })}
                </h3>
                <div className="bg-[#f8f6f3] rounded-lg p-6 border-2 border-[#175244]">
                  <p className="text-gray-700 mb-4">
                    Link do płatności za dany miesiąc będzie dostępny wkrótce.
                  </p>
                  <button className="px-6 py-3 bg-[#ffc94a] text-[#3b2a10] rounded-full hover:bg-[#ffd76f] transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                    Opłać teraz
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Informacje dodatkowe */}
      <div className="mt-8 bg-[#f8f6f3] rounded-3xl p-8 shadow-xl">
        <h3 className="text-xl font-bold text-[#1f2933] mb-4">
          ℹ️ Informacje
        </h3>
        <div className="space-y-2 text-sm text-[#4b5563]">
          <p>• Materiały są aktualizowane co tydzień</p>
          <p>• Lektor odpowiada na wiadomości w ciągu 24 godzin</p>
          <p>• Pamiętaj o regularnym wykonywaniu zadań domowych</p>
          <p>• W razie problemów skontaktuj się ze szkołą: kontakt@harry-english.pl</p>
        </div>
      </div>
    </>
  );
}
