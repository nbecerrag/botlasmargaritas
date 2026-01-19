-- Las Margaritas - Tabla de Reservas
-- Ejecutar este script en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS reservas (
  id SERIAL PRIMARY KEY,
  wa_id VARCHAR(20) UNIQUE NOT NULL,
  nombre VARCHAR(255),
  fecha DATE,
  hora TIME,
  personas INTEGER,
  tipo VARCHAR(50), -- 'Estándar' o 'Decoración'
  estado_pago VARCHAR(50) DEFAULT 'EN_PROCESO', -- 'EN_PROCESO', 'pendiente', 'enviado', 'confirmado', 'rechazado'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índice para búsquedas rápidas por WhatsApp ID
CREATE INDEX IF NOT EXISTS idx_reservas_wa_id ON reservas(wa_id);

-- Índice para búsquedas por estado de pago
CREATE INDEX IF NOT EXISTS idx_reservas_estado_pago ON reservas(estado_pago);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Eliminar trigger existente si ya existe (para re-ejecución)
DROP TRIGGER IF EXISTS update_reservas_updated_at ON reservas;

CREATE TRIGGER update_reservas_updated_at BEFORE UPDATE
ON reservas FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
