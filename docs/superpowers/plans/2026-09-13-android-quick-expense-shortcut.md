# Android Quick Expense Shortcut Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un acceso directo nativo `Registrar gasto` que capture cinco datos, cree un candidato manual privado y abra MoneyTrack en la revisión exacta sin afectar el libro antes de la confirmación.

**Architecture:** Una `QuickExpenseActivity` aislada publica un candidato v3 en la colección existente mediante una transacción Firestore online. La PWA decodifica la nueva variante, resuelve un `reviewAndroid` opaco, abre el candidato exacto y reutiliza `confirmTransactionImport`; v1/v2 y la captura de notificaciones permanecen intactos.

**Tech Stack:** Kotlin/AppCompat XML, Firebase Auth/Firestore Android, React 19, TypeScript, Firestore rules/emulator, Vitest, OpenSpec.

**Spec:** `docs/superpowers/specs/2026-09-13-android-quick-expense-shortcut-design.md`

## Global Constraints

- `Account` conserva toda autoridad financiera; el control se rotula `Cuenta usada` con ayuda `Cuenta, efectivo o tarjeta que pagó`, no “medio de pago”.
- `source: android-shortcut`, `schemaVersion: 3`; v1/v2 no cambian de significado.
- La URL lleva únicamente `reviewAndroid=<candidateId>`; nunca monto, comercio, categoría o cuenta.
- Ningún candidato modifica saldo, cupo, estadísticas o presupuesto antes de `Confirmar gasto` en la PWA.
- `applicationId com.moneytrack.capture`, `minSdk 26`, `compileSdk/targetSdk 36`, vistas XML y ninguna dependencia nueva.
- UI en español, una acción primaria violeta, controles de 48 dp, claro/oscuro/sistema, 320–400 dp, landscape y texto 1,3×.
- Cada cambio funcional comienza con una prueba roja y termina con prueba verde y commit acotado.

---

### Task 1: Registrar el contrato en el dominio y OpenSpec

**Files:**
- Modify: `CONTEXT.md:43-53`
- Modify: `openspec/changes/add-android-transaction-ingestion/proposal.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/design.md`
- Create: `openspec/changes/add-android-transaction-ingestion/specs/android-quick-expense/spec.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/specs/transaction-import-inbox/spec.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/tasks.md`

**Interfaces:**
- Consumes: diseño aprobado y términos `Account`, `Candidato de importación`, `Transacción confirmada`.
- Produces: términos `Borrador de gasto rápido`, `Acceso directo Registrar gasto` y requisitos numerados 14.x para los siguientes tasks.

- [ ] **Step 1: Añadir el término exacto al modelo de dominio**

Insertar después de `Candidato de importación`:

```markdown
**Borrador de gasto rápido**:
Candidato de importación creado explícitamente desde el acceso directo Android. Conserva los datos propuestos por la persona, pero no modifica el libro hasta su confirmación en MoneyTrack.
_Avoid_: Transacción guardada, gasto contabilizado, movimiento automático
```

- [ ] **Step 2: Escribir el delta de capacidad**

Crear `specs/android-quick-expense/spec.md` con requisitos MUST para:

```markdown
## ADDED Requirements

### Requirement: Android publica un acceso directo de gasto rápido
El compañero MUST publicar `Registrar gasto` y MUST abrir una captura nativa que no dependa del permiso de notificaciones.

#### Scenario: Abrir desde el launcher
- **WHEN** la persona toca o arrastra el acceso directo publicado por MoneyTrack
- **THEN** Android abre la captura de gasto rápido con fecha de hoy y sin datos financieros recibidos por intent

### Requirement: La captura manual crea solo un borrador privado
La captura MUST exigir descripción, fecha, monto COP, categoría de gasto y cuenta usada; MUST crear un candidato v3 del propietario mediante una operación online idempotente; y MUST NOT escribir una transacción.

#### Scenario: Continuar con datos válidos
- **WHEN** los cinco campos son válidos y Firestore confirma el candidato
- **THEN** Android abre la URL canónica con solo `view=transactions` y `reviewAndroid=<candidateId>`
- **AND** el libro, saldos, cupos, estadísticas y presupuestos permanecen iguales

#### Scenario: Sin conexión
- **WHEN** Firestore no puede confirmar el borrador en el servidor
- **THEN** la pantalla conserva el formulario, muestra `Reintentar` y no abre la PWA
```

