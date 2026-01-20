-- MIGRACIÓN: Agregar columna para rastreo de progreso del usuario
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columna ultimo_paso
ALTER TABLE reservas 
ADD COLUMN IF NOT EXISTS ultimo_paso VARCHAR(50) DEFAULT 'inicio';

-- 2. Para registros existentes, establecer valor por defecto
UPDATE reservas 
SET ultimo_paso = 'inicio' 
WHERE ultimo_paso IS NULL;

-- 3. Comentario sobre valores posibles
COMMENT ON COLUMN reservas.ultimo_paso IS 
'Valores posibles: inicio, viendo_menu, viendo_ubicacion, dando_datos, esperando_pago';

-- 4. Verificar que la columna se creó correctamente
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'reservas' AND column_name = 'ultimo_paso';
