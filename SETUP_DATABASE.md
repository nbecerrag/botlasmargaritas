# Instrucciones para Ejecutar schema.sql en Supabase

## Opción 1: Manual (Recomendado - 2 minutos)

1. **Abrir Supabase Dashboard**:
   - Ve a https://supabase.com/dashboard
   - Selecciona tu proyecto

2. **Ir al SQL Editor**:
   - En el menú lateral, click en **SQL Editor**
   - Click en **New Query**

3. **Copiar y Pegar el Schema**:
   - Abre el archivo `schema.sql` de este proyecto
   - Copia TODO el contenido
   - Pégalo en el editor SQL de Supabase

4. **Ejecutar**:
   - Click en **Run** (o presiona Ctrl+Enter)
   - Deberías ver el mensaje: "Success. No rows returned"

5. **Verificar**:
   - Ve a **Table Editor** en el menú lateral
   - Deberías ver la tabla `reservas` con todas sus columnas

---

## Opción 2: Usando el Cliente de Supabase (Programático)

Si prefieres automatizarlo, puedo crear un script que:
1. Se conecte a Supabase usando la API REST
2. Ejecute el schema automáticamente
3. Verifique que la tabla se creó correctamente

**¿Cuál opción prefieres?**

---

## Nota sobre el Error de Conexión

El error `getaddrinfo ENOENT` sugiere que:
- La conexión directa a PostgreSQL puede estar bloqueada por firewall
- Es mejor usar la API REST de Supabase para operaciones
- Una vez creada la tabla, la conexión PostgreSQL debería funcionar

**Recomendación**: Ejecuta manualmente el schema (Opción 1) y luego reiniciamos el bot.
