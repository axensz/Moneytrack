# Auditoría profunda — MoneyTrack

> **Fecha:** 2026-06-08 · **Estado del repo:** rama `mejoras-ux` (post-commit `ef48439`, que ya resolvió 30 hallazgos de una auditoría QA previa).
> Este documento es la **fuente de verdad** de la auditoría profunda. Las correcciones de futuras sesiones deben basarse en él y marcar aquí lo que se resuelva.

## Metodología

7 auditores especializados (arquitectura, lógica financiera, frontend/a11y, seguridad, QA, producto/UX, rendimiento) recorrieron el código en paralelo; cada hallazgo crítico/alto fue **verificado de forma adversarial** abriendo el archivo citado para confirmar o refutar. Además se leyeron de forma independiente `balanceCalculator.ts`, `accountStrategies.ts`, `creditDeltas.ts`, `interestCalculator.ts`, `FinanceContext.tsx` y `firestore.rules`. Las correcciones de la fase de verificación están incorporadas (varias afirmaciones se rebajaron o refutaron — se indican abajo).

## Veredicto general

**Puntuación: 7 / 10 — Beta sólida (no production-ready todavía).**

El núcleo es mejor de lo habitual para un proyecto de este tamaño: el motor de dinero (Strategy pattern + `getCreditDelta` único + `roundMoney` contra residuos IEEE-754) está bien diseñado y bien testeado; las reglas de Firestore están correctamente cerradas por dueño con validación servidor y default-deny; el diseño BYOK de Gemini no filtra clave compartida al bundle y tiene gate de consentimiento.

Lo que impide llamarlo *production-ready*:
1. Una **ruta de pérdida total de datos** en el motor de backup (hoy latente porque no está cableado a la UI, pero producto pide cablearlo).
2. **Cobertura de tests ausente** en toda la capa de escritura de Firestore, los 6 servicios de notificación y las 7 vistas.
3. **Inconsistencias de agregación en estadísticas** (los gráficos cuentan distinto que las tarjetas).
4. **Regresiones de accesibilidad** en los diálogos destructivos de mayor riesgo.

La aritmética de dinero **almacenada** es confiable; la capa que la **rodea** (persistencia con estado, stats, servicios) está poco verificada.

---

## Hallazgos críticos

### C1 — Backup "replace" borra todo y reescribe sin atomicidad ni rollback
- **Issue:** El modo "replace" borra todo y luego escribe en batches no atómicos, sin rollback ni snapshot previo. Si la red cae o se cierra la pestaña entre el borrado y la reimportación, el usuario queda con todo borrado y reimportación parcial/nula.
- **Latente:** `useBackup` no está cableado a la UI hoy (ver M-prod-backup), así que aún no es alcanzable por usuarios — pero es **bloqueante** antes de exponerlo.
- **Por qué importa:** Pérdida irreversible del historial financiero completo. En una app de finanzas es catastrófico.
- **Evidencia:** `useBackup.ts:134-158` (`clearUserData` commitea borrados en `:153`) y `:172` (se llama antes del loop de import); escrituras no atómicas en `:214,218,241,251,255,274,279`. **Verificado.**
- **Impacto:** Pérdida total de datos en conexión inestable.
- **Fix sugerido:** Antes de borrar: snapshot a JSON en memoria + restaurar en `catch`. Mejor: escribir lo nuevo con IDs nuevos, verificar, y solo entonces borrar lo viejo. Forzar export local antes de `clearUserData`.
- **Prioridad:** Crítica (al cablear backup a UI).

> No se encontraron otras rutas que causen corrupción/pérdida de datos en flujos hoy alcanzables. El motor de balances y los writes atómicos de TC sí preservan integridad.

---

## Hallazgos altos

### A1 — Tests de deuda re-implementan la lógica dentro del test
- La función de producción nunca se ejecuta. Un test contra una copia "standalone" no prueba nada del código enviado. `registerDebtPayment` real también postea transacción income/expense y llama `updateDebt`; nada de eso se ve. Pueden quedar en verde mientras el real se rompe.
- **Evidencia:** `registerDebtPayment.test.ts:5,12-24`; `modifyDebtBalance.test.ts:4,5-38`; real en `useDebts.ts:193-229, 232-270`. **Verificado.**
- **Impacto:** Movimiento de dinero de préstamos sin protección real.
- **Fix:** Extraer la aritmética a un helper puro exportado (`computeDebtPayment`) e importarlo; o testear el hook con `renderHook` y mocks. Borrar las copias.

### A2 — Cero cobertura de la ruta de escritura a Firestore
- El único test que toca Firestore va offline y corta antes de `addDoc`/`runTransaction`. Las operaciones de dinero de mayor riesgo (pago atómico de TC con `increment` de `usedCredit`, borrado en cascada, diff de credit-delta en update) no se ejecutan en ningún test.
- **Evidencia:** `offlineWrites.test.ts:48-71`; guard `useTransactionsCRUD.ts:167,213,270,307`; ruta online sin test `:172-202, 275-299, 326-355`. **Verificado.**
- **Impacto:** Bug aquí corrompe balances/duplica deuda sin señal de test.
- **Fix:** Mock de `firebase/firestore` (`db`, `runTransaction`, `writeBatch`, `addDoc`, `increment`); aserciones sobre `increment(±amount)`, reversión de `usedCredit` y diff de delta. Considerar el emulador.

### A3 — Los 6 servicios de notificación/análisis sin ningún test
- Contienen lógica de umbrales (territorio de off-by-one). `PaymentMonitor` hace `daysUntilDue === 0/1/3` (literal: salta silenciosamente un pago a 2 días); `DebtMonitor` `>=30/60/90`; `BudgetMonitor` `>=` umbrales; `BalanceMonitor` `<`.
- **Evidencia:** `src/services/*.ts` sin referencias en tests (grep). `PaymentMonitor.ts:58,72,86`; `DebtMonitor.ts:59,73,90`; `BudgetMonitor.ts:136,156,176`. **Verificado.**
- **Impacto:** Alertas erróneas/duplicadas/ausentes; spam o silencio erosionan confianza.
- **Fix:** Test por servicio con fixtures justo bajo/en/sobre cada umbral + fake timers. Verificar dedup y respeto de preferencias en `NotificationManager`.

### A4 — Tokens de color semánticos cableados pero casi nunca usados
- Tokens en Tailwind (`@theme`) pero los componentes hardcodean literales de paleta (`purple-/gray-/rose-`). El primary de dark mode (`#8b5cf6`) no se respeta porque los botones hardcodean `from-violet-600 to-purple-600`.
- **Evidencia:** `globals.css:18`, `theme.css:20,70`; `Button.tsx:52`; `Header.tsx:108`. **0 usos** de clases token vs **1182 literales** de paleta en 65 archivos. **Verificado.**
- **Impacto:** Rebrand/dark mode imposibles de controlar central; falsa sensación de design system.
- **Fix:** Adoptar `bg-primary`/`text-muted-foreground`/`bg-destructive` en componentes; manejar variantes de Button desde tokens.

### A5 — Modales destructivos hechos a mano pierden focus trap / Escape / restauración de foco
- Justo los diálogos de mayor riesgo (borrar cuenta, borrar deuda, editar cuenta, prefs de notificación, cerrar plan): el usuario de teclado puede tabular fuera del diálogo, Escape no hace nada, el foco no se restaura. WCAG 2.4.3 / 2.1.2.
- **Evidencia:** `DeleteConfirmModal.tsx:38-46`; `AccountFormModal.tsx:82-83`; `NotificationPreferencesModal.tsx:21-22`; `DebtsView.tsx:438-440`; `BudgetsView.tsx:366-367` vs `BaseModal.tsx:64-99`. **Verificado.**
- **Impacto:** Fallo de accesibilidad en acciones irreversibles (borrar cuenta + sus transacciones).
- **Fix:** Envolver estos diálogos en `BaseModal`, o extraer el focus-trap a un hook compartido. Mínimo: Escape + trap en el modal de borrado.

