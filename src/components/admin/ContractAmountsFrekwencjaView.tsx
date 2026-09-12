'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  buildContractAmountsVerification,
  formatVerificationMoney,
  type ContractAmountsVerificationRow,
} from '@/lib/contract-amounts-verification';
import type { ContractAmountsExportRow } from '@/lib/contract-amounts-xlsx';
import { isParentInComplimentaryList } from '@/lib/complimentary-parent-list';
import { resolveEnrollmentListBadge } from '@/lib/enrollment-status';
import type { PaymentType } from '@/lib/lesson-pricing';
import type {
  ComplimentaryParentRow,
  EnrollmentChildRow,
  EnrollmentGroupRow,
  EnrollmentParentRow,
} from '@/src/components/enrollment/types';

type AmountCellProps = {
  value: number | null;
  selected: boolean;
  sublabel?: string | null;
};

function AmountCell({ value, selected, sublabel }: AmountCellProps) {
  return (
    <td
      className={`whitespace-nowrap px-2 py-2 text-right text-sm tabular-nums ${
        selected
          ? 'bg-emerald-100 font-semibold text-[#0f6e56] ring-1 ring-inset ring-emerald-300'
          : 'text-zinc-800'
      }`}
    >
      <div>{formatVerificationMoney(value)}</div>
      {sublabel ? (
        <div className="text-[10px] font-normal text-zinc-500">{sublabel}</div>
      ) : null}
    </td>
  );
}

function HeaderFilterSelect({
  value,
  onChange,
  ariaLabel,
  children,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}) {
  const active = value !== '';
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      className={`mt-1 w-full max-w-[11rem] cursor-pointer rounded-lg border bg-white px-2 py-1 text-left text-[11px] font-semibold normal-case tracking-normal text-zinc-800 outline-none ring-[#0f6e56] focus:ring-2 ${
        active ? 'border-[#0f6e56] text-[#0f6e56]' : 'border-emerald-100'
      } ${className}`}
    >
      {children}
    </select>
  );
}

function HeaderFilterInput({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
}) {
  const active = value.trim() !== '';
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`mt-1 w-full min-w-[8rem] rounded-lg border bg-white px-2 py-1 text-left text-[11px] font-medium normal-case tracking-normal text-zinc-800 outline-none ring-[#0f6e56] focus:ring-2 ${
        active ? 'border-[#0f6e56] text-[#0f6e56]' : 'border-emerald-100'
      }`}
    />
  );
}

function isSelected(paymentType: PaymentType | null, kind: PaymentType): boolean {
  return paymentType === kind;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
}

type TableRow = {
  child: EnrollmentChildRow;
  parent: EnrollmentParentRow;
  verification: ContractAmountsVerificationRow;
  groupName: string;
  statusLabel: string;
  complimentary: boolean;
  noFee: boolean;
  hasKdr: boolean;
  choiceLabel: string;
  discountKey: string;
};

function toExportRow(
  row: TableRow,
  groupNameById: Map<string, string>
): ContractAmountsExportRow {
  const groupId = (row.child.proposedGroupId ?? '').trim();
  return {
    childFirstName: row.child.firstName,
    childLastName: row.child.lastName,
    parentFirstName: row.parent.firstName,
    parentLastName: row.parent.lastName,
    parentEmail: row.parent.email,
    statusLabel: row.statusLabel,
    groupName: groupId ? (groupNameById.get(groupId) ?? groupId) : 'nieprzypisana',
    hasProposedGroup: Boolean(groupId),
    complimentary: row.complimentary,
    hasKdr: Boolean(row.parent.discountLargeFamily),
    hasSibling: Boolean(row.parent.enrollingMultipleChildren),
    managerDiscountPercent: row.child.discountPercent,
    groupLessonsPerWeek: row.child.groupLessonsPerWeek,
    studentLessonsPerWeek: row.child.studentLessonsPerWeek,
    yearlyUnitPrice: row.child.yearlyUnitPrice,
    monthlyUnitPrice: row.child.monthlyUnitPrice,
    lessonUnitPrice: row.child.lessonUnitPrice,
    contractPaymentType: row.child.contractPaymentType,
    contractAmount: row.child.contractAmount,
    contractBillingExempt: row.child.contractBillingExempt,
    contractLessonUnitPrice: row.child.contractLessonUnitPrice,
    contractMonthlyUnitPrice: row.child.contractMonthlyUnitPrice,
    contractYearlyUnitPrice: row.child.contractYearlyUnitPrice,
    contractHasKdr: row.child.contractDiscountLargeFamily,
    contractHasSibling: row.child.contractDiscountSibling,
  };
}

