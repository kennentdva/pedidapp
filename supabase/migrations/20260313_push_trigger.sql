-- Ejecutar esto en el SQL Editor de Supabase
-- Este trigger llama a la Edge Function send-push cada vez que llega un nuevo pedido

-- 1. Habilitar pg_net si no está habilitado
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Crear la función que dispara el push
CREATE OR REPLACE FUNCTION notify_new_pedido()
RETURNS trigger AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://hvhxdsukldgezqwtlwcc.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := row_to_json(NEW)::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Crear el trigger en la tabla pedidos
DROP TRIGGER IF EXISTS on_pedido_insert ON pedidos;
CREATE TRIGGER on_pedido_insert
  AFTER INSERT ON pedidos
  FOR EACH ROW EXECUTE FUNCTION notify_new_pedido();
