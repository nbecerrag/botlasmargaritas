// Script temporal para limpiar la base de datos
require('dotenv').config();
const db = require('./db');

(async () => {
    try {
        console.log('🗑️  Limpiando base de datos...');

        // Eliminar todos los registros
        await db.pool.query('DELETE FROM reservas');
        console.log('✅ Registros eliminados');

        // Reiniciar secuencia de ID
        await db.pool.query("SELECT setval('reservas_id_seq', 0, false)");
        console.log('✅ Secuencia de ID reiniciada');

        // Verificar
        const result = await db.pool.query('SELECT COUNT(*) as total FROM reservas');
        console.log(`\n📊 Total de registros en la tabla: ${result.rows[0].total}`);

        await db.closePool();
        console.log('\n✅ Base de datos limpiada exitosamente');
        process.exit(0);
    } catch (e) {
        console.error('❌ Error:', e.message);
        process.exit(1);
    }
})();
