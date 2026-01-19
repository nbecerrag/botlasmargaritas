# 🔍 Guía de Diagnóstico de Conexión a Supabase

## Error Común: `getaddrinfo ENOENT db.xxx.supabase.co`

Este error indica que el sistema no puede resolver el hostname de Supabase. Aquí hay soluciones:

---

## ✅ Solución 1: Verificar la Connection String

1. Ve a tu proyecto en Supabase Dashboard
2. Settings → Database → Connection Pooling
3**USA LA CONNECTION STRING DE "CONNECTION POOLING" (NO la directa)**

**Formato correcto:**
```env
# INCORRECTO (Direct connection - puede fallar):
DATABASE_URL=postgresql://postgres:password@db.xxxx.supabase.co:5432/postgres

# CORRECTO (Connection pooling - más estable):
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

---

## ✅ Solución 2: Usar la API REST de Supabase (Alternativa)

Si la conexión PostgreSQL directa no funciona, podemos usar la API REST de Supabase:

```bash
npm install @supabase/supabase-js
```

Luego en `db.js`:
```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

// Ejemplo de uso:
const { data, error } = await supabase
    .from('reservas')
    .select('*')
    .eq('wa_id', wa_id);
```

---

## ✅ Solución 3: Verificar Configuración de Red

1. **Ping al servidor:**
   ```bash
   ping db.mmsvtxgajnwsnwkppuuu.supabase.co
   ```

2. **Verificar DNS:**
   ```bash
   nslookup db.mmsvtxgajnwsnwkppuuu.supabase.co
   ```

3. **Firewall/Antivirus**: Asegúrate de que no esté bloqueando conexiones salientes al puerto 5432/6543

---

## 🔧 Próximos Pasos Recomendados

### Opción A: Connection Pooling (Más fácil)
1. Copia la connection string de **"Connection Pooling"** en Supabase
2. Reemplázala en tu `.env`
3. Reinicia el bot

### Opción B: Supabase Client (Más estable)
1. Instalamos `@supabase/supabase-js`
2. Migramos `db.js` para usar el cliente oficial
3. Funciona 100% con REST API

**¿Cuál prefieres que implementemos?**
