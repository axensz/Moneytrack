# Diseño — HU-01: Backup y restauración segura

> **Fecha:** 2026-06-12 · **Rama:** `auditoria-profunda` · **Origen:** HU-01 del backlog post-auditoría (docs/AUDITORIA-PROFUNDA.md, hallazgos C1 y M-prod-backup).

## Contexto y problema

`useBackup.ts` ya implementa el swap seguro write-then-delete con rollback (C1 resuelto a nivel de motor, test `backupReplaceAtomic.test.ts`), pero **no está cableado a ninguna UI**: el usuario no tiene forma de exportar ni restaurar sus datos.

Además se encontraron dos gaps al auditar el motor para esta HU:

1. **Alcance incompleto (crítico para replace):** `BackupData` v1.0 solo cubre `transactions`, `accounts`, `categories`. El usuario también tiene `budgets`, `debts`, `savingsGoals`, `recurringPayments` y `planConfig`. Un restore "replace" hoy dejaría deudas/metas/recurrentes apuntando a cuentas borradas (IDs viejos), y un backup "completo" no protegería la mitad de los datos.
2. **Export desde array paginado (pérdida silenciosa):** `exportData` serializa el prop `transactions` en memoria, que está paginado (~500). Un usuario con historial largo exportaría un backup incompleto sin saberlo. Mismo patrón que el hallazgo C2 ya corregido en balances (los cálculos deben usar historial completo, nunca el array paginado).

## Decisiones de producto

| Decisión | Valor |
|---|---|
| Alcance del backup | Todo lo financiero: `transactions`, `accounts`, `categories`, `budgets`, `debts`, `savingsGoals`, `recurringPayments`, `planConfig`. **Excluye** API key de Gemini (sensible), notificaciones y preferencias de notificación (efímeras/reconstruibles). |
| Invitados | Solo usuarios logueados. El ítem de menú no se muestra a invitados. |
| UI | Modal dedicado "Respaldo de datos" accesible desde el menú de ajustes del Header, construido sobre `BaseModal` (focus trap / Escape / restauración de foco ya resueltos). |
| Estrategia default de import | `merge`. `replace` requiere descargar un respaldo del estado actual antes de habilitarse. |

## Motor — `useBackup.ts` v2.0

### Formato `BackupData` v2.0

```ts
{
  version: '2.0',
  exportDate: string,        // ISO
  transactions: Transaction[],
  accounts: Account[],
  categories: Categories,
  budgets: Budget[],
  debts: Debt[],
  savingsGoals: SavingsGoal[],
  recurringPayments: RecurringPayment[],
  planConfig: PlanConfig | null
}
```

- **Export:** lee cada colección completa con `getDocs` desde Firestore (NUNCA desde los arrays en memoria, que pueden estar paginados). Descarga como `moneytrack_backup_YYYY-MM-DD.json`.
- **Import:** acepta `version: '1.0'` (colecciones ausentes se tratan como vacías) y `'2.0'`. Cualquier otra versión → error de validación.
- **Restricción v1.0:** un backup v1.0 solo puede importarse en modo `merge`. `replace` con v1.0 borraría deudas/metas/recurrentes/planConfig que ese formato nunca capturó (pérdida sorpresa) o dejaría sus referencias `accountId` apuntando a cuentas eliminadas. La UI deshabilita `replace` con explicación cuando el archivo es v1.0.

### Orden de escritura y remap de IDs

Todos los docs se escriben con IDs nuevos (`doc(collection(...))`), registrando mapas viejo→nuevo:

1. `accounts` → genera `accountIdMap`.
2. `debts` → remap `debt.accountId`; genera `debtIdMap`.
3. `savingsGoals` (remap `accountId`), `recurringPayments` (remap `accountId`), `budgets`, `categories`.
4. `transactions` al final → remap `accountId`, `toAccountId`, `debtId`.

Referencias a IDs que no existen en los mapas se conservan tal cual (mismo comportamiento actual con `accountId`), salvo que la validación de integridad referencial las haya rechazado antes.

### Swap seguro (se conserva y amplía)

El mecanismo existente write-then-delete + rollback se extiende a las 7 colecciones:

1. `snapshotExistingRefs` captura refs viejas de **todas** las colecciones del alcance (solo lectura).
2. Se escribe todo lo nuevo en batches ≤ 500, acumulando `writtenRefs`.
3. Si la escritura falla → rollback: borrar `writtenRefs` (datos viejos intactos, resultado "no pasó nada").
4. Solo tras éxito total → borrar refs viejas (el swap real).

