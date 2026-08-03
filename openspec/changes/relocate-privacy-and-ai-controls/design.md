## Context

`Header` concentra hoy avatar, tema, privacidad, notificaciones, asistente, ajustes y salida. La preferencia `hideBalances` ya es global y persistente mediante `UIPreferencesContext`, mientras `StatsCards` solo la consume para enmascarar los cuatro importes del resumen. El acceso al asistente también vive en `Header`, aunque el estado del panel, el disparador de retorno de foco y los modales de autenticación/configuración pertenecen a `AuthenticatedApp`.

El cambio base `stabilize-responsive-shell-and-ai-overlays` impedía un disparador flotante cerrado para evitar superposiciones. Ese cambio ya fue integrado y archivado; esta decisión de producto modifica deliberadamente ese contrato con límites de ubicación, tamaño y foco más precisos.

## Goals / Non-Goals

**Goals:**

- Hacer inmediata y contextual la privacidad ubicándola junto al título `Resumen general`.
- Reducir el ruido del encabezado retirando privacidad e IA.
- Proporcionar un único lanzador flotante de IA seguro en móvil y desktop.
- Preservar el estado global de privacidad, las rutas de autenticación/configuración y el retorno de foco.
- Mantener targets táctiles WCAG 2.1 AA, safe areas y `prefers-reduced-motion`.

**Non-Goals:**

- Cambiar cálculos, persistencia financiera, formato de importes o la máscara actual.
- Rediseñar el panel, mensajes, acciones o configuración de Gemini.
- Modificar la estructura de navegación móvil o introducir dependencias/tokens nuevos.
- Añadir accesos alternativos o atajos que dupliquen los dos controles.

## Decisions

### 1. El encabezado de `Resumen general` será el único dueño visual del control de privacidad

`StatsCards` consume `setHideBalances` además de `hideBalances`. El botón compartirá una fila flex con el título `Resumen general`, alineado al extremo derecho y fuera de las cuatro tarjetas; la fila completa comunica que gobierna todo el conjunto y conserva el balance visual elegido por el usuario. Será un botón de al menos 44×44 CSS px con `EyeOff` cuando los valores están visibles, `Eye` cuando están ocultos, `aria-pressed`, `aria-label` y `title` dinámicos.

La preferencia seguirá siendo global: activar el botón enmascara o revela inmediatamente todos los importes que ya consumen `UIPreferencesContext`, no solo esa tarjeta. El control permanecerá disponible durante `balanceSettling` y no alterará el estado de carga.

La primera implementación lo ubicó en `Saldo actual`, pero la revisión visual mostró que esa proximidad podía interpretarse como una acción exclusiva de esa tarjeta. El usuario eligió explícitamente la línea de `Resumen general`; se mantienen descartados el menú de ajustes y cualquier segundo acceso que duplique la acción.

### 2. Un `AssistantLauncher` presentacional sustituirá las entradas del encabezado

Se introducirá un componente pequeño, sin conocimiento financiero, que reciba etiqueta, estado pendiente, estado abierto y una acción de activación. Usará un botón circular de 48×48 CSS px, icono `Bot`, `--primary-solid`, texto `--primary-foreground`, borde/sombra existentes y foco violeta. No habrá pulso, glow animado ni gradiente adicional.

El lanzador se fijará a la esquina inferior derecha. En móvil, su `bottom` incluirá `--shell-nav-h`, `env(safe-area-inset-bottom)` y separación adicional; desde `sm`, usará el margen desktop existente. El z-index quedará por encima del contenido y por debajo de navegación, encabezado, modales y paneles que ya poseen prioridad superior.

Mientras el asistente esté abierto, el botón permanecerá montado para conservar una referencia de foco estable, pero será visualmente oculto, no interactivo y retirado del orden de tabulación. Al cerrar el panel reaparecerá y recibirá el foco mediante el contrato actual de `returnFocusRef`.

### 3. `AuthenticatedApp` conservará la decisión de flujo

La lógica de activación saldrá de `Header` y se mantendrá junto al estado que ya controla los destinos:

- Invitado: abre autenticación.
- Usuario con IA sin configurar: abre configuración Gemini.
- Usuario configurado: guarda el lanzador como retorno de foco y abre `AIChatBot`.
- Consentimiento pendiente: el lanzador muestra un badge de estado con nombre accesible.

`Header` perderá las props y entradas de privacidad/IA que dejen de utilizarse. Como `pendingSettingsCount` representa actualmente solo el consentimiento de IA, ese badge dejará el engranaje y pasará al lanzador para no comunicar una deuda en el destino equivocado.

### 4. Validación centrada en contratos y navegador real

Las pruebas de `StatsCards` comprobarán ubicación, tamaño, estado y propagación de la preferencia. Las de shell comprobarán ausencia de las entradas antiguas y el enrutamiento invitado/sin configurar/configurado del lanzador. Las regresiones de `AIChatBot` verificarán apertura, Escape/cierre y retorno de foco.

Chrome validará claro/oscuro y al menos 390×844, 1214×768 y 1440×900, incluyendo scroll, panel abierto, navegación móvil, onboarding incompleto y ausencia de overflow.

## Risks / Trade-offs

- **El control de privacidad deja de estar disponible en todas las vistas** → permanece en el resumen principal de Transacciones, que es la entrada de la aplicación, y su estado global persiste al navegar.
- **El lanzador puede cubrir contenido o el onboarding** → offsets responsive, esquina opuesta al checklist desktop y verificaciones de geometría en Chrome.
- **Ocultar el lanzador desmontándolo rompería el retorno de foco** → mantener el nodo montado e inerte mientras el panel está abierto.
- **El badge de autorización podría duplicarse en Ajustes** → retirar `pendingSettingsCount` del encabezado cuando se migre el indicador al lanzador.
- **Cambiar un contrato OPSX ya completado puede dejar documentación contradictoria** → el cambio base fue archivado y este SDD modifica explícitamente los requisitos afectados.

## Migration Plan

1. Implementar pruebas fallidas para privacidad y lanzador.
2. Mover privacidad a la línea de `Resumen general` y retirar las entradas antiguas del encabezado global.
3. Añadir el lanzador y conectar los estados existentes.
4. Ejecutar pruebas enfocadas, suite completa, typecheck, lint, build y validación OPSX estricta.
5. Verificar visualmente en Chrome y actualizar el PR #76 antes de volver a marcarlo listo.

El rollback consiste en revertir el commit de implementación: no existe migración de datos ni cambio de esquema.

## Open Questions

Ninguna. La ubicación junto a `Resumen general` y el lanzador flotante fueron aprobados por el usuario.
