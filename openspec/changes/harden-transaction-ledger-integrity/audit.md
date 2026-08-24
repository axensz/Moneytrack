# Auditoría integral del libro mayor de transacciones

- Fecha de corte: 2026-08-03
- Rama: `codex/desktop-ux-opsx`
- Commit auditado: `bdb0bb35ff028b66850173db2c1a290193582a52`

## 1. Objetivo y método

Esta auditoría cubre toda operación que crea, modifica, elimina, enlaza, restaura, migra o usa una transacción para derivar dinero. Se revisaron el grafo local reconstruido (356 archivos, 3.297 nodos y 32.412 relaciones), el código y sus pruebas, el historial Git de la regresión de paginación, las reglas de Firestore y una sesión real read-only en Chrome.

No se creó, editó ni eliminó ningún registro real. Los archivos sin seguimiento que ya existían (`AGENTS.md`, `.codex/hooks.json` y el cambio OPSX concurrente de notificaciones) se trataron como trabajo del usuario y no se modificaron.

## 2. Flujo crítico y fuentes de verdad

```text
Entrada manual / IA / periódico / cuenta / deuda / undo
                    │
                    ▼
       validación y comando de dominio
                    │
                    ▼
 useTransactions → useTransactionsCRUD → Firestore
                    │
        commit confirmado + caché post-commit
                    │
          ┌─────────┴──────────┐
          ▼                    ▼
 head limit(500)          historial completo
 lista/filtros/CSV        saldos/validación/auditoría
```

| Dato | Autoridad vigente |
| --- | --- |
| Movimiento autenticado | Documento confirmado en `users/{uid}/transactions` |
| Saldo de ahorro/efectivo | `Account.initialBalance + Σ movimientos pagados` del historial completo |
| Deuda contractual de tarjeta | `Account.usedCredit` persistido, actualizado con el mismo delta de la transacción |
| Cupo disponible | `creditLimit - usedCredit`, nunca menor que cero en presentación |
| Lista y filtros | Head paginado; es proyección de presentación, no autoridad financiera |
| Modo invitado | Snapshot persistido de los datos locales, no solo estado React |
| Resumen general | Historial completo + cuentas; no recibe filtros inferiores |

Para ahorro y efectivo, un movimiento pagado aporta:

- ingreso en origen: `+amount`;
- gasto en origen: `-amount`;
- transferencia en origen: `-amount`;
- transferencia en destino: `+amount`.

Para tarjeta, `usedCredit` recibe:

- compra: `+(principal + interés financiado)`;
- pago/ingreso: `-amount`;
- transferencia hacia la tarjeta: `-amount`.

## 3. Incidente observado en Chrome

- La sesión real mostró **Saldo actual -$173.678,91** y la cuenta Bancolombia en **-$261.377,10**.
- Cambiar de “Este mes” a “Todo el tiempo” y filtrar Bancolombia no cambió ninguno de los cuatro valores del Resumen general. Esto confirma la aclaración funcional: saldo actual, ingresos del mes actual, gastos del mes actual y pendiente son independientes de los filtros inferiores; solo cambian la lista y el CSV.
- No hubo errores ni advertencias en la consola durante la inspección.
- El ledger visible contiene movimientos recientes capaces de producir un negativo real, incluido un préstamo de salida por $261.600 y varios ajustes/pagos. Con la UI no se obtuvo una conciliación exhaustiva de cada fila del historial; por tanto, no se atribuye el saldo actual a una transacción específica sin el reporte determinista que propone este cambio.

Conclusión: el filtro no causa el negativo. El saldo puede ser el resultado matemático actual del libro mayor o la consecuencia de una de las rutas inseguras siguientes. La aplicación hoy no ofrece evidencia suficiente para distinguir ambas posibilidades.

## 4. Hallazgos priorizados

### P1-01 — Un snapshot corto de caché puede declararse completo

`useFirestoreSubscriptions.ts:191-203,231-265` procesa el primer snapshot sin `includeMetadataChanges` ni `metadata.fromCache` y calcula `hasMore` solo por `docs.length >= 500`. Con caché parcial menor a 500, `useBalanceTransactions.ts:48-56` desactiva el listener completo y `useAllTransactions.ts:215-221` devuelve `settled=true` porque recibe `userId=null`.

Impacto: saldo parcial visible, ajustes habilitados y validaciones ejecutadas contra una fuente no confirmada. Offline o un error de listener puede prolongar el estado indefinidamente.

### P1-02 — Alta y edición omiten la validación cuando el saldo no está listo

