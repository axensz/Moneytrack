## Why

El encabezado concentra demasiadas acciones globales y presenta dos controles con poco contexto: el ojo de privacidad no comunica con claridad que afecta todos los importes y el acceso al asistente IA compite visualmente con notificaciones y ajustes. Tras revisar la primera implementación, la decisión aprobada es ubicar la privacidad junto al título `Resumen general`, donde comunica que gobierna las cuatro métricas, y convertir la IA en una acción flotante global.

La marca `MoneyTrack` también debe funcionar como el punto de retorno predecible a la vista inicial `Transacciones`, sin recargar la aplicación ni crear una ruta paralela.

## What Changes

- Mover el control global `Ocultar valores` / `Mostrar valores` desde `Header` a la línea de encabezado de `Resumen general` en `StatsCards`, sin cambiar la preferencia compartida ni el enmascaramiento existente.
- Mantener el control de privacidad siempre visible a nivel del conjunto, fuera de las tarjetas individuales, con objetivo táctil mínimo de 44×44 CSS px, nombre dinámico, estado presionado y respuesta inmediata.
- Sustituir los accesos al asistente del encabezado y del menú de ajustes por un único lanzador flotante global de 48×48 CSS px.
- Hacer que el lanzador respete la navegación inferior, safe areas, el panel abierto y los estados invitado, sin configurar, configurado y autorización pendiente.
- Restaurar el foco al lanzador al cerrar el asistente y conservar la configuración, consentimiento, conversación y salvaguardas financieras actuales.
- Convertir la marca `MoneyTrack` del encabezado en una acción nativa y accesible que reutilice el enrutador existente para volver a `Transacciones`.
- Estandarizar el cursor de mano para controles nativos y roles ARIA interactivos, conservando `not-allowed` en estados deshabilitados.
- Actualizar los contratos responsive y de operabilidad del asistente que anteriormente exigían entradas dentro del shell y prohibían un disparador flotante cerrado.

No se cambiarán cálculos, persistencia, mutaciones financieras, estructura de navegación móvil, dependencias, contenido del asistente ni el diseño interno de sus mensajes.

## Capabilities

### New Capabilities

Ninguna.

### Modified Capabilities

- `ai-overlay-operability`: reemplazar las entradas de asistente en encabezado/ajustes por un lanzador flotante único que no cubra contenido ni navegación y conserve el contrato de foco.
- `responsive-shell-fit`: retirar privacidad e IA del grupo obligatorio de acciones del encabezado, exigir que privacidad permanezca disponible junto al título del resumen sin provocar overflow, convertir la marca en el acceso a `Transacciones` y uniformar la afordancia de cursor de los controles.

## Impact

- Componentes principales: `src/components/layout/Header.tsx`, `src/components/shared/StatsCards.tsx`, `src/AuthenticatedApp.tsx` y un lanzador de asistente pequeño y aislado si la implementación lo requiere.
- Pruebas: contratos de `Header`, `StatsCards`, shell responsive y `AIChatBot`.
- CSS: reutilización de tokens semánticos existentes; no se agregan colores, gradientes o dependencias.
- Alcance responsive: desktop y móvil, únicamente para ubicación segura de los dos controles globales; las rutas y destinos no cambian.
