# Evidencia de revisión

## Contexto observado

- Fecha: 2026-08-01.
- Aplicación: `http://localhost:3000` en Vivaldi.
- Ventana: 1280 × 672 píxeles, con el viewport web reducido por la interfaz del navegador.
- Estado: modo invitado, sin cuentas, préstamos, deudas ni saldados.
- Tema inicial y final: oscuro; también se comprobó el tema claro.
- Regla de seguridad: no se confirmó ninguna alta, pago, modificación de saldo, condonación o eliminación.

## Segunda pasada: sesión autenticada

- Fecha: 2026-08-01.
- Aplicación: la misma pestaña de `http://localhost:3000` en Vivaldi, con sesión del propietario confirmada por la interfaz.
- Datos disponibles: tres préstamos activos del grupo `Me deben` y seis registros saldados. El informe no conserva nombres, montos ni descripciones privadas.
- Tema: oscuro. La comprobación claro/oscuro ya se había realizado en la primera pasada para el estado vacío y el alta.
- Regla de seguridad: revisión de solo lectura. Se abrieron y cerraron superficies, pero no se escribió en campos ni se confirmó ninguna operación financiera o destructiva.

### Cobertura autenticada

- El resumen representa de forma coherente los conteos activos, saldados y el balance neto.
- Las tarjetas activas muestran saldo actual, valor original cuando aplica, progreso, monto restante, antigüedad y dos variantes temporales: próximo pago aproximado y vencimiento fijo.
- La agenda de próximo pago abrió con el modo mensual y su día existente; también presentó los cuatro modos esperados. Se cerró sin guardar.
- Las superficies de pago, modificación de saldo y condonación abrieron y cerraron sin introducir datos ni ejecutar acciones.
- La coexistencia de las tres superficies inline se reprodujo visualmente en una misma tarjeta; este riesgo deja de ser solo una inferencia de código.
- El diálogo de eliminación comunicó alcance e irreversibilidad. Se cerró con `Escape`, devolvió el foco al botón de eliminar y no se confirmó la acción.
- La lista de saldados se expandió y mostró estados normales y un caso condonado con motivo visible; después se dejó colapsada.

## Re-verificación final en Chrome

- Fecha: 2026-08-02.
- Aplicación: `http://localhost:3000` controlada mediante la extensión de Chrome solicitada por el propietario.
- Viewport observado: 1280 × 900 píxeles; se alternaron tema claro y oscuro.
- Estado: sesión autenticada con cuentas normales, tarjetas, préstamos activos y registros saldados. La evidencia no conserva nombres, montos ni descripciones privadas.
- Regla de seguridad: se escribió únicamente un borrador temporal en el formulario y se canceló. No se confirmó ninguna alta, pago, modificación, condonación o eliminación.

### Cobertura final

- `Yo presté` y `Me prestaron` exponen su selección mediante `aria-pressed`; las etiquetas de fecha y la ayuda contextual cambian con el flujo elegido.
- La cuenta asociada ofreció cuentas normales y tarjetas. Se comprobaron las cuatro copias de impacto: prestar/recibir con cuenta normal y con tarjeta.
- `Sin fecha`, `Mensual`, `Fecha` y `Meses` mostraron exclusivamente sus campos correspondientes. Los modos todavía no exponen semántica de selección.
- Se llenó un borrador temporal, se canceló y se reabrió el alta: persona, monto, descripción, tipo, cuenta y programación regresaron a su estado inicial.
- El estado `Guardando...` no se provocó manualmente para evitar una escritura. La prueba asíncrona enfocada confirma que el botón bloquea el segundo envío mientras `addDebt` está pendiente.
- En claro y oscuro no hubo desplazamiento horizontal de página, ningún control salió del formulario y el foco de teclado mostró un contorno violeta sólido de 2 px.
- La opción de tipo activa usa `scale-105` y ocupa aproximadamente 1,8 px del espacio entre ambos botones. No corta texto ni impide la interacción, pero es una superposición visual medible.
- Pago, modificación y condonación volvieron a permanecer abiertos simultáneamente. Sus tres controles de cierre con icono `X` aparecen como botones sin nombre accesible.
- La lista de saldados y el diálogo de eliminación se abrieron de nuevo. `Escape` canceló el diálogo y devolvió el foco a la acción de eliminar.

