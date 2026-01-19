const { GoogleGenerativeAI } = require("@google/generative-ai");

// Pega tu API KEY aquí
const genAI = new GoogleGenerativeAI("AIzaSyApXv5j4dAb06Il_39pnOf7CjWE6BiBxlQ");

async function listarModelos() {
    console.log("🔍 Consultando a Google qué modelos tienes habilitados...");
    try {
        // Esta función obtiene la lista oficial asociada a tu cuenta
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        // (Usamos una instancia cualquiera para acceder al listado, el SDK no tiene un método directo 'listModels' expuesto en la clase principal en todas las versiones, pero intentaremos una llamada directa a la API si falla lo obvio).

        // NOTA: El SDK de Node a veces oculta el listado. Vamos a probar algo más directo con fetch puro para no depender de la versión del SDK.
        const apiKey = "AIzaSyApXv5j4dAb06Il_39pnOf7CjWE6BiBxlQ"; // Pégala aquí también por si acaso
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log("\n✅ MODELOS DISPONIBLES PARA TI:");
            console.log("--------------------------------");
            data.models.forEach(m => {
                // Filtramos solo los que sirven para generar contenido
                if (m.supportedGenerationMethods.includes("generateContent")) {
                    console.log(`🌟 Nombre: ${m.name.replace("models/", "")}`);
                }
            });
            console.log("--------------------------------");
            console.log("👉 COPIA UNO DE ESOS NOMBRES EXACTOS EN TU CÓDIGO.");
        } else {
            console.log("❌ Error leyendo modelos:", data);
        }

    } catch (error) {
        console.log("❌ Error fatal:", error.message);
    }
}

listarModelos();