- [ ] **Step 3: Extender propuesta, diseño, inbox y tareas**

Documentar el contrato v3 exacto, `QuickExpenseActivity`, la transacción online, el handoff opaco y la confirmación existente. Añadir a `tasks.md` una sección `## 14. Approved Android quick expense shortcut` con casillas 14.1–14.8 que correspondan a Tasks 1–8 de este plan.

- [ ] **Step 4: Validar OpenSpec estricto**

Run:

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict
rg -n "[T]BD|[T]ODO|[F]IXME" CONTEXT.md openspec/changes/add-android-transaction-ingestion
```

Expected: validación exitosa y cero placeholders nuevos.

- [ ] **Step 5: Commit**

```powershell
git add -- CONTEXT.md openspec/changes/add-android-transaction-ingestion
git commit -m "docs(openspec): specify Android quick expense shortcut"
```

---

### Task 2: Añadir el candidato manual v3 fail-closed en la PWA

**Files:**
- Modify: `src/types/transactionImport.ts`
- Modify: `src/utils/transactionImportDecoder.ts`
- Modify: `src/__tests__/utils/transactionImportDecoder.test.ts`
- Modify: `src/hooks/firestore/transactionImportOrchestration.ts`
- Modify: `src/__tests__/hooks/transactionImportOrchestration.test.ts`

**Interfaces:**
- Consumes: documento Firestore v3 con `suggestedAccountId`, `suggestedCategory`, `createdAt`.
- Produces: `AndroidShortcutCandidateBase`, unión `PendingTransactionImportCandidate` y comparación inmutable v1/v2/v3 usada por la confirmación.

- [ ] **Step 1: Escribir pruebas rojas del decoder**

Añadir fixtures y casos equivalentes a:

```typescript
const shortcutDocument = candidateDocument('b'.repeat(64), {
  schemaVersion: 3,
  source: 'android-shortcut',
  occurredAt: timestamp('2026-09-13T17:00:00.000Z'),
  amountMinor: 259900,
  currency: 'COP',
  merchant: 'Almuerzo',
  suggestedAccountId: 'cash-1',
  suggestedCategory: 'Comida',
  createdAt: timestamp('2026-09-13T17:01:00.000Z'),
  status: 'pending',
});

expect(decodeTransactionImportCandidate(shortcutDocument)).toMatchObject({
  ok: true,
  candidate: {
    schemaVersion: 3,
    source: 'android-shortcut',
    suggestedAccountId: 'cash-1',
    suggestedCategory: 'Comida',
  },
});
```

Cubrir también campos de parser en v3, campos sugeridos en v1/v2, ausencia de `createdAt`, cuenta vacía, categoría >100, estado terminal mal formado y `source/schemaVersion` cruzados.

- [ ] **Step 2: Ejecutar el decoder y confirmar rojo**

```powershell
npm.cmd run test:run -- src/__tests__/utils/transactionImportDecoder.test.ts
```

Expected: FAIL porque schema 3/source shortcut todavía son inválidos.

- [ ] **Step 3: Implementar la unión discriminada**

En `transactionImport.ts` definir:

```typescript
interface TransactionImportCandidateCommon {
  id: string;
  occurredAt: Date;
  amountMinor: number;
  currency: 'COP';
  merchant: string;
}

