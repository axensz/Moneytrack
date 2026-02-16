# MoneyTrack — Base de Conocimiento del Negocio

> **Propósito:** Documentar toda la lógica de negocio, arquitectura, reglas, modelos de datos y decisiones de diseño para servir como referencia en futuros desarrollos.
>
> **Última actualización:** 13 de febrero de 2026  
> **Versión de la app:** 0.1.0 (package.json) / 1.0.0 (config interna)

---

## Tabla de Contenidos

1. [Visión General del Producto](#1-visión-general-del-producto)
2. [Stack Tecnológico](#2-stack-tecnológico)
3. [Arquitectura de la Aplicación](#3-arquitectura-de-la-aplicación)
4. [Modelo de Datos](#4-modelo-de-datos)
5. [Reglas de Negocio — Cuentas](#5-reglas-de-negocio--cuentas)
6. [Reglas de Negocio — Transacciones](#6-reglas-de-negocio--transacciones)
7. [Reglas de Negocio — Cálculo de Balances](#7-reglas-de-negocio--cálculo-de-balances)
8. [Reglas de Negocio — Intereses y Cuotas](#8-reglas-de-negocio--intereses-y-cuotas)
9. [Reglas de Negocio — Categorías](#9-reglas-de-negocio--categorías)
10. [Reglas de Negocio — Pagos Periódicos](#10-reglas-de-negocio--pagos-periódicos)
11. [Reglas de Negocio — Préstamos y Deudas](#11-reglas-de-negocio--préstamos-y-deudas)
12. [Reglas de Negocio — Presupuestos](#12-reglas-de-negocio--presupuestos)
13. [Reglas de Negocio — Metas de Ahorro](#13-reglas-de-negocio--metas-de-ahorro)
14. [Reglas de Negocio — Estado de Cuenta TC](#14-reglas-de-negocio--estado-de-cuenta-tc)
15. [Reglas de Negocio — Exportación CSV](#15-reglas-de-negocio--exportación-csv)
16. [Reglas de Negocio — Filtrado y Estadísticas](#16-reglas-de-negocio--filtrado-y-estadísticas)
17. [Autenticación y Almacenamiento Dual](#17-autenticación-y-almacenamiento-dual)
18. [Seguridad — Reglas de Firestore](#18-seguridad--reglas-de-firestore)
19. [Asistente de IA (Gemini)](#19-asistente-de-ia-gemini)
20. [Interfaz de Usuario — Componentes](#20-interfaz-de-usuario--componentes)
21. [Backup y Restauración](#21-backup-y-restauración)
22. [Notificaciones](#22-notificaciones)
23. [Validaciones](#23-validaciones)
24. [Formateo y Localización](#24-formateo-y-localización)
25. [Patrones de Diseño Utilizados](#25-patrones-de-diseño-utilizados)
26. [Casos Borde Manejados](#26-casos-borde-manejados)
27. [Estructura de Archivos](#27-estructura-de-archivos)
28. [Variables de Entorno](#28-variables-de-entorno)
29. [Estado Actual y Deuda Técnica](#29-estado-actual-y-deuda-técnica)
30. [Glosario](#30-glosario)

---

## 1. Visión General del Producto

**MoneyTrack** es una aplicación web de finanzas personales orientada al mercado colombiano. Permite:

- Registrar **ingresos, gastos y transferencias** entre cuentas
- Gestionar **cuentas de ahorro, efectivo y tarjetas de crédito**
- Calcular **intereses por cuotas** en tarjetas de crédito (sistema French)
- Administrar **pagos periódicos** (suscripciones, servicios) con alertas de vencimiento
- Gestionar **préstamos y deudas** ("¿Quién me debe?") con seguimiento de pagos parciales
- Configurar **presupuestos mensuales** por categoría con alertas de exceso
- Definir **metas de ahorro** con fecha objetivo y seguimiento de progreso
- Visualizar **estadísticas** de flujo de caja, distribución por categoría, comparativas mensuales y tendencias anuales
- Consultar **estado de cuenta** de tarjetas de crédito por ciclo de facturación
- **Exportar transacciones a CSV** compatible con Excel
- Interactuar con un **asistente de IA** (Google Gemini) para consultas financieras y acciones rápidas
- **Sincronizar datos** en la nube con Firebase o trabajar **offline** con localStorage

### Público Objetivo

Usuarios colombianos que buscan controlar sus finanzas personales con soporte nativo para:

- Pesos colombianos (COP) con formato `$1.234.567`
- Tasas de interés E.A. (Efectiva Anual) colombianas
- Categorías en español alineadas al contexto local

---

## 2. Stack Tecnológico

| Capa               | Tecnología                       | Versión |
| ------------------ | -------------------------------- | ------- |
| **Framework**      | Next.js                          | 16.x    |
| **UI**             | React                            | 19.x    |
| **Estilos**        | Tailwind CSS                     | 4.x     |
| **Íconos**         | Lucide React                     | 0.562+  |
| **Gráficos**       | Recharts                         | 3.6+    |
| **Backend/Auth**   | Firebase (Auth, Firestore)       | 12.7+   |
| **IA**             | Google Gemini (@google/genai)    | 1.40+   |
| **Tema**           | next-themes                      | 0.4+    |
| **Notificaciones** | react-hot-toast                  | 2.6+    |
| **Testing**        | Vitest + Testing Library + jsdom | 4.x     |
| **Lenguaje**       | TypeScript                       | 5.x     |

### Scripts Disponibles

```bash
npm run dev        # Servidor de desarrollo
npm run build      # Build de producción
npm run start      # Servir build de producción
npm run lint       # Linting con ESLint
npm run test       # Tests con Vitest (watch)
npm run test:run   # Tests una sola vez
```

---

## 3. Arquitectura de la Aplicación

### Jerarquía de Proveedores

```
RootLayout (next-themes ThemeProvider)
└── Home (ErrorBoundary)
    └── FinanceTracker (Auth + Loading state)
        └── FirestoreProvider (datos raw + listeners real-time)
            └── FinanceProvider (datos derivados: balances, categorías, recurrentes)
                └── FinanceTrackerContent (UI completa)
```

### Cadena de Dependencias de Datos

```
1. useTransactions(userId)  → transacciones base
2. useAccounts(userId, transactions, deleteTransaction) → cuentas + balances
3. useRecurringPayments(userId, transactions) → pagos periódicos + estadísticas
4. useCategories(transactions, userId) → categorías fusionadas (default + usuario)
```

### Flujo de Datos

```
FirestoreProvider
  ├── 3 listeners onSnapshot paralelos (transactions, accounts, categories)
  ├── Loading = true hasta que TODOS reporten primer snapshot
  ├── Timeout de 10 segundos → estado de error
  └── Se llama UNA SOLA VEZ (Context Singleton)

FinanceProvider
  ├── Compone hooks: useTransactions → useAccounts → useRecurring → useCategories
  ├── Expone ~30 valores/funciones vía useFinance()
  └── Cada vista consume solo lo que necesita
```

### Renderizado de Vistas

```
FinanceTrackerContent
├── OfflineBanner (red offline)
├── Header (ThemeToggle, Settings, Auth)
├── TabNavigation (desktop) / Bottom Nav (mobile)
├── StatsCards (KPIs: balance, ingresos, gastos, pendientes)
├── Vista Activa:
│   ├── TransactionsView (+ TransactionForm)  ← carga directa
│   ├── AccountsView                          ← React.lazy
│   ├── RecurringPaymentsView                 ← React.lazy
│   └── StatsView                             ← React.lazy
├── Modals: Auth, Welcome, Help, Categories
├── AIChatBot (solo usuarios autenticados)
└── Toaster (notificaciones toast)
```

---

## 4. Modelo de Datos

### 4.1 Transaction

| Campo                      | Tipo                                  | Requerido        | Descripción                                |
| -------------------------- | ------------------------------------- | ---------------- | ------------------------------------------ |
| `id`                       | `string`                              | Auto (Firestore) | ID único                                   |
| `type`                     | `'income' \| 'expense' \| 'transfer'` | ✅               | Tipo de transacción                        |
| `amount`                   | `number`                              | ✅               | Monto (siempre positivo)                   |
| `category`                 | `string`                              | ✅               | Categoría asignada                         |
| `description`              | `string`                              | ✅               | Descripción (puede ser vacía)              |
| `date`                     | `Date`                                | ✅               | Fecha de la transacción                    |
| `paid`                     | `boolean`                             | ✅               | Si está pagada/ejecutada                   |
| `accountId`                | `string`                              | ✅               | Cuenta origen                              |
| `toAccountId`              | `string`                              | Solo transfers   | Cuenta destino (transferencias)            |
| `createdAt`                | `Date`                                | Auto             | Timestamp de creación                      |
| `hasInterest`              | `boolean`                             | No               | Si genera intereses (TC)                   |
| `installments`             | `number`                              | No               | Número de cuotas (1-60)                    |
| `monthlyInstallmentAmount` | `number`                              | No               | Cuota mensual calculada                    |
| `totalInterestAmount`      | `number`                              | No               | Total de intereses                         |
| `interestRate`             | `number`                              | No               | Tasa E.A. snapshot al momento de la compra |
| `recurringPaymentId`       | `string`                              | No               | ID del pago periódico asociado             |
| `debtId`                   | `string`                              | No               | ID de la deuda/préstamo asociado           |

### 4.2 Account

| Campo            | Tipo                              | Requerido   | Descripción                            |
| ---------------- | --------------------------------- | ----------- | -------------------------------------- |
| `id`             | `string`                          | Auto        | ID único                               |
| `name`           | `string`                          | ✅          | Nombre de la cuenta                    |
| `type`           | `'savings' \| 'credit' \| 'cash'` | ✅          | Tipo de cuenta                         |
| `isDefault`      | `boolean`                         | ✅          | Si es la cuenta por defecto            |
| `initialBalance` | `number`                          | ✅          | Saldo inicial (0 forzado para crédito) |
| `creditLimit`    | `number`                          | Solo credit | Cupo total de la tarjeta               |
| `cutoffDay`      | `number`                          | Solo credit | Día de corte (1-31)                    |
| `paymentDay`     | `number`                          | Solo credit | Día de pago (1-31)                     |
| `bankAccountId`  | `string`                          | No          | Cuenta bancaria asociada (para TC)     |
| `interestRate`   | `number`                          | No          | Tasa E.A. en porcentaje (ej: 23.99)    |
| `createdAt`      | `Date`                            | Auto        | Timestamp de creación                  |
| `order`          | `number`                          | No          | Orden de visualización (drag & drop)   |

### 4.3 RecurringPayment

| Campo            | Tipo                    | Requerido | Descripción                        |
| ---------------- | ----------------------- | --------- | ---------------------------------- |
| `id`             | `string`                | Auto      | ID único                           |
| `name`           | `string`                | ✅        | Nombre (ej: "Netflix", "Arriendo") |
| `amount`         | `number`                | ✅        | Valor esperado del pago            |
| `category`       | `string`                | ✅        | Categoría asociada                 |
| `accountId`      | `string`                | No        | Cuenta preferida (opcional)        |
| `dueDay`         | `number`                | ✅        | Día de vencimiento (1-31)          |
| `frequency`      | `'monthly' \| 'yearly'` | ✅        | Frecuencia                         |
| `isActive`       | `boolean`               | ✅        | Si está activo o pausado           |
| `notes`          | `string`                | No        | Notas opcionales                   |
| `createdAt`      | `Date`                  | Auto      | Timestamp de creación              |
| `lastPaidDate`   | `Date`                  | No        | Última fecha de pago               |
| `lastPaidAmount` | `number`                | No        | Último monto pagado                |

### 4.4 Category

| Campo  | Tipo                    | Requerido | Descripción            |
| ------ | ----------------------- | --------- | ---------------------- |
| `id`   | `string`                | Auto      | ID único               |
| `type` | `'expense' \| 'income'` | ✅        | Tipo de categoría      |
| `name` | `string`                | ✅        | Nombre de la categoría |

### 4.5 Debt (Préstamo/Deuda)

| Campo             | Tipo                     | Requerido | Descripción                            |
| ----------------- | ------------------------ | --------- | -------------------------------------- |
| `id`              | `string`                 | Auto      | ID único                               |
| `personName`      | `string`                 | ✅        | Nombre de la persona                   |
| `type`            | `'lent' \| 'borrowed'`   | ✅        | `lent` = yo presté, `borrowed` = debo  |
| `originalAmount`  | `number`                 | ✅        | Monto original del préstamo            |
| `remainingAmount` | `number`                 | ✅        | Monto pendiente por cobrar/pagar       |
| `description`     | `string`                 | No        | Notas opcionales                       |
| `accountId`       | `string`                 | No        | Cuenta desde la que se prestó          |
| `isSettled`       | `boolean`                | ✅        | Si la deuda está completamente saldada |
| `createdAt`       | `Date`                   | Auto      | Timestamp de creación                  |
| `settledAt`       | `Date`                   | No        | Fecha en que se saldó                  |

### 4.6 Budget (Presupuesto)

| Campo          | Tipo      | Requerido | Descripción              |
| -------------- | --------- | --------- | ------------------------ |
| `id`           | `string`  | Auto      | ID único                 |
| `category`     | `string`  | ✅        | Categoría del presupuesto |
| `monthlyLimit` | `number`  | ✅        | Límite mensual en COP    |
| `isActive`     | `boolean` | ✅        | Si está activo           |
| `createdAt`    | `Date`    | Auto      | Timestamp de creación    |

### 4.7 SavingsGoal (Meta de Ahorro)

| Campo          | Tipo      | Requerido | Descripción                        |
| -------------- | --------- | --------- | ---------------------------------- |
| `id`           | `string`  | Auto      | ID único                           |
| `name`         | `string`  | ✅        | Nombre (ej: "Vacaciones")          |
| `targetAmount` | `number`  | ✅        | Monto objetivo                     |
| `currentAmount`| `number`  | ✅        | Monto ahorrado hasta ahora         |
| `targetDate`   | `Date`    | No        | Fecha objetivo (opcional)          |
| `accountId`    | `string`  | No        | Cuenta de ahorro asociada          |
| `isCompleted`  | `boolean` | ✅        | Si se alcanzó la meta              |
| `createdAt`    | `Date`    | Auto      | Timestamp de creación              |
| `completedAt`  | `Date`    | No        | Fecha en que se completó           |

### 4.8 BackupData

| Campo          | Tipo            | Descripción                      |
| -------------- | --------------- | -------------------------------- |
| `transactions` | `Transaction[]` | Todas las transacciones          |
| `accounts`     | `Account[]`     | Todas las cuentas                |
| `categories`   | `Categories`    | Objeto con arrays expense/income |
| `debts`        | `Debt[]`        | Todas las deudas/préstamos       |
| `budgets`      | `Budget[]`      | Todos los presupuestos           |
| `savingsGoals` | `SavingsGoal[]` | Todas las metas de ahorro        |
| `exportDate`   | `string`        | Fecha de exportación ISO         |
| `version`      | `string`        | Siempre `'1.0'`                  |

### Diagrama de Relaciones

```
Account (1) ──────< (N) Transaction >──────── Debt
   │                      │                     │
   │ bankAccountId         │ recurringPaymentId   │ debtId
   │ (TC → Ahorros)        │                     │
   ▼                      ▼                     │
Account (parent)    RecurringPayment             │
                          │                     │
                          │ category             │
                          ▼                     │
                      Category <──────── Budget  │
                                                 │
                     SavingsGoal ─────────────────┘
```

### Estructura en Firestore

```
users/{userId}/
├── transactions/{transactionId}
├── accounts/{accountId}
├── categories/{categoryId}
├── recurringPayments/{paymentId}
├── debts/{debtId}
├── budgets/{budgetId}
└── savingsGoals/{goalId}
```

---

## 5. Reglas de Negocio — Cuentas

### Creación

| Regla                   | Descripción                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| **Auto-default**        | La primera cuenta creada se marca como `isDefault: true` automáticamente |
| **Balance crédito = 0** | Las cuentas tipo `credit` tienen `initialBalance` forzado a `0`          |
| **Orden automático**    | Si no tienen `order`, se asigna automáticamente al crear                 |

### Eliminación

| Regla                  | Descripción                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Protección default** | No se puede eliminar la cuenta por defecto                                                                              |
| **Cascade delete**     | Al eliminar una cuenta, se eliminan TODAS las transacciones asociadas (donde `accountId === id` o `toAccountId === id`) |
| **Batched writes**     | La eliminación cascada usa `writeBatch` con límite de 500 operaciones por lote                                          |
| **Confirmación**       | El usuario debe escribir el nombre exacto de la cuenta para confirmar                                                   |

### Cuenta por Defecto

| Regla                 | Descripción                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------- |
| **Operación atómica** | Cambiar la cuenta por defecto usa `runTransaction` para setear una y resetear todas las demás |
| **Siempre una**       | Solo puede existir una cuenta por defecto a la vez                                            |

### Tipos de Cuenta

| Tipo        | Descripción        | Campos Especiales                                                         |
| ----------- | ------------------ | ------------------------------------------------------------------------- |
| **savings** | Cuenta de Ahorros  | `initialBalance`                                                          |
| **credit**  | Tarjeta de Crédito | `creditLimit`, `cutoffDay`, `paymentDay`, `bankAccountId`, `interestRate` |
| **cash**    | Efectivo           | `initialBalance`                                                          |

### Tarjetas de Crédito — Reglas Especiales

- Pueden asociarse a una cuenta bancaria (`bankAccountId`) para pagos automáticos
- Tienen tasa de interés E.A. para cálculo de cuotas
- `initialBalance` siempre es `0` (el cupo se define en `creditLimit`)
- **NO pueden hacer transferencias salientes** (bloqueado por la UI y validaciones)
- Los ingresos a una TC se interpretan como **pagos de deuda** (categoría auto: `"Pago Crédito"`)

---

## 6. Reglas de Negocio — Transacciones

### Creación — Flujo Completo

```
1. Pre-validación: ≥1 cuenta existente + cuenta seleccionada válida
2. Validación por Strategy: TransactionValidator.validate() → chequeos específicos por tipo de cuenta
3. Parseo de monto: formato colombiano "1.234,56" → 1234.56
4. Sincronización de recurrente: si está vinculada a un pago periódico y el monto difiere, se actualiza el monto base del recurrente
5. Determinación de categoría:
   - Transferencia → "Transferencia"
   - Ingreso a TC → "Pago Crédito"
   - Otro → categoría seleccionada por el usuario
6. Cálculo de intereses (si aplica): compras TC con cuotas > 1
7. Atomicidad: Pago a TC con cuenta fuente → crea 2 transacciones atómicas
8. Modos UX: "Agregar y cerrar" vs "Agregar y continuar"
```

### Tipos de Transacción

| Tipo         | Comportamiento                                                                            |
| ------------ | ----------------------------------------------------------------------------------------- |
| **expense**  | Reduce el balance de la cuenta origen. En TC, consume cupo disponible                     |
| **income**   | Aumenta el balance de la cuenta origen. En TC = pago de deuda                             |
| **transfer** | Reduce cuenta origen + aumenta cuenta destino. Atómica. Categoría auto: `"Transferencia"` |

### Pago de Tarjeta de Crédito (income a cuenta credit)

Cuando un ingreso se registra en una tarjeta de crédito **con cuenta fuente seleccionada**:

1. Se crea un **ingreso** en la cuenta de crédito (reduce deuda)
2. Se crea un **gasto** en la cuenta fuente (reduce balance)
3. Ambas operaciones son **atómicas** (`runTransaction`)
4. Si no hay cuenta fuente, solo se registra el ingreso en la TC

### Detección de Duplicados

Al enviar el formulario, se buscan transacciones recientes que coincidan. Sistema de puntuación (máx 100):

| Criterio                  | Puntos           |
| ------------------------- | ---------------- |
| Monto exacto              | 40               |
| Misma categoría           | 20               |
| Descripción exacta        | 20 (parcial: 10) |
| Fecha dentro de ±48 horas | 20               |

- **Umbral:** ≥ 60 puntos = posible duplicado → muestra alerta
- Solo compara mismo tipo de transacción
- Retorna máximo 3 coincidencias

### Toggle Paid

Cambia el estado `paid` de una transacción. Impacta el cálculo de balances según el tipo de cuenta.

### Eliminación con Undo

Al eliminar, se muestra un toast con botón "Deshacer" durante unos segundos. Si el usuario no deshace, la eliminación se confirma.

---

## 7. Reglas de Negocio — Cálculo de Balances

### Strategy Pattern por Tipo de Cuenta

#### SavingsAccountStrategy / CashAccountStrategy

```
Balance = initialBalance
        + Σ(ingresos pagados)
        − Σ(gastos pagados)
        − Σ(transferencias salientes pagadas)
        + Σ(transferencias entrantes pagadas)
```

- **Validación de gastos/transferencias:** verifica que haya saldo suficiente

#### CreditCardStrategy

```
CupoDisponible = creditLimit − DeudaUsada

DeudaUsada = max(0, Σ(TODOS los gastos) − Σ(ingresos directos) − Σ(transferencias recibidas))
```

**Reglas clave del crédito:**

- **TODOS los gastos cuentan** (pagados Y no pagados) porque consumen el cupo inmediatamente
- Los pagos (ingresos + transferencias recibidas) reducen la deuda
- `DeudaUsada` nunca es negativa (mínimo 0)
- **Validación de gastos:** verifica cupo disponible
- **Validación de pagos:** no puede pagar más de lo que se debe, no puede pagar con deuda en 0
- **Transferencias FROM crédito:** BLOQUEADAS

### Balance Total

```
BalanceTotal = Σ(balance de cuentas donde includeInTotalBalance = true)
```

- **Incluidas:** savings, cash
- **Excluidas:** credit (representan deuda, no activos)

### Balance Dinámico (con filtros)

- Filtro "todas": balance total (excluye crédito)
- Filtro cuenta específica: balance de esa cuenta
- Label dinámico: cuenta crédito → "Cupo Disponible", otras → "Balance"

---

## 8. Reglas de Negocio — Intereses y Cuotas

### Fórmulas Financieras

**Conversión de Tasa Anual a Mensual (E.A. → E.M.):**

```
i_mensual = (1 + i_EA / 100)^(1/12) − 1
```

**Cuota Fija — Sistema de Amortización Francés:**

```
Cuota = Principal × (i × (1+i)^n) / ((1+i)^n − 1)
```

Donde: `P` = principal, `i` = tasa mensual, `n` = número de cuotas

### Reglas

| Regla                     | Descripción                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **1 cuota = sin interés** | `installments === 1` → `hasInterest = false` siempre                                                          |
| **Tasa 0% con cuotas**    | `cuota = principal / installments`                                                                            |
| **Rango de tasa**         | 0% – 200% E.A.                                                                                                |
| **Rango de cuotas**       | 1 – 60                                                                                                        |
| **Opciones estándar**     | 1, 2, 3, 6, 9, 12, 18, 24, 36, 48, 60 cuotas                                                                  |
| **Redondeo**              | Todos los resultados a 2 decimales                                                                            |
| **Snapshot**              | La tasa de interés se guarda como snapshot en la transacción (no se recalcula si cambia la tasa de la cuenta) |

### Datos Guardados en la Transacción

Cuando una compra tiene intereses:

- `hasInterest: true`
- `installments: N`
- `monthlyInstallmentAmount: cuota mensual`
- `totalInterestAmount: total de intereses`
- `interestRate: tasa E.A. al momento de la compra`

---

## 9. Reglas de Negocio — Categorías

### Categorías por Defecto

**Gastos:** Alimentación, Transporte, Servicios, Vivienda, Salud, Entretenimiento, Educación, Compras Personales, Regalos, Otros

**Ingresos:** Salario, Freelance, Inversiones, Cesantías, Otros

### Categorías Especiales (auto-asignadas)

| Categoría            | Cuándo se asigna                          |
| -------------------- | ----------------------------------------- |
| `"Transferencia"`    | Transacciones tipo `transfer`             |
| `"Pago Crédito"`     | Ingresos a cuentas de crédito            |
| `"Préstamo"`         | Al crear una deuda tipo `lent`            |
| `"Cobro Préstamo"`   | Al registrar un pago de deuda             |

### Reglas

| Regla                    | Descripción                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| **Protegidas**           | Las categorías por defecto NO se pueden eliminar                                                          |
| **Único por tipo**       | No puede haber dos categorías con el mismo nombre dentro del mismo tipo                                   |
| **Eliminación guardada** | No se puede eliminar una categoría que tenga transacciones referenciándola                                |
| **Fusión**               | En modo Firestore, las categorías se fusionan: defaults + creadas por el usuario, deduplicando por nombre |
| **Nombre requerido**     | No se permite nombre vacío                                                                                |

---

## 10. Reglas de Negocio — Pagos Periódicos

### Estado de Pago

Se determina mediante un `Map<"YYYY-M", Set<paymentId>>` pre-computado desde las transacciones con `recurringPaymentId`. La verificación es **O(1)**.

### Próxima Fecha de Vencimiento

```
dueDay = min(payment.dueDay, 28)   // cap a 28 para evitar problemas con meses cortos
Si hoy > fecha de vencimiento del mes actual:
  monthly → próximo mes
  yearly  → próximo año
```

### Días Hasta el Vencimiento

```
días = ⌈(fechaVencimiento − hoy) / 86400000⌉
```

### Estadísticas Computadas

| Estadística          | Definición                                                       |
| -------------------- | ---------------------------------------------------------------- |
| `total`              | Todos los pagos periódicos                                       |
| `active`             | Solo los que tienen `isActive === true`                          |
| `paidThisMonth`      | Activos con transacción registrada este mes                      |
| `pendingThisMonth`   | `active − paidThisMonth`                                         |
| `totalMonthlyAmount` | Suma del `amount` de los activos mensuales                       |
| `totalYearlyAmount`  | Suma del `amount` de los activos anuales                         |
| `upcomingPayments`   | Activos, no pagados este mes, vencimiento en los próximos 7 días |

### Sincronización con Transacciones

- Al crear una transacción vinculada a un pago periódico, si el monto difiere del esperado, se actualiza el monto base del pago periódico automáticamente
- El historial de pagos se rastrea por `recurringPaymentId` en las transacciones

---

## 11. Reglas de Negocio — Préstamos y Deudas

### Tipos de Deuda

| Tipo       | Significado                             | Impacto en balance              |
| ---------- | --------------------------------------- | ------------------------------- |
| `lent`     | Yo presté dinero a alguien ("me deben") | Registra como gasto "Préstamo"  |
| `borrowed` | Alguien me prestó dinero ("yo debo")    | Registra como ingreso           |

### Ciclo de Vida

1. **Creación:** Se registra `originalAmount === remainingAmount`, `isSettled = false`
2. **Pagos parciales:** `registerDebtPayment(debtId, amount)` → decrementa `remainingAmount`
3. **Liquidación automática:** Cuando `remainingAmount <= 0`, se marca `isSettled = true` y se registra `settledAt`
4. **Asociación con transacciones:** Cada pago crea una transacción con `debtId` vinculado

### Categorías Especiales

| Categoría            | Uso                                              |
| -------------------- | ------------------------------------------------ |
| `"Préstamo"`         | Auto-asignada al crear una deuda tipo `lent`     |
| `"Cobro Préstamo"`   | Auto-asignada al registrar un pago de deuda      |

### Estadísticas Computadas

| Estadística          | Definición                                                  |
| -------------------- | ----------------------------------------------------------- |
| `totalLent`          | Suma de `remainingAmount` de deudas activas tipo `lent`     |
| `totalBorrowed`      | Suma de `remainingAmount` de deudas activas tipo `borrowed` |
| `activeLentCount`    | Cantidad de deudas `lent` no saldadas                       |
| `activeBorrowedCount`| Cantidad de deudas `borrowed` no saldadas                   |
| `settledCount`       | Total de deudas completamente saldadas                      |

### Almacenamiento Dual

- **Firestore:** `users/{userId}/debts/{debtId}`
- **localStorage:** `finance_debts` (JSON array)
- Mismo patrón que transacciones y cuentas: CRUD con `userId` guard

---

## 12. Reglas de Negocio — Presupuestos

### Estructura

Un presupuesto define un **límite mensual de gasto** para una categoría específica. Solo se permite **un presupuesto por categoría** (las categorías ya presupuestadas no aparecen en el formulario).

### Cálculo de Estado (BudgetStatus)

```
spent       = Σ gastos del mes actual en esa categoría
remaining   = monthlyLimit − spent
percentage  = (spent / monthlyLimit) × 100
status      = percentage >= 100 → 'exceeded'
            = percentage >= 80  → 'warning'
            = otherwise         → 'ok'
```

### Indicadores Visuales

| Estado     | Color   | Significado                    |
| ---------- | ------- | ------------------------------ |
| `ok`       | Verde   | Gasto dentro del presupuesto   |
| `warning`  | Ámbar   | Gasto ≥ 80% del límite        |
| `exceeded` | Rojo    | Gasto ≥ 100% del límite       |

### Estadísticas Computadas

| Estadística     | Definición                                    |
| --------------- | --------------------------------------------- |
| `active`        | Presupuestos con `isActive === true`          |
| `exceeded`      | Presupuestos con `status === 'exceeded'`      |
| `warning`       | Presupuestos con `status === 'warning'`       |
| `totalBudgeted` | Suma de `monthlyLimit` de todos los activos   |
| `totalSpent`    | Suma de `spent` de todos los activos          |

### Almacenamiento Dual

- **Firestore:** `users/{userId}/budgets/{budgetId}`
- **localStorage:** `finance_budgets` (JSON array)

---

## 13. Reglas de Negocio — Metas de Ahorro

### Ciclo de Vida

1. **Creación:** Se define `targetAmount`, `currentAmount = 0`, `isCompleted = false`
2. **Aportes:** `addSavings(goalId, amount)` → incrementa `currentAmount`
3. **Completado automático:** Cuando `currentAmount >= targetAmount`, se marca `isCompleted = true` y `completedAt`

### Cálculo de Estado (GoalStatus)

```
percentage      = (currentAmount / targetAmount) × 100
remaining       = targetAmount − currentAmount
daysRemaining   = ⌈(targetDate − hoy) / 86400000⌉   (si hay targetDate)
isOverdue       = targetDate < hoy && !isCompleted
suggestedMonthly = remaining / max(monthsRemaining, 1)
```

### Ahorro Mensual Sugerido

Si la meta tiene `targetDate`, se calcula cuánto debería ahorrar mensualmente:

```
mesesRestantes = max(⌈diasRestantes / 30⌉, 1)
sugerido = montoFaltante / mesesRestantes
```

Esto ayuda al usuario a planificar sus aportes.

### Indicadores Visuales

- **Barra de progreso** con porcentaje de avance
- **Fecha vencida (overdue):** badge rojo si la meta no se ha cumplido y la fecha ya pasó
- **Metas completadas:** sección colapsable separada

### Almacenamiento Dual

- **Firestore:** `users/{userId}/savingsGoals/{goalId}`
- **localStorage:** `finance_savingsGoals` (JSON array)

---

## 14. Reglas de Negocio — Estado de Cuenta TC

### Ciclo de Facturación

Para cada tarjeta de crédito con `cutoffDay` y `paymentDay` configurados:

```
Si hoy.día > cutoffDay:
  cicloInicio = mesActual, día cutoffDay + 1
  cicloFin    = mesSiguiente, día cutoffDay
Sino:
  cicloInicio = mesAnterior, día cutoffDay + 1
  cicloFin    = mesActual, día cutoffDay
```

### Fecha de Pago

```
Si paymentDay > cutoffDay:
  paymentDueDate = mes del cicloFin, día paymentDay
Sino:
  paymentDueDate = mes después del cicloFin, día paymentDay
```

### Datos del Estado de Cuenta

| Campo                | Definición                                                    |
| -------------------- | ------------------------------------------------------------- |
| `totalCharges`       | Σ gastos en el período del ciclo                              |
| `totalPayments`      | Σ pagos (ingresos) en el período del ciclo                    |
| `balance`            | `totalCharges − totalPayments`                                |
| `cycleTransactions`  | Lista de transacciones del período, ordenadas por fecha desc  |

### Indicadores de Urgencia

- **Próximo a vencer:** La fecha de pago está a 7 días o menos
- **Vencido:** La fecha de pago ya pasó

---

## 15. Reglas de Negocio — Exportación CSV

### Formato de Archivo

- **Codificación:** UTF-8 con BOM (`\uFEFF`) para compatibilidad con Excel
- **Separador:** Coma (`,`)
- **Nombre de archivo:** `transacciones_YYYYMMDD_HHMMSS.csv`

### Columnas Exportadas

| Columna      | Fuente                                                        |
| ------------ | ------------------------------------------------------------- |
| Fecha        | `date` formateada como `DD/MM/YYYY`                           |
| Tipo         | `income` → Ingreso, `expense` → Gasto, `transfer` → Transferencia |
| Categoría    | `category`                                                    |
| Descripción  | `description`                                                 |
| Monto        | `amount` (con signo negativo para gastos)                     |
| Cuenta       | Nombre de la cuenta (resuelto desde `accountId`)              |
| Estado       | `paid` → Pagada / Pendiente                                   |
| Cuotas       | `installments` (si aplica)                                    |
| Cuota Mensual| `monthlyInstallmentAmount` (si aplica)                        |

### Escapado CSV

- Los campos con comas, comillas o saltos de línea se envuelven en comillas dobles
- Las comillas dentro del campo se duplican (`""`)

---

## 16. Reglas de Negocio — Filtrado y Estadísticas

### Dimensiones de Filtro

1. **Cuenta:** `'all'` o `accountId` específico
2. **Categoría:** `'all'` o nombre de categoría
3. **Rango de fechas:** presets (`all`, `today`, `this-week`, `this-month`, `last-month`, `this-year`, `last-year`, `custom`)
4. **Búsqueda de texto:** filtra por descripción, categoría, monto

### Regla de la Semana

La semana empieza el **domingo** (`getDay() === 0`).

### Gastos Pendientes

Siempre se calculan desde **TODAS las transacciones** (ignoran filtros de fecha). Representan la deuda total en tarjetas de crédito.

### Estadísticas Globales

| Métrica            | Fórmula                                                                              |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Total Ingresos** | Σ(transacciones pagadas tipo income)                                                 |
| **Total Gastos**   | Σ(gastos pagados en todas las cuentas) + Σ(gastos NO pagados en tarjetas de crédito) |
| **Pendientes**     | Σ(deuda usada en todas las cuentas de crédito)                                       |

**Nota:** Los gastos no pagados en tarjetas de crédito se cuentan como gastos realizados porque ya consumieron el cupo.

### Gráficos Disponibles (StatsView)

| Gráfico                     | Descripción                                    |
| --------------------------- | ---------------------------------------------- |
| **CashFlowChart**           | Barras de ingresos vs gastos (últimos 6 meses) |
| **MonthlyComparisonChart**  | Comparativa mes a mes                          |
| **CategoryPieChart**        | Distribución de gastos por categoría (Top 10)  |
| **YearlyTrendChart**        | Tendencia anual de ingresos/gastos             |
| **CreditCardInterestsCard** | Desglose de intereses por tarjeta              |
| **PeriodSummaryCard**       | Resumen con rango de fechas personalizado      |

---

## 17. Autenticación y Almacenamiento Dual

### Modelo Dual

```
userId existe? → Firestore (real-time, cloud sync)
userId null?   → localStorage (offline, sin cuenta)
```

Cada hook de datos soporta ambos modos. La decisión es `userId ? firestore : localStorage` en todas las operaciones.

### Autenticación

- **Único método:** Google Sign-In vía Firebase Auth (`signInWithPopup`)
- **Provider:** `GoogleAuthProvider`
- **Estado:** `useAuth()` escucha `onAuthStateChanged`
- **Logout:** `signOut` + loading screen de 800ms para transición suave

### Firestore — Persistencia Offline

```typescript
initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```

- Soporte multi-tab
- Cache persistente local
- Sincronización automática al reconectar

### Modo Guest (sin login)

- Datos en `localStorage`
- Sin sincronización entre dispositivos
- Sin backup automático
- Funcionalidad completa excepto: backup/import, IA chatbot

---

## 18. Seguridad — Reglas de Firestore

### Principios

- Todo acceso requiere autenticación (`request.auth != null`)
- Cada usuario solo puede leer/escribir sus propios datos (`request.auth.uid == userId`)
- Todo lo demás está denegado (`allow read, write: if false`)

### Validaciones por Colección

#### Transactions

| Operación  | Validaciones                                                                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **create** | `type ∈ ['income','expense','transfer']`, `amount > 0 ∧ ≤ 1B`, `description string ≤ 500`, `category string`, `paid bool`, `accountId string`, `date timestamp`, `createdAt timestamp` |
| **update** | Campos inmutables: `type`, `amount`, `accountId`, `date`. Solo se puede cambiar: `description`, `category`, `paid`, etc.                                                               |
| **delete** | Solo el dueño                                                                                                                                                                          |

#### Accounts

| Operación  | Validaciones                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- |
| **create** | `name string no vacío`, `type ∈ ['savings','credit','cash']`, `isDefault bool`, `initialBalance número entre -1B y 1B` |
| **update** | `type` es inmutable, `name` debe ser no vacío                                                                          |
| **delete** | Solo el dueño                                                                                                          |

#### Categories

| Operación         | Validaciones                                                     |
| ----------------- | ---------------------------------------------------------------- |
| **create**        | `type ∈ ['expense','income']`, `name string entre 1 y 100 chars` |
| **update/delete** | Solo el dueño                                                    |

#### RecurringPayments

| Operación         | Validaciones                                                                                                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **create**        | `name string entre 1 y 200 chars`, `amount > 0 ∧ ≤ 1B`, `category string`, `dueDay int entre 1 y 31`, `frequency ∈ ['monthly','yearly']`, `isActive bool`, `createdAt timestamp` |
| **update/delete** | Solo el dueño                                                                                                                                                                    |

#### Debts

| Operación  | Validaciones                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **create** | `personName string entre 1 y 200 chars`, `type ∈ ['lent','borrowed']`, `originalAmount > 0 ∧ ≤ 1B`, `remainingAmount ≥ 0 ∧ ≤ originalAmount`, `isSettled bool`, `createdAt timestamp`        |
| **update** | `type` y `originalAmount` son inmutables, `personName` debe ser no vacío                                                                                                                     |
| **delete** | Solo el dueño                                                                                                                                                                                |

#### Budgets

| Operación  | Validaciones                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| **create** | `category string entre 1 y 100 chars`, `monthlyLimit > 0 ∧ ≤ 1B`, `isActive bool`, `createdAt timestamp`           |
| **update** | `category` debe ser no vacía                                                                                        |
| **delete** | Solo el dueño                                                                                                       |

#### SavingsGoals

| Operación  | Validaciones                                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **create** | `name string entre 1 y 200 chars`, `targetAmount > 0 ∧ ≤ 1B`, `currentAmount ≥ 0`, `isCompleted bool`, `createdAt timestamp`              |
| **update** | `name` debe ser no vacío, `currentAmount ≥ 0`                                                                                             |
| **delete** | Solo el dueño                                                                                                                             |

---

## 19. Asistente de IA (Gemini)

### Configuración

- **Modelo:** `gemini-2.5-flash` (free tier)
- **SDK:** `@google/genai`
- **Requisito:** Variable de entorno `NEXT_PUBLIC_GEMINI_API_KEY`
- **Solo disponible** para usuarios autenticados

### Acciones Soportadas

| Acción                 | Descripción                                    |
| ---------------------- | ---------------------------------------------- |
| `add_transaction`      | Crear gasto o ingreso desde lenguaje natural   |
| `update_category`      | Re-categorizar una transacción                 |
| `bulk_update_category` | Re-categorizar múltiples transacciones en lote |
| `add_category`         | Crear nueva categoría                          |

### Flujo de Acciones

```
1. Usuario envía mensaje de texto
2. Gemini interpreta y propone acción con datos estructurados
3. Se muestra ActionCard con resumen de la acción propuesta
4. Usuario confirma o rechaza
5. Si confirma → se ejecuta con validaciones de seguridad:
   - Monto > 0 y < 999B
   - Categoría string < 100 chars
   - Cuenta existe
   - Tipo válido
6. Si la categoría no existe, se auto-crea
```

### Contexto Financiero

El chatbot recibe como contexto:

- Lista de cuentas con balances calculados
- Categorías disponibles
- Transacciones recientes
- Formato de moneda COP

### Tracking de Tokens

Cada mensaje muestra el uso de tokens (input/output) con detalles expandibles. El total acumulado se muestra en el header del chat.

---

## 20. Interfaz de Usuario — Componentes

### Componentes de Layout

| Componente      | Descripción                                                                |
| --------------- | -------------------------------------------------------------------------- |
| `Header`        | Barra superior sticky con branding, usuario, theme toggle, menú de ajustes |
| `TabNavigation` | Tabs desktop (4 vistas). Mobile usa bottom nav fijo                        |
| `LoadingScreen` | Pantalla completa animada. Variantes: `default` (carga) y `logout`         |
| `OfflineBanner` | Banner amber fijo cuando no hay conexión                                   |

### Modales

| Modal             | Descripción                                                       | Cierre                     |
| ----------------- | ----------------------------------------------------------------- | -------------------------- |
| `BaseModal`       | Fundamento: backdrop, blur, scroll lock, focus trap, Escape, ARIA | Backdrop + Escape + botón  |
| `AuthModal`       | Login con Google                                                  | Backdrop + Escape          |
| `WelcomeModal`    | Onboarding para usuarios sin cuentas                              | Solo botones (no backdrop) |
| `HelpModal`       | Manual completo con 6 tabs                                        | Backdrop + Escape          |
| `CategoriesModal` | CRUD de categorías con protección de defaults                     | Backdrop + Escape          |

### Componentes Compartidos

| Componente             | Descripción                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `TransactionForm`      | Formulario full-screen para crear transacciones. Soporta crédito con cuotas, vinculación a recurrentes, detección de duplicados |
| `StatsCards`           | 4 KPIs: Balance, Ingresos, Gastos, Pendientes. Toggle de privacidad (ocultar valores)                                           |
| `NotificationSettings` | Banner para gestionar permisos de notificaciones push                                                                           |

### Vistas

| Vista                   | Ruta           | Lazy | Descripción                                              |
| ----------------------- | -------------- | ---- | -------------------------------------------------------- |
| `TransactionsView`      | `transactions` | No   | Lista con filtros, búsqueda, edición inline, undo-delete |
| `AccountsView`          | `accounts`     | Sí   | CRUD de cuentas, drag & drop, jerarquía TC→Banco         |
| `RecurringPaymentsView` | `recurring`    | Sí   | Gestión de suscripciones con alertas de vencimiento      |
| `StatsView`             | `stats`        | Sí   | Dashboard de gráficos y analytics                        |

### Atajos de Teclado

| Atajo    | Acción                  |
| -------- | ----------------------- |
| `Ctrl+N` | Nueva transacción       |
| `Alt+1`  | Vista Transacciones     |
| `Alt+2`  | Vista Cuentas           |
| `Alt+3`  | Vista Periódicos        |
| `Alt+4`  | Vista Estadísticas      |
| `Ctrl+H` | Abrir Ayuda             |
| `Escape` | Cerrar modal/formulario |

---

## 21. Backup y Restauración

### Exportación

- Genera archivo JSON con `transactions`, `accounts`, `categories`, `exportDate`, `version: '1.0'`
- Nombre: `moneytrack_backup_YYYY-MM-DD.json`
- Incluye TODAS las transacciones y cuentas

### Importación

- **Requiere usuario autenticado** (solo Firestore)
- **Estrategias:**
  - `merge`: agrega al contenido existente
  - `replace`: elimina todo y luego importa

### Pipeline de Validación

```
1. Validación estructural: version='1.0', arrays existen, categories tiene expense/income
2. Integridad referencial: cada transacción apunta a una cuenta del backup
3. Categorías desconocidas: producen warnings (no errores)
4. Remapeo de IDs: old account IDs → new Firestore IDs → actualiza referencias en transacciones
5. Batch writes: chunks de 500 operaciones
```

### Progreso

```
0%  → inicio
10% → limpiando datos existentes (solo replace)
30% → datos limpiados
40% → inicio de importación
60% → cuentas importadas
80% → categorías importadas
100%→ transacciones importadas
```

---

## 22. Notificaciones

### Web Push Notifications

- **Permiso:** `Notification.requestPermission()` → `granted`/`denied`/`default`
- **Tipos:**
  - **Vencidas** (0 días o pasado): `requireInteraction: true` para las pasadas
  - **Próximas** (1-3 días): notificación estándar

### Deduplicación

- `localStorage` key: `notification-{paymentId}-{dateString}` → evita múltiples por pago por día
- Tag: `payment-{id}` / `payment-upcoming-{id}` → reemplaza notificaciones anteriores del mismo pago

### Click Handler

Al hacer click en la notificación: `window.focus()` + cierra notificación + redirección opcional

### Estado de Red

- Detecta `online`/`offline` vía eventos del navegador
- Al reconectar: `justReconnected = true` durante 5 segundos
- Toast al desconectar: "Sin conexión..."
- Toast al reconectar: "Conexión restaurada..."

---

## 23. Validaciones

### TransactionValidator

| Validación            | Regla                                            |
| --------------------- | ------------------------------------------------ |
| Descripción           | Máximo 500 caracteres                            |
| Categoría             | Requerida (excepto transfers y pagos de crédito) |
| Destino transferencia | Requerido para tipo `transfer`                   |
| Misma cuenta          | No se puede transferir a la misma cuenta         |
| Monto                 | > 0.01 y ≤ 999,999,999,999                       |
| Strategy validation   | Delegada al tipo de cuenta (balance/cupo)        |

### AccountValidator

| Validación      | Regla                                      |
| --------------- | ------------------------------------------ |
| Nombre          | Requerido (no vacío)                       |
| Cupo crédito    | > 1 y ≤ 1,000,000,000 (solo credit)        |
| Día de corte    | 1-31 (solo credit)                         |
| Día de pago     | 1-31 (solo credit)                         |
| Balance inicial | -1,000,000,000 a 1,000,000,000 (no credit) |
| Modo edición    | Omite validaciones de crédito/balance      |

### CategoryValidator

- Nombre no vacío
- Unicidad dentro del mismo tipo

---

## 24. Formateo y Localización

### Configuración Regional

```typescript
APP_CONFIG = {
  locale: "es-CO",
  currency: "COP",
  timezone: "America/Bogota",
  appName: "MoneyTrack",
  version: "1.0.0",
};
```

### Moneda (Pesos Colombianos)

- Formato: `$1.234.567` (punto como separador de miles)
- Compacto: `1.5M`, `50K`
- Grande: `$1.5B`, `$2.3M`, `$50.0K`

### Números en Input

- Entrada: `1234567` → se muestra como `1.234.567`
- Parseo: `1.234.567` → strip dots → `1234567` → `parseFloat()`
- Decimal: coma `,` como separador decimal (formato colombiano)

### Fechas

- Formato local vía locale `es-CO`
- `parseDateFromInput`: crea Date en **zona horaria local** (evita bugs de UTC offset con `new Date("YYYY-MM-DD")`)
- `formatDateForInput`: → `YYYY-MM-DD` para inputs HTML

### Toast Notifications

| Tipo    | Duración    | Color    |
| ------- | ----------- | -------- |
| Error   | 4000ms      | Rojo     |
| Success | 2000ms      | Verde    |
| Info    | 3000ms      | Default  |
| Warning | 3500ms      | ⚠️ Amber |
| Loading | Persistente | Default  |

---

## 25. Patrones de Diseño Utilizados

| Patrón                   | Dónde se Aplica                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------ |
| **Strategy**             | Cálculo de balances y validación por tipo de cuenta (`accountStrategies.ts`)                     |
| **Factory**              | `AccountStrategyFactory` — mapa estático con `registerStrategy()` para extensibilidad            |
| **Singleton**            | Logger, CurrencyFormatter, FirestoreContext (una instancia de listeners)                         |
| **Observer**             | Firestore `onSnapshot` listeners para sincronización real-time                                   |
| **Provider/Context**     | `FinanceContext`, `FirestoreContext`, `ThemeProvider` → distribución de estado                   |
| **Composite Hook**       | Hooks grandes compuestos de sub-hooks (ej: `useRecurringPayments` = subscription + CRUD + utils) |
| **Dual Storage**         | Cada hook: `userId ? firestore : localStorage`                                                   |
| **Atomic Operations**    | Transfers, pagos de crédito, cambio de default, cascade deletes (`runTransaction`, `writeBatch`) |
| **Batch Operations**     | Eliminación cascada y backup import (chunks de 500)                                              |
| **Pre-computed Lookups** | Estado de pagos periódicos (`Map<monthKey, Set<paymentId>>`)                                     |
| **Barrel Exports**       | Todos los directorios con `index.ts`                                                             |

---

## 26. Casos Borde Manejados

| #   | Caso                                   | Solución                                                                    |
| --- | -------------------------------------- | --------------------------------------------------------------------------- |
| 1   | Meses cortos (febrero, 30 días)        | Día de vencimiento de recurrentes se cap a 28                               |
| 2   | Bug de timezone en fechas              | `parseDateFromInput` crea Date local, no UTC                                |
| 3   | Loading infinito de Firestore          | Timeout de 10 segundos → estado de error                                    |
| 4   | Límite de batch Firestore              | Todas las operaciones batch se dividen en chunks de 500                     |
| 5   | Sobrepago de tarjeta de crédito        | Validación: no puede pagar más que la deuda actual                          |
| 6   | Pago con deuda en 0                    | Bloqueado con mensaje de error                                              |
| 7   | Transferencia desde tarjeta de crédito | Bloqueada completamente                                                     |
| 8   | Eliminación cascada atómica            | Cuenta + todas las transacciones en batched writes                          |
| 9   | Unmount durante async                  | `isMountedRef` previene actualizaciones de estado                           |
| 10  | SSR safety                             | Guards: `typeof window !== 'undefined'`, `typeof navigator !== 'undefined'` |
| 11  | Formato numérico colombiano            | `1.234,56` → strip dots → replace comma → `parseFloat`                      |
| 12  | Deduplicación de notificaciones        | Key en localStorage por pago/día + tag de notificación                      |
| 13  | Listeners Firestore duplicados         | Context Singleton (`FirestoreProvider`) → una sola instancia                |
| 14  | Reconexión de red                      | `justReconnected` flag durante 5s + toasts informativos                     |
| 15  | Firebase config inválida               | Error descriptivo con pasos de remediación en ErrorBoundary                 |

---

## 27. Estructura de Archivos

```
Moneytrack/
├── app/
│   ├── globals.css          # Estilos globales + sistema de componentes CSS
│   ├── layout.tsx           # Root layout (ThemeProvider, fuentes)
│   └── page.tsx             # Página principal (ErrorBoundary + FinanceTracker)
├── src/
│   ├── finance-tracker.tsx  # Componente raíz de la aplicación
│   ├── components/
│   │   ├── ErrorBoundary.tsx
│   │   ├── chat/
│   │   │   └── AIChatBot.tsx             # Asistente IA con Gemini
│   │   ├── layout/
│   │   │   ├── Header.tsx                # Barra superior
│   │   │   ├── TabNavigation.tsx         # Navegación por tabs
│   │   │   ├── LoadingScreen.tsx         # Pantalla de carga
│   │   │   └── OfflineBanner.tsx         # Banner sin conexión
│   │   ├── modals/
│   │   │   ├── BaseModal.tsx             # Modal base reutilizable
│   │   │   ├── AuthModal.tsx             # Login con Google
│   │   │   ├── CategoriesModal.tsx       # CRUD de categorías
│   │   │   ├── HelpModal.tsx             # Manual de ayuda
│   │   │   └── WelcomeModal.tsx          # Onboarding
│   │   ├── shared/
│   │   │   ├── TransactionForm.tsx       # Formulario de transacciones
│   │   │   ├── StatsCards.tsx            # Tarjetas KPI
│   │   │   └── NotificationSettings.tsx  # Config de notificaciones
│   │   ├── theme/
│   │   │   ├── ThemeProvider.tsx          # Provider de tema
│   │   │   └── ThemeToggle.tsx           # Toggle claro/oscuro
│   │   ├── ui/
│   │   │   └── Button.tsx               # Botón reutilizable
│   │   └── views/
│   │       ├── accounts/                # Vista de cuentas
│   │       │   ├── AccountsView.tsx
│   │       │   ├── CreditCardStatementView.tsx  # Estado de cuenta TC
│   │       │   ├── components/          # AccountCard, FormModal, etc.
│   │       │   └── hooks/               # useAccountForm, useDragAndDrop
│   │       ├── budgets/                 # Vista de presupuestos
│   │       │   └── BudgetsView.tsx
│   │       ├── debts/                   # Vista de préstamos/deudas
│   │       │   └── DebtsView.tsx
│   │       ├── goals/                   # Vista de metas de ahorro
│   │       │   └── GoalsView.tsx
│   │       ├── recurring/               # Vista de pagos periódicos
│   │       │   ├── RecurringPaymentsView.tsx
│   │       │   ├── components/          # PaymentCard, FormModal, etc.
│   │       │   └── hooks/               # useRecurringPaymentsView
│   │       ├── stats/                   # Vista de estadísticas
│   │       │   ├── StatsView.tsx
│   │       │   ├── components/          # Charts: CashFlow, Pie, etc.
│   │       │   ├── config/              # chartConfig.ts
│   │       │   └── hooks/               # useStatsData, useCreditCardInterests
│   │       └── transactions/            # Vista de transacciones
│   │           ├── TransactionsView.tsx
│   │           ├── components/          # TransactionItem, Filters, etc.
│   │           ├── hooks/               # useTransactionsView
│   │           └── utils/               # dateUtils.ts
│   ├── config/
│   │   └── constants.ts    # Configuración centralizada
│   ├── contexts/
│   │   ├── FinanceContext.tsx   # Contexto financiero principal
│   │   └── FirestoreContext.tsx # Contexto de Firestore (singleton)
│   ├── hooks/
│   │   ├── useAccounts.ts          # Gestión de cuentas
│   │   ├── useAddTransaction.ts    # Lógica de creación de transacciones
│   │   ├── useAuth.ts              # Autenticación Firebase
│   │   ├── useBackup.ts            # Export/Import de datos
│   │   ├── useBudgets.ts           # Gestión de presupuestos mensuales
│   │   ├── useCategories.ts        # Gestión de categorías
│   │   ├── useCreditCardStatement.ts # Estado de cuenta de TC
│   │   ├── useCSVExport.ts         # Exportación a CSV
│   │   ├── useDebts.ts             # Gestión de préstamos/deudas
│   │   ├── useFilteredData.ts      # Filtrado de datos
│   │   ├── useFirestore.ts         # Integración Firestore
│   │   ├── useGlobalStats.ts       # Estadísticas globales
│   │   ├── useKeyboardShortcuts.ts # Atajos de teclado
│   │   ├── useLocalStorage.ts      # Hook de localStorage
│   │   ├── useNetworkStatus.ts     # Estado de red
│   │   ├── useNotifications.ts     # Notificaciones push
│   │   ├── useRecurringPayments.ts # Pagos periódicos
│   │   ├── useSavingsGoals.ts      # Metas de ahorro
│   │   ├── useTransactions.ts      # CRUD de transacciones
│   │   ├── useWelcomeModal.ts      # Control del modal de bienvenida
│   │   ├── firestore/              # Sub-hooks de Firestore
│   │   │   ├── useAccountsCRUD.ts
│   │   │   ├── useCategoriesCRUD.ts
│   │   │   ├── useFirestoreSubscriptions.ts
│   │   │   └── useTransactionsCRUD.ts
│   │   └── recurring/              # Sub-hooks de recurrentes
│   │       ├── useRecurringCRUD.ts
│   │       ├── useRecurringSubscription.ts
│   │       └── useRecurringUtils.ts
│   ├── lib/
│   │   ├── firebase.ts    # Config de Firebase + Auth
│   │   └── gemini.ts      # Servicio de IA con Gemini
│   ├── types/
│   │   ├── finance.ts     # Todas las interfaces TypeScript
│   │   └── index.ts       # Barrel export
│   └── utils/
│       ├── accountStrategies.ts    # Strategy pattern para cuentas
│       ├── balanceCalculator.ts    # Calculadora de balances
│       ├── duplicateDetector.ts    # Detección de duplicados
│       ├── formatters.ts           # Formateo de moneda/números/fechas
│       ├── interestCalculator.ts   # Cálculo de intereses (French)
│       ├── logger.ts               # Sistema de logging
│       ├── toastHelpers.ts         # Helpers para toast notifications
│       └── validators.ts           # Validadores de transacciones/cuentas
├── firestore.rules          # Reglas de seguridad de Firestore
├── firebase.json            # Config de Firebase CLI
├── next.config.ts           # Config de Next.js
├── tsconfig.json            # Config de TypeScript
├── vitest.config.ts         # Config de Vitest
└── package.json             # Dependencias y scripts
```

---

## 28. Variables de Entorno

```dotenv
# Firebase — Requeridas
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Google Gemini AI — Opcional (habilita el chatbot)
NEXT_PUBLIC_GEMINI_API_KEY=
```

---

## 29. Estado Actual y Deuda Técnica

### Bugs Conocidos

Todos los bugs identificados en auditorías anteriores han sido corregidos:

- ✅ Listeners Firestore duplicados → resuelto con FirestoreContext singleton
- ✅ Fecha sobreescrita en `useAddTransaction` → corregido
- ✅ Stale closure en `useLocalStorage` → corregido
- ✅ Re-render infinito en `TransactionForm` → corregido
- ✅ Backup 'replace' rompía referencias de account IDs → corregido con remapeo de IDs
- ✅ Props muertos → eliminados
- ✅ Código muerto (~3,500 líneas) → eliminado
- ✅ `console.error/warn` → reemplazados por `logger`
- ✅ Runtime type guards en Firestore subscriptions → implementados
- ✅ `any` en `useBackup` → reemplazado por `unknown` + type narrowing
- ✅ Constantes mágicas (`'Transferencia'`, `'Pago Crédito'`) → centralizadas en `constants.ts`
- ✅ Tests movidos de `src/utils/` a `src/__tests__/utils/`
- ✅ CSS monolítico (405 líneas) → modularizado en 3 archivos
- ✅ `dateUtils.ts` reubicado de `components/views/transactions/utils/` a `src/utils/`
- ✅ SVGs no usados eliminados de `public/`

### Mejoras de Arquitectura Sugeridas

1. **Corto plazo:** Aumentar cobertura de tests (componentes UI)
2. **Medio plazo:** `react-query`/`@tanstack/query` para cache de Firestore, PWA
3. **Largo plazo:** Internacionalización (i18n), testing E2E

---

## 30. Glosario

| Término               | Definición                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------ |
| **E.A.**              | Efectiva Anual — tasa de interés anualizada usada en Colombia                              |
| **E.M.**              | Efectiva Mensual — tasa mensual derivada de la E.A.                                        |
| **Cupo**              | Límite de crédito de una tarjeta (`creditLimit`)                                           |
| **Cupo Disponible**   | `creditLimit − deudaUsada`                                                                 |
| **Sistema French**    | Amortización con cuota fija mensual (capital + intereses)                                  |
| **Snapshot**          | Copia del valor al momento de la operación (ej: `interestRate` guardada en la transacción) |
| **Cascade Delete**    | Eliminación de entidad padre + todas las hijas relacionadas                                |
| **Dual Storage**      | Patrón donde cada hook soporta Firestore (auth) y localStorage (guest)                     |
| **Batch Write**       | Escritura atómica de múltiples documentos en Firestore (límite 500 ops)                    |
| **runTransaction**    | Operación atómica de lectura+escritura en Firestore con reintentos                         |
| **Pago Periódico**    | Suscripción o servicio con fecha de vencimiento recurrente                                 |
| **Deuda/Préstamo**    | Dinero prestado a o por otra persona, con seguimiento de pagos parciales                   |
| **Presupuesto**       | Límite mensual de gasto por categoría, con alertas al 80% y 100%                          |
| **Meta de Ahorro**    | Objetivo financiero con monto target, fecha opcional, y seguimiento de aportes             |
| **Estado de Cuenta**  | Vista del ciclo de facturación de una tarjeta de crédito (corte, pago, transacciones)       |
| **Balance Total**     | Suma de balances excluyendo tarjetas de crédito                                            |
| **Gastos Pendientes** | Deuda total usada en tarjetas de crédito                                                   |

---

> **Nota para desarrolladores:** Este documento debe actualizarse con cada cambio significativo en la lógica de negocio. Las reglas de negocio aquí documentadas son la fuente de verdad para entender el comportamiento esperado de la aplicación.
