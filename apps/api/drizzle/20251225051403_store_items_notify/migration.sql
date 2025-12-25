CREATE OR REPLACE FUNCTION notify_store_items_change()
RETURNS trigger AS $$
DECLARE
  payload json;
BEGIN
  payload = json_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'id', COALESCE(NEW.id, OLD.id)
  );
  PERFORM pg_notify('store_items_updates', payload::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS store_items_notify ON store_items;
--> statement-breakpoint
CREATE TRIGGER store_items_notify
AFTER INSERT OR UPDATE OR DELETE
ON store_items
FOR EACH ROW
EXECUTE FUNCTION notify_store_items_change();