## Validaciones automatizadas

- `npm.cmd run test:run -- src/__tests__/components/debtsViewFormBehavior.test.tsx src/__tests__/components/debtPaymentScheduleForm.test.ts src/__tests__/utils/debtPaymentSchedule.test.ts`: **16/16 pruebas aprobadas**.
- `npm.cmd run typecheck`: **aprobado** en la verificación integrada del checkout.
- ESLint enfocado en `src/components/views/debts` y las tres pruebas: **aprobado sin salida de error**.
- `npm.cmd run build`: **aprobado**, con compilación, TypeScript y generación estática completas. La versión generada de `public/sw.js` se restauró al contenido previo después de validar el build.
- `npm.cmd run test:run -- --maxWorkers=2`: **126 archivos y 939 pruebas aprobadas** sin errores no controlados.

## Matriz visual

| Superficie | Resultado | Evidencia |
| --- | --- | --- |
| Encabezado y cuatro métricas | Verificado | Título, descripción, `Me deben`, `Debo`, `Saldados` y `Balance neto` presentes y legibles. |
| Estado vacío | Verificado | Mensaje y acción `Nuevo` visibles; no aparece desplazamiento horizontal de página. |
| Alta de deuda | Verificado sin persistencia | Se alternó el tipo, recorrieron modos, cuentas y ayudas; el borrador cancelado se restableció. `Guardando...` quedó cubierto por la prueba asíncrona. |
| Modos de programación | Verificado | `Sin fecha` no agrega campos; `Mensual`, `Fecha` y `Meses` muestran solo sus campos correspondientes. |
| Claro y oscuro | Verificado | Las superficies conservan jerarquía; no hay overflow horizontal y el foco visible mide 2 px en ambos temas. |
| `DebtCard` activa | Verificado en sesión autenticada | Se revisaron tres tarjetas reales sin registrar sus datos privados en este informe. |
| Progreso, vencimiento y próximo pago | Verificado en sesión autenticada | Se observaron progreso parcial, monto restante, próximo pago aproximado y vencimiento fijo. |
| Pago, ajuste, condonación y programación inline | Verificado sin persistencia | Todas las superficies abrieron y cerraron; no se introdujeron valores ni se confirmó ninguna acción. |
| Saldados y diálogo de borrado | Verificado sin mutación | Se expandió y colapsó el historial; el diálogo destructivo se abrió y canceló con `Escape`. |
| Cuenta asociada y copia contextual | Verificado | Se comprobaron cuentas normales y tarjetas en los flujos de prestar y recibir, sin guardar el borrador. |

## Hallazgos

### Alta: la tarjeta fija de primeros pasos oculta contenido de Deudas

**Severidad:** alta. **Atribución:** transversal, no introducida por la extracción de `DebtsView`.

En modo invitado sin avances, `OnboardingChecklist` se fija abajo a la izquierda con 360 píxeles de ancho. En la ventana observada cubre las primeras métricas al inicio y, al desplazarse, oculta aproximadamente la mitad izquierda del formulario, incluidos el selector de tipo, campos y la acción `Registrar` según la posición de scroll.

**Reproducción:** abrir `Préstamos` con 0/3 pasos completados, pulsar `Nuevo` y desplazarse por el formulario.

**Evidencia de código:** `src/components/onboarding/OnboardingChecklist.tsx:43` usa posicionamiento `sm:fixed`, `sm:bottom-6`, `sm:left-6`, `sm:z-40` y `sm:w-[360px]` sin mecanismo para colapsar o reubicar la tarjeta.

### Media: los modos de programación no exponen su estado actual

**Severidad:** media. **Atribución:** preservada por la refactorización en los componentes extraídos.

