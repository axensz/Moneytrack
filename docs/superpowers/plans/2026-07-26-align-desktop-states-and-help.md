# Align Desktop States and Help Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alinear los estados compartidos de onboarding, PWA/offline, carga, Estadísticas, calendario periódico, contraste, error y Ayuda con el comportamiento real de MoneyTrack, priorizando desktop sin rediseñar móvil.

**Architecture:** Mantener la lógica en el dueño actual de cada estado. `AuthenticatedApp` conserva navegación y composición; `FinanceViewRouter` solo transmite la acción mínima que necesita Estadísticas; los componentes PWA describen lectura cacheada y escritura conectada sin crear una cola; los skeletons conservan su forma visual y agregan semántica; Ayuda se actualiza al final sobre los recorridos ya implementados. Los cambios visuales reutilizan exclusivamente los tokens existentes de `app/styles/theme.css` y las clases de tipo de `app/styles/components.css`.

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, Vitest 4, Testing Library, Firebase/Firestore, PWA service worker.

## Global Constraints

- Baseline inspeccionado: `2fa05bb384c7c1cc4388a126a5c808f894a5d746` en `codex/desktop-ux-opsx`.
- Antes de cada tarea de implementación, refrescar y consultar `code-review-graph`; después usar lecturas o `rg` solo en el alcance confirmado.
- Seguir `AGENTS.md`, `PRODUCT.md` y `DESIGN.md`: voz cálida y directa, violeta como marca, color reservado para estado y WCAG 2.1 AA.
- No añadir cola offline, persistencia de “cambios pendientes”, promesa de sincronización automática ni lógica nueva en `ServiceWorkerRegistration`.
- No cambiar navegación, layout o capacidades específicas de móvil. Conservar el checklist en flujo móvil, los puntos del calendario móvil y los recorridos compartidos; agregar regresiones, no rediseño.
- El empty state de Estadísticas depende de que `balanceTransactions.length === 0`, no de que los datos filtrados de un gráfico sean cero.
- No migrar colores fuera del inventario cerrado de la Tarea 6. Conservar los badges vencido/próximo pago y los iconos de acción primarios de `DebtCard`.
- La Tarea 8 es un gate: ejecutarla solo después de implementar y dejar verdes `clarify-ledger-metric-scopes` y `harden-desktop-shell-and-interactions`. Debe preservar sus contratos de alcance métrico y navegación por teclado.
- Cada ciclo empieza con RED, confirma el fallo esperado, aplica el cambio mínimo, confirma GREEN y solo entonces crea el commit indicado.
- Usar los comandos `npm.cmd` de este plan en PowerShell; no sustituirlos por el modo watch.

### Task 1: Completar onboarding con los dos pasos financieros

**Files**

- Modify: `src/components/onboarding/OnboardingChecklist.tsx`
- Modify: `src/AuthenticatedApp.tsx`
- Modify: `src/__tests__/utils/onboardingChecklist.test.tsx`
- Preserve: `src/components/chat/AITeaserButton.tsx`

**Interfaces**

- Reducir `OnboardingChecklistProps` a `hasAccounts`, `hasTransactions`, `onGoToAccounts` y `onAddTransaction`.
- Eliminar `aiReady` y `onOpenAISettings` del contrato del checklist y de su invocación.
- No cambiar `AITeaserButtonProps`; `AuthenticatedApp` debe seguir mostrando el teaser cuando la IA no está lista.

- [ ] **Step 1: Write the failing tests**

