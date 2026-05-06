'use client';

/**
 * Panel konta użytkownika z rolą CHILD (logowanie przez child_auth / users.role = CHILD).
 * Materiały i nagrody — do rozbudowy pod istniejące API.
 */
export default function ChildPortal() {
  return (
    <div className="rounded-3xl border border-emerald-100 bg-[#f8f6f3] p-6 shadow-xl">
      <h2 className="text-xl font-bold text-[#1f2933]">Twój panel</h2>
      <p className="mt-2 text-sm text-gray-600">
        Tutaj pojawią się materiały do nauki, nagrody i postępy — po podłączeniu modułu ucznia (child_auth).
      </p>
    </div>
  );
}
