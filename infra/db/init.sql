DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'prometheus') THEN
    CREATE ROLE prometheus WITH LOGIN PASSWORD 'secret';
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE prometheus TO prometheus;
