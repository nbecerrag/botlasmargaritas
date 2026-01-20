// Load environment variables first
require('dotenv').config();

const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const gTTS = require('gtts');
const FormData = require('form-data');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const { createCanvas, loadImage, registerFont } = require('canvas');
const db = require('./db');

const app = express().use(bodyParser.json());

// 1. CONFIGURACIÓN (Desde variables de entorno)
const API_KEY_GOOGLE = process.env.API_KEY_GOOGLE;
const whatsappToken = process.env.WHATSAPP_TOKEN;
const verifyToken = process.env.VERIFY_TOKEN;

const ID_CARTA_REST = process.env.ID_CARTA_REST;
const ID_IMAGEN_PAGO = process.env.ID_IMAGEN_PAGO;
const ID_AUDIO_CONFIRMACION = process.env.ID_AUDIO_CONFIRMACION;
const ADMIN_NUMBER = process.env.ADMIN_NUMBER;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// Datos de ubicación del restaurante
const UBICACION = {
    latitud: 4.3000,
    longitud: -74.8000,
    nombre: 'Restaurante Las Margaritas 🌵',
    direccion: 'El corazón de la ciudad, Girardot'
};

// Configuración para generación de tickets gráficos
const TICKET_CONFIG = {
    plantillaPath: path.join(__dirname, 'assets', 'ticket', 'plantilla_ticket_v1.png'),
    fuentePath: path.join(__dirname, 'assets', 'ticket', 'fuente_mexicana.ttf'),
    coordenadas: {
        nombre: { x: 327.1, y: 447, fontSize: 36, color: '#FF0000', fontFamily: 'FuenteMexicana' },
        fechaHora: { x: 402.9, y: 494, fontSize: 31, color: '#FF0000', fontFamily: 'FuenteMexicana' },
        personas: { x: 349, y: 544.2, fontSize: 31, color: '#FF0000', fontFamily: 'FuenteMexicana' },
        tipo: { x: 341, y: 596.1, fontSize: 31, color: '#FF0000', fontFamily: 'FuenteMexicana' }
    }
};


const genAI = new GoogleGenerativeAI(API_KEY_GOOGLE);
const fileManager = new GoogleAIFileManager(API_KEY_GOOGLE);
const sesionesActivas = {};
const timers = {}; // Almacenamiento de temporizadores por usuario
const pagosPendientes = {}; // Almacena pagos pendientes de confirmación: { [clientNumber]: { nombre, phone_id, resumen } }
const rechazosPendientes = {}; // Almacena rechazos esperando motivo: { [adminNumber]: clientNumber }

// 🔄 DEDUPLICACIÓN: Caché de mensajes procesados (evita respuestas duplicadas)
const mensajesProcesados = new Set();
const TIEMPO_CACHE_MENSAJES = 5 * 60 * 1000; // 5 minutos

// 🔒 LOCK DE PROCESAMIENTO: Evita procesar múltiples mensajes del mismo usuario simultáneamente
const usuariosProcesando = new Set();

// ⏱️ TRACKING DE TIEMPO: Para decidir si responder con voz o texto
const ultimoMensajeUsuario = {}; // { [wa_id]: timestamp }
const TIEMPO_ENTRE_MENSAJES_VOZ = 30 * 1000; // 30 segundos

// 📦 BUFFER DE MENSAJES: Para agrupar mensajes consecutivos
const bufferMensajes = {}; // { [wa_id]: { mensajes: [], timer: timeout } }
const TIEMPO_ESPERA_AGRUPACION = 3000; // 3 segundos para agrupar mensajes

// 2. EL MENÚ (Cerebro del Faraón)
const DATOS_DEL_NEGOCIO = `
NOMBRE DEL NEGOCIO: LAS MARGARITAS BY DIGITALBROS
UBICACIÓN: El corazón de la ciudad (Ubicación ficticia para pruebas).
MONEDA: Pesos Colombianos ($).

🌵 CONTACTO Y RESERVAS:
- IMPORTANTE: Para asegurar la mesa manejamos dos tipos de reserva:
- RESERVA ESTÁNDAR: $25.000 (Valor 100% consumible en el restaurante).
- RESERVA CON DECORACIÓN: $40.000 (Costo del servicio de decoración temática mexicana, no consumible).

⏰ HORARIOS DE ATENCIÓN:
- Martes a Jueves: 12:00 m. a 10:00 p.m.
- Viernes y Sábado: 12:00 m. a 2:00 a.m. (¡Noches de Mariachi y Tequila!)
- Domingos: 11:00 a.m. a 6:00 p.m.

--- 🌮 MENÚ MEXICANO DETALLADO ---

🌯 ENTRADAS (Para empezar la fiesta):
- Nachos "El Patrón" ($28.000): Totopos de maíz crujientes, queso fundido, frijoles refritos, pico de gallo, jalapeños y guacamole artesanal.
- Esquites Callejeros ($18.000): Maíz tierno desgranado, mayonesa de la casa, queso cotija rallado y chile en polvo.
- Quesadillas de Comal ($22.000): Tres tortillas hechas a mano, rellenas de queso Oaxaca y flor de calabaza.

🌶️ PLATOS FUERTES (El mero sabor):
- Tacos al Pastor (Orden de 3) ($32.000): Cerdo marinado en achiote, piña asada, cebolla y cilantro en tortilla de maíz.
- Enchiladas Suizas ($38.000): Tres tortillas con pollo, salsa verde cremosa de tomatillo, gratinadas con queso y crema ácida.
- Burrito "Chingón" ($36.000): Tortilla gigante de harina con carne asada, arroz, frijoles, lechuga y queso. Servido con salsa roja.

🍹 CÓCTELES Y BEBIDAS:
- Margarita Clásica ($30.000): Tequila reposado, licor de naranja y zumo de limón fresco con borde de sal.
- Michelada de la Casa ($16.000): Cerveza bien fría, limón, sal, pimienta y nuestra mezcla secreta de salsas.
- Agua de Horchata ($10.000): Bebida refrescante de arroz, leche y un toque de canela.

🥑 ADICIONALES:
- Guacamole Extra ($8.000), Frijoles Refritos ($6.000), Tortillas Extra ($4.000).
`;