### A6 — El asistente IA (feature estrella) es prácticamente indescubrible
- El botón flotante hace `return null` sin key Y está totalmente oculto para invitados → casi nadie lo descubre. Únicos puntos de entrada: un ítem de ajustes y el manual de 1340 líneas.
- **Evidencia:** `AIChatBot.tsx:531` (`if(!configured) return null`); `finance-tracker.tsx:646-650` (`{user && <AIChatBot/>}`). **Verificado.**
- **Impacto:** Baja adopción del diferenciador BYOK; inversión de ingeniería invisible.
- **Fix:** Mostrar un acceso teaser (atenuado) aun sin configurar, que abra `GeminiKeyModal` con propuesta de valor. Permitir IA a invitados o mostrar teaser "inicia sesión para usar IA".

---

## Hallazgos medios / bajos

### Funcional / finanzas

| # | Issue | Evidencia | Prioridad | Confianza |
|---|-------|-----------|-----------|-----------|
| F-stats-charts | Los gráficos (cash-flow, comparativos, pie) cuentan transacciones **impagas**, mientras todo el resto de stats filtra `t.paid`. Una compra TC impaga infla los gráficos pero no aparece en la tarjeta "Gastos" ni en presupuestos → misma compra, dos cifras en la misma pantalla. | `useStatsData.ts:65-77,93-104,118-123` (sin filtro paid) vs `useGlobalStats.ts:74`, `useBudgets.ts:110-119` | Media | confirmada |
| F-tc-cupo | TC: el **display** de cupo usa `account.usedCredit` persistido; la **validación** recalcula del array paginado. La rama de gasto (`:246-256`) no tiene el `Math.max(persisted, recompute)` que sí se aplicó a la rama de pago (`:269-270`) → en TC con historial largo paginado, el validador subestima la deuda y acepta un gasto sobre el límite. | `accountStrategies.ts:246-256` vs `:269-270` | Media | probable |
| F-loans-stats | Principal del préstamo y abonos se cuentan como income/expense real en TODAS las stats/gráficos/presupuestos/IA — prestar figura como "gasto" y cobrar como "ingreso". `LOAN_CATEGORY`/`LOAN_PAYMENT_CATEGORY` no están en `adjustmentCategories`. Contradice el principio (memoria) de que los movimientos internos nunca cuentan en stats. | `constants.ts:64`; `useDebts.ts:119-130, 210-221` | Media | needs-confirmation (decisión de negocio) |
| F-tc-paid-doble | Compra TC marcada `paid=true` se cuenta a la vez como "Gastos" (gasto efectivo) y como "Pendientes" (deuda `usedCredit`) hasta que se pague la tarjeta. `getCreditDelta` ignora `paid`. Misma doble-presentación que el fix #20 intentó eliminar, ahora para el caso pagado. | `creditDeltas.ts:23-28`; `useGlobalStats.ts:83-85,109-114` | Media | needs-confirmation |
| F-debt-neg | `registerDebtPayment` con monto negativo **aumenta** la deuda sin transacción compensatoria; `modifyDebtBalance` `'add'` tampoco valida positividad. Hoy solo lo protege la UI (`DebtsView.tsx:82`). | `useDebts.ts:202-228` | Media | confirmada |
| F-debt-cascade | `deleteDebt` borra transacciones vinculadas y la deuda en secuencia **no atómica** sin rollback — un fallo a mitad deja deuda o transacciones huérfanas y balances/`usedCredit` desincronizados. | `useDebts.ts:154-190` (loop `await deleteTransaction` + `deleteDoc` separado) | Media | probable |
| F-edit-saldo | Editar un gasto cercano al saldo puede dar falso "Saldo insuficiente": `validateTransaction` calcula el balance sin excluir la transacción en edición. | `accountStrategies.ts:92-111` (línea 100/102) | Baja | needs-confirmation |
| F-cuotas-redondeo | `calculateInterest` sin interés divide `principal/installments` sin redondear → cuotas no reconcilian al principal (`$100/3 = 33.33×3 = 99.99`). La rama con interés sí redondea. | `interestCalculator.ts:147-155` vs `:169-171` | Baja | confirmada |
| F-fecha-relativa | `formatRelativeTime`/`getDaysUntilDue` usan meses de 30 días y años de 365 → labels "hace N meses" imprecisas cerca de bordes de mes. (No afecta `getDaysOverdue` real.) | `formatters.ts:198,207-210` | Baja | confirmada |
| F-cuotas-capas | `validateInterestConfig` permite hasta 60 cuotas (incluye 48/60), pero `firestore.rules:28` rechaza `installments > 36` y la UI (`INSTALLMENT_OPTIONS`) solo ofrece hasta 36. La función de 60 no está cableada → inconsistencia latente / validación semi-muerta. | `interestCalculator.ts:200-205`; `firestore.rules:25-29`; `TransactionForm.tsx:308` | Baja | confirmada |

### Arquitectura / calidad de código

| # | Issue | Evidencia | Prioridad |
|---|-------|-----------|-----------|
| Q-context | `FinanceContext` es un único value monolítico (~60 campos). Sin suscripción por campo, cualquier cambio re-renderiza Goals/Budgets/Debts/Stats/Accounts a la vez. `useFinanceSelectors` admite que no evita el re-render con un solo contexto y solo lo adoptan 3 de 11 consumidores. | `FinanceContext.tsx:300-398`; `useFinanceSelectors.ts:13-17`. Mitigado hoy por lazy-mount de la vista activa. | Media |
| Q-errboundary | Dos `ErrorBoundary` divergentes; la página cablea la vieja. (Verificación **REFUTÓ** la afirmación grave: la vieja SÍ reporta a `captureError` transitivamente vía `logger.error` en `logger.ts:79`.) Deuda de mantenibilidad: dos UIs de error paralelas + payload de contexto distinto. | `app/page.tsx:4` vs `finance-tracker.tsx:10`; `src/components/ErrorBoundary.tsx` vs `layout/ErrorBoundary.tsx` | Baja |
| Q-button-dead | `Button`/`IconButton` del design-system son **código muerto** — importados por cero componentes; todas las vistas hacen botones a mano con `.btn-*` o Tailwind crudo. | `ui/Button.tsx:98-217`; `ui/index.ts:5`; `BudgetsView.tsx:378`, `DebtsView.tsx:458-467` | Media |
| Q-useAccounts | `useAccounts.ts` (559 LOC) incrusta orquestación Firestore cruda (`runTransaction`, cascade delete multi-batch, merge de TC) saltándose la capa `hooks/firestore`. La operación más riesgosa (cascade delete, no atómico >490 ops) está enterrada en un hook de UI. | `useAccounts.ts:2,157-275,393-530` vs `useAccountsCRUD.ts:18-40` | Media |
| Q-godfiles | God-files: `HelpModal.tsx` (1340 LOC de JSX estático ≈ 3.6% del src), `ImportTransactionsModal.tsx` (1228 LOC, wizard completo en una función, sin `BaseModal`). | `wc -l`; `HelpModal.tsx:10` | Media |
| Q-stripundef | Lógica "strip undefined antes de escribir" duplicada en 4 módulos pese a existir `firestoreHelpers.ts`. | `useAccounts.ts:29-33`, `useAccountsCRUD.ts:36-38`, `useTransactionsCRUD.ts`, `useRecurringCRUD.ts` | Baja |
| Q-deprecated | `balanceCalculator.ts` tiene capa `@deprecated` (`CreditCardCalculator`) que sigue en la ruta viva → 2-3 APIs para la misma pregunta de crédito; etiquetas deprecated engañosas. | `balanceCalculator.ts:22,176-181,205-210`; caller `useAccounts.ts:7` | Baja |
| Q-selectors | `useFinanceSelectors` es abstracción a medias (pass-through sin memo ni contexto separado), adoptada por 3/11. | `useFinanceSelectors.ts:31-194` | Baja |
| Q-cc-dead | `useCreditCardInterests` calcula `monthly`/`yearlyTransactions` que nunca usa (código muerto; posible scoping de periodo incompleto). | `useCreditCardInterests.ts:68-76` vs `:87-110` | Baja |

