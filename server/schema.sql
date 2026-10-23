CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer', 'technician', 'shop', 'administrator')),
  location TEXT,
  bio TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  suspended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('technician', 'shop', 'seller')),
  location TEXT NOT NULL,
  text TEXT NOT NULL,
  services TEXT[] NOT NULL DEFAULT '{}',
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  rating NUMERIC(2,1) NOT NULL DEFAULT 0,
  availability TEXT,
  moderation_status TEXT NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES users(id) ON DELETE SET NULL,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'declined', 'completed', 'cancelled')),
  preferred_date DATE,
  preferred_time TIME,
  confirmed_date DATE,
  confirmed_time TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  request_id UUID NOT NULL UNIQUE REFERENCES service_requests(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS listing_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS listings_owner_idx ON listings(owner_id);
CREATE INDEX IF NOT EXISTS requests_customer_idx ON service_requests(customer_id);
CREATE INDEX IF NOT EXISTS requests_provider_idx ON service_requests(provider_id);
CREATE INDEX IF NOT EXISTS messages_request_idx ON messages(request_id, created_at);
CREATE INDEX IF NOT EXISTS reviews_listing_idx ON reviews(listing_id, created_at);
CREATE INDEX IF NOT EXISTS listing_reports_status_idx ON listing_reports(status, created_at);
CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at);

INSERT INTO listings (id, name, type, location, text, services, verified, rating, availability, moderation_status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Maya Tech Care', 'technician', 'Central district', 'Laptop diagnostics, phone repairs, and patient explanations.', ARRAY['Laptop repair', 'Phone repair', 'Diagnostics'], TRUE, 4.9, 'Weekdays · 09:00–17:00', 'approved'),
  ('00000000-0000-0000-0000-000000000002', 'Circuit Corner', 'shop', 'Market street', 'Accessories, refurbished devices, and everyday essentials.', ARRAY['Accessories', 'Refurbished devices', 'Trade-ins'], TRUE, 4.7, 'Mon–Sat · 10:00–18:00', 'approved'),
  ('00000000-0000-0000-0000-000000000003', 'Sam''s Smart Finds', 'seller', 'West side', 'Carefully tested laptops and phones looking for a second life.', ARRAY['Used laptops', 'Used phones', 'Device testing'], FALSE, 4.6, 'By appointment', 'approved')
ON CONFLICT (id) DO NOTHING;