1. Actualizar el fixture para esperar `0 de 2 completados` y `1 de 2 completados`.
2. Cambiar el caso de cierre para renderizar `hasAccounts: true` y `hasTransactions: true` sin IA y exigir que el checklist no exista.
3. Agregar una aserción que rechace “Activa el asistente IA” dentro del checklist.
4. Mantener las regresiones de flujo móvil, `pointer-events` y ausencia de dismissal.
5. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/utils/onboardingChecklist.test.tsx`

- [ ] **Step 2: Run tests and verify the expected failure**

- El caso “cuenta + transacción” seguirá mostrando `2 de 3 completados`.
- El texto y CTA de IA seguirán dentro del checklist.

- [ ] **Step 3: Write the minimal implementation**

1. Dejar únicamente los pasos `account` y `transaction`.
2. Calcular `completed` y `allDone` sobre esos dos pasos.
3. Retirar los dos props de IA de `OnboardingChecklist` y de `AuthenticatedApp`.
4. No tocar el bloque global `AIChatBot`/`AITeaserButton` de `AuthenticatedApp`.

- [ ] **Step 4: Run tests and verify they pass**

1. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/utils/onboardingChecklist.test.tsx`

2. Ejecutar:

   `npm.cmd run typecheck`

- [ ] **Step 5: Commit**

1. Ejecutar:

   `git add src/components/onboarding/OnboardingChecklist.tsx src/AuthenticatedApp.tsx src/__tests__/utils/onboardingChecklist.test.tsx`

2. Ejecutar:

   `git commit -m "fix: complete onboarding without optional AI"`

### Task 2: Hacer veraz y accesible el contrato PWA/offline

**Files**

- Create: `src/__tests__/components/pwaStateContracts.test.tsx`
- Modify: `src/components/pwa/OfflineIndicator.tsx`
- Modify: `src/components/pwa/PWAWelcomeModal.tsx`
- Modify: `src/components/modals/BaseModal.tsx`
- Verify unchanged behavior: `src/hooks/useNetworkStatus.ts`
- Verify unchanged behavior: `src/components/pwa/ServiceWorkerRegistration.tsx`
- Regression: `src/__tests__/hooks/offlineWrites.test.ts`

**Interfaces**

- Agregar a `BaseModalProps` `ariaLabelledBy?: string`.
- Si `ariaLabelledBy` existe, el nodo `role="dialog"` usa `aria-labelledby` y no un `aria-label` vacío o competidor.
- `PWAWelcomeModal` asigna `id="pwa-welcome-title"` al título visible y pasa ese id a `BaseModal`.
- `OfflineIndicator` conserva su API sin props y distingue tres estados internos: inicial online sin anuncio, offline persistente y reconexión temporal.

- [ ] **Step 1: Write the failing tests**

1. Mockear `useNetworkStatus`, renderizar offline y exigir:
   - `role="status"`;
   - texto que permita consultar datos cacheados;
   - texto que exija conexión para guardar;
   - ausencia de “se sincronizarán”, “en cola” o equivalentes.
2. Rerenderizar la transición offline → online y exigir un anuncio “ya puedes guardar cambios” sin afirmar que algo se sincronizó.
3. Activar fake timers y comprobar que el anuncio de reconexión desaparece después de 4 segundos.
4. Simular PWA standalone, `localStorage` limpio y el retardo existente de 500 ms; exigir un diálogo con nombre accesible `¡Bienvenido a MoneyTrack!`.
5. Exigir en el modal la misma capacidad: lectura cacheada offline y guardado solo con conexión; rechazar la promesa “Los cambios se sincronizarán automáticamente”.
6. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/pwaStateContracts.test.tsx src/__tests__/hooks/offlineWrites.test.ts`

- [ ] **Step 2: Run tests and verify the expected failure**

- `BaseModal` no enlaza el diálogo con el `h2` visible.
- El modal promete sincronización automática.
- `OfflineIndicator` desaparece al reconectar sin anunciar que guardar vuelve a estar disponible.

- [ ] **Step 3: Write the minimal implementation**

1. Añadir `ariaLabelledBy` a `BaseModal` sin alterar el título visual ni el focus trap.
2. Enlazar el título visible de `PWAWelcomeModal`.
3. Reemplazar “Funciona sin conexión” por una descripción precisa: los datos ya cacheados se pueden consultar y guardar cambios requiere conexión.
4. En `OfflineIndicator`, recordar si la sesión pasó por offline, mostrar al reconectar un `role="status"` durante 4 segundos y limpiar el timer al desmontar o volver a offline.
5. No anunciar reconexión en el primer mount online.
6. No tocar el registro o lifecycle del service worker.

- [ ] **Step 4: Run tests and verify they pass**

1. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/pwaStateContracts.test.tsx src/__tests__/hooks/offlineWrites.test.ts src/__tests__/hooks/useModalA11y.test.tsx src/__tests__/components/modalRobustness.test.tsx`

