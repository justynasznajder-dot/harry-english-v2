import { queryDb } from "@/lib/db";

let cachedCorrective: boolean | null = null;
let cachedInvoiceItems: boolean | null = null;

/** Czy migracja accountant_corrective_invoices jest już na bazie. */
export async function invoicesSupportCorrectiveDocuments(): Promise<boolean> {
  if (cachedCorrective != null) return cachedCorrective;
  const r = await queryDb(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'invoices'
       AND column_name = 'document_type'
     LIMIT 1`
  );
  cachedCorrective = r.rows.length > 0;
  return cachedCorrective;
}

/** Czy tabela invoice_items jest już na bazie. */
export async function invoicesSupportInvoiceItems(): Promise<boolean> {
  if (cachedInvoiceItems != null) return cachedInvoiceItems;
  const r = await queryDb(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = 'invoice_items'
     LIMIT 1`
  );
  cachedInvoiceItems = r.rows.length > 0;
  return cachedInvoiceItems;
}

export function resetInvoiceSchemaCache(): void {
  cachedCorrective = null;
  cachedInvoiceItems = null;
}
