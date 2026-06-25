# Spec — Extractos de tarjetas (calendario de pagos mes a mes)

**Fecha:** 2026-06-24
**Estado:** Aprobado el diseño, pendiente plan de implementación
**Autor:** Camilo + Claude

---

## 1. Problema

Hoy no hay forma de ver, de un vistazo, **cuánto hay que pagar en las tarjetas de crédito en cada mes**. El usuario quiere algo tipo extracto:

> "debes este mes tanto, el otro mes tanto, y así — y que solo aparezcan los meses donde tienes deuda."

Lo que reparte deuda a lo largo de varios meses son las **compras a cuotas** (`installments`): una compra a 12 cuotas implica una cuota distinta cada mes. Hoy esa proyección no se muestra en ningún lado.

El hook `useCreditCardStatement` ya existe pero (a) solo calcula el **ciclo actual** de cada tarjeta y (b) **no está conectado a ninguna UI**.

## 2. Objetivo

Una vista de **calendario de pagos** de tarjetas: línea de tiempo mes a mes con
- meses **pasados** (estado pagado / parcial / pendiente),
- mes **actual** resaltado,
- **proyección futura** de cuotas,
- y **solo los meses con deuda** (los meses sin monto se omiten).

Disparada por un **botón "Extractos"** en la vista Cuentas, que abre un **modal** con el calendario consolidado (todas las tarjetas) y desglose por tarjeta.

## 3. No-objetivos (YAGNI)

- **No** se registran pagos desde esta vista. Es solo lectura/visualización.
- **No** incluye préstamos a personas (`Debt`). Decidido: alcance = cuotas + periódicos de tarjeta.
- **No** cambia el modelo de datos, Firestore rules ni índices.
- **No** es una fila de botones de acción (Depositar/Enviar/etc.). Un solo botón "Extractos". Si en el futuro hay más acciones, se arma la fila entonces.
- **No** proyecta periódicos al infinito: la proyección futura tiene un horizonte acotado (ver §5.4).

## 4. Decisiones de diseño (resueltas)

| Tema | Decisión |
|------|----------|
| Alcance temporal | Futuro **+** histórico (pasado con estado pagado/parcial/pendiente). |
| Ubicación | Botón "Extractos" en vista **Cuentas** → abre **modal** (`BaseModal`). |
| Contenido | **Cuotas** de tarjetas (proyectadas) **+ periódicos** asignados a la tarjeta (solo en meses futuros). |
| Estilo botón | Pill con icono (`Receipt`), tema morado, junto a "Nueva Cuenta". |
| Agrupación de meses | Por **mes calendario de la fecha de pago** (`paymentDueDate`) — "este mes pagas $X". |

## 5. Modelo de cálculo

Nuevo **hook puro** (sin React-Firebase; testeable):

```ts
useCardPaymentSchedule(
  accounts: Account[],
  transactions: Transaction[],   // DEBE ser balanceTransactions (historial completo)
  recurringPayments: RecurringPayment[],
  now?: Date                      // inyectable para tests deterministas
): MonthGroup[]
```

### 5.1 Fuente de datos: historial COMPLETO

Se debe alimentar con `balanceTransactions` (vía `useTransactionDomain()`), **no** con `transactions` (la ventana paginada de 500). Una compra a cuotas vieja puede estar fuera de las 500 más recientes; usar la ventana paginada subreportaría cuotas. Esto está documentado en la auditoría (`balance-pagination-corruption`) y aplica a **todo lector nuevo** de transacciones de tarjeta.

> Nota: si más adelante se quiere blindar aún más, existe `useCreditCardTransactions` que hace un fetch dirigido del historial de TC. Para esta vista `balanceTransactions` es suficiente y ya está disponible en el árbol de Cuentas.

### 5.2 Ciclos de facturación

Se generaliza la lógica de `getCycleDates` (hoy solo ciclo actual) a **cualquier ciclo**, indexado por entero relativo al ciclo actual:

- `index = 0` → ciclo actual (el que cierra en el próximo corte).
- `index < 0` → ciclos pasados; `index > 0` → futuros.

