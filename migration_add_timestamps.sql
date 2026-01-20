-- MIGRACIÓN: Agregar columnas de timestamp faltantes
-- Ejecutar en Supabase SQL Editor

-- 1. Agregar columnas si no existen
ALTER TABLE reservas 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- 2. Para registros existentes, actualizar con fecha/hora actual
UPDATE reservas 
SET created_at = NOW(), updated_at = NOW() 
WHERE created_at IS NULL OR updated_at IS NULL;

-- 3. Crear función para trigger (si no existe)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 4. Eliminar trigger existente si ya existe (para re-ejecución)
DROP TRIGGER IF EXISTS update_reservas_updated_at ON reservas;

-- 5. Crear trigger para actualizar updated_at automáticamente
CREATE TRIGGER update_reservas_updated_at 
BEFORE UPDATE ON reservas 
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 6. Verificar que todo está correcto
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'reservas' 
ORDER BY ordinal_position;
