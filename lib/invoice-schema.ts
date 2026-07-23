import { queryDb } from "@/lib/db";

let cached: boolean | null = null;

/** Czy migracja accountant_corrective_invoices jest już na bazie. */
export async function invoicesSupportCorrectiveDocuments(): Promise<boolean> {
  if (cached != null) return cached;
  const r = await queryDb(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'invoices'
       AND column_name = 'document_type'
     LIMIT 1`
  );
  cached = r.rows.length > 0;
  return cached;
}

export function resetInvoiceSchemaCache(): void {
  cached = null;
}