`useAddTransaction.ts:134-186` y `useTransactionsView.tsx:296-315` pasan `transactions=undefined` cuando `balancesReady=false`. Las pruebas `addTransactionBalanceGate.test.ts:136-153` y `transactionEditValidation.test.ts:142-147` codifican que un sobregiro se guarda en ese estado.

Impacto: una ventana diseñada para evitar un falso rechazo permite un débito real que deja la cuenta negativa. La operación correcta es bloquear temporalmente el débito, no omitir la invariante.

### P1-03 — Las rutas programáticas no comparten la validación financiera

- IA: `AIChatBot.tsx:420-462` valida forma y cuenta, pero llama al CRUD crudo sin saldo; además construye contexto con el head paginado (`AIChatBot.tsx:297-334`, `gemini.ts:179-200`).
- Periódicos: `RecurringPaymentsView.tsx:125-139` llama `addTransaction` directamente y el comentario asume erróneamente que es el mismo writer validado del formulario.
- Ajuste de cuenta: `useAccountForm.ts:161-249` calcula un delta cliente y luego llama al writer crudo.
- Préstamos: `useDebts.ts:117-204,496-595` mantiene atomicidad deuda-transacción autenticada, pero un préstamo entregado o un pago de deuda propia en ahorro no valida fondos disponibles.
- Undo: `AuthenticatedApp.tsx:291-293` restaura mediante `addTransaction` crudo.

Impacto: la misma intención monetaria tiene invariantes distintas según el botón que la originó.

### P1-04 — No existe serialización de fondos de ahorro/efectivo

El gasto normal usa `addDoc` (`useTransactionsCRUD.ts:302-319`) y la transferencia atómica solo lee cuentas para existencia/tipo y tarjeta destino (`:134-203`); ninguno vuelve a calcular el saldo de origen desde servidor. La validación UI ocurre antes del commit y puede quedar obsoleta entre pestañas o dispositivos.

Impacto: dos débitos individualmente válidos pueden confirmar sobre el mismo saldo previo y producir un sobregiro. El ajuste absoluto también puede quedar mal dimensionado si entra otro movimiento entre cálculo y escritura.

### P1-05 — “Deshacer” no es la inversa de una transacción de deuda

`FinanceContext.tsx:288-316` borra un pago y revierte `remainingAmount`, o delega la eliminación del principal a `deleteDebt`. Después, `useTransactionsView.tsx:398-436` ofrece “Deshacer” a cualquier fila no enlazada y recrea solo la transacción.

- Pago: reaparece el movimiento, pero la deuda no vuelve a disminuir.
- Principal autenticado: la deuda ya no existe y las reglas rechazan el `debtId` huérfano.
- Principal invitado: puede reaparecer una transacción con `debtId` huérfano.

No existe prueba del round-trip borrar → deshacer para deuda.

### P1-06 — Un enlace no recíproco puede modificar o borrar una fila ajena

`useTransactionsCRUD.ts:387-414,468-513` y `useTransactions.ts:181-219` siguen `linkedTransactionId` sin exigir que la contraparte apunte de vuelta ni que ambas filas formen un pago de tarjeta válido. Las reglas de Firestore tampoco validan el enlace.

Impacto: un dato heredado o corrupto puede hacer que borrar/editar una fila afecte otra transacción no relacionada. Ante un enlace inválido, la operación debe bloquearse y conciliarse; nunca seguir el puntero silenciosamente.

### P1-07 — Modo invitado puede confirmar éxito sin persistencia

`useLocalStorage.ts:119-150` actualiza el estado React antes de `localStorage.setItem` y captura el error sin devolverlo. Los writers invitados resuelven como éxito; al recargar, el dato desaparece. Operaciones multi-clave tampoco tienen un commit único.

Impacto: pérdida silenciosa y estados parciales entre transacciones, cuentas y deudas. Un toast de cuota no convierte la operación en fallida para el caller.

### P1-08 — `usedCredit` ausente y su migración tienen una carrera

Los guards de pago/transferencia/edición solo comprueban deuda negativa si `usedCredit != null` (`useTransactionsCRUD.ts:163-169,238-240,337-341,502-507`). Un campo heredado ausente puede recibir un incremento negativo. `useCreditMigration.ts:55-87` calcula fuera de una transacción y hace un `SET` absoluto, por lo que puede pisar un delta concurrente. Las reglas de cuentas no acotan `usedCredit` (`firestore.rules:269-291`).

Impacto: deuda contractual negativa o divergente. Una tarjeta sin autoridad persistida debe quedar en conciliación y bloquear movimientos hasta completar una migración serializada.

### P2-01 — El pago periódico no es idempotente y “pagado” ignora `paid`