// 3. FUNCIÓN PARA GENERAR SYSTEM INSTRUCTION CON FECHA DINÁMICA
function generarSystemInstruction() {
    const ahora = new Date();
    const opciones = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Bogota'
    };
    const fechaHoraActual = ahora.toLocaleDateString('es-CO', opciones);

    return `
    🌵 PERFIL DE SISTEMA: VICENTICO DE LAS MARGARITAS
    
    📅 FECHA Y HORA ACTUAL DEL SERVIDOR: ${fechaHoraActual}
    IMPORTANTE: Usa esta fecha como referencia para calcular reservas y responder preguntas sobre disponibilidad.
    
    ⚠️ INSTRUCCIÓN DE SISTEMA CRÍTICA: PROTOCOLO DE BLOQUEO ACTIVO
    
    NIVEL 1: ANONIMATO (BLOQUEADO)
    - Si NO conoces el nombre del usuario, tu ÚNICA MISIÓN es saludar y preguntar su nombre usando UNA de estas tres opciones de forma ALEATORIA:
      
      OPCIÓN A (Hospitalaria): "¡Qué milagro verlo por acá! Soy Vicentico, su anfitrión en Las Margaritas. Antes de pasar a lo bueno, dígame: ¿con qué nombre lo recibimos en esta su casa?"
      
      OPCIÓN B (Entusiasta): "¡Bienvenido, mi estimado! El comal ya está encendido y el tequila en su punto. Soy Vicentico, su servidor. Antes de seguir dígame por favor ¿Cómo se llama usted?"
      
      OPCIÓN C (Elegante/Atenta): "¡Qué gusto saludarle! Soy Vicentico. Antes de mostrarle nuestros manjares, dígame por favor su nombre para atenderlo como usted se merece aquí en Las Margaritas."
    
    - PROHIBIDO: Ofrecer menús, hablar de reservas o dar bienvenidas largas hasta que el usuario te dé un nombre.
    - Si preguntan por precios/menú sin dar nombre, responde: "¡Ándale! Con gusto te paso todo, pero primero dime, ¿cómo te llamas, compadre?"
    - IMPORTANTE: Una vez obtengas el nombre, pasa INMEDIATAMENTE al Nivel 2 saludando con su nombre.
    
    NIVEL 2: IDENTIFICADO (Activo tras saber el nombre)
    - Detecta si es Caballero o Dama.
    - Bienvenida completa: "¡Bienvenido a Las Margaritas, Caballero [Nombre]! Es un gusto tenerte por acá. ¿En qué te puedo servir hoy?"
    
    NIVEL 3: FLUJO DE RESERVA (Paso a paso)
    - Orden estricto: 1. Pregunta de Oro (Decoración vs Estándar) → 2. Datos (Fecha/Hora/Personas) → 3. Pago.
    
    🚨 REGLA DE ORO: Si intentas saltar pasos sin completar el anterior, estarás fallando a tu hospitalidad.
    
    ---
    
    PERSONALIDAD: Eres Vicentico, el anfitrión estrella de "Las Margaritas by Digitalbros". Eres alegre, servicial, usas expresiones mexicanas como "¡Qué milagro!", "¡Ande pues!" y "¡Pásale a lo barrido!". Eres un caballero atento.
    
    ORDEN LÓGICO DE CONVERSACIÓN:
    
    1. IDENTIDAD: Obtener el nombre es prioridad absoluta.
    2. PREGUNTA ABIERTA: Una vez identificado, pregunta en qué puedes ayudar.
     3. ENTREGA DE CARTAS (PDF):
        - Si piden "carta", "menú" o "precios": Envía la etiqueta correspondiente [MENÚ_MEX].
       - Acompaña con audio <guion_audio> invitando a probar los tacos y margaritas.
       - CIERRE DEL PASO: "¿Quieres que te aparte una mesa para que pruebes los mejores tacos o prefieres antojarte primero?"
    
     3.1. UBICACIÓN DEL RESTAURANTE:
        - Si preguntan por "ubicación", "dónde quedan", "cómo llegar", "dirección" o similares: Envía la etiqueta [UBICACIÓN].
        - Acompaña SIEMPRE con audio <guion_audio> diciendo: "¡Aquí le mando el mapa, compadre! No hay pierde, lo espero con el comal caliente."
    
    4. RESERVA - LA PREGUNTA DE ORO:
       "¡Ándale! Antes de tomar tus datos, ¿vienes por una ocasión especial y quieres nuestra Decoración de Fiesta Mexicana ($40.000) o prefieres una Reserva Estándar ($25.000 consumibles)?"
    
     5. CAPTURA DE DATOS: Solo tras elegir el tipo de mesa, pide: Nombre, número de personas, fecha y hora.
     
     5.1. LÓGICA TEMPORAL E INTELIGENCIA DE FECHAS (CRÍTICO):
        
        A) CÁLCULO DINÁMICO DE FECHAS:
           - Si el cliente dice "mañana", "en dos días", "este viernes", etc., calcula la fecha real basándote en la FECHA ACTUAL DEL SERVIDOR (arriba).
           - Siempre confirma la fecha calculada al cliente.
        
        B) FORMATO DE FECHAS (DOBLE SALIDA):
           - En TEXTO: Usa SIEMPRE formato dd/mm/año (Ejemplo: 20/01/2026)
           - En AUDIO (<guion_audio>): Escribe la fecha completa con nombre del día, SIN año (Ejemplo: "martes veinte de enero")
        
        C) HORARIOS DE LAS MARGARITAS:
           - Lunes: CERRADO
           - Martes a Jueves: 12:00 p.m. a 10:00 p.m.
           - Viernes y Sábado: 12:00 p.m. a 2:00 a.m.
           - Domingo: 11:00 a.m. a 6:00 p.m.
        
        D) VALIDACIÓN DE HORARIOS:
           - Si la reserva es para hora/día FUERA de horario, di: "¡Híjole! Me encantaría, pero a esa hora ya tenemos el comal apagado. ¿Qué le parece si lo anoto para [Sugerir próxima hora/día válido más cercano]?"
           - Si es LUNES, sugiere el martes más cercano.
        
        E) ATENCIÓN 24/7 (Mensaje fuera de horario):
           - Si el cliente escribe FUERA del horario de atención del restaurante, aclara: "Ahorita mis patrones están descansando, pero yo aquí chambeo veinticuatro siete para usted. ¡Dígame qué necesita y le vamos adelantando el trámite!"
        
        F) TRASPASO HUMANO:
           - Si el cliente dice "QUIERO HABLAR CON ALGUIEN", "NECESITO UN HUMANO", etc., responde: "¡Entendido! Ya le mandé un chiflido a mis patrones. En cuanto se despejen le escriben. ¿Hay algo más en lo que Vicentico pueda ayudarle?"
    
     6. CIERRE Y PAGO: Solo con datos completos, envía el resumen y la etiqueta [DATOS_PAGO].
       Copia Exacta: "Confirmamos: [Nombre] | [Fecha] | [Hora] | [Personas] | [Tipo: Estándar o Decoración]
       
       Para confirmar tu reserva, el valor a abonar es de $[MONTO_ELEGIDO].
       
       Si es Estándar ($25.000): Este valor es 100% consumible y se descontará de tu factura final.
       Si es Decoración ($40.000): Este valor cubre el montaje festivo de tu mesa (no consumible).
       
       ¡Espero el comprobante por aquí para prender el comal y esperarte!"
    
    REGLAS DE FORMATO:
    - ORTOGRAFÍA: Escribe siempre "Las Margaritas" y el nombre de tu ciudad correctamente.
    - FONÉTICA: En el guion de audio, escribe precios en letras (ej: "veinticinco mil pesos").
    - PROHIBICIÓN: No escribas platos ni precios en el chat. Todo está en el menú [MENÚ_MEX].
    
    🚨 REGLA DE CIERRE ACTIVO (OBLIGATORIA):
    - JAMÁS termines un mensaje sin una frase de servicio en tono mexicano que invite a continuar.
    - Esto aplica ESPECIALMENTE al enviar ubicación ([UBICACIÓN]) o menú ([MENÚ_MEX]).
    - VARIACIÓN: Nunca uses la misma frase dos veces. Alterna entre estas opciones:
      * "¡Ahí lo tiene, compadre! ¿Qué más se le ofrece? Usted mande, que para eso estamos."
      * "¡Ya tiene el mapa en su mano! ¿Le ayudo con algo más o ya le voy apartando su mesa?"
      * "¡Listo el pin! ¿Qué otra duda le despejo, mi estimado? ¡Hable ahora o calle para siempre!"
      * "Ahí está la ubicación exacta. ¿En qué más le puedo servir? ¡No se me quede con las ganas!"
      * "¡Ándele pues! ¿Algo más que necesite saber antes de reservar su lugar?"
      * "¡Ahí está todo! ¿Le aparto su mesa o tiene alguna otra pregunta?"
    - PRIORIDAD: Si el cliente ya pidió ubicación y menú, tu siguiente paso OBLIGATORIO es invitarlo a hacer la reserva con la Pregunta de Oro.
    
    
    🎤 FORMATO DE RESPUESTA (INNEGOCIABLE):
    
    MODO VOZ [VOZ] - OBLIGATORIO para:
    - Bienvenidas al detectar el nombre
    - Envío de menú [MENÚ_MEX]
    - Envío de ubicación [UBICACIÓN]
    - Confirmación tras reserva
    - Frases de cierre activo
    
    ESTRUCTURA OBLIGATORIA DEL MODO VOZ:
    Paso 1: Escribe <guion_audio>
    Paso 2: Dentro escribe el texto EXACTO que será leído por ElevenLabs:
       - Precios SIEMPRE en letras: "veinticinco mil pesos", NUNCA "$25.000"
       - Frases cortas y naturales en español mexicano
       - NO incluir emojis ni etiquetas [MENÚ_MEX] o [UBICACIÓN] dentro del guion
       - Ejemplo: "¡Qué milagro, Caballero Nicolás! Bienvenido a Las Margaritas. ¿En qué lo puedo ayudar hoy?"
    Paso 3: Cierra con </guion_audio>
    Paso 4: En la siguiente línea escribe [VOZ]
    
    🚨 CRÍTICO: Si NO incluyes <guion_audio></guion_audio> Y [VOZ], el bot NO enviará audio. Es OBLIGATORIO.
    
    MODO TEXTO (SIN [VOZ]) - SOLO para:
    - Resúmenes de reserva con datos específicos
    - Confirmaciones de pago con montos exactos
    - Listas de horarios o precios detallados
    - Usa emojis mexicanos: 🌵, 🌮, 🍹, 🎉

    DATOS DEL NEGOCIO:
    ${DATOS_DEL_NEGOCIO}
  `;
}

