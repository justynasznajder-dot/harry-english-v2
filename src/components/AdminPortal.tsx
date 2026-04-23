'use client';

import { useState, useEffect } from 'react';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  account_type: string;
  confirmed: boolean;
  active?: boolean;
  resignation_date?: string | null;
  created_at?: string;
  last_login?: string;
}

interface Student {
  student_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  birth_year: string;
  location: string;
  active: boolean;
  resignation_requested: boolean;
  resignation_reason?: string | null;
  resignation_date?: string | null;
  created_at?: string;
}

export default function AdminPortal() {
  const [activeTab, setActiveTab] = useState<'users' | 'students' | 'resignations'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [formerStudents, setFormerStudents] = useState<Student[]>([]);
  const [formerUsers, setFormerUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFromDb, setLoadingFromDb] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<{
    users: Record<string, Partial<User>>;
    students: Record<string, Partial<Student>>;
  }>({ users: {}, students: {} });
  const [usersToDelete, setUsersToDelete] = useState<string[]>([]);
  const [studentsToDelete, setStudentsToDelete] = useState<string[]>([]);
  
  // Filtry dla użytkowników
  const [userFilterId, setUserFilterId] = useState<string>('');
  const [userFilterFirstName, setUserFilterFirstName] = useState<string>('');
  const [userFilterLastName, setUserFilterLastName] = useState<string>('');
  const [userFilterEmail, setUserFilterEmail] = useState<string>('');
  const [userFilterConfirmed, setUserFilterConfirmed] = useState<string>('all');
  const [userFilterAccountType, setUserFilterAccountType] = useState<string>('all');
  
  // Filtry dla studentów
  const [studentFilterId, setStudentFilterId] = useState<string>('');
  const [studentFilterUserId, setStudentFilterUserId] = useState<string>('');
  const [studentFilterFirstName, setStudentFilterFirstName] = useState<string>('');
  const [studentFilterLastName, setStudentFilterLastName] = useState<string>('');
  const [studentFilterBirthYear, setStudentFilterBirthYear] = useState<string>('');
  const [studentFilterLocation, setStudentFilterLocation] = useState<string>('all');
  const [studentFilterActive, setStudentFilterActive] = useState<string>('all');
  const [studentFilterResignation, setStudentFilterResignation] = useState<string>('all');
  
  // Dane do filtrowania (wszystkie pobrane dane)
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  
  // Liczba rezygnacji (tylko aktywni studenci z chęcią rezygnacji)
  const studentsWithResignation = allStudents.filter(s => s.resignation_requested && s.active === true).length;

  // Formularze dodawania
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    accountType: 'user' as 'user' | 'admin' | 'lektor',
    confirmed: false,
  });
  const [newStudent, setNewStudent] = useState({
    userId: '',
    firstName: '',
    lastName: '',
    birthYear: '',
    location: '' as '' | 'Paniówki' | 'Halemba' | 'Orzegów' | 'Kochłowice' | 'Bielszowice',
    active: false,
  });

  useEffect(() => {
    loadUsers();
    loadStudents();
    loadFormerStudents();
    loadFormerUsers();
  }, []);

  const loadUsers = async () => {
    setLoadingFromDb(true);
    try {
      // Pobierz wszystkich użytkowników - filtrowanie będzie po stronie klienta
      const url = '/api/admin/users?';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const fetchedUsers = data.users || [];
        setAllUsers(fetchedUsers);
        applyUserFilters(fetchedUsers);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoadingFromDb(false);
    }
  };
  
  const applyUserFilters = (usersToFilter: User[]) => {
    // Najpierw wyklucz nieaktywnych użytkowników - nie powinni być widoczni w zakładce Użytkownicy
    // Pokazuj tylko użytkowników z active = true
    let filtered = usersToFilter.filter(u => u.active === true);
    
    if (userFilterId) {
      filtered = filtered.filter(u => u.id.toLowerCase().includes(userFilterId.toLowerCase()));
    }
    if (userFilterFirstName) {
      filtered = filtered.filter(u => u.first_name.toLowerCase().includes(userFilterFirstName.toLowerCase()));
    }
    if (userFilterLastName) {
      filtered = filtered.filter(u => u.last_name.toLowerCase().includes(userFilterLastName.toLowerCase()));
    }
    if (userFilterEmail) {
      filtered = filtered.filter(u => u.email.toLowerCase().includes(userFilterEmail.toLowerCase()));
    }
    if (userFilterAccountType !== 'all') {
      filtered = filtered.filter(u => u.account_type === userFilterAccountType);
    }
    if (userFilterConfirmed !== 'all') {
      const confirmedFilter = userFilterConfirmed === 'true';
      filtered = filtered.filter(u => u.confirmed === confirmedFilter);
    }
    
    setUsers(filtered);
  };

  const loadStudents = async () => {
    setLoadingFromDb(true);
    try {
      // Pobierz wszystkich studentów - filtrowanie będzie po stronie klienta
      const url = '/api/admin/students?';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const fetchedStudents = data.students || [];
        setAllStudents(fetchedStudents);
        applyStudentFilters(fetchedStudents);
      } else {
        console.error('Failed to load students:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoadingFromDb(false);
    }
  };

  const loadFormerStudents = async () => {
    setLoadingFromDb(true);
    try {
      const url = '/api/admin/students?';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const allStudents = data.students || [];
        // Filtruj tylko nieaktywnych uczniów (active = FALSE)
        const former = allStudents.filter((s: Student) => s.active === false);
        setFormerStudents(former);
      } else {
        console.error('Failed to load former students:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Error loading former students:', error);
    } finally {
      setLoadingFromDb(false);
    }
  };

  const loadFormerUsers = async () => {
    setLoadingFromDb(true);
    try {
      const url = '/api/admin/users?';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const allUsers = data.users || [];
        // Filtruj tylko nieaktywnych użytkowników (active = false)
        const former = allUsers.filter((u: User) => u.active === false);
        setFormerUsers(former);
      } else {
        console.error('Failed to load former users:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Error loading former users:', error);
    } finally {
      setLoadingFromDb(false);
    }
  };
  
  const applyStudentFilters = (studentsToFilter: Student[]) => {
    // Najpierw wyklucz nieaktywnych uczniów - nie powinni być widoczni w zakładce Studenci
    // Pokazuj tylko studentów z active = true
    let filtered = studentsToFilter.filter(s => s.active === true);
    
    if (studentFilterId) {
      filtered = filtered.filter(s => s.student_id.toLowerCase().includes(studentFilterId.toLowerCase()));
    }
    if (studentFilterUserId) {
      filtered = filtered.filter(s => s.user_id.toLowerCase().includes(studentFilterUserId.toLowerCase()));
    }
    if (studentFilterFirstName) {
      filtered = filtered.filter(s => s.first_name.toLowerCase().includes(studentFilterFirstName.toLowerCase()));
    }
    if (studentFilterLastName) {
      filtered = filtered.filter(s => s.last_name.toLowerCase().includes(studentFilterLastName.toLowerCase()));
    }
    if (studentFilterBirthYear) {
      filtered = filtered.filter(s => s.birth_year === studentFilterBirthYear);
    }
    if (studentFilterLocation !== 'all') {
      filtered = filtered.filter(s => s.location === studentFilterLocation);
    }
    if (studentFilterActive !== 'all') {
      const activeFilter = studentFilterActive === 'true';
      filtered = filtered.filter(s => s.active === activeFilter);
    }
    if (studentFilterResignation !== 'all') {
      const resignationFilter = studentFilterResignation === 'true';
      filtered = filtered.filter(s => s.resignation_requested === resignationFilter);
    }
    
    setStudents(filtered);
  };

  // Załaduj dane tylko raz przy starcie
  useEffect(() => {
    loadUsers();
    loadStudents();
  }, []);

  // Automatyczne odświeżanie filtrów dla użytkowników (tekstowe filtry i selecty)
  useEffect(() => {
    if (allUsers.length > 0) {
      applyUserFilters(allUsers);
    }
  }, [userFilterId, userFilterFirstName, userFilterLastName, userFilterEmail, userFilterAccountType, userFilterConfirmed, allUsers]);

  // Automatyczne odświeżanie filtrów dla studentów (tekstowe filtry i selecty)
  useEffect(() => {
    if (allStudents.length > 0) {
      applyStudentFilters(allStudents);
    }
  }, [studentFilterId, studentFilterUserId, studentFilterFirstName, studentFilterLastName, studentFilterBirthYear, studentFilterLocation, studentFilterActive, studentFilterResignation, allStudents]);

  const handleUserChange = (userId: string, field: keyof User, value: any) => {
    setPendingChanges(prev => ({
      ...prev,
      users: {
        ...prev.users,
        [userId]: {
          ...prev.users[userId],
          [field]: value,
        },
      },
    }));
  };

  const handleStudentChange = (studentId: string, field: keyof Student, value: any) => {
    setPendingChanges(prev => ({
      ...prev,
      students: {
        ...prev.students,
        [studentId]: {
          ...prev.students[studentId],
          [field]: value,
        },
      },
    }));
  };

  const handleSaveChanges = async () => {
    setLoading(true);
    try {
      // Zapisz zmiany użytkowników
      for (const [userId, changes] of Object.entries(pendingChanges.users)) {
        const response = await fetch(`/api/admin/users/${userId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to update user ${userId}: ${response.status}`);
        }
      }

      // Usuń użytkowników (oznacz jako byłych)
      for (const userId of usersToDelete) {
        const response = await fetch(`/api/admin/users/${userId}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Failed to delete user ${userId}: ${response.status} - ${errorData.message || 'Unknown error'}`);
        }
      }

      // Zapisz zmiany studentów
      for (const [studentId, changes] of Object.entries(pendingChanges.students)) {
        const response = await fetch(`/api/admin/students/${studentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Failed to update student ${studentId}: ${response.status} - ${errorData.message || 'Unknown error'}`);
        }
      }

      // Usuń studentów (oznacz jako byłych)
      for (const studentId of studentsToDelete) {
        const response = await fetch(`/api/admin/students/${studentId}`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Failed to delete student ${studentId}: ${response.status} - ${errorData.message || 'Unknown error'}`);
        }
      }

      // Wyczyść pending changes
      setPendingChanges({ users: {}, students: {} });
      setUsersToDelete([]);
      setStudentsToDelete([]);

      // Przeładuj dane
      await loadUsers();
      await loadStudents();
      await loadFormerStudents();
      await loadFormerUsers();

      alert('Zmiany zostały zapisane!');
    } catch (error) {
      console.error('Error saving changes:', error);
      alert('Wystąpił błąd podczas zapisywania zmian');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          accountType: newUser.accountType,
          confirmed: newUser.confirmed,
        }),
      });

      if (response.ok) {
        setShowAddUser(false);
        setNewUser({
          email: '',
          password: '',
          firstName: '',
          lastName: '',
          accountType: 'user',
          confirmed: false,
        });
        await loadUsers();
        alert('Użytkownik został dodany!');
      } else {
        const data = await response.json();
        alert(data.message || 'Błąd podczas dodawania użytkownika');
      }
    } catch (error) {
      console.error('Error adding user:', error);
      alert('Wystąpił błąd');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: newStudent.userId,
          firstName: newStudent.firstName,
          lastName: newStudent.lastName,
          birthYear: newStudent.birthYear,
          location: newStudent.location,
          active: newStudent.active,
        }),
      });

      if (response.ok) {
        setShowAddStudent(false);
        setNewStudent({
          userId: '',
          firstName: '',
          lastName: '',
          birthYear: '',
          location: '',
          active: false,
        });
        await loadStudents();
        alert('Student został dodany!');
      } else {
        const data = await response.json();
        alert(data.message || 'Błąd podczas dodawania studenta');
      }
    } catch (error) {
      console.error('Error adding student:', error);
      alert('Wystąpił błąd');
    } finally {
      setLoading(false);
    }
  };

  const hasPendingChanges = Object.keys(pendingChanges.users).length > 0 ||
    Object.keys(pendingChanges.students).length > 0 ||
    usersToDelete.length > 0 ||
    studentsToDelete.length > 0;

  const handleRefreshData = async () => {
    if (activeTab === 'users') {
      await loadUsers();
    } else if (activeTab === 'students') {
      await loadStudents();
    } else if (activeTab === 'resignations') {
      await loadFormerStudents();
      await loadFormerUsers();
    }
  };

  // Wyciągnij unikalne lata urodzenia z bazy (tylko aktywni uczniowie)
  const availableBirthYears = Array.from(
    new Set(
      allStudents
        .filter(s => s.active === true && s.birth_year)
        .map(s => s.birth_year)
        .filter(year => year && year.trim() !== '')
    )
  ).sort((a, b) => b.localeCompare(a)); // Sortuj malejąco (najnowsze najpierw)

  const handleRestoreStudent = async (studentId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      if (response.ok) {
        await loadFormerStudents();
        await loadStudents(); // Odśwież też listę studentów
        await loadUsers(); // Odśwież też listę użytkowników (rodzic mógł zostać przywrócony)
        await loadFormerUsers(); // Odśwież też listę byłych użytkowników
        alert('Student został przywrócony');
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.message || 'Błąd podczas przywracania studenta');
      }
    } catch (error) {
      console.error('Error restoring student:', error);
      alert('Błąd podczas przywracania studenta');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreUser = async (userId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true }),
      });
      if (response.ok) {
        await loadFormerUsers();
        await loadUsers(); // Odśwież też listę użytkowników
        await loadFormerStudents(); // Odśwież też listę byłych uczniów (mogą być przywróceni razem z użytkownikiem)
        await loadStudents(); // Odśwież też listę studentów
        alert('Użytkownik został przywrócony');
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.message || 'Błąd podczas przywracania użytkownika');
      }
    } catch (error) {
      console.error('Error restoring user:', error);
      alert('Błąd podczas przywracania użytkownika');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Loading overlay */}
      {loadingFromDb && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4 shadow-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#175244]"></div>
            <p className="text-gray-700 font-medium">Pobieranie danych z bazy...</p>
          </div>
        </div>
      )}

      {/* Powiadomienie o rezygnacjach */}
      {studentsWithResignation > 0 && (
        <div className="bg-red-50 border-2 border-red-400 rounded-xl p-4 mb-4">
          <p className="text-red-800 font-semibold text-lg">
            ⚠️ Uwaga: {studentsWithResignation} {studentsWithResignation === 1 ? 'rodzic zgłosił' : studentsWithResignation < 5 ? 'rodziców zgłosiło' : 'rodziców zgłosiło'} chęć rezygnacji z kursu
          </p>
          <p className="text-red-700 text-sm mt-1">
            Sprawdź zakładkę "Studenci" i użyj filtra "Chęć rezygnacji" aby zobaczyć szczegóły.
          </p>
        </div>
      )}

      {/* Przycisk Zapisz */}
      {hasPendingChanges && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-xl p-4 flex justify-between items-center">
          <p className="text-yellow-800 font-medium">
            Masz niezapisane zmiany
          </p>
          <button
            onClick={handleSaveChanges}
            disabled={loading}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-50"
          >
            {loading ? 'Zapisywanie...' : '💾 Zapisz zmiany'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-xl p-2 border border-gray-200 flex gap-2">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-6 py-3 text-lg font-bold transition-all rounded-lg ${
            activeTab === 'users'
              ? 'bg-[#175244] text-white shadow-lg'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          👥 Użytkownicy
        </button>
        <button
          onClick={() => setActiveTab('students')}
          className={`px-6 py-3 text-lg font-bold transition-all rounded-lg ${
            activeTab === 'students'
              ? 'bg-[#175244] text-white shadow-lg'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🎓 Studenci
        </button>
        <button
          onClick={() => setActiveTab('resignations')}
          className={`px-6 py-3 text-lg font-bold transition-all rounded-lg ${
            activeTab === 'resignations'
              ? 'bg-[#175244] text-white shadow-lg'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          📋 Rezygnacje
        </button>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Filtry */}
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Filtry</h3>
              <button
                onClick={handleRefreshData}
                disabled={loadingFromDb}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 flex items-center gap-2 hidden"
              >
                <span>🔄</span>
                Pobierz z bazy
              </button>
            </div>
            <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID</label>
              <input
                type="text"
                placeholder="Filtruj po ID"
                value={userFilterId}
                onChange={(e) => setUserFilterId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Imię</label>
              <input
                type="text"
                placeholder="Filtruj po imieniu"
                value={userFilterFirstName}
                onChange={(e) => setUserFilterFirstName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nazwisko</label>
              <input
                type="text"
                placeholder="Filtruj po nazwisku"
                value={userFilterLastName}
                onChange={(e) => setUserFilterLastName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="text"
                placeholder="Filtruj po email"
                value={userFilterEmail}
                onChange={(e) => setUserFilterEmail(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Typ konta</label>
              <select
                value={userFilterAccountType}
                onChange={(e) => setUserFilterAccountType(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Wszyscy</option>
                <option value="user">User</option>
                <option value="lektor">Lektor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Potwierdzony</label>
              <select
                value={userFilterConfirmed}
                onChange={(e) => setUserFilterConfirmed(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Wszyscy</option>
                <option value="true">Tak</option>
                <option value="false">Nie</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setShowAddUser(!showAddUser)}
                className="px-4 py-2 bg-[#175244] text-white rounded-lg hover:bg-[#144a37]"
              >
                {showAddUser ? '✕ Anuluj' : '+ Dodaj użytkownika'}
              </button>
            </div>
            </div>
          </div>

          {/* Formularz dodawania użytkownika */}
          {showAddUser && (
            <form onSubmit={handleAddUser} className="bg-white p-6 rounded-xl border-2 border-[#175244] space-y-4">
              <h3 className="text-lg font-semibold">Nowy użytkownik</h3>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Imię"
                  value={newUser.firstName}
                  onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Nazwisko"
                  value={newUser.lastName}
                  onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="password"
                  placeholder="Hasło"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <select
                  value={newUser.accountType}
                  onChange={(e) => setNewUser({ ...newUser, accountType: e.target.value as any })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="user">User</option>
                  <option value="lektor">Lektor</option>
                  <option value="admin">Admin</option>
                </select>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newUser.confirmed}
                    onChange={(e) => setNewUser({ ...newUser, confirmed: e.target.checked })}
                  />
                  <span className="text-sm">Potwierdzony</span>
                </label>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-[#175244] text-white rounded-lg hover:bg-[#144a37] disabled:opacity-50"
              >
                Dodaj
              </button>
            </form>
          )}

          {/* Tabela użytkowników */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Imię</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Nazwisko</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Typ</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Potwierdzony</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => {
                  const changedUser = { ...user, ...pendingChanges.users[user.id] };
                  const isDeleted = usersToDelete.includes(user.id);
                  return (
                    <tr key={user.id} className={isDeleted ? 'bg-red-50 opacity-50' : ''}>
                      <td className="px-4 py-3">{changedUser.id}</td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={changedUser.first_name || ''}
                          onChange={(e) => handleUserChange(user.id, 'first_name', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={changedUser.last_name || ''}
                          onChange={(e) => handleUserChange(user.id, 'last_name', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="email"
                          value={changedUser.email || ''}
                          onChange={(e) => handleUserChange(user.id, 'email', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={changedUser.account_type || 'user'}
                          onChange={(e) => handleUserChange(user.id, 'account_type', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        >
                          <option value="user">User</option>
                          <option value="lektor">Lektor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={changedUser.confirmed || false}
                          onChange={(e) => handleUserChange(user.id, 'confirmed', e.target.checked)}
                          className="w-5 h-5"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            if (isDeleted) {
                              setUsersToDelete(prev => prev.filter(id => id !== user.id));
                            } else {
                              setUsersToDelete(prev => [...prev, user.id]);
                            }
                          }}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                        >
                          {isDeleted ? 'Przywróć' : 'Usuń'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Students Tab */}
      {activeTab === 'students' && (
        <div className="space-y-4">
          {/* Filtry */}
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Filtry</h3>
              <button
                onClick={handleRefreshData}
                disabled={loadingFromDb}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 flex items-center gap-2 hidden"
              >
                <span>🔄</span>
                Pobierz z bazy
              </button>
            </div>
            <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Student</label>
              <input
                type="text"
                placeholder="Filtruj po ID"
                value={studentFilterId}
                onChange={(e) => setStudentFilterId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Rodzica</label>
              <input
                type="text"
                placeholder="Filtruj po ID rodzica"
                value={studentFilterUserId}
                onChange={(e) => setStudentFilterUserId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Imię</label>
              <input
                type="text"
                placeholder="Filtruj po imieniu"
                value={studentFilterFirstName}
                onChange={(e) => setStudentFilterFirstName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nazwisko</label>
              <input
                type="text"
                placeholder="Filtruj po nazwisku"
                value={studentFilterLastName}
                onChange={(e) => setStudentFilterLastName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-32"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rok urodzenia</label>
              <select
                value={studentFilterBirthYear}
                onChange={(e) => setStudentFilterBirthYear(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg w-32"
              >
                <option value="">Wszystkie</option>
                {availableBirthYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lokalizacja</label>
              <select
                value={studentFilterLocation}
                onChange={(e) => setStudentFilterLocation(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Wszystkie</option>
                <option value="Paniówki">Paniówki</option>
                <option value="Halemba">Halemba</option>
                <option value="Orzegów">Orzegów</option>
                <option value="Kochłowice">Kochłowice</option>
                <option value="Bielszowice">Bielszowice</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aktywny</label>
              <select
                value={studentFilterActive}
                onChange={(e) => setStudentFilterActive(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Wszyscy</option>
                <option value="true">Tak</option>
                <option value="false">Nie</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Chęć rezygnacji</label>
              <select
                value={studentFilterResignation}
                onChange={(e) => setStudentFilterResignation(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">Wszyscy</option>
                <option value="true">Tak</option>
                <option value="false">Nie</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setShowAddStudent(!showAddStudent)}
                className="px-4 py-2 bg-[#175244] text-white rounded-lg hover:bg-[#144a37]"
              >
                {showAddStudent ? '✕ Anuluj' : '+ Dodaj studenta'}
              </button>
            </div>
            </div>
          </div>

          {/* Formularz dodawania studenta */}
          {showAddStudent && (
            <form onSubmit={handleAddStudent} className="bg-white p-6 rounded-xl border-2 border-[#175244] space-y-4">
              <h3 className="text-lg font-semibold">Nowy student</h3>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="ID Rodzica (user_id)"
                  value={newStudent.userId}
                  onChange={(e) => setNewStudent({ ...newStudent, userId: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Imię dziecka"
                  value={newStudent.firstName}
                  onChange={(e) => setNewStudent({ ...newStudent, firstName: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="text"
                  placeholder="Nazwisko dziecka"
                  value={newStudent.lastName}
                  onChange={(e) => setNewStudent({ ...newStudent, lastName: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  type="number"
                  placeholder="Rok urodzenia"
                  value={newStudent.birthYear}
                  onChange={(e) => setNewStudent({ ...newStudent, birthYear: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <select
                  value={newStudent.location}
                  onChange={(e) => setNewStudent({ ...newStudent, location: e.target.value as any })}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Wybierz lokalizację</option>
                  <option value="Paniówki">Paniówki</option>
                  <option value="Halemba">Halemba</option>
                  <option value="Orzegów">Orzegów</option>
                  <option value="Kochłowice">Kochłowice</option>
                  <option value="Bielszowice">Bielszowice</option>
                </select>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newStudent.active}
                    onChange={(e) => setNewStudent({ ...newStudent, active: e.target.checked })}
                  />
                  <span className="text-sm">Aktywny</span>
                </label>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-[#175244] text-white rounded-lg hover:bg-[#144a37] disabled:opacity-50"
              >
                Dodaj
              </button>
            </form>
          )}

          {/* Tabela studentów */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">ID Student</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">ID Rodzica</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Imię</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Nazwisko</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Rok urodzenia</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Lokalizacja</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Aktywny</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Chęć rezygnacji</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {students.map((student) => {
                  const changedStudent = { ...student, ...pendingChanges.students[student.student_id] };
                  const isDeleted = studentsToDelete.includes(student.student_id);
                  return (
                    <tr key={student.student_id} className={isDeleted ? 'bg-red-50 opacity-50' : ''}>
                      <td className="px-4 py-3">{changedStudent.student_id}</td>
                      <td className="px-4 py-3">{changedStudent.user_id}</td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={changedStudent.first_name || ''}
                          onChange={(e) => handleStudentChange(student.student_id, 'first_name', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={changedStudent.last_name || ''}
                          onChange={(e) => handleStudentChange(student.student_id, 'last_name', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={changedStudent.birth_year || ''}
                          onChange={(e) => handleStudentChange(student.student_id, 'birth_year', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={changedStudent.location || ''}
                          onChange={(e) => handleStudentChange(student.student_id, 'location', e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded"
                        >
                          <option value="Paniówki">Paniówki</option>
                          <option value="Halemba">Halemba</option>
                          <option value="Orzegów">Orzegów</option>
                          <option value="Kochłowice">Kochłowice</option>
                          <option value="Bielszowice">Bielszowice</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={changedStudent.active || false}
                          onChange={(e) => handleStudentChange(student.student_id, 'active', e.target.checked)}
                          className="w-5 h-5"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <input
                            type="checkbox"
                            checked={changedStudent.resignation_requested || false}
                            onChange={(e) => handleStudentChange(student.student_id, 'resignation_requested', e.target.checked)}
                            className="w-5 h-5"
                          />
                          {changedStudent.resignation_requested && changedStudent.resignation_reason && (
                            <span className="text-xs text-gray-600 max-w-xs truncate" title={changedStudent.resignation_reason}>
                              {changedStudent.resignation_reason}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            if (isDeleted) {
                              setStudentsToDelete(prev => prev.filter(id => id !== student.student_id));
                            } else {
                              setStudentsToDelete(prev => [...prev, student.student_id]);
                            }
                          }}
                          className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-xs"
                        >
                          {isDeleted ? 'Anuluj' : 'Usuń'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resignations Tab */}
      {activeTab === 'resignations' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">
                Byli uczniowie ({formerStudents.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      ID Użytkownika
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      ID Ucznia
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Imię i nazwisko
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Rok urodzenia
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Lokalizacja
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Data zakończenia
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Akcje
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formerStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        Brak byłych uczniów
                      </td>
                    </tr>
                  ) : (
                    formerStudents.map((student) => (
                      <tr key={student.student_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {student.user_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {student.student_id}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {student.first_name} {student.last_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {student.birth_year}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {student.location}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {student.resignation_date ? (
                            <span>
                              {new Date(student.resignation_date).toLocaleDateString('pl-PL', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleRestoreStudent(student.student_id)}
                            disabled={loading}
                            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Przywróć
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Byli użytkownicy */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
            <div className="p-4 bg-gray-50 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">
                Byli użytkownicy ({formerUsers.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      ID Użytkownika
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Imię i nazwisko
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Typ konta
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Data zakończenia
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider border-b border-gray-200">
                      Akcje
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {formerUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        Brak byłych użytkowników
                      </td>
                    </tr>
                  ) : (
                    formerUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {user.id}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {user.first_name} {user.last_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {user.email}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {user.account_type === 'user' ? 'Użytkownik' : user.account_type === 'admin' ? 'Admin' : 'Lektor'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {user.resignation_date ? (
                            <span>
                              {new Date(user.resignation_date).toLocaleDateString('pl-PL', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleRestoreUser(user.id)}
                            disabled={loading}
                            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Przywróć
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
