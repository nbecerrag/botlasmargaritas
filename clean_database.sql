-- LIMPIEZA TOTAL DE BASE DE DATOS
-- Este script elimina TODOS los registros de la tabla reservas
-- ⚠️ ADVERTENCIA: Esta acción NO es reversible

-- Eliminar todos los registros
DELETE FROM reservas;

-- Reiniciar el contador de ID (autoincrement) a 1
ALTER SEQUENCE reservas_id_seq RESTART WITH 1;

-- Verificar que la tabla quedó vacía
SELECT COUNT(*) as total_registros FROM reservas;
-- Resultado esperado: 0
