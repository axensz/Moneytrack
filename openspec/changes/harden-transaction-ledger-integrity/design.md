## Context

MoneyTrack deriva los saldos de ahorro/efectivo desde `initialBalance` y las transacciones pagadas; para tarjetas usa `Account.usedCredit` como deuda contractual persistida. El listado mantiene un head global paginado de 500 filas, mientras `useBalanceTransactions` activa una suscripción completa cuando detecta saturación. Esta separación es correcta: la lista puede paginarse, pero una cifra financiera no puede depender de la membresía de una página.

El defecto histórico de expulsar una fila al entrar la transacción 501 ya fue corregido. La auditoría actual, documentada en `audit.md`, encontró otra frontera: un snapshot corto proveniente de caché puede declararse completo antes del servidor. En paralelo, manual, IA, periódicos, cuentas, deudas y undo no atraviesan siempre la misma validación. La atomicidad de tarjeta es buena en los caminos secuenciales principales, pero existen carreras de ahorro, `usedCredit` heredado, enlaces no recíprocos, falso éxito invitado y operaciones compuestas parciales.

Chrome confirmó el contrato de presentación: los filtros inferiores solo cambian lista y CSV. **Saldo actual, ingresos del mes actual, gastos del mes actual y pendiente nunca cambian con búsqueda, cuenta, categoría o fecha.** El negativo observado es un estado del ledger, no una transformación del filtro.

El cambio es transversal, pero debe ser incremental. Se reutilizan `BalanceCalculator`, `creditDeltas`, el historial completo, el CRUD Firestore, la caché post-commit y el lease `accountOperationLock` ya endurecido por `repair-debt-lifecycle-and-account-links`. No se crea un command bus genérico, un backend ni una segunda fórmula de saldo.

### Matriz de autoridad

| Dato | Autoridad |
| --- | --- |
| Transacción autenticada | Commit confirmado en Firestore |
| Saldo ahorro/efectivo | `initialBalance + historial completo confirmado por servidor` |
| Deuda de tarjeta | `Account.usedCredit` finito y no negativo |
| Cálculo de respaldo de tarjeta | Historial completo, solo para detectar/conciliar divergencia |
| Head paginado/caché | Presentación; nunca autoriza una mutación monetaria |
| Invitado | Envelope local versionado cuya escritura terminó con éxito |
| Resumen general | Historial completo/cuentas, independiente de filtros |
| Notificación | Consumidor posterior al commit; nunca autoridad del dinero |

### Entradas que deben converger

El mismo límite financiero debe cubrir alta y edición manual, delete/undo, transferencia, pago enlazado de tarjeta, “Ya pagó” periódico, vinculación de pago, ajuste de cuenta, ajuste posterior a unificación, acciones IA, operaciones feature-local de deuda y migraciones. Cada entrada conserva su UX, pero no puede invocar directamente un writer que omita invariantes.

## Goals / Non-Goals

**Goals:**

- No declarar listo un historial autenticado hasta contar con evidencia del servidor.
- Aplicar un único contrato de esquema, referencias, centavos, saldo/cupo, atomicidad e idempotencia a toda intención monetaria.
- Evitar sobregiros ordinarios aun con dos pestañas/dispositivos que usen el cliente compatible.
- Conservar `usedCredit` y pares de pago recíprocos en la misma unidad de commit.
- Hacer atómicas las operaciones compuestas no-deuda y propagar fallos reales en invitado.
- Hacer que undo restaure el agregado completo o no se ofrezca.
- Explicar cada saldo y detectar datos heredados sin ocultarlos ni repararlos automáticamente.
- Preservar exactamente la independencia del Resumen general frente a los filtros inferiores.
- Dejar regresiones en funciones puras, hooks, integración, reglas reales, concurrencia y navegador.

**Non-Goals:**

- No cambiar la fórmula contable ni clamping de saldos negativos de ahorro/efectivo.
- No convertir `usedCredit` en una cifra derivada de presentación ni persistir un segundo saldo de ahorro.
- No rediseñar Transactions, Accounts, Recurring, Debts ni el shell.
- No implementar el ciclo de vida de deuda ya poseído por `repair-debt-lifecycle-and-account-links`; solo se define el contrato de integración.
- No implementar scheduler, entrega o reintentos de notificaciones.
- No agregar dependencias, servidor, Cloud Functions, cola offline autenticada ni importador CSV.
- No mutar datos reales durante pruebas; la validación de escritura usa registros desechables.