2. Ejecutar:

   `npm.cmd run typecheck`

- [ ] **Step 5: Commit**

1. Ejecutar:

   `git add src/__tests__/components/pwaStateContracts.test.tsx src/components/pwa/OfflineIndicator.tsx src/components/pwa/PWAWelcomeModal.tsx src/components/modals/BaseModal.tsx`

2. Ejecutar:

   `git commit -m "fix: align PWA offline states with write behavior"`

### Task 3: Anunciar fallbacks y skeletons sin cambiar su jerarquía visual

**Files**

- Create: `src/__tests__/components/loadingContracts.test.tsx`
- Modify: `src/__tests__/components/loadingScreen.test.tsx`
- Modify: `src/components/layout/LoadingScreen.tsx`
- Modify: `src/components/layout/FinanceViewRouter.tsx`
- Modify: `src/components/views/financial-plan/PlanSkeleton.tsx`
- Modify: `src/components/views/transactions/components/TransactionsListSkeleton.tsx`

**Interfaces**

- No agregar props a `LoadingScreen`, `PlanSkeleton` ni `TransactionsListSkeleton`.
- Mantener `LoadingScreenProps.message` como nombre dinámico del estado.
- Mantener `ViewFallback` interno a `FinanceViewRouter`; probarlo renderizando una vista lazy, no exportarlo solo para tests.

- [ ] **Step 1: Write the failing tests**

1. En `loadingScreen.test.tsx`, exigir `role="status"`, `aria-busy="true"` y nombre accesible igual al `message` mientras carga; al salir, conservar `aria-busy="false"` y `pointer-events-none`.
2. En el nuevo test, renderizar `PlanSkeleton` y exigir status/busy con “Cargando plan financiero”.
3. Renderizar `TransactionsListSkeleton` y exigir status/busy con “Cargando movimientos”.
4. Renderizar `FinanceViewRouter` en una vista lazy y, antes de resolver el chunk, exigir status/busy con “Cargando vista”.
5. Comprobar que las piezas puramente decorativas permanecen `aria-hidden`.
6. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/loadingScreen.test.tsx src/__tests__/components/loadingContracts.test.tsx`

- [ ] **Step 2: Run tests and verify the expected failure**

- `LoadingScreen` tiene busy state pero no rol/nombre accesible explícito.
- `ViewFallback` es silencioso.
- Los dos skeletons ocultan toda su región a tecnología asistiva.

- [ ] **Step 3: Write the minimal implementation**

1. Agregar `role="status"` y `aria-label={message}` al contenedor de `LoadingScreen`.
2. Agregar `role="status"`, `aria-busy="true"` y nombres concisos a `ViewFallback`, `PlanSkeleton` y `TransactionsListSkeleton`.
3. Mover `aria-hidden="true"` desde el wrapper semántico de cada skeleton a un hijo que contenga únicamente los bloques visuales.
4. No cambiar clases de tamaño, spacing, animación o responsive.

- [ ] **Step 4: Run tests and verify they pass**

1. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/loadingScreen.test.tsx src/__tests__/components/loadingContracts.test.tsx`

2. Ejecutar:

   `npm.cmd run typecheck`

- [ ] **Step 5: Commit**

1. Ejecutar:

   `git add src/__tests__/components/loadingScreen.test.tsx src/__tests__/components/loadingContracts.test.tsx src/components/layout/LoadingScreen.tsx src/components/layout/FinanceViewRouter.tsx src/components/views/financial-plan/PlanSkeleton.tsx src/components/views/transactions/components/TransactionsListSkeleton.tsx`

2. Ejecutar:

   `git commit -m "fix: announce lazy and skeleton loading states"`

