'use client';

type MarkStatus = 'PRESENT' | 'ABSENT';

type Props = {
  status: string | null;
  disabled?: boolean;
  onSelect: (status: MarkStatus) => void;
};

/** Duże przyciski obecny / nieobecny — wygodne na telefonie. */
export default function AttendanceToggleButtons({ status, disabled, onSelect }: Props) {
  const normalized = String(status ?? '').toUpperCase();
  const isPresent = normalized === 'PRESENT' || normalized === 'LATE';
  const isAbsent = normalized === 'ABSENT' || normalized === 'EXCUSED';

  return (
    <div className="flex shrink-0 items-center gap-2" role="group" aria-label="Obecność">
      <button
        type="button"
        disabled={disabled}
        title="Nieobecny"
        aria-label="Nieobecny"
        aria-pressed={isAbsent}
        onClick={() => onSelect('ABSENT')}
        className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 text-2xl font-bold transition active:scale-95 disabled:opacity-50 sm:h-14 sm:w-14 sm:text-3xl ${
          isAbsent
            ? 'border-red-600 bg-red-600 text-white shadow-sm'
            : 'border-zinc-300 bg-white text-red-600 hover:border-red-400 hover:bg-red-50'
        }`}
      >
        <span aria-hidden="true">✕</span>
      </button>
      <button
        type="button"
        disabled={disabled}
        title="Obecny"
        aria-label="Obecny"
        aria-pressed={isPresent}
        onClick={() => onSelect('PRESENT')}
        className={`inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 text-2xl font-bold transition active:scale-95 disabled:opacity-50 sm:h-14 sm:w-14 sm:text-3xl ${
          isPresent
            ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
            : 'border-zinc-300 bg-white text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50'
        }`}
      >
        <span aria-hidden="true">✓</span>
      </button>
    </div>
  );
}
