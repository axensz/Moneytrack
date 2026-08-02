## Why

La sesión real de Chrome confirmó que la cabecera móvil ensancha la aplicación y recorta una acción de cuenta, mientras que el acceso flotante y el panel del asistente IA cubren acciones financieras o pueden quedar bajo la cabecera sin una salida visible. Estos defectos reducen control y confianza precisamente en sesiones cortas, frecuentes y móviles.

## What Changes

- Mantener la cabecera y el contenido dentro del viewport móvil, con todas las acciones prioritarias alcanzables y sin scroll horizontal de página.
- Reubicar las acciones secundarias de cuenta cuando el ancho no permita conservarlas todas en la fila superior, sin alterar el orden aprobado de los controles que permanezcan visibles.
- Sustituir la burbuja flotante invasiva por puntos de entrada propiedad del shell que no cubran CTAs, calendario, gráficos ni navegación.
- Mantener el asistente globalmente descubrible tanto si está configurado como si aún requiere activación.
- Hacer que el panel del asistente respete cabecera, navegación inferior, safe areas y altura dinámica del viewport; sus controles de título, limpiar y cerrar permanecerán visibles.
- Permitir cerrar el panel con su control visible o con Escape, y restaurar el foco al disparador que lo abrió.
- Alinear la superficie del asistente con los tokens y excepciones de `PRODUCT.md` y `DESIGN.md`, sin modificar el shell violet ni los gradientes aprobados de `RecurringStatsCards`.
- Añadir regresiones enfocadas y verificación visual en Chrome para 390×844 y 1270×571, en temas claro y oscuro.
- No duplicar el skip link, el focus trap modal, las pestañas de Ayuda ni los estados vacíos ya contratados por cambios OPSX existentes.

## Capabilities

### New Capabilities

- `responsive-shell-fit`: Define cómo la cabecera, las acciones de cuenta y el contenido permanecen dentro del viewport móvil sin perder operabilidad.
- `ai-overlay-operability`: Define puntos de entrada no invasivos y un panel IA visible, cerrable, enfocable y contenido dentro de las zonas seguras del shell.

### Modified Capabilities

None.

## Impact

El cambio afecta principalmente `Header`, su menú de ajustes, la composición del shell en `AuthenticatedApp`, `AIChatBot`, `AITeaserButton`, tokens/clases compartidas estrictamente necesarios y sus pruebas. Añade una entrada directa del asistente al shell desde 1024 px y usa Ajustes por debajo de ese ancho; mueve `Cerrar sesión` al menú de ajustes únicamente por debajo de 640 px, conservando su acceso directo desde 640 px.

No cambia modelos financieros, persistencia, autenticación, contratos de Gemini, navegación de datos, dependencias ni cálculos. Depende conceptualmente de `harden-desktop-shell-and-interactions` para el contrato general de foco y de `align-desktop-states-and-help` para estados y copy; no reescribe sus artefactos ni los cambios locales actuales en `useModalA11y`.