### UI / accesibilidad

| # | Issue | Evidencia | Prioridad |
|---|-------|-----------|-----------|
| UI-filterdropdown | `FilterDropdown` (select custom) sin roles ARIA, sin `aria-expanded`/`haspopup`, sin Escape ni navegación por teclado. Replicado en cada filtro y `DateFilterDropdown`. | `FilterDropdown.tsx:53-66,69-70,31-44,84-99` | Media |
| UI-row-buttons | Botones de acción de fila (Editar/Eliminar) son `opacity-0` en desktop pero siguen en tab-order y enfocables siendo invisibles. El usuario de teclado aterriza sobre "Eliminar" sin verlo. WCAG 2.4.7. | `TransactionItem.tsx:255-271` | Media |
| UI-nested-button | Fila interactiva con `role=button` en un `<div>` que contiene `<button>` anidados (ARIA inválido; semántica impredecible para lectores de pantalla). | `TransactionItem.tsx:180-187, 256-271` | Media |
| UI-touch-44 | El piso de 44px de touch target es solo móvil y excluye `.text-xs` → muchos icon/chip buttons quedan bajo 44px; desktop sin piso. WCAG 2.5.5. | `utilities.css:272-278`; `FilterDropdown.tsx:55`; `ImportTransactionsModal.tsx:859` | Media |
| UI-text-small | Texto omnipresente de 10-11px y `text-gray-400` en datos con sentido (fechas, categorías) — contraste/tamaño bajo AA probable sobre `#faf9f7`. | 55 usos de `text-[10/11px]` en 11 archivos; `TransactionItem.tsx:224,227` | Media |
| UI-header-menu | Menú de ajustes del Header declara `role=menu/menuitem` pero sin flechas ni Escape (semántica anunciada ≠ comportamiento). | `Header.tsx:189-248` | Baja |
| UI-install-light | `InstallPrompt` hardcodea colores solo-claro (`bg-white text-purple-600`, sin `dark:`). | `InstallPrompt.tsx:106` | Baja |
| UI-dnd-keyboard | Reordenar `AccountCard` es solo drag-and-drop, sin alternativa por teclado. WCAG 2.1.1. | `AccountCard.tsx:105-121,134-137` | Baja |

### Seguridad / fiabilidad

| # | Issue | Evidencia | Prioridad |
|---|-------|-----------|-----------|
| S-replace-orphan | El "replace" import solo limpia transactions/accounts/categories, dejando debts/recurring/savingsGoals apuntando a accounts borradas (los nuevos accounts reciben IDs nuevos). (Verificación: budgets referencian `category`, NO `accountId` — el hallazgo los sobre-incluía; el "wrong money math" estaba exagerado: los balances core derivan de transactions, que sí se remapean.) | `useBackup.ts:139-147,204,262-264`; `finance.ts:41,59,83` | Media |
| S-gemini-plaintext | Key de Gemini por-usuario guardada en Firestore en texto plano y espejada en IndexedDB (`persistentLocalCache`), contradiciendo el comentario de "nunca persiste". Owner-scoped y cifrado en reposo, pero recuperable en dispositivo compartido/comprometido. | `useGeminiApiKey.ts:104`; `firestore.rules:316-323`; `firebase.ts:41-45,88` | Media |
| S-settings-rule | Regla genérica `/settings/{settingId}` permite escribir campos arbitrarios sin validar (`planConfig.declaredIncome` puede ser NaN/negativo/enorme; documento sin límite de tamaño). Único punto laxo entre reglas por lo demás estrictas. | `firestore.rules:316-323` | Media |
| S-error-redact | El handler global de errores reenvía errores/rechazos no capturados a `captureError` **SIN** la redacción de `logger` → con un reporter real configurado, montos/descripciones o la key embebidos en mensajes/stacks saldrían del dispositivo. | `errorReporter.ts:66-80` vs `logger.ts:75-80` | Media |
| S-xlsx-cdn | `xlsx` clavado a tarball de CDN (no registry): `npm audit` no lo cubre, build no reproducible, y parsea archivos subidos no confiables. | `package.json:28` | Baja |
| S-env-key | `NEXT_PUBLIC_GEMINI_API_KEY` obsoleto sigue en `.env.local` (no referenciado en código → no entra al bundle hoy; `.env.local` no commiteado). Footgun: un solo import lo inlinearía al bundle de todos. | grep sin matches; `.env.local` | Baja |
| S-ai-visibility | `AIChatBot` decide visibilidad con `isGeminiConfigured()` de memoria de módulo, no reactivo al contexto de key/consentimiento (UX puede quedar inconsistente; el gate duro en `getGeminiClient` sí evita egress). | `AIChatBot.tsx:308,531`; `geminiClient.ts:39` | Baja |

### Producto / UX

| # | Issue | Evidencia | Prioridad |
|---|-------|-----------|-----------|
| P-debt-disclosure | Borrar una deuda/préstamo cascada-elimina sus transacciones y revierte balances de cuenta/TC, pero la confirmación solo dice "no se puede deshacer" sin mencionar los efectos financieros. | `DebtsView.tsx:449-456`; cascade real `useDebts.ts:154-190,208-222`. (cascade correcto; falta divulgación) | Media |
| P-goals-isolated | Las metas de ahorro son un contador aislado: "Agregar ahorro" solo incrementa `currentAmount`, nunca mueve dinero de una cuenta (`accountId` declarado pero sin uso) → el dinero se cuenta doble y no hay "retirar". | `useSavingsGoals.ts:112-124`; `GoalsView.tsx:48-54,153-193`; `finance.ts:83` | Media |
| P-backup-nowire | Motor completo de backup/restore JSON (`useBackup`) implementado pero no cableado a ninguna UI → sin portabilidad ni recuperación de datos. (Cablearlo activa C1 — arreglar atomicidad primero.) | `useBackup.ts:37-66,289-338`; `Header.tsx:195-247` sin entrada | Media |
| P-welcome-dup | Dos welcome modals pueden apilarse, y el `WelcomeModal` in-app reaparece en cada recarga (solo ref en memoria, sin localStorage). | `layout.tsx:38`; `PWAWelcomeModal.tsx:14-33`; `useWelcomeModal.ts:30,33` | Media |
| P-confirm-native | Confirmaciones destructivas inconsistentes: budgets/goals usan `confirm()` nativo (no temático, no accesible, suprimible en algunos WebView/PWA) mientras accounts/debts/recurring usan modales ricos. | `BudgetsView.tsx:75`; `GoalsView.tsx:75` | Media |
| P-guest-hidden | Modo invitado indescubrible: `AuthModal` solo ofrece "Continuar con Google", sin decir que la app es usable sin cuenta. | `AuthModal.tsx:36-78`; `Header.tsx:137-145` | Media |
| P-onboarding | Help es un manual estático de 1340 líneas sustituyendo onboarding real; `WelcomeModal` es una sola pantalla "crea cuenta" sin tour contextual. | `HelpModal.tsx:1-53`; `WelcomeModal.tsx:27-58` | Baja |
| P-cascade-incons | Semántica de cascade inconsistente entre entidades (recurring conserva transacciones; debts las borra) sin vista unificada de "qué se afecta" antes de borrar. | `DeletePaymentModal.tsx:33-35` vs `useDebts.ts:154-190` | Baja |

### Rendimiento