## Decisions

### 1. Separar “recibido de caché” de “confirmado y exhaustivo”

El listener del head usará `includeMetadataChanges: true` y publicará una señal `transactionsServerSettled`. Un snapshot con `metadata.fromCache=true` puede poblar la lista, pero no resolverá readiness, aunque tenga menos de 500 filas. Después de un snapshot de servidor:

- `<500` significa que el head es exhaustivo y puede alimentar el saldo;
- `>=500` activa/mantiene el listener completo y readiness depende de su primer snapshot de servidor;
- offline/error sin confirmación conserva `ready=false` y una causa accionable.

`hasMoreTransactions` seguirá siendo paginación de UI; no volverá a representar por sí solo autoridad financiera. `BalanceCalculator` y `transactionPaginationCache` no cambian.

Alternativa descartada: activar siempre dos listeners completos. Sería correcta, pero duplica lecturas para historiales pequeños y no hace explícita la semántica caché-servidor.

### 2. Bloquear, nunca omitir, una invariante dependiente del saldo

Cuando la autoridad no esté lista, se aceptan acciones que no dependan del saldo solo si el writer puede probar que no lo reducen; cualquier gasto, transferencia, pago desde una cuenta, ajuste, edición/borrado con efecto debitante, undo o acción compuesta se bloquea antes de la primera mutación. El mensaje explica “Estamos conciliando tu historial” y permite reintentar.

Las pruebas actuales que esperan guardar con `balancesReady=false` se invertirán: deben demostrar cero llamadas al writer. Esto elimina tanto falsos rechazos contra una página parcial como aceptaciones inseguras.

Alternativa descartada: pasar `transactions=undefined` al validador. Convierte una falta de autoridad en permiso y es la causa directa del bypass.

### 3. Introducir una fachada feature-local de mutaciones del ledger

Se creará una fachada pequeña dentro del dominio de transacciones, no un bus genérico. Recibirá una intención tipada (`create`, `edit`, `delete`, `restore`, `transfer`, `credit-payment`, `recurring-post`, `balance-adjustment`, `migration`) y devolverá únicamente después del commit. La fachada:

1. normaliza montos/deltas con `roundMoney`, exige `Number.isFinite`, rango y fechas válidas;
2. resuelve las cuentas desde documentos de servidor para decisiones de tipo y `usedCredit`; `accountsRef` queda como optimización/presentación, no autoridad;
3. valida el before/after completo de cada cuenta afectada;
4. verifica referencias, enlace recíproco y semántica del agregado;
5. aplica la escritura atómica apropiada;
6. publica caché, cierra UI, muestra éxito y dispara observadores solo después del commit.

`useAddTransaction` conserva preparación de formulario/intereses, pero no posee la última defensa. IA, periódicos, cuentas, deudas y undo consumen la misma fachada o un adapter feature-local que ejecute el mismo planner dentro de su commit atómico.

Alternativa descartada: confiar en que cada vista replique `TransactionValidator`. Ya produjo divergencias y no protege callers programáticos.

### 4. Serializar mutaciones que pueden reducir saldo no-crédito

No se añadirá un saldo materializado de ahorro. Para conservar el ledger como única autoridad y cerrar la carrera entre dispositivos, una mutación balance-sensitive reutilizará el lease raíz existente con un nuevo `AccountOperationKind` de ledger:

1. adquirir el lease;
2. consultar desde servidor, después del lease, las cuentas afectadas y las transacciones históricas que las referencian por `accountId` o `toAccountId`;
3. deduplicar y calcular el estado antes/después con las funciones vivas;
4. rechazar si un débito ordinario cruza a negativo o empeora un negativo heredado;
5. confirmar movimiento, contrapartes, metadatos relacionados y tombstone de liberación en una sola operación final;
6. liberar de forma segura si el commit no ocurrió.

