# THE BLACK FITNESS - App de Planes Nutricionales con IA

Aplicación web cliente (frontend) para registrar datos de clientes, generar planes nutricionales mensuales con ayuda de IA, visualizar resultados, exportar a PDF y guardar historial local en el navegador.

## Características principales

- Registro de datos del cliente con validaciones básicas.
- Generación de plan nutricional de 4 semanas.
- Integración con endpoint de IA configurable.
- Modo de respaldo local (simulación) si el endpoint no responde.
- Vista previa del plan en la interfaz.
- Exportación a PDF con branding personalizable.
- Historial local de planes y PDFs en IndexedDB.
- Configuración local de marca, colores, prompt base y logo.

## Stack y dependencias

- HTML + CSS + JavaScript (ES Modules).
- IndexedDB para persistencia local.
- jsPDF (CDN) para generación de PDF.
- Sin backend obligatorio para funcionar en modo simulación.

## Estructura del proyecto

- `index.html`: estructura de la UI, formularios y secciones.
- `styles.css`: estilos visuales y responsive.
- `app.js`: orquestación principal de eventos y flujo de negocio.
- `database.js`: acceso a IndexedDB (clientes, planes, configuración, historial PDF).
- `aiService.js`: construcción de prompt y llamada a IA (con fallback simulado).
- `pdfGenerator.js`: armado y exportación de PDF con jsPDF.
- `ui.js`: renderizado de estado, vista previa, historial y branding.
- `utils.js`: utilidades de validación, sanitización, fechas, archivos y JSON.
- `logo.jpeg`: logo por defecto.

## Requisitos

- Navegador moderno con soporte para:
  - ES Modules
  - IndexedDB
  - Fetch API
- Servidor HTTP local (recomendado). Evita abrir `index.html` con `file://` para prevenir restricciones del navegador.

## Cómo ejecutar en local

### Opción rápida con Node.js

1. Abrir terminal en la carpeta del proyecto.
2. Ejecutar:

```bash
npx serve .
```

3. Abrir la URL mostrada por la terminal (por ejemplo `http://localhost:3000`).

### Opción con Python

```bash
python3 -m http.server 8080
```

Luego abrir `http://localhost:8080`.

## Flujo funcional

1. La app inicia y abre IndexedDB.
2. Carga configuración local guardada (`configuracion`) o usa valores por defecto.
3. Si no hay logo guardado en base64, intenta cargar `logo.jpeg` como logo inicial.
4. El usuario completa el formulario de cliente.
5. Se validan campos obligatorios.
6. Se guarda el cliente en IndexedDB.
7. Se construye prompt con `basePrompt + datos del cliente`.
8. Se solicita el plan al endpoint IA configurado.
9. Si falla la IA, se usa un plan simulado local.
10. Se valida la estructura del JSON de plan.
11. Se guarda el plan en IndexedDB y se muestra en vista previa.
12. Se genera PDF, se registra en historial de PDFs y se habilita descarga.
13. El historial permite ver, descargar (desde caché o regenerando) y eliminar planes.

## Configuración editable desde la UI

En la sección "Configuración local" se puede ajustar:

- `brandName`
- `brandSlogan`
- `aiEndpoint`
- `primaryColor`
- `surfaceColor`
- `basePrompt`
- `logoBase64` (subiendo imagen)

Todo se guarda localmente en IndexedDB.

## Endpoint de IA esperado

La app hace `POST` JSON a `aiEndpoint` y espera respuesta en formato JSON de plan.

### Ejemplo mínimo válido de respuesta

```json
{
  "titulo": "Plan de alimentacion mensual",
  "cliente": {
    "nombre": "Juan Perez",
    "edad": 30,
    "peso": 80,
    "altura": 178,
    "sexo": "Masculino"
  },
  "objetivo": "Bajar grasa",
  "calorias_estimadas": "2200 kcal/dia",
  "recomendaciones_generales": [
    "Priorizar alimentos frescos"
  ],
  "semanas": [
    {
      "semana": "Semana 1",
      "comidas": [
        {
          "tipo": "Desayuno",
          "descripcion": "Avena con fruta"
        }
      ]
    }
  ],
  "sustituciones": [
    "Pollo por pavo"
  ],
  "notas_finales": [
    "Ajustar por progreso semanal"
  ]
}
```

## Esquema de datos en IndexedDB

Base de datos: `the_black_fitness_db`

Object stores:

- `clientes`
  - `id` (autoIncrement, keyPath)
  - índices: `nombre`, `fecha_creacion`
- `planes`
  - `id` (autoIncrement, keyPath)
  - índices: `clienteId`, `fecha`
- `configuracion`
  - `id` (keyPath, se usa `main`)
- `historial_pdf`
  - `id` (autoIncrement, keyPath)
  - índices: `planId`, `fecha`

## Errores y comportamiento esperado

- Si el endpoint IA no está disponible o responde error, la app muestra aviso y usa simulación local.
- Si la respuesta IA no cumple el formato, se muestra error de validación.
- La descarga PDF puede fallar si jsPDF no carga correctamente desde CDN.
- Los datos no se sincronizan en la nube: todo es almacenamiento local del navegador.

## Seguridad y límites

- Se aplica sanitización básica de texto para reducir riesgo de inyección en UI.
- No existe autenticación ni control de acceso.
- No hay cifrado de datos en reposo dentro del navegador.
- Para producción, se recomienda backend propio con autenticación, auditoría y cifrado.

## Posibles mejoras

- Agregar tests unitarios para validación y utilidades.
- Integrar control de versiones de prompts.
- Exportar/importar backup completo de IndexedDB.
- Añadir internacionalización de textos.
- Añadir métricas nutricionales más avanzadas y personalizadas.