### Task 4: Consolidar el empty state de Estadísticas

**Files**

- Create: `src/__tests__/components/statsViewStates.test.tsx`
- Modify: `src/components/views/stats/StatsView.tsx`
- Modify: `src/components/layout/FinanceViewRouter.tsx`
- Modify: `src/AuthenticatedApp.tsx`
- Regression: `src/__tests__/hooks/useStatsData.test.ts`
- Verify descriptions: `src/components/views/stats/components/CashFlowChart.tsx`
- Verify descriptions: `src/components/views/stats/components/MonthlyComparisonChart.tsx`
- Verify descriptions: `src/components/views/stats/components/CategoryPieChart.tsx`
- Verify descriptions: `src/components/views/stats/components/YearlyTrendChart.tsx`

**Interfaces**

- Crear `StatsViewProps` con `onGoToTransactions: () => void`.
- Agregar `onGoToTransactions: () => void` a `FinanceViewRouterProps`.
- `AuthenticatedApp` debe pasar la acción de navegación unificada que deja `harden-desktop-shell-and-interactions`; no escribir directamente la URL ni crear una segunda ruta.

- [ ] **Step 1: Write the failing tests**

1. Mockear selectores con `balanceTransactions: []` y exigir:
   - una sola explicación a nivel de vista;
   - texto que aclare que los gráficos aparecerán al registrar movimientos;
   - botón nativo “Ir a Transacciones”;
   - invocación de `onGoToTransactions` por click;
   - ausencia de los mensajes repetidos de empty state de los charts.
2. Mockear `transactions: []` y `balanceTransactions` con un movimiento completo para demostrar que Estadísticas decide con historial completo y compone los charts.
3. Renderizar los cuatro charts con datos y exigir `role="img"` con `aria-label` no vacío que describa métrica y periodo.
4. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/statsViewStates.test.tsx src/__tests__/hooks/useStatsData.test.ts`

- [ ] **Step 2: Run tests and verify the expected failure**

- `StatsView` no acepta una acción de navegación.
- Con historial vacío se renderizan varios empty cards.
- No existe un CTA de vista hacia Transacciones.

- [ ] **Step 3: Write the minimal implementation**

1. Mantener todos los hooks en orden estable y derivar `const hasTransactions = allTransactions.length > 0`.
2. Después de ejecutar los hooks, retornar un único empty state si `hasTransactions` es falso.
3. Usar un botón nativo con `onGoToTransactions`; no abrir directamente `TransactionForm`.
4. Si hay cualquier transacción en el historial completo, conservar la composición actual y las descripciones de los charts, incluso si un agregado particular queda vacío.
5. Pasar la acción por `FinanceViewRouter` desde `AuthenticatedApp`.

- [ ] **Step 4: Run tests and verify they pass**

1. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/statsViewStates.test.tsx src/__tests__/hooks/useStatsData.test.ts src/__tests__/hooks/useGlobalStats.test.ts`

2. Ejecutar:

   `npm.cmd run typecheck`

- [ ] **Step 5: Commit**

1. Ejecutar:

   `git add src/__tests__/components/statsViewStates.test.tsx src/components/views/stats/StatsView.tsx src/components/layout/FinanceViewRouter.tsx src/AuthenticatedApp.tsx`

2. Ejecutar:

   `git commit -m "fix: add one actionable statistics empty state"`

### Task 5: Revelar todos los pagos de días congestionados

**Files**

- Create: `src/__tests__/components/recurringCalendarDisclosure.test.tsx`
- Modify: `src/components/views/recurring/components/RecurringCalendar.tsx`
- Regression: `src/__tests__/utils/recurringDates.test.ts`

**Interfaces**

- Conservar `RecurringCalendarProps` sin cambios.
- Mantener `PaymentStatus` interno y agregar un mapa interno de etiquetas: `paid → Pagado`, `overdue → Vencido`, `soon → Próximo`, `normal → Programado`.

- [ ] **Step 1: Write the failing tests**