export type ContractAmountsFrekwencjaViewProps = {
  parents: EnrollmentParentRow[];
  groups: EnrollmentGroupRow[];
  complimentaryParents: ComplimentaryParentRow[];
  discountSettings: { LARGE_FAMILY_CARD: number; SIBLING: number };
  studentQuery: string;
  exporting: boolean;
  onExport: (rows: ContractAmountsExportRow[]) => void;
};

export default function ContractAmountsFrekwencjaView({
  parents,
  groups,
  complimentaryParents,
  discountSettings,
  studentQuery,
  exporting,
  onExport,
}: ContractAmountsFrekwencjaViewProps) {
  const [childFilter, setChildFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [frekwencjaFilter, setFrekwencjaFilter] = useState('');
  const [kdrFilter, setKdrFilter] = useState('');
  const [rabatFilter, setRabatFilter] = useState('');
  const [wyborFilter, setWyborFilter] = useState('');

  const groupNameById = useMemo(
    () => new Map(groups.map((g) => [g.id, g.name])),
    [groups]
  );
  const globalQuery = studentQuery.trim().toLocaleLowerCase('pl');

  const allRows = useMemo(() => {
    const rows: TableRow[] = [];
    for (const parent of parents) {
      const complimentary = isParentInComplimentaryList(parent, complimentaryParents);
      for (const child of parent.children) {
        if (globalQuery) {
          const hay = [
            child.firstName,
            child.lastName,
            parent.firstName,
            parent.lastName,
            parent.email,
          ]
            .join(' ')
            .toLocaleLowerCase('pl');
          if (!hay.includes(globalQuery)) continue;
        }
        const groupId = (child.proposedGroupId ?? '').trim();
        const verification = buildContractAmountsVerification({
          yearlyUnitPrice: child.yearlyUnitPrice,
          monthlyUnitPrice: child.monthlyUnitPrice,
          lessonUnitPrice: child.lessonUnitPrice,
          hasProposedGroup: Boolean(groupId),
          groupLessonsPerWeek: child.groupLessonsPerWeek,
          studentLessonsPerWeek: child.studentLessonsPerWeek,
          managerDiscountPercent: child.discountPercent,
          hasKdr: Boolean(parent.discountLargeFamily),
          hasSibling: Boolean(parent.enrollingMultipleChildren),
          complimentary,
          discountSettings,
          contractYearlyUnitPrice: child.contractYearlyUnitPrice,
          contractMonthlyUnitPrice: child.contractMonthlyUnitPrice,
          contractLessonUnitPrice: child.contractLessonUnitPrice,
          contractPaymentType: child.contractPaymentType,
          contractAmount: child.contractAmount,
          contractBillingExempt: child.contractBillingExempt === true,
          contractHasKdr: child.contractDiscountLargeFamily === true,
          contractHasSibling: child.contractDiscountSibling === true,
        });
        const noFee = complimentary || child.contractBillingExempt === true;
        const hasKdr = Boolean(parent.discountLargeFamily);
        const choiceLabel = noFee
          ? 'bez opłat'
          : verification.paymentTypeLabel ?? 'brak';
        const discountKey =
          verification.discount.percent > 0
            ? `${verification.discount.percent}%`
            : 'brak';
        rows.push({
          child,
          parent,
          verification,
          groupName: groupId ? (groupNameById.get(groupId) ?? groupId) : 'nieprzypisana',
          statusLabel: resolveEnrollmentListBadge(child).label,
          complimentary,
          noFee,
          hasKdr,
          choiceLabel,
          discountKey,
        });
      }
    }
    rows.sort((a, b) => {
      const last = (a.child.lastName ?? '').localeCompare(b.child.lastName ?? '', 'pl');
      if (last !== 0) return last;
      return (a.child.firstName ?? '').localeCompare(b.child.firstName ?? '', 'pl');
    });
    return rows;
  }, [
    parents,
    complimentaryParents,
    globalQuery,
    discountSettings,
    groupNameById,
  ]);

  const statusOptions = useMemo(
    () => uniqueSorted(allRows.map((r) => r.statusLabel)),
    [allRows]
  );
  const groupOptions = useMemo(
    () => uniqueSorted(allRows.map((r) => r.groupName)),
    [allRows]
  );
  const frekwencjaOptions = useMemo(
    () => uniqueSorted(allRows.map((r) => r.verification.lessonsPerWeekLabel)),
    [allRows]
  );
  const rabatOptions = useMemo(
    () => uniqueSorted(allRows.map((r) => r.discountKey)),
    [allRows]
  );
  const wyborOptions = useMemo(
    () => uniqueSorted(allRows.map((r) => r.choiceLabel)),
    [allRows]
  );

  const filteredRows = useMemo(() => {
    const childQ = childFilter.trim().toLocaleLowerCase('pl');
    return allRows.filter((row) => {
      if (childQ) {
        const hay = [
          row.child.firstName,
          row.child.lastName,
          row.parent.firstName,
          row.parent.lastName,
          row.parent.email,
        ]
          .join(' ')
          .toLocaleLowerCase('pl');
        if (!hay.includes(childQ)) return false;
      }
      if (statusFilter && row.statusLabel !== statusFilter) return false;
      if (groupFilter && row.groupName !== groupFilter) return false;
      if (
        frekwencjaFilter &&
        row.verification.lessonsPerWeekLabel !== frekwencjaFilter
      ) {
        return false;
      }
      if (kdrFilter === 'yes' && !row.hasKdr) return false;
      if (kdrFilter === 'no' && row.hasKdr) return false;
      if (rabatFilter && row.discountKey !== rabatFilter) return false;
      if (wyborFilter && row.choiceLabel !== wyborFilter) return false;
      return true;
    });
  }, [
    allRows,
    childFilter,
    statusFilter,
    groupFilter,
    frekwencjaFilter,
    kdrFilter,
    rabatFilter,
    wyborFilter,
  ]);

  const hasColumnFilters =
    childFilter.trim() !== '' ||
    statusFilter !== '' ||
    groupFilter !== '' ||
    frekwencjaFilter !== '' ||
    kdrFilter !== '' ||
    rabatFilter !== '' ||
    wyborFilter !== '';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-sm text-zinc-600">
          Weryfikacja kwot: stawka × frekwencja × rabat (już wpisany). Frekwencja z grupy; override
          managera na członkostwie ma pierwszeństwo. Bez grupy — frekwencja pusta. Główna kwota =
          wyliczenie bieżące; pod spodem „umowa:” = stawki z podpisanej umowy. Zielone tło = wybrana
          płatność. „Na fakturze” ={' '}
          <span className="font-medium text-zinc-800">contracts.amount</span> (ratalna/jednorazowa;
          przy umowie wielodzietnej to suma) albo stawka za zajęcia.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasColumnFilters ? (
            <button
              type="button"
              onClick={() => {
                setChildFilter('');
                setStatusFilter('');
                setGroupFilter('');
                setFrekwencjaFilter('');
                setKdrFilter('');
                setRabatFilter('');
                setWyborFilter('');
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50"
            >
              Wyczyść filtry
            </button>
          ) : null}
          <button
            type="button"
            disabled={exporting || filteredRows.length === 0}
            onClick={() =>
              onExport(filteredRows.map((row) => toExportRow(row, groupNameById)))
            }
            className="rounded-xl border border-[#0f6e56] bg-white px-3 py-2 text-sm font-semibold text-[#0f6e56] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? 'Generowanie…' : 'Pobierz Excel'}
          </button>
        </div>
      </div>

      <p className="text-sm text-zinc-600">
        {filteredRows.length}
        {filteredRows.length !== allRows.length ? ` / ${allRows.length}` : ''} dzieci
      </p>

      {allRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          {globalQuery ? 'Brak dzieci dla podanego wyszukiwania' : 'Brak dzieci'}
        </p>
      ) : filteredRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          Brak dzieci dla wybranych filtrów
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-emerald-100">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-emerald-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-3 py-2 align-bottom">
                  <span className="block">Dziecko</span>
                  <HeaderFilterInput
                    value={childFilter}
                    onChange={setChildFilter}
                    ariaLabel="Filtr dziecka"
                    placeholder="Szukaj…"
                  />
                </th>
                <th className="px-2 py-2 align-bottom">
                  <span className="block">Status</span>
                  <HeaderFilterSelect
                    value={statusFilter}
                    onChange={setStatusFilter}
                    ariaLabel="Filtr statusu"
                  >
                    <option value="">Wszystkie</option>
                    {statusOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </HeaderFilterSelect>
                </th>
                <th className="px-2 py-2 align-bottom">
                  <span className="block">Grupa</span>
                  <HeaderFilterSelect
                    value={groupFilter}
                    onChange={setGroupFilter}
                    ariaLabel="Filtr grupy"
                  >
                    <option value="">Wszystkie</option>
                    {groupOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </HeaderFilterSelect>
                </th>
                <th className="px-2 py-2 align-bottom">
                  <span className="block">Frekwencja</span>
                  <HeaderFilterSelect
                    value={frekwencjaFilter}
                    onChange={setFrekwencjaFilter}
                    ariaLabel="Filtr frekwencji"
                    className="max-w-[9rem]"
                  >
                    <option value="">Wszystkie</option>
                    {frekwencjaOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </HeaderFilterSelect>
                </th>
                <th className="px-2 py-2 align-bottom">
                  <span className="block">KDR</span>
                  <HeaderFilterSelect
                    value={kdrFilter}
                    onChange={setKdrFilter}
                    ariaLabel="Filtr KDR"
                    className="max-w-[7rem]"
                  >
                    <option value="">Wszystkie</option>
                    <option value="yes">Tak</option>
                    <option value="no">Nie</option>
                  </HeaderFilterSelect>
                </th>
                <th className="px-2 py-2 align-bottom">
                  <span className="block">Rabaty</span>
                  <HeaderFilterSelect
                    value={rabatFilter}
                    onChange={setRabatFilter}
                    ariaLabel="Filtr rabatów"
                    className="max-w-[8rem]"
                  >
                    <option value="">Wszystkie</option>
                    {rabatOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === 'brak' ? 'Brak' : opt}
                      </option>
                    ))}
                  </HeaderFilterSelect>
                </th>
                <th className="px-2 py-2 text-right align-bottom">Jednorazowa</th>
                <th className="px-2 py-2 text-right align-bottom">Ratalna</th>
                <th className="px-2 py-2 text-right align-bottom">Za zajęcia</th>
                <th className="px-2 py-2 align-bottom">
                  <span className="block">Wybór</span>
                  <HeaderFilterSelect
                    value={wyborFilter}
                    onChange={setWyborFilter}
                    ariaLabel="Filtr wyboru płatności"
                    className="max-w-[9rem]"
                  >
                    <option value="">Wszystkie</option>
                    {wyborOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </HeaderFilterSelect>
                </th>
                <th className="px-2 py-2 text-right align-bottom">Na fakturze</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(
                ({
                  child,
                  parent,
                  verification: v,
                  groupName,
                  statusLabel,
                  noFee,
                  hasKdr,
                }) => {
                  const showContract = Boolean(v.onContract);
                  const contractHint = showContract
                    ? {
                        yearly:
                          v.onContract!.yearly != null
                            ? `umowa: ${formatVerificationMoney(v.onContract!.yearly)}`
                            : null,
                        monthly:
                          v.onContract!.monthly != null
                            ? `umowa: ${formatVerificationMoney(v.onContract!.monthly)}`
                            : null,
                        lesson:
                          v.onContract!.lesson != null
                            ? `umowa: ${formatVerificationMoney(v.onContract!.lesson)}`
                            : null,
                      }
                    : null;

                  return (
                    <tr
                      key={child.requestId}
                      className={`border-t border-emerald-50 ${
                        noFee ? 'bg-sky-50/80' : 'odd:bg-white even:bg-zinc-50/60'
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-zinc-900">
                            {child.firstName} {child.lastName}
                          </span>
                          {noFee ? (
                            <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 ring-1 ring-inset ring-sky-200">
                              Bez opłat
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {parent.firstName} {parent.lastName}
                          {parent.email ? ` · ${parent.email}` : ''}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-sm text-zinc-700">{statusLabel}</td>
                      <td className="px-2 py-2 text-sm text-zinc-700">{groupName}</td>
                      <td className="px-2 py-2 text-sm font-medium text-zinc-800">
                        {v.lessonsPerWeekLabel}
                      </td>
                      <td className="px-2 py-2 text-sm">
                        {hasKdr ? (
                          <span className="inline-flex items-center rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-800 ring-1 ring-inset ring-violet-200">
                            KDR
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="max-w-[10rem] px-2 py-2 text-xs text-zinc-600">
                        {v.discount.percent > 0 ? (
                          <>
                            <span className="font-semibold text-zinc-800">
                              {v.discount.percent}%
                            </span>
                            {v.discountLabel ? (
                              <div className="mt-0.5 leading-snug">{v.discountLabel}</div>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <AmountCell
                        value={v.preview.yearly}
                        selected={isSelected(v.paymentType, 'YEARLY')}
                        sublabel={contractHint?.yearly}
                      />
                      <AmountCell
                        value={v.preview.monthly}
                        selected={isSelected(v.paymentType, 'MONTHLY')}
                        sublabel={contractHint?.monthly}
                      />
                      <AmountCell
                        value={v.preview.lesson}
                        selected={isSelected(v.paymentType, 'PER_LESSON')}
                        sublabel={contractHint?.lesson}
                      />
                      <td className="px-2 py-2 text-sm text-zinc-700">
                        {noFee ? (
                          <span className="font-semibold text-sky-900">bez opłat</span>
                        ) : (
                          v.paymentTypeLabel ?? <span className="text-zinc-400">brak</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold tabular-nums text-zinc-900">
                        {noFee ? (
                          <>
                            {formatVerificationMoney(0)}
                            <div className="text-[10px] font-normal text-sky-800">bez opłat</div>
                          </>
                        ) : (
                          <>
                            {formatVerificationMoney(v.invoiceAmount)}
                            {v.invoiceAmountSource === 'contract' ? (
                              <div className="text-[10px] font-normal text-zinc-500">z umowy</div>
                            ) : null}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