No hay unicidad por `(recurringPaymentId, recurringCycle)` y el propio comentario en `RecurringPaymentsView.tsx:125-139` reconoce que pueden crearse dobles. `MarkPaidModal.tsx:63-73` ofrece también gastos pendientes y `useRecurringUtils.ts:51-79,118-145` considera cualquier fila enlazada como pagada, mientras `PaymentMonitor.ts` sí exige `paid`.

Impacto: duplicados, saldo reducido dos veces y estado contradictorio de un periódico.

### P2-02 — Operaciones compuestas todavía pueden quedar a medias

- En alta manual, `useAddTransaction.ts:231-240` actualiza primero el monto de la plantilla periódica y después intenta crear el movimiento.
- En edición de cuenta, `useAccountForm.ts:246-249` actualiza cuenta y después crea el ajuste.
- En unificación de tarjetas, `AccountsView.tsx:263-286` confirma el merge y después intenta el ajuste deseado.
- La categoría de una acción IA puede crearse antes de que falle la transacción.

Impacto: la UI informa fallo, pero una parte de la intención ya fue aplicada.

### P2-03 — Documentos inválidos se silencian o contaminan el cálculo

El head filtra documentos con un guard mínimo (`useFirestoreSubscriptions.ts:47-53`), sin informar cuántos quedaron fuera; el historial completo no aplica el mismo guard (`useAllTransactions.ts:37-43`). Categorías vacías, fechas inválidas, montos no finitos, enlaces rotos o metadatos incompatibles pueden producir resultados distintos entre lista y saldo.

Impacto: discrepancias sin explicación. Los registros deben clasificarse y mostrarse en conciliación, no desaparecer ni entrar sin validación.

### P2-04 — Precisión y validación numérica no son uniformes

`useAccountForm.ts:198-207` persiste `newBalance - currentBalance` sin `roundMoney`; por ejemplo, una resta decimal puede producir `39999.21999999997`. El validador parcial de edición usa `isNaN`, pero no `Number.isFinite`, y el writer invitado no tiene la defensa de las reglas remotas.

Impacto: residuos subcentavo en el ledger o valores no finitos desde un caller programático. Todo monto y delta persistido debe normalizarse una sola vez a centavos y respetar el mismo máximo.

### Riesgos condicionados que el diseño debe cerrar

- `accountsRef` decide qué cuentas afectan `usedCredit` en alta, borrado y edición (`useTransactionsCRUD.ts:104-109,305,402,490`). Si el arreglo está atrasado, el delta puede omitirse aunque el documento de cuenta correcto exista en servidor.
- Dos pestañas invitadas escriben arrays completos sin versión/CAS; gana la última escritura y puede perderse la anterior.
- `safeFirestoreOperation` puede reintentar una intención sin clave idempotente; ante confirmación ambigua, un pago o periódico puede duplicarse.
- La migración invitada puede confirmar batches parciales y, para registros legacy sin ID, generar identificadores nuevos al reintentar.
- `togglePaid` y modificaciones absolutas calculadas desde estado React pueden perder una de dos actualizaciones concurrentes.

## 5. Regresiones ya corregidas y preservadas

### Ventana global de 500

El defecto histórico era calcular sobre las 500 filas más recientes de todas las cuentas. Al entrar la 501, una fila antigua era expulsada y su efecto desaparecía. `useBalanceTransactions` y `useAllTransactions` ya alimentan los saldos con historial completo cuando el head se satura.

`balancePaginationCorruption.test.ts` reproduce los dos signos exactos:

- expulsar un ingreso de $337.520 convierte $563.088,89 en $225.568,89;
- expulsar un gasto de $40.000 convierte $563.088,89 en $603.088,89.

Esta regresión está verde y no debe reabrirse.

### Resumen general independiente de filtros

`TransactionsView.tsx:67-77` calcula el overview antes de aplicar filtros; `useLedgerOverview.ts` delega las métricas en `useGlobalStats.ts:137-193`, que usa el mes calendario actual para ingresos/gastos, historial completo para pendiente y `totalBalance` para saldo. La lista y el CSV sí reciben búsqueda, cuenta, categoría y fecha.

Contrato confirmado por el usuario: ninguno de los cuatro valores del Resumen general cambia con los filtros inferiores.

## 6. Matriz de entradas monetarias