// 3. MODELO (Configuración de Inteligencia y Memoria)
const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    systemInstruction: generarSystemInstruction(),
});

// 4. FUNCIONES DE APOYO (Audio y Voz) - ELEVENLABS INTEGRADO
async function descargarAudio(mediaId) {
    try {
        const urlRes = await axios.get(`https://graph.facebook.com/v17.0/${mediaId}`, {
            headers: { "Authorization": `Bearer ${whatsappToken}` }
        });
        const ruta = path.join(__dirname, "audio_temp.ogg");
        const response = await axios({
            url: urlRes.data.url, method: 'GET', responseType: 'stream',
            headers: { "Authorization": `Bearer ${whatsappToken}` }
        });

        const writer = fs.createWriteStream(ruta);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(ruta)); // ✅ Ahora sí espera a que el archivo exista
            writer.on('error', () => reject(null));
        });
    } catch (e) {
        console.error("❌ Error descargando audio de Meta:", e.message);
        return null;
    }
}

// Función auxiliar para convertir números a texto (0 a 999.999.999)
// Función auxiliar para convertir números a texto (0 a 999.999.999)
function convertirNumeroATexto(num) {
    if (num === 0) return "cero";
    const unidades = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve", "veinte", "veintiún", "veintidós", "veintitrés", "veinticuatro", "veinticinco", "veintiséis", "veintisiete", "veintiocho", "veintinueve"];
    const decenas = ["", "diez", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
    const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

    if (num < 30) return unidades[num];
    if (num < 100) return decenas[Math.floor(num / 10)] + (num % 10 ? " y " + unidades[num % 10] : "");
    if (num < 1000) return (num === 100 ? "cien" : centenas[Math.floor(num / 100)] + (num % 100 ? " " + convertirNumeroATexto(num % 100) : ""));
    if (num < 1000000) return (num < 2000 ? "mil " + convertirNumeroATexto(num % 1000) : convertirNumeroATexto(Math.floor(num / 1000)) + " mil" + (num % 1000 ? " " + convertirNumeroATexto(num % 1000) : ""));
    if (num < 2000000) return "un millón " + (num % 1000000 ? convertirNumeroATexto(num % 1000000) : "");
    return convertirNumeroATexto(Math.floor(num / 1000000)) + " millones" + (num % 1000000 ? " " + convertirNumeroATexto(num % 1000000) : "");
}

// Helper para fonética
function aplicarFonetica(texto) {
    return texto.replace(/Keops/gi, "kéops").replace(/Girardot/gi, "Hhirardot");
}

async function enviarAudioWhatsApp(texto, to, phone_number_id) {
    // 1. Limpieza Mínima (Gemini ya hace el trabajo pesado)
    let textoParaVoz = texto
        .replace(/Keops/gi, 'kéops')   // Fonética exacta
        .replace(/Girardot/gi, 'Hhirardot') // Fonética exacta
        .replace(/[^\w\s\u00C0-\u00FF,\.\(\)?\¡!¿ñÑ…\-]/g, '') // Permitir puntos suspensivos, guiones, etc.
        .trim();

    // Asegurar punto final
    if (!textoParaVoz.endsWith('.')) textoParaVoz += '.';

    // Normalizar espacios
    textoParaVoz = textoParaVoz.replace(/\s+/g, ' ');

    // VALIDACIÓN: Evitar enviar texto vacío o solo signos a ElevenLabs
    if (!textoParaVoz.replace(/[^a-zA-Z0-9\u00C0-\u00FF]/g, '').trim()) {
        console.warn("⚠️ Advertencia: El texto para voz estaba vacío o solo tenía signos. Se omitió el audio.");
        return;
    }

    const ELEVEN_API_KEY = ELEVENLABS_API_KEY;
    const VOICE_ID = ELEVENLABS_VOICE_ID; // Vicentico voice
    const rutaAudio = path.join(__dirname, 'voz_vicentico.mp3');

    try {
        console.log("🔊 Generando voz con ElevenLabs (Fonética):", textoParaVoz.substring(0, 50) + "...");
        const response = await axios({
            method: 'POST',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
            headers: {
                'xi-api-key': ELEVEN_API_KEY,
                'Content-Type': 'application/json',
                'Accept': 'audio/mpeg'
            },
            data: {
                text: textoParaVoz,
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                    stability: 0.6,    // Estabilidad ALTA para evitar variaciones raras
                    similarity_boost: 0.8,
                    style: 0.0,        // Estilo moderado
                    use_speaker_boost: true
                }
            },
            responseType: 'stream'
        });

        // 3. Guardar el archivo de audio
        const writer = fs.createWriteStream(rutaAudio);
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // ⏳ Esperar 1 segundo para asegurar que el archivo se libere
        await new Promise(resolve => setTimeout(resolve, 1000));

        console.log("📤 Subiendo audio a WhatsApp...");
        // 4. Enviar a WhatsApp
        const form = new FormData();
        form.append('file', fs.createReadStream(rutaAudio));
        form.append('type', 'audio/mpeg');
        form.append('messaging_product', 'whatsapp');

        const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${phone_number_id}/media`, form, {
            headers: { ...form.getHeaders(), 'Authorization': `Bearer ${whatsappToken}` }
        });

        await axios.post(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            type: "audio",
            audio: { id: uploadRes.data.id }
        }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });

        console.log("✅ Audio enviado correctamente con ElevenLabs.");

    } catch (error) {
        console.error("❌ Error en proceso de audio:");
        if (error.response) {
            // Error de la API (ElevenLabs o WhatsApp)
            console.error("Status:", error.response.status);
            console.error("Data:", error.response.data);
        } else {
            console.error("Mensaje:", error.message);
        }
    }
}

async function enviarMenuWhatsApp(menuId, to, phone_number_id) {
    try {
        await axios.post(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            type: "document",
            document: {
                id: menuId,
                caption: "Menú Las Margaritas 🌵"
            }
        }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
        console.log(`✅ Menú enviado (${menuId}).`);
    } catch (e) {
        console.error("❌ Error enviando menú:", e.message);
    }
}

async function enviarImagenPago(to, phone_number_id) {
    try {
        await axios.post(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            type: "image",
            image: { id: ID_IMAGEN_PAGO }
        }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
        console.log(`✅ Imagen de Pago enviada.`);
    } catch (e) { console.error("❌ Error enviando imagen pago:", e.message); }
}

async function enviarUbicacion(to, phone_number_id) {
    try {
        await axios.post(`https://graph.facebook.com/v17.0/${phone_number_id}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            type: "location",
            location: {
                latitude: UBICACION.latitud,
                longitude: UBICACION.longitud,
                name: UBICACION.nombre,
                address: UBICACION.direccion
            }
        }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
        console.log(`✅ Ubicación enviada: ${UBICACION.nombre}`);
    } catch (e) { console.error("❌ Error enviando ubicación:", e.message); }
}

