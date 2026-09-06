'use client';

import type { ReactNode } from 'react';
import {
  allocateUniqueGroupName,
  buildGroupNameBase,
  GROUP_NAME_SEP,
  HARRY_ENGLISH_LEVELS,
  isHarryEnglishLevelCode,
} from '@/src/data/harryEnglishLevels';

type GroupNamingFieldsProps = {
  name: string;
  level: string;
  /** Po pierwszym zapisie — poziom i lokalizacja zablokowane. */
  locked: boolean;
  onLevelChange: (level: string) => void;
  /**
   * Edycja nazwy. Tymczasowo dozwolona także po zapisie (gdy podane).
   * Potem z powrotem: tylko gdy `!locked`.
   */
  onNameChange?: (name: string) => void;
  /** Select lokalizacji (kolejność: poziom → lokalizacja → nazwa). */
  locationField: ReactNode;
  className?: string;
  levelSelectClassName?: string;
  nameInputClassName?: string;
};

/**
 * Poziom + lokalizacja (slot) + nazwa auto.
 * Poziom/lokalizacja blokowane po pierwszym zapisie; nazwa tymczasowo edytowalna także potem.
 */
export default function GroupNamingFields({
  name,
  level,
  locked,
  onLevelChange,
  onNameChange,
  locationField,
  className = 'contents',
  levelSelectClassName = 'w-full rounded-xl border border-emerald-200 px-3 py-2 bg-white disabled:bg-zinc-50 disabled:text-zinc-600',
  nameInputClassName = 'w-full rounded-xl border border-emerald-200 px-3 py-2 bg-white disabled:bg-zinc-50 disabled:text-zinc-600',
}: GroupNamingFieldsProps) {
  const legacyLevel = level && !isHarryEnglishLevelCode(level) ? level : null;
  // TODO(tymczasowo): nazwa edytowalna także po zapisie — potem: `!locked && typeof onNameChange === 'function'`
  const nameEditable = typeof onNameChange === 'function';

  return (
    <div className={className}>
      <div className="md:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs leading-relaxed text-zinc-700">
        <p className="font-semibold text-zinc-800">Jak nazywać grupy</p>
        <p className="mt-1">
          Nazwa powstaje automatycznie:{' '}
          <span className="font-medium">
            poziom{GROUP_NAME_SEP}lokalizacja
          </span>
          {' '}
          — np. <span className="font-medium">P4{GROUP_NAME_SEP}Mokotów</span>
          {' '}
          lub <span className="font-medium">Sz1{GROUP_NAME_SEP}Bemowo</span>.
          {' '}
          Możesz ją dowolnie zmienić (dodać tekst na początku lub na końcu).
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>
            <span className="font-medium">P</span> = przedszkole + wiek (
            <span className="font-medium">P3</span>–
            <span className="font-medium">P6</span>)
          </li>
          <li>
            <span className="font-medium">Sz</span> = szkoła + klasa (
            <span className="font-medium">Sz1</span>–
            <span className="font-medium">Sz8</span>), egzamin:{' '}
            <span className="font-medium">Sz8E</span>
          </li>
          <li>
            Lista lokalizacji zależy od poziomu: P* → przedszkola, Sz* → szkoły
          </li>
          <li>
            Druga aktywna grupa o tej samej bazie: sufiks{' '}
            <span className="font-medium">(2)</span>, <span className="font-medium">(3)</span>…
          </li>
          <li>
            Po pierwszym zapisie poziom i lokalizacja są tylko do odczytu — błąd = dezaktywacja
            grupy i otwarcie nowej. Nazwa jest tymczasowo edytowalna także po zapisie.
          </li>
        </ul>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700">Poziom</label>
        <select
          className={levelSelectClassName}
          value={level}
          disabled={locked}
          onChange={(e) => onLevelChange(e.target.value)}
          title={
            locked
              ? 'Poziom zablokowany po pierwszym zapisie'
              : 'Wybierz poziom — nazwa uzupełni się automatycznie'
          }
        >
          <option value="">Wybierz poziom</option>
          {legacyLevel ? (
            <option value={legacyLevel}>{legacyLevel} (stara wartość)</option>
          ) : null}
          {HARRY_ENGLISH_LEVELS.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      {locationField}
      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700">Nazwa grupy</label>
        <input
          className={
            nameEditable
              ? nameInputClassName
              : `${nameInputClassName} bg-zinc-50 text-zinc-800`
          }
          value={name}
          readOnly={!nameEditable}
          onChange={
            nameEditable
              ? (e) => onNameChange?.(e.target.value)
              : undefined
          }
          placeholder={`np. Sz1${GROUP_NAME_SEP}Bemowo`}
          title={
            nameEditable
              ? 'Możesz zmienić nazwę (także po zapisie — tymczasowo)'
              : 'Nazwa generowana automatycznie z poziomu i lokalizacji'
          }
        />
      </div>
    </div>
  );
}

/** Podgląd nazwy przy tworzeniu: baza + ewentualny (2)/(3) wśród aktywnych. */
export function previewAutoGroupName(options: {
  level: string;
  locationName: string;
  activeGroupNames: readonly string[];
}): string {
  const base = buildGroupNameBase(options.level, options.locationName);
  if (!base) return '';
  return allocateUniqueGroupName(base, options.activeGroupNames);
}
