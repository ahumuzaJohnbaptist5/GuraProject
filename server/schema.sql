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
  image_urls TEXT[] NOT NULL DEFAULT '{}',
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

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
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
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at);

ALTER TABLE listings ADD COLUMN IF NOT EXISTS image_urls TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_images TEXT[] NOT NULL DEFAULT '{}';

DELETE FROM listings
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003'
);


-- Marketplace products and orders: prices and inventory are authoritative on the server.
CREATE TABLE IF NOT EXISTS marketplace_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  price_ugx INTEGER NOT NULL CHECK (price_ugx >= 0),
  available_units INTEGER NOT NULL DEFAULT 0 CHECK (available_units >= 0),
  image_url TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'new',
  compatibility TEXT NOT NULL DEFAULT '',
  specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_demo BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('demo','pending_payment','paid','failed','cancelled')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('mtn','airtel','card')),
  phone_number TEXT,
  amount_ugx INTEGER NOT NULL CHECK (amount_ugx > 0),
  payment_tracking_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS marketplace_order_items (
  order_id UUID NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES marketplace_products(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  price_ugx INTEGER NOT NULL CHECK (price_ugx >= 0),
  product_name TEXT NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE INDEX IF NOT EXISTS marketplace_orders_customer_idx ON marketplace_orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_products_category_idx ON marketplace_products(category, active);

-- Demo catalog is for design/testing only: never initiate live payment for demo products.
INSERT INTO marketplace_products
  (id,sku,name,description,category,price_ugx,available_units,image_url,condition,compatibility,specifications,is_demo)
VALUES
('11111111-1111-4111-8111-111111111101','GURA-DEMO-SCREEN','14-inch Laptop Replacement Display','Illustrative Full HD laptop panel. Confirm display size, connector position, pin count and resolution against the original part before buying.','Screens & Displays',180000,12,'https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=900&q=85','New','Verify 14-inch panel and connector', '{"Display size":"14 inch","Resolution":"Full HD (illustrative)","Connector":"Check exact laptop model"}'::jsonb,TRUE),
('11111111-1111-4111-8111-111111111102','GURA-DEMO-RAM','8GB DDR4 Laptop RAM','Example 8GB DDR4 SODIMM memory module. Check generation, speed, and motherboard compatibility.','RAM & Memory',85000,24,'https://images.unsplash.com/photo-1541029071515-84cc54f84dc5?auto=format&fit=crop&w=900&q=85','Refurbished','DDR4 laptops (compatibility varies)', '{"Capacity":"8 GB","Memory type":"DDR4","Form factor":"SODIMM"}'::jsonb,TRUE),
('11111111-1111-4111-8111-111111111103','GURA-DEMO-SSD','512GB Solid-State Drive','Example high-speed storage upgrade. Check whether your system supports SATA or NVMe before choosing a drive.','SSDs & Storage',145000,16,'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?auto=format&fit=crop&w=900&q=85','New','Confirm SATA or NVMe interface', '{"Capacity":"512 GB","Interface":"Check before purchase","Category":"Solid-state storage"}'::jsonb,TRUE),
('11111111-1111-4111-8111-111111111104','GURA-DEMO-POWER','Laptop Power Adapter','Illustrative universal laptop adapter listing. The voltage, amperage and connector must match your device.','Chargers & Power',65000,30,'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=85','New','Match voltage and connector', '{"Accessory":"Power adapter","Input":"Varies by model","Connector":"Confirm with seller"}'::jsonb,TRUE)
ON CONFLICT (id) DO NOTHING;
