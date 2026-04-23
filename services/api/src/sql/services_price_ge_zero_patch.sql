-- Allow free (0) service prices. Safe to run multiple times.
ALTER TABLE services DROP CONSTRAINT IF EXISTS services_price_check;
ALTER TABLE services
  ADD CONSTRAINT services_price_check CHECK (price >= 0);
