const { Pool } = require('pg');

// Configuración del pool de conexiones PostgreSQL
const connectionConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('supabase')
        ? { rejectUnauthorized: false }
        : false,
    max: 20, // Máximo de conexiones en el pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Aumentado a 10 segundos
};

console.log('🔧 Configuración de DB:', {
    ssl: connectionConfig.ssl ? 'Activado' : 'Desactivado',
    connectionString: process.env.DATABASE_URL ? 'Configurado ✅' : 'NO CONFIGURADO ❌'
});

const pool = new Pool(connectionConfig);

// Evento de error del pool
pool.on('error', (err) => {
    console.error('❌ Error inesperado en pool de PostgreSQL:', err);
});

/**
 * Crear o recuperar una reserva ACTIVA (EN_PROCESO) por WhatsApp ID
 * Esto permite que un cliente tenga múltiples reservas en diferentes fechas
 * Solo trabaja con la reserva EN_PROCESO actual, ignorando las confirmadas/rechazadas
 * @param {string} wa_id - ID de WhatsApp del cliente
 * @returns {Promise<Object>} - Datos de la reserva activa
 */
async function createOrGetReserva(wa_id) {
    try {
        // 1. Buscar reservas ACTIVAS (EN_PROCESO, pendiente, enviado) para este cliente
        const activeQuery = `
            SELECT * FROM reservas 
            WHERE wa_id = $1 
              AND estado_pago IN ('EN_PROCESO', 'pendiente', 'enviado')
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const activeResult = await pool.query(activeQuery, [wa_id]);

        if (activeResult.rows.length > 0) {
            console.log(`📋 Reserva ACTIVA encontrada para ${wa_id} (estado: ${activeResult.rows[0].estado_pago})`);
            return activeResult.rows[0];
        }

        // 2. Si no existe reserva ACTIVA, crear una nueva
        // (Ignoramos reservas anteriores confirmadas/rechazadas)
        const insertQuery = `
            INSERT INTO reservas (wa_id, estado_pago)
            VALUES ($1, 'EN_PROCESO')
            RETURNING *
        `;
        const insertResult = await pool.query(insertQuery, [wa_id]);
        console.log(`✅ Nueva reserva EN_PROCESO creada para ${wa_id}`);
        return insertResult.rows[0];

    } catch (error) {
        console.error('❌ Error en createOrGetReserva:', error.message);
        // No lanzar error - permitir que el bot continúe funcionando
        return null;
    }
}

/**
 * Actualizar datos de una reserva ACTIVA (EN_PROCESO)
 * Solo actualiza la reserva EN_PROCESO del cliente, no toca las finalizadas
 * @param {string} wa_id - ID de WhatsApp del cliente
 * @param {Object} data - Datos a actualizar (nombre, fecha, hora, personas, tipo, estado_pago)
 * @returns {Promise<Object>} - Reserva actualizada
 */
async function updateReserva(wa_id, data) {
    try {
        // Asegurar que existe una reserva EN_PROCESO primero
        await createOrGetReserva(wa_id);

        const allowedFields = ['nombre', 'fecha', 'hora', 'personas', 'tipo_reserva', 'estado_pago', 'ultimo_paso'];
        const updates = [];
        const values = [];
        let paramIndex = 1;

        // Construir query dinámica solo con campos permitidos
        for (const [key, value] of Object.entries(data)) {
            if (allowedFields.includes(key) && value !== undefined && value !== null) {
                updates.push(`${key} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        }

        if (updates.length === 0) {
            console.warn('⚠️ No hay campos válidos para actualizar');
            return null;
        }

        // Añadir wa_id al final de los valores
        values.push(wa_id);

        // CRÍTICO: Solo actualizar reservas EN_PROCESO o pendiente/enviado
        // NO actualizar reservas confirmadas/rechazadas
        const query = `
            UPDATE reservas
            SET ${updates.join(', ')}
            WHERE wa_id = $${paramIndex} 
              AND estado_pago IN ('EN_PROCESO', 'pendiente', 'enviado')
            RETURNING *
        `;

        const result = await pool.query(query, values);

        if (result.rows.length > 0) {
            console.log(`✅ Reserva EN_PROCESO actualizada para ${wa_id}:`, Object.keys(data).join(', '));
            return result.rows[0];
        } else {
            console.warn(`⚠️ No se encontró reserva EN_PROCESO para actualizar (${wa_id})`);
            return null;
        }

    } catch (error) {
        console.error('❌ Error en updateReserva:', error.message);
        return null;
    }
}

/**
 * Obtener datos de la reserva ACTIVA (EN_PROCESO) de un cliente
 * @param {string} wa_id - ID de WhatsApp del cliente
 * @returns {Promise<Object>} - Datos de la reserva activa
 */
async function getReserva(wa_id) {
    try {
        const query = `
            SELECT * FROM reservas 
            WHERE wa_id = $1 AND estado_pago = 'EN_PROCESO'
            ORDER BY created_at DESC
            LIMIT 1
        `;
        const result = await pool.query(query, [wa_id]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Error en getReserva:', error.message);
        return null;
    }
}

/**
 * Obtener TODAS las reservas de un cliente (historial completo)
 * @param {string} wa_id - ID de WhatsApp del cliente
 * @returns {Promise<Array>} - Lista de todas las reservas del cliente
 */
async function getAllReservasByClient(wa_id) {
    try {
        const query = 'SELECT * FROM reservas WHERE wa_id = $1 ORDER BY created_at DESC';
        const result = await pool.query(query, [wa_id]);
        return result.rows;
    } catch (error) {
        console.error('❌ Error en getAllReservasByClient:', error.message);
        return [];
    }
}

/**
 * Obtener todas las reservas con un estado específico
 * @param {string} estado - Estado de pago ('pendiente', 'enviado', 'confirmado', 'rechazado')
 * @returns {Promise<Array>} - Lista de reservas
 */
async function getReservasByEstado(estado) {
    try {
        const query = 'SELECT * FROM reservas WHERE estado_pago = $1 ORDER BY created_at DESC';
        const result = await pool.query(query, [estado]);
        return result.rows;
    } catch (error) {
        console.error('❌ Error en getReservasByEstado:', error.message);
        return [];
    }
}

/**
 * Verificar conexión a la base de datos
 * @returns {Promise<boolean>} - true si la conexión es exitosa
 */
async function testConnection() {
    try {
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Conexión a PostgreSQL exitosa:', result.rows[0].now);
        return true;
    } catch (error) {
        console.error('❌ Error conectando a PostgreSQL:', error.message);
        return false;
    }
}

/**
 * Cerrar el pool de conexiones (para shutdown limpio)
 */
async function closePool() {
    await pool.end();
    console.log('🔌 Pool de PostgreSQL cerrado');
}

module.exports = {
    createOrGetReserva,
    updateReserva,
    getReserva,
    getAllReservasByClient,
    getReservasByEstado,
    testConnection,
    closePool,
    pool // Exportar para queries personalizadas si es necesario
};
