CREATE TABLE IF NOT EXISTS store_items (
  id serial PRIMARY KEY,
  name text NOT NULL,
  price numeric(10, 2) NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id serial PRIMARY KEY,
  author text NOT NULL,
  body text NOT NULL,
  created_at timestamp without time zone DEFAULT now()
);
