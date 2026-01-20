// Parche temporal para arreglar el error de producción
// Este script reemplaza el bloque finally problemático

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index.js');
let content = fs.readFileSync(filePath, 'utf8');

// Buscar el bloque finally problemático y reemplazarlo
const problematicCode = `    } finally {
        // 🔓 Liberar lock del usuario (siempre, incluso si hubo error)
        usuariosProcesando.delete(from);
        console.log(\`✅ Usuario \${from} liberado para nuevos mensajes\`);
    }`;

const fixedCode = `    } finally {
        // 🔓 Liberar lock del usuario (siempre, incluso si hubo error)
        // SAFETY: from puede no estar definido si el error ocurrió antes de su declaración
        if (typeof from !== 'undefined' && from) {
            usuariosProcesando.delete(from);
            console.log(\`✅ Usuario \${from} liberado para nuevos mensajes\`);
        }
    }`;

if (content.includes('usuariosProcesando.delete(from)')) {
    content = content.replace(problematicCode, fixedCode);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Archivo parcheado exitosamente');
} else {
    console.log('⚠️ El código problemático no se encontró o ya fue parcheado');
}
