# 🔄 Sistema de Múltiples Reservas - Las Margaritas

## 🎯 Problema Resuelto

**Antes**: Si un cliente reservaba dos veces en días distintos, se creaba confusión porque el bot intentaba actualizar la misma fila de la base de datos.

**Ahora**: Cada cliente puede tener múltiples reservas en diferentes fechas, y el bot siempre trabaja con la reserva activa actual (EN_PROCESO).

---

## 📊 Estados de Reserva

### 1. **EN_PROCESO** (Estado Inicial)
- Se asigna cuando el cliente inicia una nueva conversación
- Es la reserva "activa" que se está configurando
- Solo puede haber UNA reserva EN_PROCESO por cliente

### 2. **pendiente** (Esperando Confirmación)
- Se asigna cuando el cliente envía el comprobante de pago
- El admin aún no ha revisado el pago

### 3. **confirmado** (Aprobada por Admin)
- El admin aprobó el pago
- La reserva está finalizada y archivada
- Ya no se puede modificar

### 4. **rechazado** (Rechazada por Admin)
- El admin rechazó el pago
- La reserva está finalizada
- Se puede iniciar una nueva reserva EN_PROCESO

---

## 🔄 Flujo de Estados

```
NUEVO CLIENTE
    ↓
[EN_PROCESO] ← El bot trabaja aquí
    ↓ (Cliente envía comprobante)
[pendiente] ← Esperando admin
    ↓
    ├→ [confirmado] ← Reserva completada ✅
    │      ↓
    │   (Cliente puede reservar otra vez)
    │      ↓
    │   [EN_PROCESO] ← Nueva reserva
    │
    └→ [rechazado] ← Pago rechazado ❌
           ↓
       (Cliente puede reservar otra vez)
           ↓
       [EN_PROCESO] ← Nueva reserva
```

---

## 🧠 Lógica Inteligente

### Función: `createOrGetReserva(wa_id)`

**Antes:**
```javascript
// Buscaba CUALQUIER reserva del cliente
SELECT * FROM reservas WHERE wa_id = $1
// ❌ Problema: Si ya tenía una confirmada, no creaba nueva
```

**Ahora:**
```javascript
// Busca SOLO reservas EN_PROCESO
SELECT * FROM reservas 
WHERE wa_id = $1 AND estado_pago = 'EN_PROCESO'
ORDER BY created_at DESC LIMIT 1
// ✅ Si no hay EN_PROCESO, crea una nueva
```

### Función: `updateReserva(wa_id, data)`

**Protección crítica:**
```javascript
// Solo actualiza EN_PROCESO, pendiente o enviado
WHERE wa_id = $1 
  AND estado_pago IN ('EN_PROCESO', 'pendiente', 'enviado')
// ✅ NO toca reservas confirmadas/rechazadas
```

---

## 📝 Ejemplo Real

**Escenario:**
1. Juan reserva para el viernes 20 de enero
2. El admin confirma su reserva
3. Juan quiere reservar otra vez para el sábado 28 de enero

**Base de datos:**

| id | wa_id | fecha | estado_pago | created_at |
|----|-------|-------|-------------|------------|
| 1  | 57321 | 2026-01-20 | confirmado | 2026-01-18 |
| 2  | 57321 | 2026-01-28 | EN_PROCESO | 2026-01-25 |

**Consultas:**

```javascript
// Obtener reserva activa (la nueva)
getReserva("57321") 
// → Devuelve id:2 (EN_PROCESO)

// Obtener historial completo
getAllReservasByClient("57321")
// → Devuelve [id:2, id:1] (ambas)
```

---

## ✅ Ventajas

1. **Sin Conflictos**: Cada conversación trabaja con su propia reserva EN_PROCESO
2. **Historial Completo**: Todas las reservas anteriores se conservan
3. **Seguridad**: Las reservas confirmadas nunca se modifican accidentalmente
4. **Múltiples Reservas**: Un cliente puede reservar todas las veces que quiera

---

## 🔧 Actualización del Schema

**IMPORTANTE**: Debes ejecutar esta query en Supabase si ya creaste la tabla anteriormente:

```sql
-- Actualizar tabla existente para agregar EN_PROCESO
ALTER TABLE reservas 
ALTER COLUMN estado_pago SET DEFAULT 'EN_PROCESO';

-- Opcional: Migrar reservas pendientes existentes
UPDATE reservas 
SET estado_pago = 'EN_PROCESO' 
WHERE estado_pago = 'pendiente' 
  AND created_at > NOW() - INTERVAL '24 hours';
```

Si aún NO has ejecutado `schema.sql`, simplemente ejecútalo tal como está (ya incluye EN_PROCESO).

---

## 📊 Consultas Útiles

```sql
-- Ver todas las reservas EN_PROCESO (en configuración)
SELECT * FROM reservas WHERE estado_pago = 'EN_PROCESO';

-- Ver historial de un cliente específico
SELECT * FROM reservas WHERE wa_id = '573212450883' ORDER BY created_at DESC;

-- Ver reservas confirmadas de hoy en adelante
SELECT * FROM reservas 
WHERE estado_pago = 'confirmado' 
  AND fecha >= CURRENT_DATE
ORDER BY fecha, hora;

-- Estadísticas por estado
SELECT estado_pago, COUNT(*) as total 
FROM reservas 
GROUP BY estado_pago;
```

---

## 🚀 Próximos Pasos

1. Ejecuta el `schema.sql` actualizado en Supabase
2. Si ya tenías datos, ejecuta las queries de migración
3. El bot automáticamente usará el nuevo sistema
4. Prueba reservando dos veces con el mismo número

¡El sistema ya está preparado para manejar múltiples reservas sin cruzar cables! 🌮