export interface AndroidShortcutCandidateBase
  extends TransactionImportCandidateCommon {
  schemaVersion: 3;
  source: 'android-shortcut';
  suggestedAccountId: string;
  suggestedCategory: string;
  createdAt: Date;
  sourcePackage?: never;
  cardLast4?: never;
  observedInstrumentLabel?: never;
  parserId?: never;
  parserVersion?: never;
  confidence?: never;
}
```

Conservar la base de notificación v1/v2 con sus campos actuales y definir cada estado terminal como `(AndroidNotificationCandidateBase | AndroidShortcutCandidateBase) & { status: ... }`.

- [ ] **Step 4: Implementar decodificación exacta por variante**

Separar `NOTIFICATION_CANDIDATE_FIELDS` y `SHORTCUT_CANDIDATE_FIELDS`. Decodificar campos comunes una vez y ramificar por `schemaVersion/source`; rechazar cualquier clave cruzada. `createdAt` usa el mismo `decodeTimestamp` actual.

- [ ] **Step 5: Escribir prueba roja de identidad servidor-actual v3**

En `transactionImportOrchestration.test.ts`, confirmar que cambiar `suggestedCategory`, `suggestedAccountId` o `createdAt` entre apertura y confirmación produce `El candidato cambió en el servidor` y cero escrituras.

- [ ] **Step 6: Extender `sameCandidate` y dejar verde**

Comparar primero los campos comunes y luego:

```typescript
if (current.source !== expected.source) return false;
if (current.source === 'android-shortcut' && expected.source === 'android-shortcut') {
  return current.suggestedAccountId === expected.suggestedAccountId
    && current.suggestedCategory === expected.suggestedCategory
    && current.createdAt.getTime() === expected.createdAt.getTime();
}
```

La rama de notificación conserva parser, paquete y señales actuales.

- [ ] **Step 7: Ejecutar pruebas y tipos**

```powershell
npm.cmd run test:run -- src/__tests__/utils/transactionImportDecoder.test.ts src/__tests__/hooks/transactionImportOrchestration.test.ts
npm.cmd run typecheck
```

Expected: ambas suites y TypeScript pasan.

- [ ] **Step 8: Commit**

```powershell
git add -- src/types/transactionImport.ts src/utils/transactionImportDecoder.ts src/__tests__/utils/transactionImportDecoder.test.ts src/hooks/firestore/transactionImportOrchestration.ts src/__tests__/hooks/transactionImportOrchestration.test.ts
git commit -m "feat(import): accept manual Android expense drafts"
```

---

### Task 3: Endurecer reglas Firestore para v3

**Files:**
- Modify: `firestore.rules:190-325`
- Modify: `src/__tests__/firestore/transactionImport.rules.test.ts`

**Interfaces:**
- Consumes: contrato v3 del Task 2.
- Produces: creación owner-only exacta, cuenta existente, no-op, dismiss y confirmación atómica compatibles con v1/v2/v3.

- [ ] **Step 1: Añadir pruebas rojas de reglas**

Crear helpers `validShortcutCandidate()` y casos para:

```typescript
await assertSucceeds(setDoc(ownerShortcutRef, validShortcutCandidate({
  suggestedAccountId: ownerAccountId,
})));
await assertFails(setDoc(foreignShortcutRef, validShortcutCandidate()));
await assertFails(setDoc(ownerShortcutRef, validShortcutCandidate({
  suggestedAccountId: 'missing-account',
})));
await assertFails(setDoc(ownerShortcutRef, {
  ...validShortcutCandidate(),
  parserId: 'manual',
}));
```

Agregar casos de categoría vacía/>100, `createdAt` cliente arbitrario, mutación de contenido, dismiss válido y confirmación bajo lease.

- [ ] **Step 2: Ejecutar emulador y confirmar rojo**

```powershell
npm.cmd run test:rules
```

Expected: los casos v3 fallan; casos v1/v2 siguen pasando.

- [ ] **Step 3: Implementar forma base común y variantes exactas**

Crear funciones de reglas:

```javascript
function isValidAndroidShortcutCandidate(userId, candidateId, data) {
  return candidateId.matches('[a-f0-9]{64}')
    && data.keys().hasOnly([
      'schemaVersion', 'source', 'occurredAt', 'amountMinor', 'currency',
      'merchant', 'suggestedAccountId', 'suggestedCategory', 'createdAt',
      'status', 'transactionId', 'confirmedAt', 'dismissedAt'
    ])
    && data.schemaVersion == 3
    && data.source == 'android-shortcut'
    && isValidString(data.suggestedAccountId, 1, 1500)
    && exists(/databases/$(database)/documents/users/$(userId)/accounts/$(data.suggestedAccountId))
    && isValidString(data.suggestedCategory, 1, 100)
    && data.createdAt is timestamp;
}
```

Mantener las transiciones terminales comunes y exigir `createdAt == request.time` solo en create v3.

- [ ] **Step 4: Ejecutar reglas verdes**

```powershell
npm.cmd run test:rules
```

Expected: ambas suites configuradas pasan sin permisos ampliados a otro UID.

- [ ] **Step 5: Commit**

```powershell
git add -- firestore.rules src/__tests__/firestore/transactionImport.rules.test.ts
git commit -m "feat(rules): secure Android shortcut drafts"
```

---

### Task 4: Abrir el borrador exacto desde la URL y precargar la revisión

**Files:**
- Create: `src/utils/androidQuickExpenseHandoff.ts`
- Create: `src/__tests__/utils/androidQuickExpenseHandoff.test.ts`
- Modify: `src/hooks/firestore/useTransactionImportCandidates.ts`
- Modify: `src/__tests__/hooks/useTransactionImportCandidates.test.ts`
- Modify: `src/components/views/transactions/components/TransactionImportInbox.tsx`
- Modify: `src/components/views/transactions/components/TransactionImportReviewModal.tsx`
- Modify: `src/__tests__/components/transactionImportInbox.test.tsx`
- Modify: `src/__tests__/components/transactionImportReviewModal.test.tsx`

**Interfaces:**
- Consumes: `PendingTransactionImportCandidate` v3 y query `reviewAndroid`.
- Produces: `readAndroidReviewRequest(search)`, `clearAndroidReviewRequest(url)` y carga puntual de candidato aunque quede fuera del límite de 100.

- [ ] **Step 1: Escribir pruebas rojas del handoff puro**

```typescript
expect(readAndroidReviewRequest('?view=transactions&reviewAndroid=' + 'a'.repeat(64)))
  .toEqual({ kind: 'valid', candidateId: 'a'.repeat(64) });