1. Fijar el reloj de Vitest en un mes conocido y crear cuatro pagos que vencen el mismo día.
2. Exigir que los primeros dos sigan en el preview compacto desktop.
3. Exigir un elemento nativo `details` con un `summary` llamado `+2 más`.
4. Abrir el disclosure y exigir nombre, monto formateado y estado textual de cada pago oculto.
5. Exigir que el control pueda recibir foco y que click altere la propiedad `open`.
6. Verificar que el contenedor móvil conserva un punto por cada pago, incluidos los cuatro.
7. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/recurringCalendarDisclosure.test.tsx src/__tests__/utils/recurringDates.test.ts`

- [ ] **Step 2: Run tests and verify the expected failure**

- El conteo `+2 más` es un `span` no interactivo.
- Los pagos tercero y cuarto no exponen monto ni estado.

- [ ] **Step 3: Write the minimal implementation**

1. Mantener `cell.items.slice(0, 2)` como preview.
2. Reemplazar únicamente el `span` de conteo por `details/summary` en desktop.
3. Renderizar `cell.items.slice(2)` dentro del disclosure con nombre, `formatCurrency(amount)` y etiqueta de estado.
4. Conservar el mapa completo de puntos `sm:hidden` sin convertirlo en otro layout.

- [ ] **Step 4: Run tests and verify they pass**

1. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/recurringCalendarDisclosure.test.tsx src/__tests__/utils/recurringDates.test.ts src/__tests__/hooks/recurringOverdue.test.ts`

2. Ejecutar:

   `npm.cmd run typecheck`

- [ ] **Step 5: Commit**

1. Ejecutar:

   `git add src/__tests__/components/recurringCalendarDisclosure.test.tsx src/components/views/recurring/components/RecurringCalendar.tsx`

2. Ejecutar:

   `git commit -m "fix: disclose every recurring payment in crowded days"`

### Task 6: Corregir solo el inventario cerrado de contraste

**Files**

- Create: `src/__tests__/components/desktopContrastContracts.test.tsx`
- Modify: `src/components/views/debts/components/DebtCard.tsx`
- Modify: `src/components/shared/TransactionForm.tsx`
- Modify: `src/components/pwa/OfflineIndicator.tsx`
- Verify tokens: `app/styles/theme.css`
- Verify type controls: `app/styles/components.css`

**Interfaces**

- No cambiar props ni crear tokens.
- El test extrae los valores hex reales de `:root` y `.dark` en `theme.css`, calcula luminancia/contraste y vincula esos pares con las clases requeridas en los tres componentes.

**Inventario confirmado contra HEAD**

1. `DebtCard` metadata: `text-gray-400 dark:text-gray-500` → `text-muted-foreground`.
2. `DebtCard` Add/Subtract inactivo: grises raw → `btn-type btn-type-inactive`.
3. `DebtCard` Add activo: `bg-green-500 text-white` → `btn-type btn-type-active-success`.
4. `DebtCard` Subtract activo: `bg-red-500 text-white` → `btn-type btn-type-active-destructive`.
5. `DebtCard` cierres inline: `text-gray-400 hover:text-gray-600` → `text-muted-foreground hover:text-foreground`.
6. `TransactionForm` deuda pendiente y error TRM: `text-amber-600` → `text-warning`.
7. `TransactionForm` fecha/razón de duplicado: amber raw → `text-warning` sobre `bg-warning-muted`.
8. `TransactionForm` confirmar/cancelar duplicado: amber raw → confirmación `bg-warning-muted text-warning border border-warning`; cancelación `text-warning`.
9. `TransactionForm` “Agregar y continuar”: `bg-amber-500 text-white` → `bg-primary-solid text-primary-foreground`.
10. `OfflineIndicator`: `bg-amber-500 text-white` → `bg-warning-muted text-warning border-b border-warning`.

- [ ] **Step 1: Write the failing tests**

1. Agregar asserts de ratios AA en claro/oscuro para:
   - `muted-foreground` sobre `card`;
   - `warning` sobre `warning-muted`;
   - `success` sobre `success-muted`;
   - `destructive` sobre `destructive-muted`;
   - `primary-foreground` sobre `primary-solid`.
