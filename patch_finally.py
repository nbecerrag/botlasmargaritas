import re

# Read the file
with open('index.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to find the problematic finally block
old_pattern = r'(\s*}\s*finally\s*{\s*\n\s*//[^\n]*\n\s*)usuariosProcesando\.delete\(from\);(\s*\n\s*console\.log\(`[^`]+\$\{from\}[^`]+`\);)'

# Replacement with safety check
replacement = r'''\1// SAFETY: from puede no estar definido si el error ocurrió antes de su declaración
        if (typeof from !== 'undefined' && from) {
            usuariosProcesando.delete(from);\2
        }'''

# Apply the replacement
new_content, count = re.subn(old_pattern, replacement, content)

if count > 0:
    # Write back
    with open('index.js', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f'✅ Parche aplicado exitosamente ({count} reemplazo(s))')
else:
    print('⚠️ No se encontró el patrón a reemplazar. El archivo podría estar ya parcheado.')
