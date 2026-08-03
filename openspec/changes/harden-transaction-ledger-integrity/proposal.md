## Why

MoneyTrack promete un libro mayor confiable, pero hoy todavía existen rutas capaces de persistir un sobregiro real: el alta y la edición omiten la validación mientras el historial completo se asienta, las transferencias no vuelven a comprobar fondos en la frontera atómica y el asistente IA escribe por un camino crudo. Además, la decisión de que un historial corto está completo se toma por longitud y no por confirmación del servidor, por lo que un snapshot parcial de caché puede habilitar saldos y mutaciones antes de tiempo.

El defecto histórico de la ventana global de 500 transacciones ya está corregido en este checkout, y Chrome confirmó que los filtros de mes o cuenta no cambian el saldo global. Este cambio conserva esa arquitectura, cierra las fronteras activas que aún pueden crear negativos y agrega conciliación determinista para distinguir un saldo legítimo de datos inconsistentes sin adivinar ni reparar automáticamente.

## What Changes

- Definir una sola autoridad para cada cifra: transacciones pagadas y saldo inicial para ahorro/efectivo; `Account.usedCredit` para deuda contractual de tarjetas; historial completo confirmado por servidor para cálculos y validaciones históricas.
- Incorporar una señal explícita de historial confirmado por servidor. Ningún saldo se declarará listo y ninguna mutación dependiente del saldo se ejecutará desde un snapshot parcial de caché.
- Enrutar altas, ediciones, transferencias, pagos de tarjeta, ajustes de saldo, acciones del asistente y operaciones programáticas por una frontera financiera compartida, con el mismo esquema, referencias e invariantes.
- Serializar y revalidar contra estado de servidor las mutaciones que pueden reducir ahorro/efectivo; los fallos de conexión, concurrencia o fondos insuficientes terminarán sin escritura parcial.
- Mantener atómicas y recíprocas las transacciones enlazadas, actualizar `usedCredit` desde documentos leídos dentro de la operación y rechazar cuentas o autoridades persistidas ausentes, en vez de depender solo del arreglo de cuentas del cliente.
- Hacer idempotente el registro de un pago periódico por ciclo y convertir “Deshacer” en una inversa semántica: restaurar el agregado completo cuando sea seguro o no ofrecer la acción cuando solo podría recrear una mitad inconsistente.
- Hacer que los filtros de lista y CSV sigan siendo proyecciones sin efecto sobre saldos, estadísticas globales ni validaciones.
- Agregar un diagnóstico de conciliación por cuenta que explique `saldo inicial + movimientos pagados = saldo actual`, detecte documentos inválidos, referencias huérfanas, pares rotos y divergencias de tarjeta, y proponga una reparación explícita sin mutar datos automáticamente.
- Cubrir la frontera caché-servidor, 499/500/501 transacciones, concurrencia, doble envío, modo invitado, escrituras IA, transferencias, pagos enlazados, ajustes, edición, borrado y datos heredados mediante pruebas puras, de hooks, integración y reglas reales de Firestore.
- Conservar el comportamiento compartido en escritorio y móvil. La interfaz solo añadirá estados y explicaciones necesarias para evitar escrituras inseguras y presentar la conciliación con los componentes y tokens existentes.

No hay cambios incompatibles de API pública. No se cambiará la fórmula contable, no se persistirá un segundo saldo autoritativo para ahorro/efectivo, no se ocultarán saldos negativos legítimos, no se repararán datos sin confirmación del usuario y no se rediseñará el dashboard. El ciclo de vida de deudas permanece en `repair-debt-lifecycle-and-account-links`; los recordatorios permanecen en `harden-notification-delivery-and-recurring-reminders`.

## Capabilities

### New Capabilities

- `transaction-ledger-integrity`: define fuentes de verdad, completitud confirmada del historial, independencia del Resumen general frente a filtros, una frontera uniforme para todas las escrituras monetarias y la conciliación/reparación verificable por cuenta.

### Modified Capabilities

Ninguna. Las especificaciones actuales `responsive-shell-fit` y `ai-overlay-operability` no cambian sus requisitos; el asistente conserva su contrato visual y solo adopta la frontera financiera compartida.

## Impact

- **Datos y persistencia:** `Transaction`, `Account`, listener paginado, historial completo, caché de paginación, reglas de Firestore, operaciones atómicas y migraciones/reconciliaciones de datos heredados.
- **Dominio:** cálculo de saldos, validadores, CRUD de transacciones, pagos de tarjeta, transferencias, ajustes de cuenta, pagos periódicos, restauración/undo, préstamos como consumidores y acciones confirmadas del asistente.
- **Interfaz:** estados “calculando/conciliando”, bloqueo temporal con mensaje accionable y reporte de conciliación reutilizando componentes semánticos. Aplica a escritorio y móvil sin cambiar navegación ni layout general.
- **Dependencias:** no se agrega ninguna dependencia de runtime ni de desarrollo. Se reutilizan Firebase, Vitest y el emulador ya presentes.
- **Operación:** despliegue compatible en dos fases (reglas y cliente), auditoría read-only de datos existentes y rollback sin migración destructiva.
