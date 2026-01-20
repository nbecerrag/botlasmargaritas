-- SCRIPT DE CORRECCIÓN: Arreglar tabla reservas
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar estructura actual
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'reservas'
ORDER BY ordinal_position;

-- 2. Si id está NULL, necesitamos recrear la tabla con el schema correcto
-- OPCIÓN A: Si la tabla tiene pocos datos de prueba, recrearla

DROP TABLE IF EXISTS reservas CASCADE;

CREATE TABLE reservas (
  id SERIAL PRIMARY KEY,
  wa_id VARCHAR(20) UNIQUE NOT NULL,
  nombre VARCHAR(255),
  fecha DATE,
  hora TIME,
  personas INTEGER,
  tipo_reserva VARCHAR(50), -- 'estandar' o 'decoracion'
  estado_pago VARCHAR(50) DEFAULT 'EN_PROCESO',
  estado_reserva VARCHAR(50) DEFAULT 'EN_PROCESO',
  ultimo_paso VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX idx_reservas_wa_id ON reservas(wa_id);
CREATE INDEX idx_reservas_estado_pago ON reservas(estado_pago);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_reservas_updated_at ON reservas;

CREATE TRIGGER update_reservas_updated_at BEFORE UPDATE
ON reservas FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Verificar que se creó correctamente
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'reservas'
ORDER BY ordinal_position;
