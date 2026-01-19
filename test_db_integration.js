// Script de Prueba - Integración Base de Datos PostgreSQL/Supabase
// Ejecutar: node test_db_integration.js

require('dotenv').config();
const db = require('./db');

async function testIntegration() {
    console.log('🧪 INICIANDO TEST DE INTEGRACIÓN DE BASE DE DATOS\n');
    console.log('='.repeat(60));

    try {
        // 1. Test de Conexión
        console.log('\n📡 TEST 1: Verificando conexión a PostgreSQL/Supabase...');
        const connected = await db.testConnection();
        if (!connected) {
            console.error('❌ FALLÓ: No se pudo conectar a la base de datos');
            console.log('\n⚠️ ACCIÓN REQUERIDA: Verifica que DATABASE_URL esté configurado correctamente en .env');
            return;
        }

        // 2. Test de Creación de Reserva
        console.log('\n📝 TEST 2: Creando reserva EN_PROCESO...');
        const testWaId = '573999999999'; // Número de prueba
        const reserva = await db.createOrGetReserva(testWaId);
        console.log('✅ Reserva creada/recuperada:', {
            id: reserva?.id,
            wa_id: reserva?.wa_id,
            estado_pago: reserva?.estado_pago
        });

        // 3. Test de Actualización de Nombre
        console.log('\n👤 TEST 3: Guardando nombre del cliente...');
        await db.updateReserva(testWaId, { nombre: 'Juan Pérez TEST' });
        const reservaConNombre = await db.getReserva(testWaId);
        console.log('✅ Nombre guardado:', reservaConNombre?.nombre);

        // 4. Test de Actualización de Tipo
        console.log('\n🎨 TEST 4: Guardando tipo de reserva...');
        await db.updateReserva(testWaId, { tipo: 'Decoración' });
        const reservaConTipo = await db.getReserva(testWaId);
        console.log('✅ Tipo guardado:', reservaConTipo?.tipo);

        // 5. Test de Datos Logísticos
        console.log('\n📊 TEST 5: Guardando datos logísticos (personas, fecha, hora)...');
        await db.updateReserva(testWaId, {
            personas: 4,
            fecha: '2026-01-25',
            hora: '19:30:00'
        });
        const reservaCompleta = await db.getReserva(testWaId);
        console.log('✅ Datos guardados:', {
            personas: reservaCompleta?.personas,
            fecha: reservaCompleta?.fecha,
            hora: reservaCompleta?.hora
        });

        // 6. Test de Estado: Enviado
        console.log('\n📤 TEST 6: Actualizando estado a "enviado"...');
        await db.updateReserva(testWaId, { estado_pago: 'enviado' });
        const reservaEnviado = await db.getReserva(testWaId);
        console.log('✅ Estado actualizado:', reservaEnviado?.estado_pago);

        // 7. Test de Estado: Confirmado
        console.log('\n✅ TEST 7: Actualizando estado a "confirmado"...');
        await db.updateReserva(testWaId, { estado_pago: 'confirmado' });
        const reservaConfirmada = await db.getReserva(testWaId);
        console.log('✅ Estado actualizado:', reservaConfirmada?.estado_pago);

        // 8. Test de Múltiples Reservas
        console.log('\n🔄 TEST 8: Creando nueva reserva EN_PROCESO (la anterior se confirmó)...');
        const nuevaReserva = await db.createOrGetReserva(testWaId);
        console.log('✅ Nueva reserva creada:', {
            id: nuevaReserva?.id,
            estado_pago: nuevaReserva?.estado_pago,
            es_diferente: nuevaReserva?.id !== reserva?.id
        });

        // 9. Test de Historial de Reservas
        console.log('\n📜 TEST 9: Recuperando historial completo del cliente...');
        const historial = await db.getAllReservasByClient(testWaId);
        console.log(`✅ Total de reservas en historial: ${historial?.length || 0}`);
        historial?.forEach((r, i) => {
            console.log(`   ${i + 1}. ID: ${r.id} | Estado: ${r.estado_pago} | Nombre: ${r.nombre || '(vacío)'}`);
        });

        // 10. Test de Búsqueda por Estado
        console.log('\n🔍 TEST 10: Buscando reservas EN_PROCESO...');
        const reservasEnProceso = await db.getReservasByEstado('EN_PROCESO');
        console.log(`✅ Reservas EN_PROCESO encontradas: ${reservasEnProceso?.length || 0}`);

        console.log('\n' + '='.repeat(60));
        console.log('🎉 TODOS LOS TESTS COMPLETADOS EXITOSAMENTE');
        console.log('\n✅ La integración de base de datos está funcionando correctamente');
        console.log('✅ Puedes proceder a ejecutar el bot con: node index.js');

    } catch (error) {
        console.error('\n❌ ERROR EN LOS TESTS:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await db.closePool();
        console.log('\n🔌 Conexión cerrada');
    }
}

// Ejecutar tests
testIntegration();