Un ingreso simple que solo mejora un saldo puede evitar la consulta histórica, pero sigue pasando esquema/referencias/fachada. Ediciones, borrados y restauraciones se clasifican por su delta before/after; por ejemplo, borrar un ingreso o una transferencia entrante sí es balance-sensitive.

El lock ya bloquea escrituras de cuentas/transacciones/deudas durante la ventana y sus reglas fueron probadas en el cambio de deudas. Aquí solo se agrega el kind y el uso; no se reimplementa el protocolo. Las reglas y el emulador verificarán la forma del lease y las referencias, sin intentar sumar un historial desde rules.

Alternativas descartadas:

- validar solo con el snapshot React: mantiene la carrera;
- persistir `currentBalance`: introduce una segunda autoridad, backfill y reconciliación permanente;
- Cloud Function: contradice la exportación estática y agrega infraestructura.

### 5. Tratar un negativo como evidencia, no como algo que se oculta

El saldo de ahorro/efectivo nunca se clampea. Un `initialBalance` negativo o un negativo heredado sigue visible. Las mutaciones ordinarias no podrán cruzar de no-negativo a negativo ni empeorar uno existente; ingresos, borrado de gasto y un ajuste explícito podrán mejorarlo.

Una restauración exacta o reparación puede revelar un negativo si representa el estado histórico confirmado. Ese caso requiere una intención explícita, advertencia y metadatos de auditoría; no usa el bypass de una operación ordinaria.

### 6. Mantener `usedCredit` como autoridad estricta y migrarlo bajo lease

Toda tarjeta nueva debe tener `usedCredit` finito y `>=0`. Una tarjeta heredada con el campo ausente queda `creditAuthorityReady=false`; compras, pagos, transferencias, edición, borrado, merge o deuda que la afecten se bloquean hasta conciliación.

La migración de crédito adquirirá el lease, consultará historial desde servidor, calculará con `creditDeltas`, verificará que la tarjeta siga necesitando migración y confirmará `usedCredit`, versión y liberación juntos. No hará un `SET` absoluto desde una query posiblemente cacheada. Los writers leerán el documento de cuenta dentro de la operación y nunca dependerán de que `accountsRef` conozca su tipo.

Las reglas validarán, cuando el campo exista, que `usedCredit` sea número finito, no negativo y dentro del rango monetario. Se permite que supere `creditLimit`, porque el producto ya admite deuda sobre cupo con advertencia; no se permite deuda negativa.

### 7. Validar un par enlazado antes de seguir su puntero

Antes de editar o borrar una fila con `linkedTransactionId`, la contraparte debe:

- existir;
- apuntar recíprocamente al ID original;
- compartir monto, fecha lógica, `paid` y beneficiario sincronizable;
- representar un ingreso/pago en tarjeta y su egreso de origen, no dos filas arbitrarias.

Si falla, la operación no toca ninguna fila y crea un hallazgo de conciliación. La reparación ofrece enlazar el par inequívoco, desvincular de forma explícita o mantener ambas filas independientes; nunca elimina siguiendo un puntero no confiable.

### 8. Hacer idempotentes las intenciones repetibles

El posteo de un periódico usará una clave determinística derivada de `(recurringPaymentId, recurringCycle)`. Dos pestañas, doble clic o retry ambiguo convergen en una sola transacción. Solo una fila `paid=true` puede saldar el ciclo; candidatos `paid=false` no aparecen como pagos y `useRecurringUtils` aplica la misma regla que los monitores.

Las acciones IA reciben un `operationId` estable desde la acción confirmada. El undo conserva el ID original cuando restaura exactamente una fila o usa un `operationId` de agregado. Los retries Firestore reutilizan referencias reservadas fuera del callback.

No se impondrá una tabla genérica de idempotencia a cada ingreso manual; el guard síncrono y una referencia estable por submit son suficientes. Las claves persistidas se reservan para intents que pueden repetirse por diseño o abarcan varias filas.

### 9. Hacer atómica cada intención compuesta

