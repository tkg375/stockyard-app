-- Prevent double-booking the same time slot
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_date_time
  ON consultations(date, time)
  WHERE status NOT IN ('cancelled');
