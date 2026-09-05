import {
  formatSchoolDateTime,
  SCHOOL_TIMEZONE,
} from '@/lib/school-timezone';

export function formatLessonDateTime(iso: string): string {
  return formatSchoolDateTime(iso);
}

export { SCHOOL_TIMEZONE };

export function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  const names = [
    'Styczeń',
    'Luty',
    'Marzec',
    'Kwiecień',
    'Maj',
    'Czerwiec',
    'Lipiec',
    'Sierpień',
    'Wrzesień',
    'Październik',
    'Listopad',
    'Grudzień',
  ];
  const idx = Number(month) - 1;
  if (!year || idx < 0 || idx > 11) return ym;
  return `${names[idx]} ${year}`;
}

export function attendanceStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? 'PRESENT').toUpperCase();
  if (s === 'PRESENT') return 'Obecny';
  if (s === 'ABSENT') return 'Nieobecny';
  if (s === 'EXCUSED') return 'Usprawiedliwiony';
  if (s === 'LATE') return 'Spóźniony';
  if (s === 'UNMARKED') return 'Do oznaczenia';
  return s;
}

export function attendanceStatusClass(status: string | null | undefined): string {
  const s = String(status ?? 'PRESENT').toUpperCase();
  if (s === 'PRESENT' || s === 'LATE') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (s === 'EXCUSED') return 'text-sky-700 bg-sky-50 border-sky-200';
  if (s === 'ABSENT') return 'text-rose-700 bg-rose-50 border-rose-200';
  if (s === 'UNMARKED') return 'text-amber-800 bg-amber-50 border-amber-200';
  return 'text-zinc-700 bg-zinc-50 border-zinc-200';
}

export function paymentStatusLabel(status: string): string {
  const s = status.toUpperCase();
  if (s === 'PAID') return 'Opłacone';
  if (s === 'PENDING') return 'Do zapłaty';
  if (s === 'DRAFT') return 'W przygotowaniu';
  if (s === 'OVERDUE') return 'Po terminie';
  return status;
}

export function paymentStatusClass(status: string): string {
  const s = status.toUpperCase();
  if (s === 'PAID') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  if (s === 'DRAFT') return 'text-zinc-600 bg-zinc-50 border-zinc-200';
  if (s === 'OVERDUE') return 'text-rose-700 bg-rose-50 border-rose-200';
  return 'text-amber-800 bg-amber-50 border-amber-200';
}

export function formatAmountPln(amount: string | number): string {
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  return `${n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;
}
