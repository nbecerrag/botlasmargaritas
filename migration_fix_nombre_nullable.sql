-- MIGRACIÓN: Remover restricción NOT NULL de la columna nombre
-- La columna nombre debe ser nullable porque las reservas se crean
-- primero sin datos y luego se van completando durante la conversación

-- Ejecutar en Supabase SQL Editor

-- 1. Hacer la columna nombre nullable
ALTER TABLE reservas 
ALTER COLUMN nombre DROP NOT NULL;

-- 2. Verificar el cambio
SELECT column_name, is_nullable, data_type 
FROM information_schema.columns 
WHERE table_name = 'reservas' AND column_name = 'nombre';

-- Resultado esperado: is_nullable = 'YES'
