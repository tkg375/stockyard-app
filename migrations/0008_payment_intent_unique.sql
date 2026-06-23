-- Prevent the same PaymentIntent from being claimed by two concurrent booking requests
CREATE UNIQUE INDEX IF NOT EXISTS idx_consultations_payment_intent
  ON consultations(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
