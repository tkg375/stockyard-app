-- Accounts no longer let customers save pets, and there's no customer
-- login/password-reset flow anymore (only vets/admin log in, via a fixed
-- password with no reset flow). Both tables are fully dead: nothing in the
-- app writes or reads them anymore.
--
-- consultations.pet_id is left in place (nullable, unused going forward) —
-- dropping it would require another full table rebuild, and it's harmless
-- dead weight rather than a correctness risk.

PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS pets;
DROP TABLE IF EXISTS password_reset_tokens;

PRAGMA foreign_keys=ON;