Los cuatro modos de programación cambian de color, pero en el árbol accesible permanecen como botones simples. No exponen `aria-pressed`, un grupo de radios ni otra semántica que comunique qué opción está seleccionada. `Yo presté`/`Me prestaron` ya fue corregido por trabajo posterior y sí expone `aria-pressed`.

**Reproducción:** abrir `Nuevo`, alternar los modos y revisar el árbol accesible de Chrome; los cuatro aparecen como `botón` sin estado de selección.

**Evidencia de código:** `PaymentScheduleFields.tsx:17-31` resuelve la selección solo mediante clases condicionales.

### Media: varias acciones inline pueden permanecer abiertas a la vez

**Severidad:** media. **Atribución:** riesgo del estado coordinado entre `DebtsView` y `DebtCard`; confirmado visualmente en la sesión autenticada.

Abrir `Modificar saldo` solo cierra la programación, y abrir `Registrar pago` también solo cierra la programación. `Condonar` no cierra ninguno de los otros paneles. En Vivaldi se reprodujo que una misma tarjeta renderiza pago, ajuste y condonación simultáneamente, aumentando altura y compartiendo estados que el usuario puede confundir.

**Reproducción:** en una tarjeta activa, abrir `Modificar saldo`, luego `Registrar pago` y finalmente `Condonar`. Los tres paneles permanecen visibles a la vez.

**Evidencia de código:** `DebtCard.tsx:175-205` y los bloques condicionales en `DebtCard.tsx:250-345`.

### Media: tres controles de cierre inline no tienen nombre accesible

**Severidad:** media. **Atribución:** preservada por la refactorización en `DebtCard`.

Los paneles de pago, modificación y condonación usan un botón con icono `X` sin texto, `aria-label` ni `title`. Cuando los tres paneles están abiertos, Chrome expone tres botones sin nombre. El cierre de programación sí usa `title="Cerrar"` y no presenta este defecto.

**Reproducción:** abrir los tres paneles inline y recorrer sus acciones con el árbol accesible o un lector de pantalla.

**Evidencia de código:** `DebtCard.tsx:265-272`, `DebtCard.tsx:313-320` y `DebtCard.tsx:339-346`.

### Baja: la selección de tipo invade levemente el espacio entre botones

**Severidad:** baja. **Atribución:** preservada por la refactorización en `NewDebtForm`.

La opción activa aplica `scale-105`. A 1280 px, su caja visual ocupa aproximadamente 1,8 px del espacio de la opción vecina. No corta texto ni bloquea eventos, pero contradice de forma literal la ausencia de superposición pedida por el contrato visual.

**Evidencia de código:** `NewDebtForm.tsx:58` y `NewDebtForm.tsx:70`.

### Baja: la extracción dejó una interfaz de componente extensa

**Severidad:** baja. **Atribución:** deuda técnica de mantenibilidad.

`DebtCard` recibe 24 propiedades y conserva 354 líneas. `DebtsView` mantiene todos los estados inline y repite el mismo bloque de propiedades para los grupos `Me deben` y `Debo`. La separación mejora la localización del JSX, pero no reduce del todo el acoplamiento entre contenedor y tarjeta.

No se recomienda una arquitectura nueva. Si se corrigen los paneles simultáneos, la mejora mínima sería agrupar únicamente el estado y las acciones inline de la tarjeta detrás de una interfaz feature-local pequeña.

## Conclusión

La refactorización integrada conserva el resumen, el estado vacío, el alta, la cancelación, los modos de programación, las tarjetas activas y el historial saldado en los escenarios revisados. La re-verificación en Chrome completó las dos tareas pendientes sin mutar datos y diferenció la selección de tipo ya corregida de los modos que aún carecen de semántica. Permanecen documentados el checklist flotante, los paneles simultáneos, tres cierres sin nombre y la superposición leve de la selección. Deben abordarse en cambios posteriores y pequeños; este OPSX no modifica código de producto.