async function notificarAdmin(from, phone_id, mediaId, nombreCliente) {
    try {
        console.log(`🔔 Notificando al admin sobre pago de ${from}. Media ID: ${mediaId}`);

        // 1. Extraer resumen con Gemini (más rápido que procesar todo manualmente)
        const modeloConFecha = genAI.getGenerativeModel({
            model: "gemini-2.5-pro",
            systemInstruction: generarSystemInstruction()
        });
        const chatAdmin = modeloConFecha.startChat({ history: sesionesActivas[from] || [] });
        const result = await chatAdmin.sendMessage("Extrae un resumen de la reserva en formato texto plano: Nombre, Fecha, Hora, Personas, Decoración, Cumpleaños. Sé breve.");
        const resumen = result.response.text();

        console.log(`📝 Resumen generado: ${resumen.substring(0, 100)}...`);

        // 2. Guardar en pagos pendientes de confirmación
        pagosPendientes[from] = {
            nombre: nombreCliente || "Cliente",
            phone_id: phone_id,
            resumen: resumen
        };

        // 3. Enviar Mensaje Interactivo al Admin con BOTONES
        console.log(`📤 Enviando mensaje con botones al admin: ${ADMIN_NUMBER}`);
        await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
            messaging_product: "whatsapp",
            to: ADMIN_NUMBER,
            type: "interactive",
            interactive: {
                type: "button",
                body: {
                    text: `🔔 Nueva evidencia de pago de ${pagosPendientes[from].nombre}\n\n${resumen}\n\nCliente: ${from}\n\n⚠️ Revisa tu cuenta y elige una acción:`
                },
                action: {
                    buttons: [
                        {
                            type: "reply",
                            reply: {
                                id: `confirmar_${from}`,
                                title: "✅ Confirmar"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: `rechazar_${from}`,
                                title: "❌ Rechazar"
                            }
                        }
                    ]
                }
            }
        }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
        console.log(`✅ Mensaje con botones enviado`);

        // 4. Reenviar Comprobante (Usando el Media ID original)
        console.log(`🖼️ Esperando 3.5s antes de reenviar imagen...`);
        await new Promise(resolve => setTimeout(resolve, 3500)); // Esperar propagación (Fix Error 400 - 3.5s delay)

        console.log(`📤 Reenviando imagen al admin. Media ID: ${mediaId}`);
        await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
            messaging_product: "whatsapp", to: ADMIN_NUMBER, type: "image", image: { id: mediaId }
        }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
        console.log(`✅ Imagen reenviada al admin`);

        console.log("✅ Notificación con botones enviada al Admin. Esperando confirmación...");
    } catch (e) {
        console.error("❌ Error notificando admin:", e.message);
        if (e.response) {
            console.error("🔴 Status:", e.response.status);
            console.error("🔴 Data:", JSON.stringify(e.response.data, null, 2));
        }
    }
}



// 4.5 GENERACIÓN DE TICKETS GRÁFICOS
async function generarTicketReserva(nombreCliente, fecha, hora, personas, tipo) {
    try {
        // 0. FUNCIÓN DE SANITIZACIÓN (eliminar caracteres internos del sistema)
        const sanitizar = (texto) => {
            if (!texto) return '';
            // Eliminar guiones, guiones bajos, asteriscos al inicio/final
            return texto.replace(/^[-_*\s]+|[-_*\s]+$/g, '').trim();
        };

        // 1. Verificar que existe la plantilla
        if (!fs.existsSync(TICKET_CONFIG.plantillaPath)) {
            console.warn("⚠️ Plantilla de ticket no encontrada. Saltando generación de ticket gráfico.");
            return null;
        }

        // 2. Cargar plantilla
        const plantilla = await loadImage(TICKET_CONFIG.plantillaPath);
        const canvas = createCanvas(plantilla.width, plantilla.height);
        const ctx = canvas.getContext('2d');

        // 3. Registrar fuente personalizada si existe
        if (fs.existsSync(TICKET_CONFIG.fuentePath)) {
            try {
                registerFont(TICKET_CONFIG.fuentePath, { family: 'FuenteMexicana' });
                console.log("✅ Fuente personalizada cargada");
            } catch (err) {
                console.warn("⚠️ No se pudo cargar la fuente personalizada. Usando fuente por defecto.");
            }
        }

        // 4. Dibujar plantilla en canvas
        ctx.drawImage(plantilla, 0, 0);

        // 5. Configurar estilo de texto general
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        // 6. SANITIZAR Y PREPARAR DATOS
        // CRÍTICO: Fallback para nombre si está vacío/null/undefined
        const nombreFinal = sanitizar(nombreCliente) || 'CLIENTE DISTINGUIDO';
        const fechaFinal = sanitizar(fecha) || 'Por confirmar';
        const horaFinal = sanitizar(hora) || 'Por confirmar';
        const personasFinal = sanitizar(personas).replace(/[^\d]/g, '') || '1';
        const tipoFinal = sanitizar(tipo) || 'RESERVA ESTÁNDAR';

        console.log(`🎨 Datos finales para ticket: Nombre="${nombreFinal}", Fecha="${fechaFinal}", Hora="${horaFinal}", Personas="${personasFinal}", Tipo="${tipoFinal}"`);

        // 7. Escribir NOMBRE (BOLD + MAYÚSCULAS + ROJO)
        const coordNombre = TICKET_CONFIG.coordenadas.nombre;
        ctx.font = `bold ${coordNombre.fontSize}px ${coordNombre.fontFamily || 'Arial'}`;
        ctx.fillStyle = coordNombre.color;
        ctx.fillText(nombreFinal.toUpperCase(), coordNombre.x, coordNombre.y);

        // 8. Escribir FECHA Y HORA (BOLD + MAYÚSCULAS + ROJO)
        const coordFechaHora = TICKET_CONFIG.coordenadas.fechaHora;
        ctx.font = `bold ${coordFechaHora.fontSize}px ${coordFechaHora.fontFamily || 'Arial'}`;
        ctx.fillStyle = coordFechaHora.color;
        ctx.fillText(`${fechaFinal.toUpperCase()} - ${horaFinal.toUpperCase()}`, coordFechaHora.x, coordFechaHora.y);

        // 9. Escribir PERSONAS (BOLD + MAYÚSCULAS + ROJO)
        const coordPersonas = TICKET_CONFIG.coordenadas.personas;
        ctx.font = `bold ${coordPersonas.fontSize}px ${coordPersonas.fontFamily || 'Arial'}`;
        ctx.fillStyle = coordPersonas.color;
        const numPersonas = parseInt(personasFinal) || 1;
        ctx.fillText(`${numPersonas} PERSONA${numPersonas > 1 ? 'S' : ''}`, coordPersonas.x, coordPersonas.y);

        // 10. Escribir TIPO DE RESERVA (BOLD + MAYÚSCULAS + ROJO)
        const coordTipo = TICKET_CONFIG.coordenadas.tipo;
        ctx.font = `bold ${coordTipo.fontSize}px ${coordTipo.fontFamily || 'Arial'}`;
        ctx.fillStyle = coordTipo.color;
        ctx.fillText(tipoFinal.toUpperCase(), coordTipo.x, coordTipo.y);

        // 11. Exportar como buffer PNG
        const buffer = canvas.toBuffer('image/png');
        console.log(`✅ Ticket generado exitosamente para ${nombreFinal}`);

        return buffer;

    } catch (error) {
        console.error("❌ Error generando ticket:", error.message);
        return null;
    }
}