Cada ciclo produce `{ cycleStart, cycleEnd, paymentDueDate }`, con el día acotado al último día real del mes (reusar `effectiveDueDay` / `lastDayOfMonth` de `recurringDates.ts` para fin de mes: corte/pago día 31 en febrero → 28/29).

`cycleIndexOf(date)` → índice del ciclo cuya ventana `[cycleStart, cycleEnd]` contiene `date` (para ubicar la primera facturación de cada compra).

### 5.3 Monto de un ciclo para una tarjeta (`statementTotal`)

Toda transacción de gasto se trata uniformemente como cuotas (compra de contado = `installments = 1`):

- `firstIndex = cycleIndexOf(tx.date)` — ciclo donde se factura la cuota 1.
- La compra aporta a un ciclo `t` si `(t - firstIndex) ∈ [0, installments)`.
- Monto aportado = `monthlyInstallmentAmount ?? amount` (para `installments > 1`) o `amount` (contado).
- Número de cuota mostrado = `(t - firstIndex) + 1`.

`statementTotal(card, index)` = suma de los aportes de todas las compras activas en ese ciclo.

Compras de contado (`installments = 1`) solo aportan a su propio ciclo (`t == firstIndex`), naturalmente cubierto por la regla `[0, 1)`.

### 5.4 Periódicos de la tarjeta

Pagos `RecurringPayment` con `accountId === card.id`, `isActive`, sumados **solo en meses futuros** (`index > 0`):
- `monthly` → cada ciclo futuro.
- `yearly` → solo el ciclo cuyo mes coincide con el mes ancla (`getYearlyAnchorMonth`).

En meses **pasados/actual** los periódicos ya se reflejan como transacciones reales en la tarjeta (al marcarlos pagados se crea una `Transaction`), así que **no se suman aparte** para evitar doble conteo.

### 5.5 Estado de pago (solo `index <= 0`)

`payments(card, index)` = Σ de pagos hacia la tarjeta (`income` en la tarjeta + `transfer` con `toAccountId == card.id`) con fecha en la **ventana de pago** del ciclo: `(cycleEnd, nextCycleEnd]`.

- `paid`     → `payments >= statementTotal - ε`
- `pending`  → `payments == 0`
- `partial`  → `0 < payments < statementTotal`
- `projected`→ ciclos futuros (`index > 0`), sin estado.

> `// ponytail: heurística — los pagos no están etiquetados a un ciclo concreto;`
> `// un pago puede cubrir parte de otro ciclo. Suficiente para visualización.`
> `// Upgrade path: etiquetar pagos a su ciclo (como recurringCycle) si se necesita exactitud.`

### 5.6 Rango de meses (horizonte)

- **Pasado:** hasta 6 ciclos previos con `statementTotal > 0`. `// ponytail: tope 6; configurable si se pide.`
- **Futuro:** hasta el último ciclo con alguna cuota viva. Si la tarjeta solo tiene periódicos (sin cuotas vivas), extender hasta +3 ciclos. Tope duro: +12 ciclos.
- Se **omite** cualquier mes cuyo total sea 0.

### 5.7 Agrupación consolidada

Bucket por **mes calendario de `paymentDueDate`** (`YYYY-MM`). Varias tarjetas con cortes distintos caen en el mismo bucket si pagan el mismo mes. `total` del mes = Σ de `statementTotal` de las tarjetas de ese bucket.

**`isCurrent`** = el bucket cuyo `monthKey` es el mes calendario de `now` (lo que el usuario llama "este mes"). Es independiente del estado de pago: un bucket puede ser "actual" y aun así contener una mezcla de tarjetas con distinto estado. El **estado** (§5.5) es por tarjeta/ciclo, no por bucket; el bucket solo se usa para etiqueta de mes, total y resaltado.

## 6. Tipos

```ts
interface CardMonthPayment {
  cardId: string;
  cardName: string;
  statementTotal: number;          // monto a pagar de esta tarjeta ese mes
  paidAmount: number;              // pagos aplicados (para "parcial")
  status: 'paid' | 'partial' | 'pending' | 'projected';
  installmentItems: { description: string; cuota: number; total: number; amount: number }[];
  recurringItems: { name: string; amount: number }[];
  cycleStart: Date;
  cycleEnd: Date;
  paymentDueDate: Date;
}

interface MonthGroup {
  monthKey: string;                // 'YYYY-MM' de la fecha de pago
  label: string;                   // 'Julio 2026'
  total: number;                   // Σ statementTotal de todas las tarjetas
  isCurrent: boolean;              // bucket que contiene el pago del ciclo actual
  isFuture: boolean;
  cards: CardMonthPayment[];
}
```

