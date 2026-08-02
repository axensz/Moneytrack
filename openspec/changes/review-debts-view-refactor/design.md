## Context

La extracción fue introducida por el commit histórico `304aaf4` y hoy forma parte de `main`. El commit `72f6a82` citado en la conversación previa ya no existe en el grafo de Git del checkout; la revisión usa el contenido integrado como fuente de verdad.

La vista conserva una estructura feature-local:

- `DebtsView.tsx`: obtiene datos, mantiene el estado coordinador, valida acciones y organiza secciones.
- `components/DebtCard.tsx`: presenta una deuda activa y sus acciones inline.
- `components/NewDebtForm.tsx`: presenta el alta de préstamo o deuda.
- `components/PaymentScheduleFields.tsx`: presenta los cuatro modos de programación.
- `utils/paymentScheduleForm.ts`: transforma y valida la programación de pagos.
- `utils/debtForm.ts`: crea el estado inicial del formulario.
- `constants.ts`: comparte las etiquetas de condonación.

El cambio pretendía conservar el comportamiento y la apariencia. Por eso la evidencia decisiva de este OPSX es una revisión del producto en ejecución, no una nueva modificación del código.

## Goals / Non-Goals

**Goals:**

- Hacer trazable la separación de responsabilidades ya integrada.
- Comprobar que todos los estados visibles siguen presentes y son legibles en desktop.
- Revisar jerarquía, espaciado, contraste semántico, desbordamientos y transiciones entre paneles inline.
- Separar hechos observados, riesgos y correcciones propuestas.

**Non-Goals:**

- Reabrir la arquitectura completa de MoneyTrack.
- Cambiar reglas financieras, persistencia, tipos o contratos de hooks.
- Rediseñar la vista, sus tokens o la navegación.
- Corregir hallazgos durante esta revisión.
- Auditar la composición móvil; requiere una revisión independiente si se amplía el alcance.

## Decisions

### Revisar el estado integrado, no recrear el commit original

La rama activa contiene la refactorización integrada y cambios posteriores. Se revisará el comportamiento actual de esos componentes, usando el commit `304aaf4` solo para delimitar qué responsabilidades fueron extraídas. La alternativa de reconstruir una rama temporal se descarta porque no representaría lo que el usuario ejecuta hoy.

### Usar una matriz de estados visible y reproducible

La revisión cubrirá, en este orden:

1. Resumen y estado vacío: cuatro métricas, título, descripción y llamada a crear.
2. Alta: selector `Yo presté`/`Me prestaron`, datos básicos, fechas, programación y cuenta asociada.
3. Programación: `Sin fecha`, `Mensual`, `Fecha` y `Meses`, incluidos sus campos condicionales.
4. Tarjetas activas: nombre, descripción, montos, progreso, vencimiento, próximo pago y orden por fecha.
5. Acciones inline: programar, modificar saldo, pagar y condonar; se probará el cambio rápido entre acciones para detectar paneles simultáneos o saltos de layout.
6. Cierre: lista de saldados y diálogo de eliminación.
7. Tema: superficies, texto, estados y controles en claro y oscuro.

Se inspeccionarán primero los estados existentes para evitar crear datos innecesarios. Las acciones destructivas o que mueven dinero no se confirmarán; basta abrir y cerrar sus superficies.

### Mantener el estándar visual existente

La revisión usa `PRODUCT.md`, `DESIGN.md` y los tokens actuales como contrato. Violeta es marca/acción/selección; verde, rojo y ámbar expresan estado. No se evaluará la pantalla contra estilos externos ni contra un dashboard genérico.

### Registrar hallazgos antes de editar

Todo defecto se documentará con estado, pasos, evidencia y severidad. Una corrección posterior necesitará alcance explícito; este OPSX no autoriza cambios de producto.

## Risks / Trade-offs

- [Los datos existentes no cubren todos los estados] → Documentar qué estados fueron comprobados y cuáles quedan pendientes; no inventar evidencia.
- [Una acción inline podría modificar dinero] → Abrir/cerrar formularios sin confirmar pagos, ajustes, condonaciones o borrados.
- [La rama tiene cambios locales ajenos en accesibilidad modal] → No editar ni incluir esos archivos en este OPSX.
- [Los cambios posteriores pueden ocultar una regresión histórica] → Reportar el estado actual y citar `304aaf4` solo como límite de la extracción.
- [Una sola resolución no prueba toda la respuesta responsive] → Declarar el viewport observado y dejar otras resoluciones como validación pendiente.

## Migration Plan

No hay migración ni despliegue. Si la revisión encuentra defectos, se propondrá un cambio pequeño y separado con pruebas enfocadas. El rollback de este OPSX consiste únicamente en retirar sus documentos.

## Open Questions

Ninguna para iniciar la revisión desktop.