| # | Issue | Evidencia | Prioridad |
|---|-------|-----------|-----------|
| R-balance-recalc | Recálculo de balance O(cuentas × transacciones) duplicado en ~6 hooks que dependen de transactions → un solo add re-ejecuta todos. (Verificación: la ruta de TC hace short-circuit en `usedCredit` persistido = O(1); el coste real O(N×cuentas) es la ruta savings/cash + filtros por-hook. Severidad rebajada.) | `accountStrategies.ts:66-90`; `balanceCalculator.ts:136-150`; `useGlobalStats.ts:73-114`; `useFilteredData.ts:87-130`; `AccountsView.tsx:49-57` | Media |
| R-allTx-refetch | `useAllTransactions` reconstruye una firma string de todo el historial y re-fetchea la colección completa en cada edición mientras Stats está abierto. | `useAllTransactions.ts:41-49,59-85`; `StatsView.tsx:34` | Media |
| R-provider-eager | `FinanceProvider` ejecuta todos los hooks de feature (budgets/debts/goals/recurring) sin importar la vista activa → cada mutación recomputa agregados fuera de pantalla. | `FinanceContext.tsx:173-292` | Media |
| R-memo-inline | `React.memo` de `TransactionItem` anulado por callbacks inline frescos por fila en cada render. | `TransactionItem.tsx:33`; `TransactionsList.tsx:188-201` | Media |
| R-analytics-eager | Firebase Analytics se carga e inicializa eager en import de módulo, fuera del critical path. | `firebase.ts:2,57` | Baja |
| R-recompute-submit | `validateTransaction` de TC siempre hace `recomputeUsedCreditFromTransactions` (O(N)) en submit, aun cuando el persistido está fresco. | `accountStrategies.ts:205-223,243` | Baja |
| R-date-perrow | `TransactionsList` aloca `new Date()` + `toLocaleDateString` por ítem en cada render; visible recreado fuera del memo. | `TransactionsList.tsx:97,160-181` | Baja |
| R-xlsx-full | `xlsx` se importa completo (`import * as XLSX`) — pesado aunque code-split; parsea en main thread. | `xlsxParser.ts:12` | Baja |

> **Hallazgo REFUTADO en verificación (no es riesgo):** "auto-generación/catch-up de pagos recurrentes sin tests" — ese flujo no existe en el código; los recurrentes solo se convierten en transacción manualmente vía `TransactionForm.tsx:360-398`. `PaymentMonitor` solo crea notificaciones, nunca transacciones. El riesgo de "duplicar cargos al abrir tras días offline" es ficticio aquí.

---

## Bugs / flujos para reproducir (casos manuales)

1. **Gráficos ≠ tarjetas (F-stats-charts):** Crea una compra de TC con `paid=false`. Estadísticas → la compra aparece en cash-flow/categoría/comparativo, pero la tarjeta "Gastos" y los presupuestos no la cuentan.
2. **Préstamo como gasto (F-loans-stats):** Registra un préstamo "Me deben" de $1.000.000. Estadísticas → figura $1M de "gasto"; al cobrarlo, $1M de "ingreso".
3. **Cupo de TC sobrepasado (F-tc-cupo):** En una TC con >500 transacciones (paginadas), intenta un gasto que excede el límite real pero no el recalculado en memoria → se acepta indebidamente.
4. **Deuda crece con monto negativo (F-debt-neg):** `registerDebtPayment(debtId, -50000)` desde código/acción IA (la UI lo bloquea) → la deuda aumenta sin transacción compensatoria.
5. **Teclado sobre "Eliminar" invisible (UI-row-buttons):** Lista de transacciones (desktop), tabula por una fila → el foco aterriza en el botón Eliminar invisible (`opacity-0`). Enter → borra.
6. **Escape no cierra borrado de cuenta (A5):** Abre "Eliminar cuenta", pulsa Escape → no pasa nada.
7. **Edición cerca del saldo (F-edit-saldo):** Cuenta con saldo $100, gasto existente $90. Edita ese gasto a $95 → posible falso "Saldo insuficiente".
8. **WelcomeModal renag (P-welcome-dup):** Sin crear cuenta, recarga varias veces → el WelcomeModal reaparece cada vez.
9. **Replace huérfano (S-replace-orphan, al cablear backup):** Importa en modo "replace" teniendo deudas con `accountId` → las deudas quedan apuntando a cuentas inexistentes.
10. **Cuotas sin interés no reconcilian (F-cuotas-redondeo):** Compra $100 a 3 cuotas sin interés → cuota mostrada 33.33 × 3 = 99.99 ≠ 100.

---

## Riesgos de seguridad / fiabilidad (los más importantes)

1. **C1** — pérdida total de datos en backup "replace" no atómico (latente hasta cablear; bloqueante antes de exponer).
2. Reglas `settings/` sin validación de campos arbitrarios — único hueco en reglas por lo demás sólidas.
3. Key Gemini en texto plano en Firestore + IndexedDB, contradiciendo el modelo de amenaza declarado.
4. Handler global de errores sin redacción — fuga potencial de datos financieros/key a un reporter externo cuando se configure.
5. `xlsx` desde tarball de CDN parseando archivos no confiables (cobertura de auditoría reducida).
6. `replace` import deja referencias huérfanas cross-colección.

> **Lo que está bien (no tocar):** reglas Firestore owner-scoped con default-deny y validación servidor; BYOK sin key compartida en bundle; gate de consentimiento; logger redacta campos sensibles; salida de IA renderizada como React (sin `dangerouslySetInnerHTML`); `firebase-admin` solo devDependency, nunca importado en cliente.

---

## Problemas de arquitectura / mantenibilidad (los más importantes)

1. Contexto monolítico (`FinanceContext`) — el acoplamiento de re-render escalará mal; el "seam" (`useFinanceSelectors`) está a medias.
2. Dos sistemas de botones / dos `ErrorBoundary` / `BaseModal` adoptado parcialmente — design system "teatral": existe pero se evita.
3. God-files (`HelpModal` 1340, `ImportTransactionsModal` 1228, `useAccounts` 559 con Firestore crudo).
4. Capa de persistencia inconsistente: CRUD simple por `hooks/firestore`, pero cascade/merge crudos en hooks de UI.
5. Capa "deprecated" viva en `balanceCalculator` y duplicación de `stripUndefined`.

---

## Tests que deberían existir (faltantes)

- Ruta de escritura Firestore (mock): `addCreditPaymentAtomic` (increment correcto por cuenta), `deleteTransaction` (reversión de `usedCredit`), `updateTransaction` (diff de delta), `addTransferAtomic`, cascade delete de cuenta.
- Código real de deudas (no la copia): `registerDebtPayment`/`modifyDebtBalance` ejecutando la función de producción (transacción + `updateDebt` + clamp + signo lent/borrowed).
- Los 6 servicios con fixtures justo bajo/en/sobre cada umbral + fake timers (especial: `PaymentMonitor === 0/1/3`).
- Import e2e: extracto que solapa transacciones existentes → commit con dedup → balance/`usedCredit` recomputados.
- Render de las 7 vistas: al menos add/edit de transacción y pago de deuda (rellenar, submit, aserción de callback + errores de validación).
- `useStatsData`: que filtre `paid` consistente con `useGlobalStats`.
- `useCreditCardInterests`: interés mensual/anual/total/pendiente para un plan de cuotas conocido.
- Tooling: borrar un `vitest.config` duplicado, `npm test` no en watch para CI, añadir `@vitest/coverage-v8` con umbral.

---

## Top 10 fixes para hacer primero

Priorizado por impacto en usuario × riesgo × esfuerzo:

1. Hacer **atómico/seguro el backup "replace"** (snapshot + rollback, o write-then-delete) antes de cablear `useBackup` a la UI. *(C1 — pérdida de datos)*
2. **Unificar la regla de `paid`** en `useStatsData` para que los gráficos coincidan con tarjetas/presupuestos. *(bajo esfuerzo, alta confianza)*
3. **Guard de positividad** en `registerDebtPayment`/`modifyDebtBalance` (`if (!(amount>0)) return`). *(1 línea, cierra invariante)*
4. Aplicar **`Math.max(persisted, recompute)`** a la rama de gasto de TC (`accountStrategies.ts:248`). *(corrige sobre-aceptación de cupo)*
5. **Mock de Firestore + tests** de la ruta de escritura de dinero (A2) y convertir los tests de deuda a código real (A1).
6. **Tests de los 6 servicios** de umbral (A3), arreglando el `=== 0/1/3` de `PaymentMonitor` si se confirma off-by-one.
7. Revelar acciones de fila en **focus-within** + **Escape/focus-trap** en modales destructivos (A5, row buttons). *(a11y de alto riesgo)*
8. **Validar/segmentar la regla `settings/{settingId}`** y enrutar el handler global de errores por `sanitize()`.
9. **Divulgar la cascada** al borrar deuda + reemplazar `confirm()` de budgets/goals por el modal compartido.
10. **Decidir y documentar** el tratamiento de préstamos en stats (¿movimiento interno o ingreso/gasto real?) y, si interno, añadir las dos categorías a `adjustmentCategories`.

---

## Roadmap de implementación

