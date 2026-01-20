-- Script para limpiar nombres inválidos de reservas EN_PROCESO
-- Ejecutar en Supabase SQL Editor

-- Ver reservas con nombres inválidos
SELECT id, wa_id, nombre, estado_pago, created_at 
FROM reservas 
WHERE estado_pago = 'EN_PROCESO' 
  AND (nombre IN ('Hola', 'hola', 'Hi', 'hi', 'Buenos', 'buenos', 'Buenas', 'buenas')
       OR LENGTH(nombre) <= 4);

-- Limpiar nombres inválidos (poner como NULL)
UPDATE reservas
SET nombre = NULL
WHERE estado_pago = 'EN_PROCESO' 
  AND (nombre IN ('Hola', 'hola', 'Hi', 'hi', 'Buenos', 'buenos', 'Buenas', 'buenas')
       OR LENGTH(nombre) <= 4);

-- Verificar el cambio
SELECT COUNT(*) as nombres_limpiados
FROM reservas 
WHERE estado_pago = 'EN_PROCESO' AND nombre IS NULL;
