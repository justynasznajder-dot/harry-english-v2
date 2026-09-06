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