### Inmediato (hoy/mañana — riesgo y quick wins)
- C1 atomicidad de backup (o mantener `useBackup` explícitamente fuera de la UI con comentario de bloqueo).
- Filtro `paid` en `useStatsData` (#2).
- Guard de monto en deudas (#3).
- `Math.max` en rama de gasto de TC (#4).
- Borrar `NEXT_PUBLIC_GEMINI_API_KEY` de `.env.local`.

### Esta semana (red de seguridad + a11y)
- Mock de Firestore y tests de escritura de dinero (A2); deuda con código real (A1); tests de servicios (A3).
- focus-within/Escape/focus-trap en modales destructivos; revelar botones de fila enfocados (A5).
- Regla `settings/` validada; redacción en handler global de errores.
- Decisión documentada sobre préstamos en stats; divulgar cascade de deuda; reemplazar `confirm()`.
- Tooling de tests (config único, no-watch en CI, coverage con umbral).

### Después (deuda estructural y producto)
- Dividir `FinanceContext` en contextos por dominio (o store con selectores) respaldando `useFinanceSelectors`.
- Elegir UN sistema de botones y adoptar tokens semánticos; consolidar `ErrorBoundary` y `BaseModal`.
- Descomponer `HelpModal`/`ImportTransactionsModal`; extraer cascade/merge de `useAccounts` a un repositorio.
- Cablear backup/export a la UI (post-C1) — incluido modo invitado.
- Descubribilidad de IA y de modo invitado; onboarding contextual; metas con cuenta real o etiqueta de "seguimiento manual".
- Rendimiento: mapa único de balances/`usedCredit`, lazy Analytics, refetch de Stats sin firma de historial completo.

---

## Recomendación final

**No abrir features nuevas todavía.** El producto está en una beta sólida (7/10) con fundamentos buenos, pero tiene tres deudas que un feature nuevo solo agravaría:

1. Una **red de seguridad de tests ausente** justo donde se mueve el dinero (escritura Firestore, deudas con código real, servicios). Hoy no hay forma de saber si un cambio rompe balances o `usedCredit`. Esto es lo primero.
2. Una **ruta de pérdida total de datos** latente (backup replace) que debe blindarse antes de exponerse.
3. **Inconsistencias de presentación de cifras** (gráficos vs tarjetas, préstamos, compras TC pagadas) que erosionan la confianza — el activo central de una app de finanzas.

**Plan recomendado antes de nuevas funcionalidades:** (a) blindar C1, (b) los 4 fixes de dinero de bajo esfuerzo (#2-#4, #10), (c) levantar la cobertura de la capa de escritura/servicios/deudas, (d) cerrar las regresiones de a11y en diálogos destructivos. Con eso, el proyecto pasa de "beta confiable en lectura" a "listo para evolucionar con seguridad".

---

## Registro de resolución

> Marcar aquí cada hallazgo a medida que se resuelva (id · fecha · commit · nota).

| Hallazgo | Estado | Fecha | Commit / nota |
|----------|--------|-------|---------------|
| **C1** backup replace | ✅ Resuelto | 2026-06-09 | `useBackup.ts`: write-then-delete **+ rollback**. Snapshot → escribe lo nuevo (registrando cada ref) → si falla a mitad, **borra los docs nuevos parciales** (rollback) dejando los viejos intactos y sin duplicados → solo tras éxito total borra lo viejo (swap). Semántica efectiva "todo o nada" dentro de los límites de Firestore (no hay transacción atómica sobre miles de docs; el caso degenerado red-caída-en-rollback queda documentado). Test: `backupReplaceAtomic.test.ts` (4: orden, rollback-replace, merge OK, rollback-merge). |
| **F-stats-charts** (#2) | ✅ Resuelto | 2026-06-08 | `useStatsData.ts` filtra `t.paid` → gráficos = cards/presupuestos. Test: `useStatsData.test.ts` (4). |
| **F-debt-neg** (#3) | ✅ Resuelto | 2026-06-08 | `useDebts.ts`: guard `amount>0` en `registerDebtPayment` (return) y `modifyDebtBalance` (throw). Test: `debtAmountGuard.test.ts` (9). |
| **F-tc-cupo** (#4) | ✅ Resuelto | 2026-06-08 | `accountStrategies.ts`: rama gasto usa `Math.max(persisted, recompute)`. Test: 3 casos en `accountStrategies.test.ts`. ⚠️ Trade-off: introduce falso "Cupo insuficiente" **transitorio** tras un pago reciente no persistido (espejo, igual que la rama de pagos). El test #10 previo (que asumía la dirección contraria) se reescribió para la dirección stale-baja. |
| **S-env-key** | ✅ Resuelto | 2026-06-08 | `NEXT_PUBLIC_GEMINI_API_KEY` removida de `.env.local` (reemplazada por comentario BYOK). 0 referencias en `src/`/`app/`. |
| **F-loans-stats** (#10) | ✅ Resuelto | 2026-06-08 | **Decisión: movimiento interno.** `LOAN_CATEGORY` + `LOAN_PAYMENT_CATEGORY` añadidas a `adjustmentCategories` (`constants.ts`) → préstamos/cobros excluidos de cards, gráficos, presupuestos, plan, servicios e IA vía la fuente única. Saldos NO afectados (se calculan por `t.paid`). Tests: casos #10 en `useGlobalStats.test.ts` y `useStatsData.test.ts`. |
| **A2** ruta de escritura | ✅ Resuelto | 2026-06-08 | Cobertura de la capa de escritura de dinero. `transactionsWritePath.test.ts` (10: add/addCreditPaymentAtomic/transfer/delete/update — mock de firebase/firestore que asevera signo+magnitud de `increment(usedCredit)` y atomicidad) + `accountCascadeDelete.test.ts` (4: cascade delete + reconciliación idempotente de `usedCredit` por SET desde sobrevivientes; protección cuenta default). |
| **A1** deudas código real | ✅ Resuelto | 2026-06-08 | `registerDebtPayment.test.ts` y `modifyDebtBalance.test.ts` reescritos para ejecutar el hook real `useDebts` (modo invitado) en vez de re-implementar la lógica standalone. 14 casos; espía `addTransaction` (tipo/monto/categoría/cuenta). |
| **A3** tests de servicios | ✅ Resuelto | 2026-06-08 | 6 archivos en `src/__tests__/services/` (42 tests), fixtures bajo/en/sobre cada umbral + fake timers: Payment (0/1/3), Debt (30/60/90), Balance (`< umbral`, cooldown), Budget (80/90/100), Spending (>200% del promedio), NotificationManager (gating/dedup/quiet-hours). **Aclaración:** el `=== 0/1/3` de PaymentMonitor NO es off-by-one sino schedule discreto (día 2 sin aviso a propósito); la fragilidad real es perder el aviso si la app no se abre ese día (no cambiado — decisión de diseño). |
| **A5** a11y modales | ✅ Resuelto | 2026-06-08 | Hook `useModalA11y` (scroll-lock, Escape, focus-trap, restauración de foco) + `BaseModal` refactorizado; aplicado a `DeleteConfirmModal`/`AccountFormModal`/`NotificationPreferencesModal`. Nuevo `ConfirmDialog` (sobre BaseModal) que reemplaza los modales INLINE de `DebtsView` (borrar deuda — ahora **divulga la cascada**, cierra también **P-debt-disclosure**) y `BudgetsView` (cerrar plan), y los **`confirm()` nativos** de budgets/goals (ya no quedan `confirm()`). Test `useModalA11y.test.tsx`. |
| **P-debt-disclosure** | ✅ Resuelto | 2026-06-08 | El `ConfirmDialog` de borrar deuda ahora divulga que se eliminan las transacciones vinculadas y se revierten los saldos afectados (antes solo decía "no se puede deshacer"). |
| **S-settings-rule** | ✅ Resuelto | 2026-06-09 | `firestore.rules`: la regla `/settings/{settingId}` ahora valida ESTRICTAMENTE por documento — `ai` solo `{geminiApiKey:string≤200, aiConsent:bool}`, `planConfig` solo `{startMonth:'YYYY-MM', declaredIncome>0 y ≤1e9}` (rechaza NaN/negativo/enorme); `hasOnly` bloquea campos desconocidos y cualquier otro `settingId`. `allow delete` separado para no romper `clearConfig`/`deleteField`. |
| **S-error-redact** | ✅ Resuelto | 2026-06-09 | `sanitize` extraído a `src/utils/sanitize.ts` (compartido); `captureError`/`captureMessage` ahora **redactan el contexto** antes de enviarlo al reporter → ni el logger, ni el handler global de errores, ni un llamador directo filtran montos/descripciones/la API key a un servicio externo. Test en `errorReporter.test.ts`. |
| **F-debt-cascade** | ✅ Resuelto | 2026-06-09 | `useDebts.deleteDebt` (autenticado) ahora borra las transacciones vinculadas + revierte `usedCredit` de las TC afectadas + borra la deuda en **UNA `runTransaction`** (todo o nada). Se threadea `accounts` a `useDebts`. Fallback secuencial si hay > 400 transacciones (límite de Firestore). Test: `debtCascadeDelete.test.ts` (3). |
| **F-cuotas-redondeo** | ✅ Resuelto | 2026-06-09 | `interestCalculator.ts`: la cuota sin interés se redondea a centavos (`Math.round(principal/installments*100)/100`), igual que la rama con interés (antes devolvía el float crudo). `totalAmount` sigue siendo el principal exacto. Test en `interestCalculator.test.ts`. |
| **F-edit-saldo** | ❌ Refutado | 2026-06-09 | No reproducible: el path de edición (`handleSaveEdit` en `useTransactionsView`) NO ejecuta la validación de saldo/cupo (`validateTransaction`) — solo valida monto>0, máximo y categoría, y llama directo a `updateTransaction`. El falso "Saldo insuficiente" describía un camino inexistente. (Observación aparte, fuera de alcance: la edición tampoco impide sobregirar — falta de validación, no falso-positivo.) |
| **Q-stripundef** | ✅ Resuelto | 2026-06-09 | El patrón "quitar claves undefined antes de escribir" estaba duplicado en 8 hooks (+ helper local en `useAccounts`). Centralizado en `stripUndefined` en `utils/firestoreHelpers.ts`; 13 sitios migrados. Behavior-preserving (verificación adversarial: equivalente exacto). |
| **Q-godfile-help** | ✅ Resuelto | 2026-06-09 | `HelpModal.tsx` (1340 LOC de JSX estático) descompuesto en 9 componentes de sección bajo `components/modals/help/`; el contenedor conserva BaseModal + tabs + orden. Contenido byte-idéntico (verificación adversarial). |
| **Q-deprecated** | ✅ Resuelto | 2026-06-09 | Retirada la capa `@deprecated CreditCardCalculator` de `balanceCalculator.ts`. API viva única `getCreditCardUsedCredit` en `accountStrategies.ts`; 8 call sites de producción + 2 tests rewireados; clase y statics de crédito eliminados (`BalanceCalculator` conserva solo su API viva). Behavior-preserving (guard de tipo preservado). |
| **UI-row-buttons** | ✅ Resuelto | 2026-06-09 | Las acciones de fila (Editar/Eliminar) ahora se revelan también con `sm:group-focus-within:opacity-100` (antes solo `group-hover`) → el usuario de teclado VE el foco al tabular en vez de aterrizar sobre un botón invisible. WCAG 2.4.7. Test en `transactionItemA11y.test.tsx`. |
| **UI-nested-button** | ✅ Resuelto | 2026-06-09 | `TransactionItem`: el contenedor de fila ya NO es `role=button` anidando `<button>` (ARIA inválido). Se retiró `role/tabIndex/aria-expanded/onKeyDown` del `<div>` (queda `onClick` como conveniencia de ratón) y el chevron se convirtió en `<button>` real con `aria-expanded` + label Expandir/Contraer + touch 44px → ruta de teclado válida y semántica correcta. Test en `transactionItemA11y.test.tsx`. |
| **UI-filterdropdown** | ✅ Resuelto | 2026-06-09 | `FilterDropdown`: trigger con `aria-haspopup=listbox` + `aria-expanded`; panel `role=listbox` con `aria-label`; opciones `role=option` + `aria-selected`; **Escape** cierra. `DateFilterDropdown` (composite con inputs): `aria-haspopup=dialog` + `aria-expanded` + panel `role=dialog` + Escape. Test `filterDropdownA11y.test.tsx` (4). |
| **UI-touch-44** | ✅ Resuelto (conservador) | 2026-06-09 | `utilities.css`: la regla móvil de 44px ya NO excluye `.text-xs` (chips/icon-buttons antes bajo 44px). Añadido piso de altura desktop 24px (WCAG 2.5.8 AA) vía `@media (min-width:641px) and (pointer:fine)`, sin forzar ancho para no romper botones de texto inline. ⚠️ Cambio de CSS global: verificado tsc/build, NO QA visual headless. |
| **UI-text-small** | 🟡 Parcial | 2026-06-09 | Mejora de contraste conservadora (sin cambiar tamaño → sin riesgo de layout): la fecha de `TransactionItem` pasó de `text-gray-400` a `text-gray-500` (texto con dato). El barrido completo (55 usos `text-[10/11px]` en 11 archivos) requiere pase de diseño visual — **pendiente**. |
| **R-memo-inline** | ✅ Resuelto | 2026-06-09 | `TransactionItem` recibía closures de cero-args creadas por fila (`onEdit={()=>…}`, etc.) + `editForm` a TODAS las filas → `React.memo` nunca evitaba re-render; teclear en una fila re-renderizaba las ~30 visibles. Fix: callbacks ahora reciben `transaction`/`id` y se pasan las refs **estables** (`useCallback`) directo desde `useTransactionsView` (TransactionsList + AdjustmentGroup); `memo` con comparador `areEqual` que ignora `editForm`/`onSave` salvo en la fila en edición. Tests de contrato en `transactionItemA11y.test.tsx` (2). |
| **R-date-perrow** | ✅ Resuelto | 2026-06-09 | `TransactionsList`: el `.map` alocaba `new Date()`/`toLocaleDateString` por fila en cada render para la cabecera de fecha; además el memo de agrupación dependía de `visible` (slice de identidad nueva cada render → recomputaba siempre). Fix: el `useMemo` ahora depende de `[transactions, visibleCount]`, calcula `visible` dentro, y precalcula `showDateHeader`+`headerLabel`+`key` una sola vez; el render solo los lee. |
| **R-allTx-refetch** | ✅ Resuelto | 2026-06-09 | `useAllTransactions` re-leía la colección COMPLETA (N lecturas Firestore) en CADA edición con Stats abierto, porque la firma de dependencia incluía campos (monto/fecha/categoría/tipo/pago). Fix: la firma es ahora el **set de IDs** del array live → refetch solo en alta/baja (cambio de membresía), no al editar. Correcto porque el retorno fusiona con **precedencia del array live** (`mergeTransactionsById(primary=live)`) y toda tx editable está en live → la edición ya se refleja sin tocar `fullTxs`; la baja cambia el set → refetch que purga la copia stale. Edición: de **N lecturas → 0**. Investigado vs onSnapshot (1 delta/edición + listener always-on) y rollups precomputados; se eligió la firma-de-IDs por mínimo riesgo + mínimas lecturas. Test `useAllTransactions.test.ts` (6). |
| **R-analytics-eager** | ✅ Resuelto | 2026-06-09 | `firebase.ts` importaba `firebase/analytics` estáticamente y llamaba `getAnalytics` en el import del módulo (que provee db/auth → siempre en el arranque) → el SDK entraba al bundle principal y se inicializaba en el critical path. Fix: import **dinámico** (`import('firebase/analytics')`, code-split fuera del bundle principal) + init **diferido** en `requestIdleCallback` (fallback setTimeout 2s) + guard `isSupported()` + `measurementId`. El export `analytics` (sin consumidores) se retiró. Verificado: build code-splittea, 0 importadores rotos. |

| **P-goals-isolated** | ✅ Resuelto (divulgación) | 2026-06-09 | **Decisión del usuario: etiqueta de "seguimiento manual"** (no mover dinero real). `GoalsView` ahora divulga, bajo el encabezado, que las metas son un seguimiento informativo y que "Agregar ahorro" **no mueve dinero** de las cuentas ni afecta saldos (banner + hint en el formulario inline) → elimina la percepción de doble-conteo sin tocar el motor de dinero. Sin cambio de lógica financiera. Test `goalsDisclosure.test.tsx`. (El `accountId` declarado pero no cableado queda como deuda menor, no riesgo.) |

| **A4** tokens/botones | ✅ Resuelto (sistema de botones) | 2026-06-09 | **Decisión del usuario: mantener la identidad violeta + tokenizar.** Se centralizó la paleta de botones en 8 tokens `--btn-*` en `theme.css` (fuente única); las clases `.btn-*` (sistema vivo) ya no hardcodean literales — el gradiente primario, los hovers de submit/cancel y el danger pasan por `var(--btn-*)`. Cambiar esos tokens rebranda TODOS los botones desde un sitio. Mode-invariante → cero cambio visual. ⚠️ El barrido app-wide de literales DECORATIVOS no-botón (purple-100/gray-400 en ~65 archivos) queda como deuda de diseño diferida (no necesario para el control central de la paleta de botones). |
| **Q-button-dead** | ✅ Resuelto | 2026-06-09 | El `<Button>`/`<IconButton>` del design-system eran código muerto (0 importadores, 0 usos JSX) → un segundo sistema de botones fantasma. Eliminados (`src/components/ui/` borrado) dejando `.btn-*` (ahora 100% tokenizado) como sistema ÚNICO. Verificado: 0 importadores → borrado seguro, build OK. |

| **A6** IA indescubrible | ✅ Resuelto | 2026-06-09 | El asistente solo se montaba con sesión Y key configurada (`{user && <AIChatBot/>}` + `if(!configured) return null`) → invisible para invitados y para quien no tenía key. Nuevo `AITeaserButton` (FAB atenuado, **ligero, sin imports de `lib/gemini`** → preserva el lazy-load del chat) que aparece justo en esos casos: invitado → abre login; autenticado sin key/consentimiento → abre `GeminiKeyModal`. `finance-tracker` enruta reactivamente vía `useGeminiKey` (`aiKeyConfigured && aiHasConsent`): listo → `AIChatBot` lazy; si no → teaser. Test `aiTeaserButton.test.tsx` (2). De paso, la visibilidad ahora es **reactiva al contexto** (mitiga S-ai-visibility: el switch teaser↔chat ya no depende de la memoria de módulo `isGeminiConfigured()`). |

| **P-welcome-dup** | ✅ Resuelto | 2026-06-09 | `useWelcomeModal` persistía el "cerrado" solo en un `useRef` en memoria → el modal reaparecía en CADA recarga mientras el usuario no tuviera cuentas. Ahora se persiste en `localStorage` (`moneytrack_welcome_dismissed`, init del ref desde ahí), y se limpia al crear la primera cuenta (reaparece si vuelve a 0 cuentas). Test `useWelcomeModal.test.ts` (4). (El apilado PWA+in-app se mitiga porque `PWAWelcomeModal` ya persiste su propio flag y solo aplica en standalone.) |
| **P-guest-hidden** | ✅ Resuelto | 2026-06-09 | `AuthModal` solo ofrecía "Continuar con Google" → el modo invitado era indescubrible. Se añadió separador + botón **"Continuar sin cuenta"** (cierra el modal = entra como invitado) + nota "Puedes usar MoneyTrack sin cuenta — tus datos se guardan solo en este dispositivo". Test `authModalGuest.test.tsx` (2). |
| **UI-header-menu** | ✅ Resuelto | 2026-06-09 | El menú de ajustes del Header declaraba `role=menu/menuitem` + `aria-expanded` pero sin navegación por teclado. Se añadió: foco al primer ítem al abrir, **flechas** ↑/↓ (con wrap) + Home/End para mover el foco, y **Escape** cierra devolviendo el foco al botón disparador (`settingsButtonRef`). Semántica anunciada = comportamiento. |

| **F-fecha-relativa** | ✅ Resuelto | 2026-06-09 | `formatRelativeTime` contaba meses/años dividiendo días entre 30/365 → "hace N meses" impreciso cerca de bordes de mes. Ahora usa diferencia de **calendario real** (`calendarMonths`: dif. de año*12+mes, ajustando si aún no se cumple el día); años = `floor(meses/12)`. Bordes (`< 1 mes` calendario) caen a "hace N días". Tests nuevos en `formatters.test.ts` (3: 1 mes exacto, 26 días sin saltar a mes, 11→10 meses sin saltar a año). |
| **Q-cc-dead** | ✅ Resuelto | 2026-06-09 | `useCreditCardInterests` calculaba `monthlyTransactions`/`yearlyTransactions` (+ helper `filterByPeriod`) que nunca se usaban — el flujo real de intereses se computa en el `forEach` por `monthsSinceFirstInstallment`. Código muerto eliminado. Behavior-preserving (cubierto por `mergeCreditCards.test.ts`, que asevera `totalInterest`). |
| **UI-install-light** | ✅ Resuelto | 2026-06-09 | `InstallPrompt` (banner móvil + botón desktop) hardcodeaba colores sin `dark:`. Añadidas variantes dark (gradiente del banner, botón "Instalar", hover de cerrar, botón desktop) — aditivas, cero cambio en modo claro. |

| **UI-dnd-keyboard** | ✅ Resuelto | 2026-06-09 | Reordenar cuentas era solo drag-and-drop/touch (WCAG 2.1.1). `useDragAndDrop` expone `moveAccount(id, 'up'|'down')` que reutiliza `reorderAccounts` (misma persistencia); `AccountCard` añade botones "subir/bajar" (props opcionales) junto al grip (ahora `aria-hidden`), deshabilitados en extremos; `AccountsView` cablea ambos con límites por índice (principales y asociadas). Test `accountCardKeyboardReorder.test.tsx` (4). |
| **F-cuotas-capas** | ✅ Resuelto | 2026-06-09 | `validateInterestConfig` aceptaba hasta 60 cuotas (lista incluía 48/60), pero `firestore.rules` rechaza >36 y la UI (`INSTALLMENT_OPTIONS`) solo ofrece hasta 36 → validación semi-muerta inconsistente. Cap alineado a **36** y lista a `[1,2,3,6,9,12,18,24,36]`. Tests: rango (48/60 ahora inválidas) + acepta 36. |
| **R-recompute-submit** | ✅ Resuelto | 2026-06-09 | `CreditCardStrategy.validateTransaction` ejecutaba SIEMPRE el recompute O(N) en submit. Ahora es **lazy/memoizado** + short-circuits demostrablemente equivalentes: en GASTO, si el persistido por sí solo ya rechaza (disponible con el persistido ≥ con el max → si rechaza con persistido, rechaza siempre) se omite el recompute; en PAGO, si `persisted>0 && persisted>=amount` se acepta sin recompute. **F-tc-cupo intacto**: `Math.max(persisted, recompute())` permanece en todo camino donde el recompute puede cambiar la decisión (caso #10 sigue forzándolo). Tests +3 (analizado en workflow paralelo con prueba de equivalencia). |

| **Q-context** | ✅ Resuelto | 2026-06-09 | **FinanceContext migrado a store con `useSyncExternalStore`** (planeado con /plan + investigado con /workflows). **Fase 1:** nuevo `src/contexts/financeStore.ts` — `createStore` (snapshot mutable + listeners), `shallowEqual`, `useStoreSelector` sobre el `useSyncExternalStore` NATIVO de React 19 (sin shim) con caché de selección + bail-out. **Fase 2:** `FinanceProvider` crea el store una vez (ref estable) y empuja el `value` memoizado en `useLayoutEffect`; el Context lleva el STORE (identidad estable → nunca re-renderiza solo); `useFinance()` = selector identidad (comportamiento idéntico). **Fase 3:** los 7 hooks de `useFinanceSelectors` usan `useStoreSelector` con selector por slice → **aislamiento real de re-render por dominio**; migrados los 8 consumidores directos (StatsView, AccountsView, CreditCardStatementView, RecurringPaymentsView, TransactionsView, TransactionForm, ImportTransactionsModal, AIChatBot) a hooks de dominio + `useFormatCurrency`; el shell `finance-tracker` queda en `useFinance()` (lee casi todo). **Motor de datos/CRUD y acoplamiento (deleteTransactionWithDebtSync, usedCredit, mergeCreditCards, orden de hooks) INTACTOS.** Tests `financeStore.test.ts` (8). ⚠️ Beneficio runtime modesto (el lazy-mount ya aislaba las vistas pesadas); el valor es el seam arquitectónico correcto. R-provider-eager y R-balance-recalc NO se resuelven aquí (follow-ups). |

| **Q-godfiles** (ImportTransactionsModal) | ✅ Resuelto | 2026-06-09 | **ImportTransactionsModal descompuesto** (planeado /plan + investigado /workflows). **Fase A:** lógica/estado (12 vars + ~15 handlers + computed) → `src/hooks/useImportWizard.ts` (testeable aislado); tipos → `src/types/import.ts`; `AIDateAdjuster` → `components/modals/import/`. **Fase B:** el JSX de presentación partido en `ImportUploadStep` (193) / `ImportReviewStep` (361) / `ImportDoneStep` (46) + `AISuggestionsPanel` (97), todos bajo `components/modals/import/`. **El modal pasó de 1230 LOC (lógica+UI mezcladas, 1 función) a 232 LOC de shell** (header/stepper/footer + render del paso); ningún archivo del wizard supera 500 LOC. El commit de dinero (`useImportTransactions`: writeBatch + `increment(usedCredit)`) NO se tocó; parsers/dedup/aprendizaje/aiCategorizer reutilizados. Test `useImportWizard.test.ts` (7). |

| **Q-useAccounts** | ✅ Resuelto | 2026-06-09 | **Orquestación Firestore cruda extraída de `useAccounts`** (planeado /plan + investigado /workflows + ultracode, test-first). Nuevo `src/hooks/firestore/accountOrchestration.ts` (355) con las 3 ops más peligrosas, movidas byte-idéntico: `deleteAccountCascade` (cascade multi-batch 490-op + reconciliación `usedCredit` SET idempotente + limpieza #23), `mergeCreditCardsOrchestrated` (consolida usedCredit + reapunta tx/recurring/debts), `setDefaultAccountAtomic` (runTransaction). `useAccounts` (559→**307 LOC**) queda como composición de UI: validación + computación pura del plan de merge + ramas guest/localStorage + balances derivados; delega la rama autenticada. Invariantes de dinero INTACTAS (reconciliación idempotente, BATCH_LIMIT 490, protección default, #23, mergedAccountIds). Red de seguridad test-first: `accountCascadeDelete` (A2) + nuevo `accountMergeAndDefault.test.ts` (4: merge consolida/reapunta/borra, valida mismo-banco/destino≠origen, setDefault atómico) — verdes antes y después del move. |

| **Q-errboundary** | ✅ Resuelto | 2026-06-09 | Los dos `ErrorBoundary` divergentes consolidados en uno (`components/layout/ErrorBoundary`), superset sin pérdida: reporte vía `captureError`+componentStack, UI de error de config Firebase (ayuda dev), retry suave + recargar. `app/page` apunta a este; `components/ErrorBoundary.tsx` eliminado. |
| **S-xlsx-cdn** | ⏹️ No-fix (justificado) | 2026-06-09 | El "fix" (mover a registry npm) sería **contraproducente**: SheetJS dejó de publicar en npm; el `xlsx` del registry es 0.18.5 (2022) con CVEs, mientras el pin actual `cdn.sheetjs.com/xlsx-0.20.3` es el **canal oficial vigente**. Se mantiene el CDN. Mitigación del riesgo de "parsea archivos no confiables": el parseo corre client-side en el navegador del propio usuario sobre su archivo. |

> **Verificación:** 44 hallazgos resueltos (+1 parcial, +1 no-fix justificado) + 1 refutado, con revisión adversarial. `tsc --noEmit` limpio · eslint sin warnings nuevos · suite global **569 tests** verde · `next build` OK. **Toda la deuda arquitectónica cerrada.**
>
> **Lows restantes (requieren DECISIÓN de producto/seguridad, no técnicos):** `UI-text-small` (pase de diseño visual: tamaño/contraste en ~14 archivos), `S-gemini-plaintext` (key en texto plano — decisión de modelo de amenaza), `F-tc-paid-doble` (compra TC pagada cuenta como gasto y pendiente — decisión de negocio), `P-onboarding`/`P-cascade-incons` (producto), `S-replace-orphan` (gated: backup no cableado a UI).
> **Organización:** todo consolidado en la rama **`auditoria-profunda`** → PR único contra `main`.
> **Nota (Phase 2 memo shell):** ya estaba en sitio — `StatsCards` (el hijo pesado del shell) ya es `React.memo` con props estables; no hay memo adicional seguro sin profiling.
> **Deuda estructural pendiente (PLANES listos, requieren decisión — no auto-aplicados):** (1) `FinanceContext` — completar el seam de selectores (12/12) + decidir split-por-dominio vs store con `useSyncExternalStore` (la migración de selectores conviene bundlearla con el cambio arquitectónico: hoy es churn sin beneficio runtime); (2) **A4 tokens/botones** — adoptar el `<Button>` del design-system como único sistema + tokenizar (decisiones de paleta/gradiente); (3) `ImportTransactionsModal` — extraer `useImportWizard` + sub-componentes (empezar por test de caracterización); (4) **(b) hecho** — falta solo extraer la orquestación cruda de `useAccounts` a `useAccountsCRUD` (alto riesgo). Más: medios sueltos de UI/a11y, producto y rendimiento.
