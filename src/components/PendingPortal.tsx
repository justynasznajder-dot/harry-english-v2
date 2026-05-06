'use client';

interface PendingPortalProps {
  children: Array<{
    childId?: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    confirmed?: boolean;
  }>;
}

export default function PendingPortal({ children }: PendingPortalProps) {
  return (
    <div className="bg-[#f8f6f3] rounded-3xl p-8 shadow-xl">
      <h2 className="text-3xl font-bold text-[#1f2933] mb-4">
        Dziękujemy za rejestrację!
      </h2>
      <p className="text-[#4b5563] mb-6">
        Skontaktujemy się z Tobą wkrótce. Twoje zgłoszenie czeka na kontakt ze strony szkoły.
      </p>

      <div className="space-y-3 mb-8">
        {children.map((child, index) => (
          <div key={child.childId || index} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="font-semibold text-[#1f2933]">
              {child.firstName} {child.lastName}
            </p>
            <p className="text-sm text-[#4b5563]">Data urodzenia: {child.birthDate}</p>
            <span className="inline-block mt-2 rounded-full bg-yellow-100 text-yellow-800 px-3 py-1 text-xs font-semibold">
              Oczekuje na potwierdzenie
            </span>
          </div>
        ))}
      </div>

      <a
        href="mailto:kontakt@harry-english.pl"
        className="inline-block px-6 py-3 bg-[#175244] text-white font-semibold rounded-full hover:bg-[#144a37] transition-colors"
      >
        Skontaktuj się ze szkołą
      </a>
    </div>
  );
}