expect(readAndroidReviewRequest('?reviewAndroid=abc')).toEqual({ kind: 'invalid' });
expect(clearAndroidReviewRequest('https://host/?view=transactions&reviewAndroid=' + 'a'.repeat(64)))
  .toBe('https://host/?view=transactions');
```

- [ ] **Step 2: Implementar el helper mínimo y ejecutarlo verde**

Exportar `ANDROID_REVIEW_PARAM`, regex `/^[a-f0-9]{64}$/`, lector triestado y limpiador que preserve los demás parámetros/hash.

```powershell
npm.cmd run test:run -- src/__tests__/utils/androidQuickExpenseHandoff.test.ts
```

- [ ] **Step 3: Escribir pruebas rojas de carga puntual**

Probar que `useTransactionImportCandidates(userId, requestedId)` añade un v3 pendiente obtenido por `onSnapshot(doc(...))`, no duplica uno ya incluido, y reporta `requestedStatus: 'missing' | 'terminal' | 'invalid'` sin exponer datos de otro UID.

- [ ] **Step 4: Implementar carga puntual y fusión**

Ampliar el retorno con:

```typescript
requestedCandidate: PendingTransactionImportCandidate | null;
requestedStatus: 'idle' | 'loading' | 'ready' | 'missing' | 'terminal' | 'error';
```

La consulta de lista permanece igual. El listener de documento se crea solo con UID e ID válidos y se limpia al cambiar cualquiera.

- [ ] **Step 5: Escribir pruebas rojas de UI y precarga**

Cubrir:

- parámetro válido abre y expande exactamente el v3 solicitado;
- parámetro inválido muestra un error reparable y se limpia;
- candidato ausente/terminal no selecciona otro;
- v3 precarga `suggestedAccountId` y `suggestedCategory` si siguen disponibles;
- cuenta/categoría obsoleta queda vacía con aviso;
- v3 nunca ofrece `Recordar este medio de pago`;
- v1/v2 mantienen matching, copy y conducta actuales.

- [ ] **Step 6: Implementar inbox y modal**

En el modal, inicializar la rama v3 así:

```typescript
const shortcutAccountExists = candidate.source === 'android-shortcut'
  && accounts.some(account => account.id === candidate.suggestedAccountId);
