-- Track when the last daily overdue reminder was sent to the vet for each consultation
ALTER TABLE consultations ADD COLUMN notif_overdue_last_sent INTEGER DEFAULT 0;