async function enviarTicketReserva(to, phone_id, nombreCliente, fecha, hora, personas, tipo) {
    try {
        // 1. Generar imagen del ticket
        const ticketBuffer = await generarTicketReserva(nombreCliente, fecha, hora, personas, tipo);

        if (!ticketBuffer) {
            console.warn("⚠️ No se pudo generar ticket. Saltando envío.");
            return;
        }

        // 2. Guardar temporalmente (WhatsApp requiere path para upload)
        const tempPath = path.join(__dirname, `ticket_${to}_temp.png`);
        fs.writeFileSync(tempPath, ticketBuffer);

        // 3. Subir imagen a WhatsApp como media
        const form = new FormData();
        form.append('file', fs.createReadStream(tempPath));
        form.append('type', 'image/png');
        form.append('messaging_product', 'whatsapp');

        const uploadRes = await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/media`, form, {
            headers: { ...form.getHeaders(), 'Authorization': `Bearer ${whatsappToken}` }
        });

        const mediaId = uploadRes.data.id;

        // 4. Enviar mensaje con el ticket
        await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            type: "image",
            image: {
                id: mediaId,
                caption: "🎫 ¡Tu comprobante de reserva está listo! Te esperamos con el comal caliente. 🌮"
            }
        }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });

        // 5. Limpiar archivo temporal
        fs.unlinkSync(tempPath);

        // 6. Enviar audio oficial de confirmación pre-grabado (NO usar ElevenLabs)
        await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            type: "audio",
            audio: { id: ID_AUDIO_CONFIRMACION }
        }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
        console.log(`✅ Audio de confirmación enviado a ${to}`);

        // 7. Enviar mensaje de texto corto de celebración
        await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            text: { body: "¡Ándale! Ya está todo listo. ¡Aquí lo esperamos con los tequilas bien fríos! 🌵🌮" }
        }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });

        console.log(`✅ Ticket y confirmación enviados exitosamente a ${to}`);

    } catch (error) {
        console.error("❌ Error enviando ticket:", error.message);
        // No fallar silenciosamente - el usuario ya recibió el mensaje de texto
    }
}



// 5. GESTIÓN DE SEGUIMIENTOS (Follow-ups)

// ELIMINADO: Ya no usamos mensajes predeterminados - Gemini genera seguimientos contextuales

function cancelarSeguimiento(to) {
    if (timers[to]) {
        clearTimeout(timers[to].timer1);
        clearTimeout(timers[to].timer2);
        clearTimeout(timers[to].timer3); // Cancelar seguimiento pago 24h
        delete timers[to];
        console.log(`⏹️ Seguimiento cancelado para ${to}`);
    }
}

function programarSeguimientoPago(to, phone_id) {
    // No borramos timers[to] completo porque timer1/timer2 ya pasaron o se cancelaron al hablar
    // Solo agregamos timer3
    if (!timers[to]) timers[to] = {};

    console.log(`⏳ Programando seguimiento de PAGO (24h) para ${to}...`);
    const t3 = setTimeout(async () => {
        try {
            console.log(`⏰ Ejecutando Follow-up PAGO para ${to}`);
            await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                messaging_product: "whatsapp",
                to: to,
                text: { body: "¡Qué onda, compadre! Aún tengo tu mesa apartada, pero otros clientes también la andan queriendo. ¿Ya pudiste hacer el abono? Mándame el comprobante para confirmarte al 100. 🌮💚" }
            }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
            delete timers[to];
        } catch (e) { console.error("Error en Follow-up PAGO:", e.message); }
    }, 24 * 60 * 60 * 1000); // 24 horas

    timers[to].timer3 = t3;
}

function programarSeguimiento(to, phone_id) {
    cancelarSeguimiento(to); // Limpiar previos

    console.log(`⏳ Programando seguimiento contextual con Gemini para ${to}...`);

    // Timer único: 5 minutos después del último mensaje
    const t1 = setTimeout(async () => {
        try {
            console.log(`⏰ Generando seguimiento contextual para ${to}`);

            // Obtener historial de conversación
            const historial = sesionesActivas[to] || [];

            if (!historial || historial.length === 0) {
                console.log(`⚠️ No hay historial para ${to}, omitiendo seguimiento`);
                return;
            }

            // Crear modelo temporal para generar seguimiento
            const modeloSeguimiento = genAI.getGenerativeModel({
                model: "gemini-2.5-pro",
                systemInstruction: `Eres Vicentico de Las Margaritas. 
                
ANALIZA la conversación anterior y genera UN MENSAJE DE SEGUIMIENTO NATURAL que:
                1. Sea breve (máximo 2 líneas)
                2. Continúe naturalmente la conversación
                3. Invite sutilmente a avanzar en la reserva o responder dudas
                4. Use el tono alegre y mexicano de Vicentico
                5. NO sea repetitivo con lo que ya dijiste
                
                IMPORTANTE: Responde SOLO el mensaje de seguimiento, sin etiquetas ni instrucciones.`
            });

            const chatSeguimiento = modeloSeguimiento.startChat({ history: historial });
            const resultado = await chatSeguimiento.sendMessage("Genera un mensaje de seguimiento contextual basado en nuestra conversación.");
            const mensajeSeguimiento = resultado.response.text().trim();

            console.log(`💬 Seguimiento generado: "${mensajeSeguimiento.substring(0, 50)}..."`);

            // Enviar como texto (no audio)
            await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                messaging_product: "whatsapp",
                to: to,
                text: { body: mensajeSeguimiento }
            }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });

            delete timers[to]; // Limpiar memoria
        } catch (e) {
            console.error("❌ Error en seguimiento contextual:", e.message);
        }
    }, 5 * 60 * 1000); // 5 minutos

    timers[to] = { timer1: t1 };
}

// 6. EL PROCESADOR PRINCIPAL (Webhook)
app.post("/webhook", async (req, res) => {
    // 📢 ESTE LOG ES PARA SABER SI META ESTÁ LLEGANDO
    console.log("📩 ¡ATENCIÓN! Llegó una notificación de Meta al Webhook.");

    res.sendStatus(200);
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        if (!value?.messages) return;

        const msg = value.messages[0];
        const from = msg.from;
        const phone_id = value.metadata.phone_number_id;

        // 🔄 DEDUPLICACIÓN: Verificar si ya procesamos este mensaje
        const msgId = msg.id;
        if (mensajesProcesados.has(msgId)) {
            console.log(`⏭️ Mensaje duplicado ignorado: ${msgId}`);
            return;
        }

        // Agregar mensaje al caché y programar su eliminación
        mensajesProcesados.add(msgId);
        setTimeout(() => mensajesProcesados.delete(msgId), TIEMPO_CACHE_MENSAJES);

        // 🔒 LOCK: Verificar si ya estamos procesando un mensaje de este usuario
        if (usuariosProcesando.has(from)) {
            console.log(`⏳ Usuario ${from} ya tiene un mensaje en proceso. Esperando...`);
            return;
        }

        // Marcar usuario como "procesando"
        usuariosProcesando.add(from);

        // CANCELAR SEGUIMIENTOS PREVIOS (El cliente habló)
        cancelarSeguimiento(from);

        // VALIDACIÓN ANTI-ERROR 400 (Input Vacío)
        if (msg.type === "text" && (!msg.text.body || msg.text.body.trim() === "")) {
            console.log("⚠️ Mensaje vacío recibido. Ignorando.");
            return;
        }

        if (!sesionesActivas[from]) sesionesActivas[from] = [];

        // Crear modelo con systemInstruction actualizada con fecha y hora actual
        const modeloConFecha = genAI.getGenerativeModel({
            model: "gemini-2.5-pro",
            systemInstruction: generarSystemInstruction()
        });

        const chat = modeloConFecha.startChat({ history: sesionesActivas[from] });
        let respuestaFaraon = "";

        // LÓGICA ESPECIAL: Detectar si es el ADMIN usando botones interactivos
        if (from === ADMIN_NUMBER && msg.type === "interactive") {
            const buttonResponse = msg.interactive.button_reply;
            const buttonId = buttonResponse.id; // Ejemplo: "confirmar_573208776763" o "rechazar_573208776763"

            if (buttonId.startsWith("confirmar_")) {
                const clienteNumber = buttonId.replace("confirmar_", "");

                if (pagosPendientes[clienteNumber]) {
                    const datosPago = pagosPendientes[clienteNumber];

                    // Enviar mensaje de éxito al cliente
                    await axios.post(`https://graph.facebook.com/v17.0/${datosPago.phone_id}/messages`, {
                        messaging_product: "whatsapp",
                        to: clienteNumber,
                        text: { body: "¡Ya quedó listo el depósito, mi estimado! El comal ya nos está esperando. 🌮 En breve te enviaré tu comprobante de reserva oficial. ¡Nos vemos pronto!" }
                    }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });

                    // NUEVO: Enviar ticket gráfico personalizado
                    // Extraer datos del resumen usando búsqueda por palabras clave (más robusto)
                    const resumen = datosPago.resumen;
                    console.log(`📋 Resumen completo: ${resumen}`);

                    // Función auxiliar para limpiar texto y extraer valor
                    const extraerValor = (texto, palabra) => {
                        const regex = new RegExp(`${palabra}[:\\s]+([^,\\.\\n]+)`, 'i');
                        const match = texto.match(regex);
                        return match ? match[1].trim() : '';
                    };

                    // Extraer cada campo con limpieza
                    let fecha = extraerValor(resumen, 'Fecha') || 'Por confirmar';
                    let hora = extraerValor(resumen, 'Hora') || 'Por confirmar';
                    let personas = extraerValor(resumen, 'Personas') || '1';
                    let tipoReserva = resumen.includes('Decoración') || resumen.includes('Decoracion') ?
                        'Decoración' : 'Estándar';

                    // Limpiar cualquier texto interno que pueda venir en el resumen
                    fecha = fecha.replace(/RESPONDE.*/gi, '').trim();
                    hora = hora.replace(/RESPONDE.*/gi, '').trim();
                    personas = personas.replace(/[^\d]/g, '') || '1';  // Solo números

                    console.log(`📊 Datos extraídos del resumen: Fecha="${fecha}", Hora="${hora}", Personas="${personas}", Tipo="${tipoReserva}"`);

                    // 🔥 PERSISTENCIA EN TIEMPO REAL: Extraer datos DIRECTAMENTE de la base de datos
                    console.log(`🔍 SINCRONIZACIÓN: Consultando datos reales desde Supabase...`);
                    const reservaActiva = await db.getReserva(clienteNumber);

                    if (reservaActiva) {
                        console.log(`✅ Datos recuperados de Supabase:`);
                        console.log(`   - Nombre: "${reservaActiva.nombre || 'NO DISPONIBLE'}"`);
                        console.log(`   - Fecha: ${reservaActiva.fecha || 'N/A'}`);
                        console.log(`   - Hora: ${reservaActiva.hora || 'N/A'}`);
                        console.log(`   - Personas: ${reservaActiva.personas || 'N/A'}`);
                        console.log(`   - Tipo: ${reservaActiva.tipo || 'N/A'}`);

                        // Usar datos de Supabase, con fallback al resumen si falta algo
                        const nombreFinal = reservaActiva.nombre || datosPago.nombre || 'Cliente Distinguido';
                        const fechaFinal = reservaActiva.fecha || fecha;
                        const horaFinal = reservaActiva.hora || hora;
                        const personasFinal = reservaActiva.personas?.toString() || personas;
                        const tipoFinal = reservaActiva.tipo || tipoReserva;

                        console.log(`🎫 Generando ticket con datos de DB (NO de memoria)...`);

                        await enviarTicketReserva(
                            clienteNumber,
                            datosPago.phone_id,
                            nombreFinal,
                            fechaFinal,
                            horaFinal,
                            personasFinal,
                            tipoFinal
                        );
                    } else {
                        console.warn(`⚠️ No se encontró reserva EN_PROCESO en DB, usando datos del resumen`);
                        await enviarTicketReserva(
                            clienteNumber,
                            datosPago.phone_id,
                            datosPago.nombre,
                            fecha,
                            hora,
                            personas,
                            tipoReserva
                        );
                    }

                    // Confirmar al admin
                    await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                        messaging_product: "whatsapp",
                        to: ADMIN_NUMBER,
                        text: { body: `✅ Confirmación enviada a ${datosPago.nombre} (${clienteNumber})` }
                    }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });

                    // 💾 PERSISTENCIA: Actualizar estado de pago a 'confirmado'
                    await db.updateReserva(clienteNumber, { estado_pago: 'confirmado' });
                    console.log(`💾 Estado de pago actualizado en DB: confirmado`);

                    // Eliminar de pagos pendientes
                    delete pagosPendientes[clienteNumber];
                    console.log(`✅ Pago confirmado para ${clienteNumber}`);
                } else {
                    await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                        messaging_product: "whatsapp",
                        to: ADMIN_NUMBER,
                        text: { body: `⚠️ No se encontró el pago pendiente para ${clienteNumber}` }
                    }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
                }
                return;

            } else if (buttonId.startsWith("rechazar_")) {
                const clienteNumber = buttonId.replace("rechazar_", "");

                if (pagosPendientes[clienteNumber]) {
                    // Guardar en rechazos pendientes (esperando motivo)
                    rechazosPendientes[ADMIN_NUMBER] = clienteNumber;

                    // Pedir motivo al admin
                    await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                        messaging_product: "whatsapp",
                        to: ADMIN_NUMBER,
                        text: { body: `❌ Pago rechazado para ${pagosPendientes[clienteNumber].nombre}.\n\n📝 Por favor, escribe el motivo del rechazo (ej: "Monto incompleto", "Datos incorrectos"):` }
                    }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });

                    console.log(`⏳ Esperando motivo de rechazo del admin para ${clienteNumber}`);
                } else {
                    await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                        messaging_product: "whatsapp",
                        to: ADMIN_NUMBER,
                        text: { body: `⚠️ No se encontró el pago pendiente para ${clienteNumber}` }
                    }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
                }
                return;
            }
        }

        // LÓGICA: Si el admin escribe texto después de presionar "Rechazar", es el motivo
        if (from === ADMIN_NUMBER && msg.type === "text" && rechazosPendientes[ADMIN_NUMBER]) {
            const clienteNumber = rechazosPendientes[ADMIN_NUMBER];
            const motivo = msg.text.body.trim();

            if (pagosPendientes[clienteNumber]) {
                const datosPago = pagosPendientes[clienteNumber];

                // Enviar mensaje de rechazo amable al cliente
                await axios.post(`https://graph.facebook.com/v17.0/${datosPago.phone_id}/messages`, {
                    messaging_product: "whatsapp",
                    to: clienteNumber,
                    text: { body: `Híjole, mi estimado, mis patrones me dicen que hubo un detalle con su pago: ${motivo}. ¿Me ayuda a revisarlo? 🙏` }
                }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });

                // Confirmar al admin
                await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                    messaging_product: "whatsapp",
                    to: ADMIN_NUMBER,
                    text: { body: `✅ Mensaje de rechazo enviado a ${datosPago.nombre} (${clienteNumber}) con  motivo: "${motivo}"` }
                }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });

                // 💾 PERSISTENCIA: Actualizar estado de pago a 'rechazado'
                await db.updateReserva(clienteNumber, { estado_pago: 'rechazado' });
                console.log(`💾 Estado de pago actualizado en DB: rechazado`);

                // Limpiar rechazos y dejar el pago pendiente (para que puedan enviar otro comprobante)
                delete rechazosPendientes[ADMIN_NUMBER];
                console.log(`❌ Pago rechazado para ${clienteNumber}. Motivo: ${motivo}`);
            }
            return;
        }

        if (msg.type === "image") {
            // RECIBO DE PAGO - Solo notificar al admin, NO enviar mensaje al cliente
            const mediaId = msg.image.id;
            cancelarSeguimiento(from);

            // 💾 PERSISTENCIA: Actualizar estado de pago a 'enviado' (esperando confirmación del admin)
            await db.updateReserva(from, { estado_pago: 'enviado' });
            console.log(`💾 Estado de pago actualizado: enviado (esperando confirmación del admin)`);

            // Extraer nombre del cliente del historial si está disponible
            const nombreCliente = sesionesActivas[from] ?
                (sesionesActivas[from].find(h => h.role === 'user')?.parts?.[0]?.text || "Cliente") :
                "Cliente";

            await notificarAdmin(from, phone_id, mediaId, nombreCliente);

            // NO enviar mensaje al cliente - esperar confirmación del admin
            console.log(`⏳ Pago recibido de ${from}. Esperando confirmación del admin...`);
            return;

        } else if (msg.type === "audio") {
            const rutaValida = await descargarAudio(msg.audio.id);
            if (!rutaValida) { // ✅ Si falla la descarga, no intentamos subir a Google
                respuestaFaraon = "Mis oídos reales fallaron. ¿Podrías repetirlo o escribirme? [VOZ]";
            } else {
                const upload = await fileManager.uploadFile(rutaValida, { mimeType: "audio/ogg", displayName: "audio" });
                const result = await chat.sendMessage([
                    { text: "Responde a este audio usando los datos de KEOPS:" },
                    { fileData: { mimeType: upload.file.mimeType, fileUri: upload.file.uri } }
                ]);
                respuestaFaraon = result.response.text();
            }
        } else if (msg.type === "text") {
            // 💾 PERSISTENCIA: Asegurar que existe una reserva EN_PROCESO antes de procesar el mensaje
            await db.createOrGetReserva(from);

            const result = await chat.sendMessage(msg.text.body);
            respuestaFaraon = result.response.text();

            // 🔄 PERSISTENCIA EN TIEMPO REAL: Sincronización con Supabase
            const textoLower = msg.text.body.toLowerCase();
            const respuestaLower = respuestaFaraon.toLowerCase();

            // 1. Detectar y guardar NOMBRE (extraer de la respuesta de Gemini)
            if (!sesionesActivas[from] || sesionesActivas[from].length < 3) {
                // Es uno de los primeros mensajes - Gemini probablemente detectó el nombre
                if (respuestaLower.includes('bienvenido') || respuestaLower.includes('caballero') || respuestaLower.includes('dama')) {
                    console.log(`🔍 SINCRONIZACIÓN: Gemini detectó un nombre, extrayendo...`);

                    // PASO 1: Verificar si ya existe reserva EN_PROCESO
                    const reservaExistente = await db.getReserva(from);

                    if (reservaExistente?.nombre) {
                        console.log(`📋 Nombre ya guardado: "${reservaExistente.nombre}" - saltando captura`);
                    } else {
                        // PASO 2: Extraer nombre de la respuesta de Gemini
                        // Buscar patrones como "Bienvenido, Juan" o "Caballero Nicolás" o "Dama María"
                        let nombreExtraido = null;

                        // Patrón 1: "Bienvenido, [Nombre]" o "Bienvenida, [Nombre]"
                        const patronBienvenido = /bienvenid[oa],?\s+([A-ZÁ-ÚÑ][a-zá-úñ]+(?:\s+[A-ZÁ-ÚÑ][a-zá-úñ]+)?)/i;
                        const matchBienvenido = respuestaFaraon.match(patronBienvenido);

                        // Patrón 2: "Caballero [Nombre]" o "Dama [Nombre]"
                        const patronCaballero = /(?:caballero|dama)\s+([A-ZÁ-ÚÑ][a-zá-úñ]+(?:\s+[A-ZÁ-ÚÑ][a-zá-úñ]+)?)/i;
                        const matchCaballero = respuestaFaraon.match(patronCaballero);

                        if (matchBienvenido) {
                            nombreExtraido = matchBienvenido[1].trim();
                        } else if (matchCaballero) {
                            nombreExtraido = matchCaballero[1].trim();
                        }

                        // PASO 3: Guardar solo si se extrajo un nombre válido
                        if (nombreExtraido && nombreExtraido.length > 1 && !/^(hola|hi|buenos|buenas|hey)/i.test(nombreExtraido)) {
                            await db.createOrGetReserva(from);
                            await db.updateReserva(from, { nombre: nombreExtraido });

                            // PASO 4: Verificar que se guardó
                            const reservaActualizada = await db.getReserva(from);
                            if (reservaActualizada?.nombre) {
                                console.log(`✅ NOMBRE GUARDADO en DB: "${reservaActualizada.nombre}"`);
                            } else {
                                console.error(`❌ ERROR: El nombre NO se guardó correctamente`);
                            }
                        } else {
                            console.log(`⚠️ No se pudo extraer un nombre válido de la respuesta`);
                        }
                    }
                }
            }

            // 2. Detectar y guardar TIPO DE RESERVA (con verificación)
            if (textoLower.includes('decoración') || textoLower.includes('decoracion') ||
                textoLower.includes('decorada') || textoLower.includes('fiesta')) {
                await db.updateReserva(from, { tipo: 'Decoración', ultimo_paso: 'dando_datos' }); // 📊 Capturando datos
                const verificacion = await db.getReserva(from);
                console.log(`💾 Tipo guardado en DB: Decoración (Verificado: ${verificacion?.tipo})`);
            } else if (textoLower.includes('estándar') || textoLower.includes('estandar') ||
                textoLower.includes('consumible') || textoLower.includes('normal') ||
                textoLower.includes('sin decoración') || textoLower.includes('sin decoracion')) {
                await db.updateReserva(from, { tipo: 'Estándar', ultimo_paso: 'dando_datos' }); // 📊 Capturando datos
                const verificacion = await db.getReserva(from);
                console.log(`💾 Tipo guardado en DB: Estándar (Verificado: ${verificacion?.tipo})`);
            }

            // 3. Detectar y guardar NÚMERO DE PERSONAS
            const personasMatch = msg.text.body.match(/\b(\d+)\s*(persona|people|pax)/i);
            if (personasMatch) {
                await db.updateReserva(from, { personas: parseInt(personasMatch[1]) });
                console.log(`💾 Personas guardado en DB: ${personasMatch[1]}`);
            } else if (/^\d+$/.test(msg.text.body.trim()) && respuestaLower.includes('hora')) {
                // Si es solo un número y la respuesta pregunta por hora, probablemente es personas
                await db.updateReserva(from, { personas: parseInt(msg.text.body.trim()) });
                console.log(`💾 Personas guardado en DB: ${msg.text.body}`);
            }

            // 4. Detectar y guardar FECHA (varios formatos)
            const fechaMatch = msg.text.body.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
            if (fechaMatch || textoLower.includes('mañana') || textoLower.includes('hoy') ||
                textoLower.includes('viernes') || textoLower.includes('sábado') || textoLower.includes('domingo')) {
                // Esperar a que Gemini calcule la fecha exacta y la incluya en la respuesta
                const fechaRespuesta = respuestaFaraon.match(/(\d{1,2})[\/](\d{1,2})[\/](\d{4})/);
                if (fechaRespuesta) {
                    const [_, dia, mes, año] = fechaRespuesta;
                    const fechaISO = `${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
                    await db.updateReserva(from, { fecha: fechaISO });
                    console.log(`💾 Fecha guardada en DB: ${fechaISO}`);
                }
            }

            // 5. Detectar y guardar HORA
            const horaMatch = msg.text.body.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|p\.m\.|a\.m\.)?/i);
            if (horaMatch && (textoLower.includes('tarde') || textoLower.includes('noche') ||
                textoLower.includes('am') || textoLower.includes('pm') || /\d{1,2}:\d{2}/.test(msg.text.body))) {
                let hora = parseInt(horaMatch[1]);
                const minutos = horaMatch[2] || '00';
                const periodo = horaMatch[3] ? horaMatch[3].toLowerCase() : '';

                // Convertir a formato 24h si es PM
                if (periodo.includes('pm') && hora < 12) hora += 12;
                if (periodo.includes('am') && hora === 12) hora = 0;

                const horaFormato = `${hora.toString().padStart(2, '0')}:${minutos}:00`;
                await db.updateReserva(from, { hora: horaFormato });
                console.log(`💾 Hora guardada en DB: ${horaFormato}`);
            }
        }

        sesionesActivas[from] = await chat.getHistory(); // Guardar memoria

        if (respuestaFaraon.includes("[VOZ]")) {
            // Extracción de partes usando XML
            const guionMatch = respuestaFaraon.match(/<guion_audio>([\s\S]*?)<\/guion_audio>/);

            // Si hay guion de audio, usamos ese. Si no, limpiamos la etiqueta [VOZ] del texto original.
            let scriptAudio = guionMatch ? guionMatch[1].trim() : respuestaFaraon.replace("[VOZ]", "").trim();

            // 1. Detección y Envío de Menús (Regex Robustas)
            let menuEnviado = false;
            // Detectar variaciones como [ MENÚ_MEX ] o [MENÚ MEX]
            if (/\[\s*MENÚ_MEX\s*\]/i.test(respuestaFaraon) || /\[\s*MENU_MEX\s*\]/i.test(respuestaFaraon)) {
                await enviarMenuWhatsApp(ID_CARTA_REST, from, phone_id);
                await db.updateReserva(from, { ultimo_paso: 'viendo_menu' }); // 📊 Actualizar progreso
                scriptAudio = scriptAudio.replace(/\[\s*MENÚ_MEX\s*\]/gi, "").replace(/\[\s*MENU_MEX\s*\]/gi, "");
                menuEnviado = true;
            }


            // 2. Detección de UBICACIÓN
            if (/\[\s*UBICACIÓN\s*\]/i.test(respuestaFaraon) || /\[\s*UBICACION\s*\]/i.test(respuestaFaraon)) {
                await enviarUbicacion(from, phone_id);
                await db.updateReserva(from, { ultimo_paso: 'viendo_ubicacion' }); // 📊 Actualizar progreso
                scriptAudio = scriptAudio.replace(/\[\s*UBICACIÓN\s*\]/gi, "").replace(/\[\s*UBICACION\s*\]/gi, "");
            }

            // 3. Detección de DATOS DE PAGO (Mensaje Conversacional)
            if (/\[\s*DATOS_PAGO\s*\]/i.test(respuestaFaraon) || /\[\s*DATOS PAGO\s*\]/i.test(respuestaFaraon)) {
                await enviarImagenPago(from, phone_id);
                await db.updateReserva(from, { ultimo_paso: 'esperando_pago' }); // 📊 Actualizar progreso

                // Limpiar etiqueta del audio
                scriptAudio = scriptAudio.replace(/\[\s*DATOS_PAGO\s*\]/gi, "").replace(/\[\s*DATOS PAGO\s*\]/gi, "");

                // Mensaje conversacional en lugar de template
                scriptAudio += "\n\nEn la imagen que te acabo de enviar están los datos para hacer el abono. Una vez lo hagas, me mandas el comprobante como IMAGEN y yo confirmo tu reserva al toque. 🎂✨";

                programarSeguimientoPago(from, phone_id); // Iniciar timer 24h
            }

            // Limpieza final de seguridad para el audio (quitar etiquetas si quedaron)
            scriptAudio = scriptAudio.replace(/<[^>]*>/g, '').trim();

            // ⏱️ DECISIÓN: Voz o Texto (según tiempo entre mensajes Y estado del usuario)
            const ahora = Date.now();
            const ultimoMensaje = ultimoMensajeUsuario[from] || 0;
            const tiempoTranscurrido = ahora - ultimoMensaje;

            // Verificar si el usuario tiene nombre en la DB
            const reservaActual = await db.getReserva(from);
            const tieneNombre = reservaActual?.nombre && reservaActual.nombre.length > 0;

            // PRIMER MENSAJE SIEMPRE AUDIO, o si no tiene nombre, o si pasó tiempo suficiente
            const usarVoz = !tieneNombre || ultimoMensaje === 0 || tiempoTranscurrido > TIEMPO_ENTRE_MENSAJES_VOZ;

            // Actualizar timestamp
            ultimoMensajeUsuario[from] = ahora;

            if (usarVoz) {
                // PRIMER MENSAJE o HAN PASADO MÁS DE 30s: Enviar con VOZ
                console.log("🎤 Enviando respuesta con AUDIO (primera o después de pausa)");
                if (scriptAudio) {
                    const audioFonetico = aplicarFonetica(scriptAudio);
                    await enviarAudioWhatsApp(audioFonetico, from, phone_id);
                }
            } else {
                // MENSAJE RÁPIDO CONSECUTIVO: Enviar como TEXTO
                console.log("💬 Enviando respuesta como TEXTO (mensaje rápido consecutivo)");
                if (scriptAudio) {
                    await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                        messaging_product: "whatsapp",
                        to: from,
                        text: { body: scriptAudio }
                    }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
                }
            }

            // EL GANCHO INMEDIATO (Texto post-audio si hubo menú)
            if (menuEnviado) {
                await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                    messaging_product: "whatsapp", to: from, text: { body: "Mientras conoces nuestra carta... 🌮 ¿Te gustaría que te aparte un rincón especial cerca del ambiente mexicano? ¡No te pierdas nuestras noches de margaritas y buena música! ��" }
                }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
            }

        } else {
            // Respuesta Texto Normal (Listas largas, menús, o cuentas detalladas)
            if (/\[\s*DATOS_PAGO\s*\]/i.test(respuestaFaraon) || /\[\s*DATOS PAGO\s*\]/i.test(respuestaFaraon)) {
                await enviarImagenPago(from, phone_id);
                programarSeguimientoPago(from, phone_id);
                respuestaFaraon = respuestaFaraon.replace(/\[\s*DATOS_PAGO\s*\]/gi, "").replace(/\[\s*DATOS PAGO\s*\]/gi, "");
            }

            await axios.post(`https://graph.facebook.com/v17.0/${phone_id}/messages`, {
                messaging_product: "whatsapp", to: from, text: { body: respuestaFaraon }
            }, { headers: { 'Authorization': `Bearer ${whatsappToken}` } });
        }

        programarSeguimiento(from, phone_id);

    } catch (e) {
        console.error("\ud83d\udd25 Error cr\u00edtico:", e.message);
    } finally {
        // \ud83d\udd13 Liberar lock del usuario (siempre, incluso si hubo error)
        usuariosProcesando.delete(from);
        console.log(`\u2705 Usuario ${from} liberado para nuevos mensajes`);
    }
});

// --- ESTA ES LA PARTE QUE FALTA ---

// 🩺 RUTA DE SALUD PARA RENDER (OBLIGATORIA)
app.get("/healthz", (req, res) => {
    res.status(200).send("Vicentico está vivo y listo para los tacos 🌵🌮");
});

// Verificación del Webhook (GET)
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === verifyToken) {
        res.status(200).send(req.query["hub.challenge"]);
    } else {
        res.sendStatus(403);
    }
});

// Configuración del Puerto (Render usa el 10000 por defecto)
const PORT = process.env.PORT || 10000;

// Verificar conexión a base de datos e iniciar servidor
db.testConnection().then(connected => {
    if (connected) {
        app.listen(PORT, () => console.log(`🌮 Bot Las Margaritas listo en puerto ${PORT}.`));
    } else {
        console.error('❌ Error crítico: No se pudo conectar a la base de datos. El bot no iniciará.');
    }
});

// Manejo de cierre limpio
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM recibido, cerrando gracefully...');
    await db.closePool();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT recibido, cerrando gracefully...');
    await db.closePool();
    process.exit(0);
});