| Entrada | Writer actual | Estado |
| --- | --- | --- |
| Alta manual | `useAddTransaction` → CRUD | valida solo si `balancesReady`; bypass activo |
| Edición manual | `useTransactionsView` → CRUD | misma omisión; carrera pre-commit |
| Borrado | CRUD atómico para TC/deuda-pago | enlaces no verificados; puede reducir saldo al borrar ingreso |
| Undo | `addTransaction` crudo | no es inversa de agregados de deuda |
| Transferencia | `runTransaction` | atómica en forma/TC, sin fondos servidor |
| Pago de tarjeta | dos filas + `usedCredit` atómicos | falta autoridad si `usedCredit` es nulo y fondos servidor en origen |
| Periódico “Ya pagó” | `addTransaction` crudo | sin saldo, unicidad ni `paid` uniforme |
| Vincular periódico | update crudo | permite candidato pendiente |
| Ajuste de saldo/deuda | cálculo cliente + writer crudo | bloquea readiness normal, no carrera ni composición |
| Unificar tarjetas + ajuste | merge, luego alta separada | intención parcialmente aplicable |
| Crear/pagar deuda | operación feature-local | auth atómico; sin fondos no-crédito; guest/concurrencia pendientes |
| Acción IA | CRUD crudo | contexto paginado y sin saldo |
| Migración de invitado | batches de migración | requiere validar envelope y relaciones antes de publicar |
| Migración de crédito | query + set absoluto | carrera con movimientos concurrentes |
| CSV | solo lectura | correctamente limitado por filtros; se bloquea sin historial listo |

## 7. Archivos críticos

- Contratos: `src/types/finance.ts`, `src/config/constants.ts`, `firestore.rules`.
- Wiring: `src/contexts/FirestoreContext.tsx`, `src/contexts/FinanceContext.tsx`, `src/hooks/useFirestore.ts`.
- Lectura: `useFirestoreSubscriptions.ts`, `transactionPaginationCache.ts`, `useAllTransactions.ts`, `useBalanceTransactions.ts`.
- Cálculo: `accountStrategies.ts`, `balanceCalculator.ts`, `creditDeltas.ts`, `accountTransactions.ts`, `creditPaymentPairs.ts`.
- Escritura: `useTransactions.ts`, `useAddTransaction.ts`, `useTransactionsCRUD.ts`, `useAccounts.ts`, `accountOrchestration.ts`, `useDebts.ts`, `useCreditMigration.ts`, `useLocalStorage.ts`, `guestMigration.ts`.
- Entradas UI: `TransactionForm.tsx`, `TransactionsView.tsx`, `useTransactionsView.tsx`, `AccountsView.tsx`, `useAccountForm.ts`, `RecurringPaymentsView.tsx`, `MarkPaidModal.tsx`, `AIChatBot.tsx`, `gemini.ts`.
- Pruebas eje: `balancePaginationCorruption`, `useBalanceTransactions`, `transactionsWritePath`, `addTransactionBalanceGate`, `transactionEditValidation`, `transactionPaginationCache`, `useAllTransactions`, `accountBalanceAdjust`, `transactionsGuestCreditPayment`, reglas y suites de deuda/recurrentes.

## 8. Cobertura y vacíos

Los lotes focales auditados terminaron verdes (hasta 20 archivos y 188 pruebas). Esto confirma que el comportamiento vigente está caracterizado, no que sea correcto: varias pruebas afirman de manera explícita el bypass cuando `balancesReady=false`.

Faltan regresiones para:

- caché `<500` → servidor `<500`;
- caché `<500` → servidor `>=500` → activación de historial completo;
- caché offline/error que nunca se declara asentada;
- dos débitos concurrentes sobre el mismo saldo;
- `usedCredit` nulo y migración concurrente;
- enlace no recíproco o de semántica incorrecta;
- borrar → deshacer principal/pago de deuda;
- doble posteo del mismo ciclo periódico;
- fallo real de persistencia invitada y rollback de agregado;
- paridad de manual, IA, periódico, deuda, ajuste y undo contra una sola frontera.
- normalización exacta a centavos, rechazo de `Infinity` y máximo uniforme;
- `accountsRef` atrasado, escritura invitada multi-pestaña y reintento de migración parcial.

## 9. Límites de cambios relacionados

- `repair-debt-lifecycle-and-account-links` conserva ownership de crear, pagar, borrar y reasignar deudas. Este cambio solo exige que esas operaciones consuman la autoridad/guard compartido y que el undo no rompa el agregado.
- `harden-notification-delivery-and-recurring-reminders` conserva scheduler, entrega y reintentos. Las notificaciones consumen commits confirmados y nunca gobiernan el commit financiero.
- `clarify-ledger-metric-scopes` ya fijó la semántica del Resumen general, filtros y CSV; aquí se preserva sin recalcular métricas.
- No existe importador CSV activo. La única importación de transacciones vigente es la migración de datos de invitado; CSV es exportación read-only.