- Periódico: movimiento, clave de ciclo y cambio de monto/último pago de la plantilla confirman juntos.
- Ajuste de cuenta: metadata de cuenta y transacción de ajuste confirman con el mismo snapshot/lease. El movimiento guarda `expectedBefore`, `targetBalance`, `operationId` y origen.
- Merge de tarjeta: el ajuste de deuda deseada se incorpora al batch de unificación o se solicita después como una nueva intención explícita; nunca se reporta el merge como fallido después de haberlo confirmado silenciosamente.
- IA: si necesita crear categoría, categoría y movimiento se incluyen en el mismo commit cuando sea posible; el dinero no depende del éxito de un efecto cosmético posterior.
- Deuda: el cambio existente conserva ownership de su agregado, pero integra el planner/lease de saldo antes de confirmar un gasto en ahorro y provee un restore semántico.

Los side effects de UI y notificación permanecen fuera del commit y son estrictamente post-commit.

### 10. Convertir undo en una inversa semántica

La acción genérica solo se ofrece cuando la misma fila puede restaurarse de forma idempotente y todas sus invariantes siguen válidas. Para pares de tarjeta, deuda, migración o cascadas, undo delega en un comando de agregado que restaura todas las entidades y deltas; si ese comando no existe, la acción no se muestra y se explica la alternativa.

En particular, una transacción con `debtId` no se recrea mediante `addTransaction`. El pago debe volver a reducir `remainingAmount` junto con la fila; el principal debe restaurar deuda y movimiento juntos. Este detalle se implementa en el change de deuda, y este SDD agrega la regresión de integración borrar → deshacer.

### 11. Persistir invitado como un envelope financiero versionado

El éxito invitado significa persistencia, no solo estado React. Las colecciones que participan en una intención monetaria se serializarán en un único envelope versionado del guest ledger. El flujo calcula el snapshot siguiente, intenta `localStorage.setItem` y solo después publica el estado React y el evento cross-tab. Si falla por cuota/serialización, lanza error, conserva el snapshot anterior y la UI no muestra éxito.

La migración desde claves legacy será idempotente: construye y valida el envelope, lo escribe, lo relee/verifica y solo entonces retira las claves anteriores. Una `revision` permite detectar last-write-wins entre pestañas; ante conflicto se recarga y reintenta la intención, no se pisa el estado remoto.

Alternativa descartada: rollback best-effort de varias claves. Un segundo fallo de cuota puede impedir el rollback y mantener un agregado parcial.

### 12. Conciliar antes de reparar

Una función pura construirá por cuenta un reporte determinista con:

- saldo inicial;
- totales de ingresos, gastos, entradas y salidas pagadas;
- saldo calculado y secuencia ordenada de movimientos;
- `usedCredit` persistido versus delta histórico de tarjeta;
- documentos inválidos/no finitos, cuentas o deudas huérfanas;
- enlaces no recíprocos, ciclos periódicos duplicados y filas pendientes que aparentan pago;
- estado de completitud y origen caché/servidor.

Estados: `ok`, `negative-explained`, `incomplete`, `invalid-record`, `orphan-reference`, `broken-link`, `credit-divergence`, `recurring-duplicate` y `dependent-debt-mismatch`.

El reporte es read-only. Una reparación genera primero un plan con before/after y exige confirmación. Para ahorro se usa una transacción de ajuste trazable; para tarjeta se elige explícitamente si manda la deuda bancaria persistida (crear movimiento de conciliación) o el historial (corregir `usedCredit`). No se corrige automáticamente ni se borra evidencia histórica.

La UI reutiliza cards, tablas/listas, `BaseModal`, tokens semánticos y foco existentes. Verde/rojo/ámbar expresan estado; violet queda para acción/selección. Desktop y móvil comparten el mismo contrato y targets de 44 px.

### 13. Preservar el alcance del Resumen general

`useLedgerOverview` continuará recibiendo `balanceTransactions`, cuentas y `totalBalance` antes de los filtros. Sus cuatro valores mantienen estos ámbitos:

- Saldo actual: todas las cuentas de activo y todo el historial pagado;
- Ingresos: mes calendario actual;
- Gastos: mes calendario actual;
- Pendiente: deuda contractual/pendientes actuales según el historial completo.

Búsqueda, cuenta, categoría, preset de fecha y rango personalizado solo afectan la lista y el CSV. Las pruebas cambiarán todos los filtros y exigirán igualdad referencial/numérica de los cuatro valores.

### 14. Respetar ownership entre cambios OPSX

