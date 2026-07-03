-- The vet-side "write prescription" feature (drug search, PDF generation,
-- fax/email to pharmacy) was retired at the vet's request — never used in
-- practice. Pharmacy info collection/display on consultations is unrelated
-- and stays in place.

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS prescriptions;

PRAGMA foreign_keys=ON;
