-- Nowe statusy procesu zapisu: po uzupelnieniu danych rodzic czeka na generowanie umowy przez szkole.
ALTER TYPE "enrollment_status" ADD VALUE 'AWAITING_CONTRACT';
ALTER TYPE "enrollment_status" ADD VALUE 'CONTRACT_READY';