`repair-debt-lifecycle-and-account-links` termina primero sus dos tareas pendientes y conserva la implementación de deuda/lock. Este cambio aporta la fachada, readiness y contrato de undo que deuda consume. `harden-notification-delivery-and-recurring-reminders` observa únicamente commits confirmados; una falla de entrega no revierte ni duplica dinero. `clarify-ledger-metric-scopes` permanece como autoridad de copy/alcance del Resumen general.

## Risks / Trade-offs

- **Más lecturas y latencia en débitos** → aplicar lease/query solo a mutaciones que pueden reducir saldo o exigen target exacto; consultar únicamente cuentas afectadas y medir p95. Para escala extrema, un futuro rollup requerirá otro SDD.
- **Lease abandonado tras cierre de pestaña** → liberar en `finally`, conservar TTL de cinco minutos, mensaje de retry y prueba de reacquisición; nunca forzar escritura sin autoridad.
- **Cliente antiguo sin la fachada** → desplegar primero reglas compatibles y cliente; activar cualquier exigencia estricta de lock solo después de adopción. El lease activo ya bloquea writers antiguos durante cada operación segura.
- **Negativo heredado bloquea una corrección** → permitir operaciones que lo mejoren y el ajuste explícito; bloquear solo las que lo empeoren.
- **Envelope invitado puede superar cuota** → serializar antes de tocar estado, medir tamaño, explicar exportar/iniciar sesión y conservar claves legacy hasta verificación.
- **Historial corrupto hace ambigua la reparación** → no adivinar; reporte y plan read-only, confirmación explícita y backup/export antes de mutar.
- **Dos cambios OPSX tocan deuda/notificación** → orden de integración y pruebas de contrato; no copiar su lógica en este change.
- **Reglas no pueden sumar todo el historial** → las rules garantizan dueño, forma, referencias y protocolo de lock; la suma se valida desde servidor bajo lease y se prueba con emulador/concurrencia.
- **Metadatos nuevos en Transaction** → son opcionales y retrocompatibles; no se exige backfill para leer movimientos históricos.

## Migration Plan

1. Cerrar y verificar `repair-debt-lifecycle-and-account-links`; refrescar estado de los cambios concurrentes y el grafo.
2. Agregar primero pruebas fallidas de caché-servidor, bypass, concurrencia, enlaces, `usedCredit`, recurrentes, guest y undo.
3. Implementar `transactionsServerSettled`, propagar estado/causa y bloquear writers balance-sensitive sin autoridad.
4. Añadir la fachada pura/planner y normalización monetaria; conservar temporalmente los writers existentes detrás de adapters.
5. Extender el kind/reglas del lease y migrar create/edit/delete/transfer/payment/adjustment a validación server-current.
6. Serializar la migración de `usedCredit`, agregar el gate por tarjeta y conciliar cuentas legacy antes de habilitar sus writes.
7. Migrar IA y periódicos; agregar idempotencia por ciclo y semántica `paid` única.
8. Integrar ajuste/merge atómico y el contrato de deuda/undo sin reimplementar su lifecycle.
9. Introducir el envelope invitado y migrar claves legacy solo después de verificación read-back.
10. Publicar el reporte read-only de conciliación. Ejecutarlo sobre datos reales sin reparar; cualquier plan de cambio requiere confirmación independiente.
11. Ejecutar suites focales, reglas reales, concurrencia, full test, typecheck, lint, build, diff check y validación OPSX estricta.
12. Desplegar reglas backward-compatible antes del cliente, validar con datos desechables en Chrome desktop/móvil y observar errores. Endurecer reglas incompatibles solo en una fase posterior.

Rollback: cada metadata nueva es opcional. El cliente puede volver a la versión anterior sin transformar transacciones. Se conserva el envelope/las claves legacy durante una versión completa; el rollback selecciona el último snapshot verificado. Las reglas iniciales son backward-compatible y pueden permanecer. Ninguna reparación real forma parte del despliegue automático.

## Open Questions

Ninguna para crear el plan. La decisión operativa sobre cuál cifra corregir en una cuenta real (`ledger`, `usedCredit` o saldo bancario informado) se toma por cuenta después de ver el reporte de conciliación y nunca se infiere desde el saldo negativo por sí solo.