setAccountId(shortcutAccountExists ? candidate.suggestedAccountId : '');
setCategory(
  candidate.source === 'android-shortcut'
    && expenseCategories.includes(candidate.suggestedCategory)
    ? candidate.suggestedCategory
    : '',
);
```

Ejecutar matching de instrumentos y el efecto de recomendación solo para `android-notification`. Limpiar la URL con `history.replaceState` después de resolver ready/missing/terminal/invalid.

- [ ] **Step 7: Ejecutar suites enfocadas**

```powershell
npm.cmd run test:run -- src/__tests__/utils/androidQuickExpenseHandoff.test.ts src/__tests__/hooks/useTransactionImportCandidates.test.ts src/__tests__/components/transactionImportInbox.test.tsx src/__tests__/components/transactionImportReviewModal.test.tsx
npm.cmd run typecheck
```

Expected: suites y tipos verdes, sin regresión v1/v2.

- [ ] **Step 8: Commit**

```powershell
git add -- src/utils/androidQuickExpenseHandoff.ts src/__tests__/utils/androidQuickExpenseHandoff.test.ts src/hooks/firestore/useTransactionImportCandidates.ts src/__tests__/hooks/useTransactionImportCandidates.test.ts src/components/views/transactions/components/TransactionImportInbox.tsx src/components/views/transactions/components/TransactionImportReviewModal.tsx src/__tests__/components/transactionImportInbox.test.tsx src/__tests__/components/transactionImportReviewModal.test.tsx
git commit -m "feat(transactions): open Android quick expense drafts"
```

---

### Task 5: Modelar y validar la captura rápida en Kotlin

**Files:**
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/quickexpense/QuickExpenseDraft.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/quickexpense/QuickExpenseFormValidator.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/quickexpense/QuickExpenseCandidateId.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/quickexpense/QuickExpenseFormValidatorTest.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/quickexpense/QuickExpenseCandidateIdTest.kt`

**Interfaces:**
- Produces: `QuickExpenseDraft(candidateId, occurredAtEpochMillis, amountMinor, merchant, suggestedAccountId, suggestedCategory)`, `validateQuickExpenseForm(...)` y `QuickExpenseCandidateId.generate()`.

- [ ] **Step 1: Escribir pruebas rojas de monto y formulario**

Casos mínimos:

```kotlin
assertEquals(1_399_000L, parseCopAmountMinor("13.990"))
assertEquals(1_399L, parseCopAmountMinor("13,99"))
assertNull(parseCopAmountMinor("0"))
assertNull(parseCopAmountMinor("1,999"))
assertEquals(QuickExpenseField.ACCOUNT, validateQuickExpenseForm(valid.copy(accountId = "")).field)
```

Cubrir 1/140 caracteres, categoría 1/100, fecha local al mediodía, máximo `100_000_000_000` minor y trimming sin alterar contenido interno.

- [ ] **Step 2: Escribir prueba roja de identidad**

Generar 100 IDs; cada uno debe cumplir `[a-f0-9]{64}` y ser único. Inyectar `SecureRandom` para que una prueba determinista confirme hex de 32 bytes.

- [ ] **Step 3: Ejecutar rojo**

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:TEMP='C:\jtmp'
$env:TMP='C:\jtmp'
$env:ANDROID_HOME=Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_SDK_ROOT=$env:ANDROID_HOME
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*QuickExpense*'
```

Expected: FAIL por clases ausentes.

- [ ] **Step 4: Implementar lógica pura mínima**

Usar `BigDecimal.movePointRight(2).longValueExact()`, regex colombiana explícita y `LocalDate.atTime(12, 0).atZone(zoneId)`. No usar `Double` para convertir dinero.

- [ ] **Step 5: Ejecutar verde y commit**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*QuickExpense*'
git add -- android-capture/app/src/main/java/com/moneytrack/capture/quickexpense android-capture/app/src/test/java/com/moneytrack/capture/quickexpense
git commit -m "feat(android): model quick expense drafts"
```

