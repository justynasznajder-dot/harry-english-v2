'use client';

import {
  buildContractAmountsVerification,
  formatVerificationMoney,
  type ContractAmountsVerificationRow,
} from '@/lib/contract-amounts-verification';
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

function isSelected(paymentType: PaymentType | null, kind: PaymentType): boolean {
  return paymentType === kind;
}

export type ContractAmountsFrekwencjaViewProps = {
  parents: EnrollmentParentRow[];
  groups: EnrollmentGroupRow[];
  complimentaryParents: ComplimentaryParentRow[];
  discountSettings: { LARGE_FAMILY_CARD: number; SIBLING: number };
  studentQuery: string;
  exporting: boolean;
  onExport: () => void;
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
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const q = studentQuery.trim().toLocaleLowerCase('pl');

  const rows: Array<{
    child: EnrollmentChildRow;
    parent: EnrollmentParentRow;
    verification: ContractAmountsVerificationRow;
    groupName: string;
    statusLabel: string;
  }> = [];

  for (const parent of parents) {
    const complimentary = isParentInComplimentaryList(parent, complimentaryParents);
    for (const child of parent.children) {
      if (q) {
        const hay = [
          child.firstName,
          child.lastName,
          parent.firstName,
          parent.lastName,
          parent.email,
        ]
          .join(' ')
          .toLocaleLowerCase('pl');
        if (!hay.includes(q)) continue;
      }
      const groupId = (child.proposedGroupId ?? '').trim();
      const verification = buildContractAmountsVerification({
        yearlyUnitPrice: child.yearlyUnitPrice,
        monthlyUnitPrice: child.monthlyUnitPrice,
        lessonUnitPrice: child.lessonUnitPrice,
        enrollmentLessonsPerWeek: child.lessonsPerWeek,
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
      rows.push({
        child,
        parent,
        verification,
        groupName: groupId ? (groupNameById.get(groupId) ?? groupId) : 'nieprzypisana',
        statusLabel: resolveEnrollmentListBadge(child).label,
      });
    }
  }

  rows.sort((a, b) => {
    const last = (a.child.lastName ?? '').localeCompare(b.child.lastName ?? '', 'pl');
    if (last !== 0) return last;
    return (a.child.firstName ?? '').localeCompare(b.child.firstName ?? '', 'pl');
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-3xl text-sm text-zinc-600">
          Weryfikacja kwot: stawka × frekwencja × rabat (już wpisany). Główna kwota = wyliczenie
          bieżące; pod spodem „umowa:” = stawki z podpisanej umowy. Zielone tło = wybrana płatność.
          „Na fakturze” = <span className="font-medium text-zinc-800">contracts.amount</span>{' '}
          (ratalna/jednorazowa; przy umowie wielodzietnej to suma) albo stawka za zajęcia.
        </p>
        <button
          type="button"
          disabled={exporting || rows.length === 0}
          onClick={onExport}
          className="rounded-xl border border-[#0f6e56] bg-white px-3 py-2 text-sm font-semibold text-[#0f6e56] transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {exporting ? 'Generowanie…' : 'Pobierz Excel'}
        </button>
      </div>

      <p className="text-sm text-zinc-600">{rows.length} dzieci</p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-600">
          {q ? 'Brak dzieci dla podanego wyszukiwania' : 'Brak dzieci'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-emerald-100">
          <table className="min-w-full border-collapse text-left">
            <thead className="bg-emerald-50/80 text-xs font-semibold uppercase tracking-wide text-zinc-600">
              <tr>
                <th className="px-3 py-2">Dziecko</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Grupa</th>
                <th className="px-2 py-2">Frekwencja</th>
                <th className="px-2 py-2">Rabaty</th>
                <th className="px-2 py-2 text-right">Jednorazowa</th>
                <th className="px-2 py-2 text-right">Ratalna</th>
                <th className="px-2 py-2 text-right">Za zajęcia</th>
                <th className="px-2 py-2">Wybór</th>
                <th className="px-2 py-2 text-right">Na fakturze</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ child, parent, verification: v, groupName, statusLabel }) => {
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
                    className="border-t border-emerald-50 odd:bg-white even:bg-zinc-50/60"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-900">
                        {child.firstName} {child.lastName}
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
                    <td className="max-w-[10rem] px-2 py-2 text-xs text-zinc-600">
                      {v.discount.percent > 0 ? (
                        <>
                          <span className="font-semibold text-zinc-800">{v.discount.percent}%</span>
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
                      {v.paymentTypeLabel ?? <span className="text-zinc-400">brak</span>}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 text-right text-sm font-semibold tabular-nums text-zinc-900">
                      {formatVerificationMoney(v.invoiceAmount)}
                      {v.invoiceAmountSource === 'contract' ? (
                        <div className="text-[10px] font-normal text-zinc-500">z umowy</div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