## 7. UI

### 7.1 Botón disparador
- Componente: botón "Extractos" con icono `Receipt`, estilo pill morado, en el header de `AccountsView` junto a "Nueva Cuenta" (o sobre `CreditCardsConsolidatedSummary`).
- Solo visible si hay ≥1 tarjeta de crédito.
- `onClick` → abre el modal.

### 7.2 Modal `CardStatementsModal`
- Reusa `BaseModal` (accesibilidad/foco ya resueltos).
- Título: "Extractos de tarjetas".
- Selector: **Todas** / una tarjeta específica (filtra `MonthGroup[]`).
- Lista de `MonthPaymentRow` ordenada ascendente por `monthKey`.

### 7.3 `MonthPaymentRow`
- Cabecera: `label` del mes + `total`. Si `isCurrent` → resaltado (borde/fondo morado). El badge de estado **no** va en la cabecera (un bucket puede mezclar estados); va por tarjeta.
- Expandible → desglose por tarjeta (`CardMonthPayment`): nombre, monto, badge de estado de esa tarjeta, y notas:
  - badge: `pagado` (verde) / `parcial` (ámbar, "pagaste X de Y") / `pendiente` (rojo) / `proyectado` (gris/morado tenue).
  - notas: "Visa: cuota 3/12", "Netflix (periódico)".
- Respeta `hideBalances` (`••••••`), `formatCurrency`, dark mode y los patrones visuales existentes (gradientes morados, `rounded-xl`, etc.).
- Estado vacío: si no hay meses con deuda → mensaje "No tienes pagos de tarjeta pendientes".

## 8. Archivos (estimado)

| Archivo | Acción |
|---------|--------|
| `src/hooks/useCardPaymentSchedule.ts` | Nuevo — hook puro de cálculo. |
| `src/components/views/accounts/components/CardStatementsModal.tsx` | Nuevo — modal + filas. |
| `src/components/views/accounts/AccountsView.tsx` | Editar — botón "Extractos" + estado open/close + render del modal; pasar `balanceTransactions` y `recurringPayments`. |
| `src/__tests__/hooks/useCardPaymentSchedule.test.ts` | Nuevo — tests del hook. |

Posible refactor menor: extraer la lógica de ciclo de `useCreditCardStatement` (`getCycleDates`) a una util pura compartida para no duplicarla. Solo si encaja limpio; sin refactor especulativo.

## 9. Pruebas (hook puro, sin frameworks extra — Vitest ya está)

1. Cuota de compra a N meses cae en los meses correctos (cuota k en ciclo k).
2. Compra de contado solo aparece en su propio ciclo.
3. Meses sin deuda se omiten del resultado.
4. Estado: `paid` (pago ≥ total), `partial` (0 < pago < total), `pending` (pago 0), `projected` (futuro).
5. Periódico de tarjeta se suma solo a meses futuros, no a pasados (no doble conteo).
6. Fin de mes: corte/pago día 31 en febrero → 28/29 (vía `effectiveDueDay`).
7. Historial completo: una cuota cuya compra está fuera de las 500 recientes sigue proyectándose (se prueba pasando el set completo).
8. Consolidado: dos tarjetas que pagan el mismo mes se suman en el mismo bucket.

## 10. Riesgos / limitaciones conocidas

- **Estado pagado/parcial es heurístico** (§5.5): los pagos no se etiquetan por ciclo. Aceptable para visualización; documentado en el código.
- **Horizonte de periódicos** acotado arbitrariamente (+3 / tope +12). Configurable luego.
- **Cortes muy irregulares** (cambios de `cutoffDay` en el tiempo) no se modelan; se asume `cutoffDay`/`paymentDay` actuales para todos los ciclos. Igual que el `useCreditCardStatement` actual.