---

### Task 6: Cargar opciones y crear el borrador online

**Files:**
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/quickexpense/QuickExpenseOptionsRepository.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/quickexpense/QuickExpenseDraftRepository.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/quickexpense/QuickExpenseHandoff.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/quickexpense/QuickExpenseOptionsRepositoryTest.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/quickexpense/QuickExpenseDraftRepositoryTest.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/quickexpense/QuickExpenseHandoffTest.kt`

**Interfaces:**
- Consumes: `QuickExpenseDraft` del Task 5.
- Produces: `QuickExpenseOption(id, name, isDefault)`, `QuickExpenseOptions(accounts, categories)`, `QuickExpenseWriteResult` y `QuickExpenseHandoff.url(candidateId)`.

- [ ] **Step 1: Escribir pruebas rojas de decodificación de opciones**

Probar que solo acepta cuentas con `name/type/isDefault`, solo categorías `type == expense`, ordena por `order` y nombre, y selecciona default únicamente cuando es inequívoco.

- [ ] **Step 2: Escribir pruebas rojas de persistencia**

Mediante un `QuickExpenseDocumentStore` falso, probar:

- path `users/{uid}/transactionImportCandidates/{64hex}`;
- forma v3 exacta;
- create ausente;
- retry con campos inmutables idénticos;
- colisión con contenido distinto;
- fallo offline sin resultado stored;
- UID vacío rechazado antes del store.

- [ ] **Step 3: Escribir prueba roja del URL opaco**

```kotlin
assertEquals(
    "https://axensz.github.io/Moneytrack/?view=transactions&reviewAndroid=${"a".repeat(64)}",
    QuickExpenseHandoff.url("a".repeat(64)),
)
```

IDs inválidos deben lanzar `IllegalArgumentException`; ningún método acepta monto u otros campos.

- [ ] **Step 4: Ejecutar rojo**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*QuickExpense*'
```

- [ ] **Step 5: Implementar repositorios**

`FirebaseQuickExpenseDocumentStore` usa `FirebaseFirestore.runTransaction`: lee el documento; si no existe, escribe campos v3 con `FieldValue.serverTimestamp()`; si existe, compara únicamente los campos inmutables normalizados y retorna stored sin escribir; cualquier diferencia retorna collision. Las lecturas de opciones usan `Source.DEFAULT` y no crean una base local adicional.

- [ ] **Step 6: Ejecutar verde y commit**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*QuickExpense*'
git add -- android-capture/app/src/main/java/com/moneytrack/capture/quickexpense android-capture/app/src/test/java/com/moneytrack/capture/quickexpense
git commit -m "feat(android): persist quick expense drafts"
```

---

### Task 7: Publicar el shortcut y construir la Activity nativa

**Files:**
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/QuickExpenseActivity.kt`
- Create: `android-capture/app/src/main/res/layout/activity_quick_expense.xml`
- Create: `android-capture/app/src/main/res/xml/shortcuts.xml`
- Create: `android-capture/app/src/main/res/drawable/ic_add_expense.xml`
- Modify: `android-capture/app/src/main/AndroidManifest.xml`
- Modify: `android-capture/app/src/main/res/values/strings.xml`
- Modify: `android-capture/app/src/main/res/values/dimens.xml`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/QuickExpenseUiContractTest.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/QuickExpenseShortcutContractTest.kt`

**Interfaces:**
- Consumes: validación, opciones, repository y handoff de Tasks 5–6; `GoogleSignInController` existente.
- Produces: shortcut estático `quick_expense`, Activity exportada sin extras financieros y recorrido accesible.

- [ ] **Step 1: Escribir contratos de recursos rojos**

Verificar XML para:

- metadata `android.app.shortcuts` en `MainActivity`;
- shortcut `quick_expense`, label `Registrar gasto`, target `.QuickExpenseActivity` y action fija;
- Activity exportada y tema MoneyTrack;
- `ScrollView`, labels asociados, `inputType=numberDecimal`, `accessibilityLiveRegion=polite`, botón primario y 48 dp;
- ausencia de campos intent para monto/categoría/cuenta.

- [ ] **Step 2: Ejecutar rojo**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*QuickExpense*'
```

