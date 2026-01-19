// Script de prueba de persistencia en tiempo real
// Ejecutar: node test_persistence.js

require('dotenv').config();
const db = require('./db');

async function testPersistence() {
    console.log('🧪 PRUEBA DE PERSISTENCIA EN TIEMPO REAL\n');

    const testWaId = '573212450883_TEST'; // Número de prueba

    try {
        // 1. Verificar conexión
        console.log('1️⃣ Verificando conexión a Supabase...');
        const connected = await db.testConnection();
        if (!connected) {
            console.error('❌ No se pudo conectar a la base de datos');
            return;
        }

        // 2. Limpiar datos de prueba anteriores
        console.log('\n2️⃣ Limpiando datos de prueba anteriores...');
        await db.pool.query('DELETE FROM reservas WHERE wa_id = $1', [testWaId]);

        // 3. Crear reserva EN_PROCESO
        console.log('\n3️⃣ Creando reserva EN_PROCESO...');
        const reserva = await db.createOrGetReserva(testWaId);
        console.log(`   ✅ Reserva creada con ID: ${reserva.id}`);
        console.log(`   - Estado inicial: ${reserva.estado_pago}`);
        console.log(`   - Nombre inicial: ${reserva.nombre || '(vacío)'}`);

        // 4. Guardar nombre
        console.log('\n4️⃣ Guardando nombre del cliente...');
        await db.updateReserva(testWaId, { nombre: 'Juan Pérez TEST' });

        // 5. Verificar que se guardó
        console.log('\n5️⃣ Verificando que el nombre se guardó...');
        const verificacion1 = await db.getReserva(testWaId);
        console.log(`   ✅ Nombre recuperado: "${verificacion1.nombre}"`);

        if (!verificacion1.nombre) {
            console.error('   ❌ ERROR: El nombre está vacío!');
        } else {
            console.log('   ✅ Nombre guardado correctamente');
        }

        // 6. Guardar datos de reserva completos
        console.log('\n6️⃣ Guardando datos completos de reserva...');
        await db.updateReserva(testWaId, {
            fecha: '2026-01-25',
            hora: '19:30:00',
            personas: 4,
            tipo: 'Decoración'
        });

        // 7. Verificar datos completos
        console.log('\n7️⃣ Verificando datos completos...');
        const verificacion2 = await db.getReserva(testWaId);
        console.log(`   - Nombre: "${verificacion2.nombre}"`);
        console.log(`   - Fecha: ${verificacion2.fecha}`);
        console.log(`   - Hora: ${verificacion2.hora}`);
        console.log(`   - Personas: ${verificacion2.personas}`);
        console.log(`   - Tipo: ${verificacion2.tipo}`);
        console.log(`   - Estado: ${verificacion2.estado_pago}`);

        // 8. Simular confirmación de pago
        console.log('\n8️⃣ Simulando confirmación de pago...');
        await db.updateReserva(testWaId, { estado_pago: 'confirmado' });

        // 9. Verificar que ya no se puede actualizar (está confirmado)
        console.log('\n9️⃣ Intentando actualizar reserva confirmada (NO debería funcionar)...');
        const resultado = await db.updateReserva(testWaId, { nombre: 'OTRO NOMBRE' });
        if (!resultado) {
            console.log('   ✅ Correcto: No se puede actualizar reserva confirmada');
        } else {
            console.error('   ❌ ERROR: Se actualizó una reserva confirmada!');
        }

        // 10. Crear nueva reserva EN_PROCESO para el mismo cliente
        console.log('\n🔟 Creando nueva reserva EN_PROCESO para el mismo cliente...');
        const nuevaReserva = await db.createOrGetReserva(testWaId);
        console.log(`   ✅ Nueva reserva creada con ID: ${nuevaReserva.id}`);
        console.log(`   - Es diferente a la anterior: ${nuevaReserva.id !== reserva.id ? 'SÍ ✅' : 'NO ❌'}`);

        // 11. Ver historial completo
        console.log('\n1️⃣1️⃣ Historial completo del cliente:');
        const historial = await db.getAllReservasByClient(testWaId);
        console.log(`   Total de reservas: ${historial.length}`);
        historial.forEach((r, i) => {
            console.log(`   ${i + 1}. ID:${r.id} | Estado:${r.estado_pago} | Nombre:${r.nombre || '(vacío)'}`);
        });

        // 12. Limpiar datos de prueba
        console.log('\n1️⃣2️⃣ Limpiando datos de prueba...');
        await db.pool.query('DELETE FROM reservas WHERE wa_id = $1', [testWaId]);
        console.log('   ✅ Datos de prueba eliminados');

        console.log('\n✅ PRUEBA COMPLETADA EXITOSAMENTE\n');

    } catch (error) {
        console.error('\n❌ ERROR EN LA PRUEBA:', error.message);
        console.error(error);
    } finally {
        await db.closePool();
        process.exit(0);
    }
}

testPersistence();
