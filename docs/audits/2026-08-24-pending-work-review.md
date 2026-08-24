# Revisión de pendientes — 2026-08-24

## Resultado ejecutivo

El árbol actual está técnicamente verde, pero no está listo para sacar el PR de borrador. Quedan 103 tareas OpenSpec abiertas: 58 de integridad del ledger, 41 de entrega de notificaciones, 2 de privacidad/IA y 2 del ciclo de vida de deudas. El camino crítico es cerrar primero la frontera monetaria compartida; una prueba real con datos desechables confirmó que una deuda prestada puede superar los fondos de una cuenta de ahorros, registrarse como exitosa y dejarla en negativo.

## Estado verificado

- Rama local: `codex/desktop-ux-opsx`, `cc65510`, diez commits por delante de su rama remota.
- PR #76: abierto y en borrador; el remoto sigue en `72060af`. Sus checks verdes corresponden al 3 de agosto de 2026 y no prueban el estado local actual.
- Dependabot: 27 alertas abiertas. El número histórico de 17 ya no describe el estado actual.
- OpenSpec: 10/10 elementos válidos en modo estricto.
- Vitest: 133 archivos aprobados, 1 omitido; 1048 pruebas aprobadas, 4 omitidas.
- Reglas Firestore: 4/4 aprobadas contra el emulador real.
- TypeScript, ESLint, build estático y `git diff --check`: aprobados.
- `npm audit` completo y de producción: 0 vulnerabilidades.

## Pendientes priorizados

### P0 — Integridad del ledger (58)

No conviene completar la tarea 1.6 como una prueba aislada que deje el repositorio rojo ni crear una segunda validación temporal. Debe implementarse junto con la frontera pura de las tareas 3.1–3.6 y después enrutar cada entrada mediante las tareas 4–9.

Orden recomendado:

1. Tareas 3.1–3.6: tipos de intención, normalización monetaria y planner antes/después.
2. Tareas 4.1–4.7: escritura autenticada serializada con el lease existente.
3. Tareas 6.1–6.7: manual, IA, ajuste, merge y adaptador de deudas.
4. Tareas 7–9: recurrentes, undo semántico y persistencia invitada durable.
5. Tareas 10–11: conciliación, navegador y cierre integral.

Evidencia crítica: el intento desechable `QA Rechazo 20260824` por `$ 999.999.999.999`, asociado a `QA Ahorros 20260824`, no fue rechazado por fondos insuficientes. Se creó el préstamo, la cuenta quedó negativa y la interfaz mostró “Préstamo registrado” más una alerta de umbral. Esto confirma el faltante de la tarea 6.5 y la necesidad de que la suite de paridad 1.6 pruebe la misma invariante para manual, edición, IA, recurrentes, ajustes, deuda, delete y undo.

### P1 — Entrega de notificaciones (41)

La modificación local de `BudgetMonitor` y preferencias es trabajo parcial, no cierre del cambio:

- la progresión de presupuesto se recuerda en un `Map` de proceso y no constituye por sí sola una garantía persistente o multidispositivo;
- las nuevas validaciones de umbral arrojan mensajes en inglés y no cubren todavía el contrato de error inline, foco inicial inválido, 200% de zoom, lector de pantalla ni wrapping a 320 px;
- el grafo marca riesgo 0,55 y pide revisión explícita de `validateNotificationThresholds` y `checkThresholds`.

No se debe marcar ninguna tarea del cambio como completa ni mezclar estas cuatro modificaciones no confirmadas con el commit de seguridad/documentación.

### P1 — PR y CI actuales

Antes de sacar el PR de borrador:

1. Decidir si se empujan los diez commits locales ya existentes.
2. Crear commits separados para lockfile/validación y para cualquier trabajo de notificaciones que supere revisión.
3. Actualizar el cuerpo del PR con los conteos y evidencia de navegador actuales.
4. Esperar checks nuevos; los del SHA remoto actual están obsoletos.
5. Verificar alertas Dependabot después de que el lockfile seguro llegue a `main`, sin descartarlas manualmente.

### P2 — Puertas manuales de navegador (4)

- Privacidad/IA 4.3 y 5.3: la matriz invitado pasó en 390×844, 1214×768 y 1440×900, claro/oscuro, sin overflow ni errores. Faltan autorización pendiente, asistente autenticado configurado y coexistencia con onboarding; no se falsificaron alterando credenciales, API key o estado persistido.
- Deudas 6.4: creación, pago parcial, reasignación, saldado, eliminación confirmada, foco y responsive pasaron. El flujo de error no es verde por el sobregiro observado.

### P2 — Archivo OpenSpec posterior a integración

Cuatro cambios tienen todas sus casillas cerradas pero siguen activos: `align-desktop-states-and-help`, `clarify-ledger-metric-scopes`, `harden-desktop-shell-and-interactions` y `review-debts-view-refactor`. Deben archivarse solo cuando su contenido esté integrado y la rama esté limpia, no para reducir artificialmente el conteo de pendientes.

## Datos desechables limpiados

Se eliminaron los siguientes registros creados únicamente para la validación, junto con sus transacciones vinculadas:

- `QA Ahorros 20260824`
- `QA Crédito 20260824`
- `QA Deuda Ahorros 20260824`
- `QA Deuda Crédito 20260824` (saldada)
- `QA Rechazo 20260824`

La verificación posterior mostró cero deudas activas o saldadas, cero transacciones para la búsqueda `QA` y ninguna cuenta QA. No se modificó “Isabella — Celular”.