2. Agregar asserts de contrato de clases para las diez filas y rechazo explícito de sus combinaciones legacy.
3. Agregar regresiones que preserven exactamente:
   - badges vencido `rose`;
   - badge próximo pago `sky`;
   - acciones primarias `sky`, `purple`, `green`, `amber` y `destructive` de `DebtCard`.
4. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/desktopContrastContracts.test.tsx`

- [ ] **Step 2: Run tests and verify the expected failure**

- Las diez filas siguen usando las clases raw inventariadas.
- El test de preservación pasa antes y después; cualquier migración adicional debe hacerlo fallar.

- [ ] **Step 3: Write the minimal implementation**

1. Aplicar las sustituciones uno a uno en las líneas inventariadas.
2. Reutilizar las clases `.btn-type*` ya definidas; no duplicar su CSS.
3. No modificar `theme.css`, `components.css`, badges vencido/próximo, iconos primarios, gradientes del shell ni colores del calendario.

- [ ] **Step 4: Run tests and verify they pass**

1. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/desktopContrastContracts.test.tsx src/__tests__/components/transactionFormCompact.test.tsx src/__tests__/components/transactionFormTrm.test.tsx`

2. Ejecutar:

   `npm.cmd run typecheck`

3. Ejecutar:

   `npm.cmd run lint`

- [ ] **Step 5: Commit**

1. Ejecutar:

   `git add src/__tests__/components/desktopContrastContracts.test.tsx src/components/views/debts/components/DebtCard.tsx src/components/shared/TransactionForm.tsx src/components/pwa/OfflineIndicator.tsx`

2. Ejecutar:

   `git commit -m "fix: apply verified semantic contrast tokens"`

### Task 7: Ocultar diagnósticos internos del ErrorBoundary en producción

**Files**

- Create: `src/__tests__/components/errorBoundaryProductionCopy.test.tsx`
- Modify: `src/components/layout/ErrorBoundary.tsx`
- Regression: `src/__tests__/lib/errorReporter.test.ts`

**Interfaces**

- Conservar `Props.children`, `Props.fallback`, `State` y `handleRetry`.
- `componentDidCatch` debe seguir enviando error y `componentStack` a `captureError`.

- [ ] **Step 1: Write the failing tests**

1. Mockear `captureError` y renderizar un hijo que lanza un error de Firebase/API key.
2. Con `vi.stubEnv('NODE_ENV', 'production')`, exigir:
   - encabezado genérico;
   - guía de reintento, recarga y soporte;
   - botones `Reintentar` y `Recargar página`;
   - ausencia del error bruto, `.env.local`, Firebase Console, `FIREBASE_SETUP.md` y `npm run dev`.
3. Confirmar que `captureError` recibió el detalle interno.
4. Con `NODE_ENV=development`, confirmar que el diagnóstico técnico sigue disponible.
5. Hacer click en `Reintentar` y comprobar que el boundary vuelve a intentar renderizar children.
6. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/errorBoundaryProductionCopy.test.tsx src/__tests__/lib/errorReporter.test.ts`

- [ ] **Step 2: Run tests and verify the expected failure**

- El error Firebase muestra credenciales, archivo de entorno, consola y comando de desarrollo también en producción.

- [ ] **Step 3: Write the minimal implementation**

1. Separar `isDevelopment` de `isFirebaseError`.
2. Mostrar el panel técnico existente solo cuando ambos sean verdaderos.
3. Para cualquier error de producción, mostrar “Algo salió mal”, recuperación y contacto de soporte sin interpolar `errorMessage`.
4. Conservar reporte, fallback custom, retry y reload.

- [ ] **Step 4: Run tests and verify they pass**

1. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/errorBoundaryProductionCopy.test.tsx src/__tests__/lib/errorReporter.test.ts`

2. Ejecutar:

   `npm.cmd run typecheck`

- [ ] **Step 5: Commit**

