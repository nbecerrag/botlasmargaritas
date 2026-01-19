# 🌵 Las Margaritas Bot - Guía de Despliegue en Producción

Bot de WhatsApp con IA para el restaurante "Las Margaritas", preparado para despliegue profesional en **Render + Supabase**.

## 📋 Requisitos Previos

- Node.js 16+ instalado
- Cuenta en [Supabase](https://supabase.com) (gratis)
- Cuenta en [Render](https://render.com) (gratis)
- Cuenta de Meta Business con WhatsApp API
- Cuenta de ElevenLabs para text-to-speech
- Cuenta de Google Cloud con Generative AI activado

---

## 🚀 Configuración Local

### 1. Instalar Dependencias

```bash
npm install
```

### 2. Configurar Variables de Entorno

Copia el archivo de ejemplo y rellena tus credenciales:

```bash
cp .env.example .env
```

Edita `.env` con tus valores reales:

```env
PORT=3001
API_KEY_GOOGLE=tu_api_key_de_google
WHATSAPP_TOKEN=tu_token_de_meta
VERIFY_TOKEN=hola
ELEVENLABS_API_KEY=tu_api_key_de_elevenlabs
ELEVENLABS_VOICE_ID=lRf3yb6jZby4fn3q3Q7M
ID_CARTA_REST=id_del_menu_pdf
ID_IMAGEN_PAGO=id_de_imagen_pago
ID_AUDIO_CONFIRMACION=id_audio_confirmacion
ADMIN_NUMBER=573212450883
DATABASE_URL=postgresql://user:password@host:port/database
```

### 3. Configurar Base de Datos en Supabase

1. **Crear proyecto** en [Supabase](https://supabase.com)
2. **Ir a SQL Editor** en el dashboard
3. **Ejecutar** el contenido de `schema.sql`:
   ```sql
   -- Copiar y pegar el contenido completo de schema.sql aquí
   ```
4. **Copiar la Connection String**:
   - Ve a Settings → Database
   - Copia la URI de conexión (Connection String)
   - Pégala en `.env` como `DATABASE_URL`

### 4. Probar Localmente

```bash
# Iniciar el bot
node index.js
```

Deberías ver:
```
✅ Conexión a PostgreSQL exitosa: [timestamp]
✅ Base de datos PostgreSQL lista
🌮 Bot Las Margaritas listo en puerto 3001.
```

---

## ☁️ Despliegue en Render

### 1. Preparar Repositorio Git

```bash
git init
git add .
git commit -m "Preparado para producción con env vars y database"
git branch -M main
git remote add origin https://github.com/tu-usuario/bot-las-margaritas.git
git push -u origin main
```

### 2. Crear Web Service en Render

1. Ve a [Render Dashboard](https://dashboard.render.com)
2. Click en **"New +"** → **"Web Service"**
3. Conecta tu repositorio de GitHub
4. Configuración:
   - **Name**: `bot-las-margaritas`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node index.js`
   - **Plan**: Free

### 3. Configurar Variables de Entorno en Render

En la sección **Environment**, añade TODAS las variables de tu `.env` local:

| Key | Value |
|-----|-------|
| `API_KEY_GOOGLE` | `AIzaSy...` |
| `WHATSAPP_TOKEN` | `EAAaoh...` |
| `VERIFY_TOKEN` | `hola` |
| `ELEVENLABS_API_KEY` | `sk_47d...` |
| `ELEVENLABS_VOICE_ID` | `lRf3yb...` |
| `ID_CARTA_REST` | `885489...` |
| `ID_IMAGEN_PAGO` | `321672...` |
| `ID_AUDIO_CONFIRMACION` | `140480...` |
| `ADMIN_NUMBER` | `573212450883` |
| `DATABASE_URL` | `postgresql://...` (de Supabase) |
| `PORT` | *(Render lo asigna automáticamente)* |

> **⚠️ IMPORTANTE**: NO configurar manualmente `PORT`. Render lo asigna dinámicamente.

### 4. Desplegar

Click en **"Create Web Service"**. Render automáticamente:
- Clonará tu repositorio
- Ejecutará `npm install`
- Iniciará el bot con `node index.js`
- Asignará una URL: `https://bot-las-margaritas.onrender.com`

---

## 🔗 Configurar Webhook de WhatsApp

1. Ve a [Meta for Developers](https://developers.facebook.com)
2. Selecciona tu app de WhatsApp Business
3. En **"WhatsApp" → "Configuration"**:
   - **Callback URL**: `https://bot-las-margaritas.onrender.com/webhook`
   - **Verify Token**: `hola` (el mismo que en `VERIFY_TOKEN`)
4. Click en **"Verify and Save"**
5. Suscribirse a campos: `messages`

---

## 💾 Verificar Persistencia de Datos

### Ver Datos en Supabase

1. Ve a tu proyecto en Supabase
2. Click en **"Table Editor"**
3. Selecciona la tabla `reservas`
4. Verás todas las conversaciones con datos guardados automáticamente:
   - `wa_id`: Número de WhatsApp del cliente
   - `nombre`: Capturado en el primer mensaje
   - `fecha`, `hora`, `personas`: Capturados durante la reserva
   - `tipo`: "Estándar" o "Decoración"
   - `estado_pago`: "pendiente" → "enviado" → "confirmado"/"rechazado"

### Flujo de Persistencia Automática

El bot guarda datos **inmediatamente** en cada paso:

1. **NOMBRE** → Primer mensaje después de preguntar nombre
2. **TIPO** → Cuando el usuario elige "Decoración" o "Estándar"
3. **PERSONAS** → Al capturar número de comensales
4. **FECHA** → Al confirmar fecha de reserva
5. **HORA** → Al capturar hora de reserva
6. **ESTADO_PAGO**:
   - `enviado` → Cliente envía comprobante (imagen)
   - `confirmado` → Admin aprueba pago
   - `rechazado` → Admin rechaza pago

**✅ Ventaja**: Si el servidor se reinicia, todos los datos persisten en la base de datos.

---

## 🧪 Testing

### Test de Variables de Entorno

```bash
node -e "require('dotenv').config(); console.log('PORT:', process.env.PORT, 'DB:', process.env.DATABASE_URL ? '✅' : '❌');"
```

### Test de Conexión a Base de Datos

```bash
node -e "require('dotenv').config(); const db = require('./db'); db.testConnection();"
```

### Test de Flujo Completo

1. Envía un mensaje de WhatsApp al bot
2. Completa el flujo hasta pago
3. Verifica en Supabase que se guardó cada dato

---

## 📊 Monitoreo

### Logs en Render

- Ve a tu servicio en Render
- Click en **"Logs"**
- Busca mensajes de persistencia:
  ```
  💾 Nombre guardado en DB: Juan Pérez
  💾 Tipo guardado en DB: Decoración
  💾 Personas guardado en DB: 4
  💾 Fecha guardada en DB: 2026-01-20
  💾 Hora guardada en DB: 19:30:00
  💾 Estado de pago actualizado: enviado
  ```

### Queries Útiles en Supabase

```sql
-- Ver todas las reservas pendientes
SELECT * FROM reservas WHERE estado_pago = 'pendiente' ORDER BY created_at DESC;

-- Ver reservas confirmadas de hoy
SELECT * FROM reservas WHERE estado_pago = 'confirmado' AND fecha = CURRENT_DATE;

-- Estadísticas por tipo
SELECT tipo, COUNT(*) as total FROM reservas GROUP BY tipo;
```

---

## 🛠️ Solución de Problemas

### Error: "Base de datos no conectada"

- Verifica que `DATABASE_URL` esté correctamente configurada
- Asegúrate de que la IP de Render esté permitida en Supabase (por defecto está abierto)

### Error: "Cannot read property 'API_KEY_GOOGLE' of undefined"

- Verifica que el archivo `.env` existe localmente
- En Render, confirma que todas las variables están configuradas en Environment

### El bot no guarda datos

- Revisa los logs para ver mensajes `💾`
- Ejecuta `schema.sql` nuevamente en Supabase
- Verifica la conexión con `db.testConnection()`

---

## 📝 Notas Importantes

- **Seguridad**: Nunca commitees el archivo `.env` a Git (ya está en `.gitignore`)
- **Render Free Tier**: El servicio se apaga tras 15 min de inactividad (se reactiva automáticamente)
- **Supabase Free Tier**: 500MB de base de datos, más que suficiente para miles de reservas
- **Backup**: Supabase hace backups automáticos diarios

---

## 🎉 ¡Listo!

Tu bot ahora:
- ✅ Lee credenciales desde variables de entorno
- ✅ Usa puerto dinámico (`process.env.PORT`)
- ✅ Guarda datos automáticamente en PostgreSQL
- ✅ Persiste información incluso si el servidor se reinicia
- ✅ Está listo para producción en Render + Supabase

**¡A servir tacos! 🌮**