`planConfig` es un doc único en `users/{uid}/settings`, no una colección:
- `merge`: no se toca si ya existe; se escribe solo si no hay.
- `replace`: se sobrescribe con el del backup (o se borra si el backup no trae). Nunca se toca el doc de la API key Gemini que vive en la misma colección `settings`.

### Validación

- Estructura: versión soportada, arrays presentes, categorías con `expense`/`income`.
- Integridad referencial (pre-escritura, sobre el archivo): cada `transaction.accountId`/`toAccountId` debe existir en `accounts` del backup; `transaction.debtId` debe existir en `debts` (v2.0); `debt/goal/recurring.accountId` ausente del backup → warning en logger, se importa sin remap (campo opcional).

## UI — `BackupModal.tsx` (nuevo)

Entrada: ítem "Respaldo de datos" en el menú de ajustes del Header (`role=menuitem`, mismo patrón de los existentes). Visible solo con sesión iniciada.

Estructura del modal (sobre `BaseModal`):

1. **Sección Exportar:** botón "Descargar respaldo (.json)" + lista breve de qué incluye y qué no (API key excluida).
2. **Sección Restaurar:**
   - Input de archivo `.json` → al seleccionar: parse + validación.
   - **Resumen previo:** versión, fecha de export, conteos por colección (N transacciones, M cuentas, …).
   - Selector de estrategia: `merge` (default, radio) / `replace` (radio con warning destructivo).
   - Si `replace`: botón "Descargar respaldo actual" — hasta no pulsarlo, "Restaurar" queda deshabilitado. El gate se resetea si se cambia el archivo seleccionado.
   - Botón "Restaurar" → barra de progreso (`importProgress` existente) → resumen final (conteos importados).
3. **Durante import:** modal no cerrable (sin X, Escape deshabilitado, sin click-fuera), listener `beforeunload` activo para avisar si cierran la pestaña.

## Manejo de errores (mensajes al usuario)

| Fallo | Resultado | Mensaje |
|---|---|---|
| Validación de archivo | Cero escrituras | Detalle del error (versión, estructura, referencia rota) |
| Escritura a mitad | Rollback automático de lo escrito | "No se modificó nada. Revisa tu conexión e intenta de nuevo." |
| Rollback también falla | Pueden quedar docs nuevos | "La restauración falló y pueden haber quedado datos duplicados. Reintenta la restauración en modo reemplazar." |
| Borrado de viejos falla (replace, post-éxito) | 1 reintento automático; si persiste, datos nuevos completos + restos viejos | "Restauración completa. La limpieza de datos antiguos quedó parcial: pueden verse duplicados." |

## Tests

Hook (`useBackup`), extendiendo el patrón de mocks de `backupReplaceAtomic.test.ts`:

1. Export usa `getDocs` por colección y NO el array en memoria (caso: historial > página).
2. Export excluye API key / notificaciones.
3. Import v2.0: remap correcto de `accountId`/`toAccountId`/`debtId` en todo el grafo.
4. Import v1.0: colecciones ausentes = vacías, sin error; `replace` rechazado para v1.0.
5. Replace: viejos se borran solo tras éxito total (las 7 colecciones).
6. Fallo a mitad de escritura: rollback borra exactamente `writtenRefs`, viejos intactos.
7. `planConfig`: merge respeta existente; replace sobrescribe; doc de API key jamás tocado.
8. Versión no soportada / estructura rota / referencia rota → error antes de escribir.

UI (ligero): gate de replace (botón deshabilitado hasta descargar respaldo actual; reset al cambiar archivo).

## Archivos

| Archivo | Cambio |
|---|---|
| `src/types/finance.ts` | `BackupData` v2.0 (+tipo `BackupDataV1` para compat de import) |
| `src/hooks/useBackup.ts` | Export vía `getDocs`; import 7 colecciones + remap + planConfig |
| `src/components/modals/BackupModal.tsx` | Nuevo, sobre `BaseModal` |
| `src/components/layout/Header.tsx` | Ítem de menú "Respaldo de datos" |
| `src/components/finance-tracker.tsx` | Estado/montaje del modal |
| `src/__tests__/hooks/useBackup*.test.ts` | Casos de la sección Tests |

## Fuera de alcance

- Backup para invitados (decisión explícita: solo logueados).
- Backups automáticos/programados, versionado de múltiples backups, cifrado del archivo.
- Notificaciones, preferencias y API key en el backup.
