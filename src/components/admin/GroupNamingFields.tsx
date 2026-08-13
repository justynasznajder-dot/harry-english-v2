'use client';

import {
  detectLevelFromGroupName,
  GROUP_NAME_SEP,
  HARRY_ENGLISH_LEVELS,
  isHarryEnglishLevelCode,
  rebuildGroupName,
} from '@/src/data/harryEnglishLevels';

type GroupNamingFieldsProps = {
  name: string;
  level: string;
  locationName: string;
  onChange: (next: { name: string; level: string }) => void;
  /** Dodatkowe klasy na kontener (np. grid) */
  className?: string;
  nameInputClassName?: string;
  levelSelectClassName?: string;
};

/**
 * Nazwa grupy + poziom dopasowany automatycznie z prefixu nazwy.
 */
export default function GroupNamingFields({
  name,
  level,
  locationName: _locationName,
  onChange,
  className = 'contents',
  nameInputClassName = 'w-full rounded-xl border border-emerald-200 px-3 py-2',
  levelSelectClassName = 'w-full rounded-xl border border-emerald-200 px-3 py-2 bg-zinc-50',
}: GroupNamingFieldsProps) {
  const legacyLevel = level && !isHarryEnglishLevelCode(level) ? level : null;
  const detectedLevel = detectLevelFromGroupName(name);
  const selectValue = detectedLevel ?? (legacyLevel || level || '');

  return (
    <div className={className}>
      <div className="md:col-span-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs leading-relaxed text-zinc-700">
        <p className="font-semibold text-zinc-800">Jak nazywać grupy</p>
        <p className="mt-1">
          Wzorzec: <span className="font-medium">poziom{GROUP_NAME_SEP}lokalizacja{GROUP_NAME_SEP}dzień godzina</span>
          {' '}
          — np. <span className="font-medium">P4{GROUP_NAME_SEP}Mokotów{GROUP_NAME_SEP}czw 16:00</span>
          {' '}
          lub <span className="font-medium">Sz1{GROUP_NAME_SEP}Bemowo{GROUP_NAME_SEP}wt 17:00</span>.
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
          <li>
            <span className="font-medium">P</span> = przedszkole + wiek (<span className="font-medium">P3</span>–
            <span className="font-medium">P6</span>)
          </li>
          <li>
            <span className="font-medium">Sz</span> = szkoła + klasa (<span className="font-medium">Sz1</span>–
            <span className="font-medium">Sz8</span>), egzamin: <span className="font-medium">Sz8E</span>
          </li>
          <li>Druga równoległa grupa: dopisz na końcu <span className="font-medium">· B</span></li>
          <li>Poziom poniżej ustawi się sam z początku nazwy</li>
        </ul>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700">Nazwa grupy</label>
        <input
          className={nameInputClassName}
          placeholder={`np. Sz1${GROUP_NAME_SEP}Bemowo${GROUP_NAME_SEP}wt 16:00`}
          value={name}
          onChange={(e) => {
            const nextName = e.target.value;
            const nextLevel = detectLevelFromGroupName(nextName) ?? '';
            onChange({ name: nextName, level: nextLevel });
          }}
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-zinc-700">Poziom</label>
        <select
          className={levelSelectClassName}
          value={selectValue}
          disabled
          aria-readonly="true"
          title="Poziom dopasowuje się automatycznie z nazwy grupy"
        >
          <option value="">
            {name.trim() ? 'Nie rozpoznano poziomu w nazwie' : 'Uzupełni się z nazwy'}
          </option>
          {legacyLevel && !detectedLevel ? (
            <option value={legacyLevel}>{legacyLevel} (stara wartość)</option>
          ) : null}
          {HARRY_ENGLISH_LEVELS.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/** Po zmianie lokalizacji — zachowaj poziom i dzień/godzinę w nazwie. */
export function syncGroupNameWithLocation(options: {
  name: string;
  level: string;
  locationName: string;
}): string {
  const level =
    options.level.trim() || detectLevelFromGroupName(options.name) || '';
  if (!level) return options.name;
  return rebuildGroupName({
    previousName: options.name,
    levelCode: level,
    locationName: options.locationName,
  });
}