- [ ] **Step 3: Crear recursos y manifest mínimos**

Usar `shortcuts.xml`:

```xml
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut
        android:shortcutId="quick_expense"
        android:enabled="true"
        android:icon="@drawable/ic_add_expense"
        android:shortcutShortLabel="@string/quick_expense_short_label"
        android:shortcutLongLabel="@string/quick_expense_long_label">
        <intent
            android:action="com.moneytrack.capture.action.QUICK_EXPENSE"
            android:targetPackage="com.moneytrack.capture"
            android:targetClass="com.moneytrack.capture.QuickExpenseActivity" />
    </shortcut>
</shortcuts>
```

- [ ] **Step 4: Implementar estados de Activity**

Estados explícitos: `SIGNED_OUT`, `LOADING_OPTIONS`, `EDITING`, `SAVING`, `STORED`, `ERROR`. La acción primaria es respectivamente iniciar sesión, esperar/deshabilitada, continuar, guardando/deshabilitada, abrir MoneyTrack y reintentar. El permiso de notificaciones no participa.

La Activity:

- aplica SplashScreen, tema e insets existentes;
- restaura texto/fecha/selecciones en `onSaveInstanceState`;
- bloquea doble toque;
- limpia errores al corregir el campo correspondiente;
- abre únicamente `QuickExpenseHandoff.url(candidateId)`;
- hace `finish()` solo cuando `startActivity` fue aceptado.

- [ ] **Step 5: Ejecutar pruebas, lint y APK debug**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest lintDebug assembleDebug
```

Expected: pruebas verdes, cero lint errors y APK generado.

- [ ] **Step 6: Commit**

```powershell
git add -- android-capture/app/src/main/AndroidManifest.xml android-capture/app/src/main/java/com/moneytrack/capture/QuickExpenseActivity.kt android-capture/app/src/main/res android-capture/app/src/test/java/com/moneytrack/capture
git commit -m "feat(android): add quick expense shortcut"
```

---

### Task 8: Verificación integrada del shortcut

**Files:**
- Modify after evidence: `openspec/changes/add-android-transaction-ingestion/tasks.md`
- Modify after evidence: `openspec/changes/add-android-transaction-ingestion/implementation-notes.md`

**Interfaces:**
- Consumes: Tasks 1–7 completos.
- Produces: evidencia automática y lista explícita de validación física pendiente.

- [ ] **Step 1: Ejecutar regresión web completa**

```powershell
npm.cmd run test:run
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Expected: cero fallos introducidos. Registrar conteos exactos.

- [ ] **Step 2: Ejecutar reglas y Android completo**

```powershell
npm.cmd run test:rules
.\android-capture\gradlew.bat -p android-capture clean testDebugUnitTest lintDebug assembleDebug
```

Expected: reglas verdes, Gradle successful y APK debug presente.

- [ ] **Step 3: Revisar grafo e impacto**

Actualizar el grafo, ejecutar `detect_changes`, `get_affected_flows` y `tests_for` para decoder, inbox, confirmación, repository y Activities. Resolver cualquier ruta financiera sin cobertura.

- [ ] **Step 4: Validar especificación y diff**

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict
git diff --check HEAD~1..HEAD
git status --short
```

- [ ] **Step 5: Registrar solo evidencia obtenida**

Marcar 14.1–14.7 según pruebas reales. Dejar 14.8 abierta hasta validar en dispositivo shortcut, 320/400 dp, landscape, texto 1,3×, claro/oscuro, cuenta distinta, offline y cero efecto contable antes de confirmar.

- [ ] **Step 6: Commit**

```powershell
git add -- openspec/changes/add-android-transaction-ingestion/tasks.md openspec/changes/add-android-transaction-ingestion/implementation-notes.md
git commit -m "docs(openspec): record quick expense verification"
```
