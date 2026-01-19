// Test simple de conexión
require('dotenv').config();
const { Pool } = require('pg');

async function testSimple() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('🔍 Intentando conectar...');
        console.log('Connection String:', process.env.DATABASE_URL ?
            process.env.DATABASE_URL.substring(0, 30) + '...[OCULTO]' : 'NO CONFIGURADO');

        const client = await pool.connect();
        console.log('✅ Conexión exitosa!');

        const result = await client.query('SELECT NOW()');
        console.log('✅ Query exitosa:', result.rows[0]);

        client.release();
        await pool.end();

        console.log('\n🎉 TODO FUNCIONÓ CORRECTAMENTE');

    } catch (error) {
        console.error('\n❌ ERROR:', error.message);
        console.error('\nDetalles completos:');
        console.error(error);
        await pool.end();
    }
}

testSimple();