1. Ejecutar:

   `git add src/__tests__/components/errorBoundaryProductionCopy.test.tsx src/components/layout/ErrorBoundary.tsx`

2. Ejecutar:

   `git commit -m "fix: keep production error recovery user safe"`

### Task 8: Actualizar Help y README después de los cambios dependientes

**Precondition**

- `openspec/changes/clarify-ledger-metric-scopes/tasks.md` está completo y su suite `src/__tests__/components/helpMetricScopes.test.tsx` está verde.
- `openspec/changes/harden-desktop-shell-and-interactions/tasks.md` está completo y su suite `src/__tests__/components/helpModalTabs.test.tsx` está verde.
- Si alguna condición falla, detener esta tarea; no adaptar Help contra una navegación o alcance métrico intermedio.

**Files**

- Create: `src/__tests__/components/helpContentContracts.test.tsx`
- Create: `src/components/modals/help/HelpSectionFinancialPlan.tsx`
- Modify: `src/components/modals/HelpModal.tsx`
- Modify: `src/components/modals/help/HelpSectionBasics.tsx`
- Modify: `src/components/modals/help/HelpSectionAccounts.tsx`
- Modify: `src/components/modals/help/HelpSectionRecurring.tsx`
- Modify only if required by the prerequisite contract: `src/components/modals/help/HelpSectionTransactions.tsx`
- Modify only if required by the prerequisite contract: `src/components/modals/help/HelpSectionStats.tsx`
- Modify: `README.md`

**Interfaces**

- Cambiar `HelpViewTabId` para admitir `financial-plan`.
- Añadir `helpTabFromView('financial-plan')` a `HELP_TABS`.
- No cambiar `HelpModalProps`.
- Exportar `HelpSectionFinancialPlan` como componente sin props, igual que las demás secciones.

- [ ] **Step 1: Write the failing tests**

1. Renderizar `HelpModal` y exigir una pestaña primaria `Plan financiero` cuyo panel explique:
   - configuración de ingreso e inicio del plan;
   - datos insuficientes y movimientos pagados;
   - sugerencias accionables que llevan un borrador a Presupuestos;
   - IA como mejora opcional, no requisito.
