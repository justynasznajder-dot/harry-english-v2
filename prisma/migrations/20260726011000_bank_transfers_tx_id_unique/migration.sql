-- Nr transakcji ING jako unikalny identyfikator przelewu w szkole
-- (wiele NULL dozwolone — PostgreSQL UNIQUE traktuje NULL jako różne).

CREATE UNIQUE INDEX "bank_transfers_school_bank_tx_key"
ON "bank_transfers"("school_id", "bank_transaction_id");