2. En Inicio, exigir que cuenta + primera transacción completen onboarding y que IA quede como teaser opcional.
3. En Inicio, exigir lectura de datos cacheados offline y conexión para guardar; rechazar cola/sincronización automática.
4. En Cuentas, exigir el entry point actual `Extractos` que abre `CardStatementsModal`; rechazar “aparece debajo de tus cuentas”.
5. En Pagos periódicos, exigir el recorrido actual `Ya pagó` con `Registrar pago ahora` o `Vincular transacción existente`; rechazar “Crea un gasto y selecciona el pago periódico asociado”.
6. Leer `README.md` y exigir el mismo contrato offline, rechazando “Las escrituras nuevas se encolarán”.
7. Mantener los asserts del cambio de alcance: filtros reales y scopes de Estadísticas, sin reescribir su wording.
8. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/helpContentContracts.test.tsx src/__tests__/components/helpMetricScopes.test.tsx src/__tests__/components/helpModalTabs.test.tsx`

- [ ] **Step 2: Run tests and verify the expected failure**

- No existe sección de Plan financiero.
- Help afirma que extractos aparecen debajo de las cuentas.
- Recurring documenta el flujo anterior.
- README promete escrituras en cola.

- [ ] **Step 3: Write the minimal implementation**

1. Añadir la sección de Plan financiero como journey primario usando `sectionTitle('financial-plan')`.
2. Corregir únicamente los párrafos contractuales de Basics, Accounts y Recurring.
3. En `README.md`:
   - renombrar “modo invitado offline” a “modo invitado local”;
   - describir la PWA como consulta de datos cacheados offline con guardado conectado;
   - reemplazar las líneas de `quota-exceeded` que prometen cola por lectura cacheada y reintento conectado.
4. No redefinir filtros ni scopes de `HelpSectionTransactions`/`HelpSectionStats`; integrar la versión final de `clarify-ledger-metric-scopes`.
5. Mantener el roving tabindex y teclado final de `harden-desktop-shell-and-interactions`.

- [ ] **Step 4: Run tests and verify they pass**

1. Ejecutar:

   `npm.cmd run test:run -- src/__tests__/components/helpContentContracts.test.tsx src/__tests__/components/helpMetricScopes.test.tsx src/__tests__/components/helpModalTabs.test.tsx src/__tests__/config/ui.test.ts`

2. Ejecutar:

   `npm.cmd run typecheck`

3. Ejecutar:

   `npm.cmd run lint`

- [ ] **Step 5: Commit**

1. Ejecutar:

   `git add README.md src/__tests__/components/helpContentContracts.test.tsx src/components/modals/HelpModal.tsx src/components/modals/help/HelpSectionFinancialPlan.tsx src/components/modals/help/HelpSectionBasics.tsx src/components/modals/help/HelpSectionAccounts.tsx src/components/modals/help/HelpSectionRecurring.tsx src/components/modals/help/HelpSectionTransactions.tsx src/components/modals/help/HelpSectionStats.tsx`

2. Ejecutar:

   `git commit -m "docs: align help with live desktop journeys"`

### Task 9: Verificación integrada y cierre OpenSpec

**Files**

- Modify after all gates pass: `openspec/changes/align-desktop-states-and-help/tasks.md`

**Interfaces**

- No cambios de interfaz en esta tarea.

- [ ] **Step 1: Run the integrated readiness gate**

1. Revisar que todos los tests nuevos fallen de forma individual antes de sus implementaciones; si alguno nació verde, reforzar el contrato y repetir su ciclo.
2. Antes de marcar OpenSpec, ejecutar la suite enfocada completa:

   `npm.cmd run test:run -- src/__tests__/utils/onboardingChecklist.test.tsx src/__tests__/components/pwaStateContracts.test.tsx src/__tests__/hooks/offlineWrites.test.ts src/__tests__/components/loadingScreen.test.tsx src/__tests__/components/loadingContracts.test.tsx src/__tests__/components/statsViewStates.test.tsx src/__tests__/hooks/useStatsData.test.ts src/__tests__/components/recurringCalendarDisclosure.test.tsx src/__tests__/components/desktopContrastContracts.test.tsx src/__tests__/components/errorBoundaryProductionCopy.test.tsx src/__tests__/components/helpContentContracts.test.tsx src/__tests__/components/helpMetricScopes.test.tsx src/__tests__/components/helpModalTabs.test.tsx`

- [ ] **Step 2: Stop on any failing gate**

- Cualquier fallo identifica una tarea que no está lista para cierre; no marcar su checkbox ni continuar al commit final.

- [ ] **Step 3: Write only the minimal owner-task fix if a gate fails**

1. Corregir solo la tarea propietaria del fallo; no ampliar inventarios ni hacer refactors oportunistas.
2. Ejecutar inspección desktop en 1024, 1280 y 1440 px, claro y oscuro, para:
   - checklist completo sin cubrir contenido;
   - offline y reconexión;
   - nombre del diálogo PWA;
   - loading y empty states;
   - disclosure de calendario;
   - diez pares de contraste;
   - error de producción;
   - Help final.
3. Ejecutar una regresión móvil funcional de cada componente compartido tocado, sin remediación visual.

- [ ] **Step 4: Run complete verification and mark OpenSpec tasks**

1. Ejecutar:

   `npm.cmd run typecheck`

2. Ejecutar:

   `npm.cmd run lint`

3. Ejecutar:

   `npm.cmd run build`

4. Ejecutar:

   `npm.cmd run test:run`

5. Solo con los cuatro comandos verdes y la inspección completa, marcar `[x]` en `openspec/changes/align-desktop-states-and-help/tasks.md`.

- [ ] **Step 5: Commit**

1. Ejecutar:

   `git add openspec/changes/align-desktop-states-and-help/tasks.md`

2. Ejecutar:

   `git commit -m "chore: complete desktop state guidance change"`
