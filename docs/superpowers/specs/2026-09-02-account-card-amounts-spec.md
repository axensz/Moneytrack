# Spec — Modelo de Presentación de Montos en Cards de Cuenta (The Confident Ledger)

- **Fecha:** 2026-09-02
- **Estado:** Propuesta de diseño y especificación (Ready for Review)
- **Contexto:** MoneyTrack — `AccountsView`, `AccountCard`, `CreditCardsConsolidatedSummary`
- **North Star:** *"The Confident Ledger"* (PRODUCT.md) / *"Sistema Visual"* (DESIGN.md)

---

## 1. Problema

Actualmente, la visualización de cantidades y estados en las tarjetas de cuenta ([AccountCard.tsx](file:///c:/Users/camilo.guzman_pragma/Desktop/Moneytrack/src/components/views/accounts/components/AccountCard.tsx)) y en el resumen consolidado ([CreditCardsConsolidatedSummary.tsx](file:///c:/Users/camilo.guzman_pragma/Desktop/Moneytrack/src/components/views/accounts/components/CreditCardsConsolidatedSummary.tsx)) presenta 7 fallas de consistencia, semántica y privacidad:

1. **Falso éxito visual en tarjetas copadas o sobregiradas:**
   En `AccountCard`, el color del saldo principal usa `balance < 0 ? 'text-destructive' : 'text-success'`. Dado que en tarjetas de crédito el cupo disponible está acotado por `Math.max(0, limit - used)`, el monto jamás es `< 0`. En consecuencia, cuando una tarjeta tiene $0 disponible (cupo 100% agotado) o está sobregirada, el `$ 0` se renderiza en **verde brillante (`text-success`)**, sugiriendo falsamente un estado positivo.
2. **Cero en cuentas de débito/efectivo pintado en verde:**
   Un saldo de `$ 0` exacto en cuentas de ahorro o efectivo se evalúa como `text-success` en lugar de un tono neutro.
3. **Fuga visual de endeudamiento en Modo Privacidad (`hideBalances`):**
   Al activar `hideBalances`, las cifras se enmascaran (`••••••`), pero la barra de porcentaje de uso de `CreditCardInfo` sigue dibujando su ancho real (`width: ${usagePercentage}%`) y su color de alerta (`bg-warning`), permitiendo inferir visualmente el nivel de deuda del usuario.
4. **Riesgo de `$ NaN` ante límites indefinidos:**
   En tarjetas de crédito, `creditLimit` se asume presente (`account.creditLimit!`), pero el tipo `Account` lo declara opcional. Si falta o es nulo, `Intl.NumberFormat` formatea `NaN` como `$ NaN`.
5. **Incumplimiento del token tipográfico de `DESIGN.md`:**
   Los montos numéricos carecen de la clase `font-mono`, incumpliendo la regla de diseño que exige fuentes monoespaciadas para cifras y montos tabulares.
6. **Deficiencia de accesibilidad (WCAG 2.1 AA) en cifras enmascaradas:**
   El string literal `••••••` no cuenta con un `aria-label="Saldo oculto"`, causando que los lectores de pantalla vocalicen caracteres ambiguos o silencios.
7. **Divergencia de cálculo en Disponible Consolidado:**
   El resumen consolidado calcula `totalAvailable = Math.max(0, totalLimit - totalUsed)`, lo que provoca que una tarjeta con sobrecupo reste artificialmente el cupo disponible de otra tarjeta independiente.

---

## 2. El Mejor Modelo: `AccountBalancePresentationModel`

Para erradicar la lógica condicional dispersa en los componentes JSX, el mejor modelo arquitectónico es el patrón **Presentation Model** (o State Machine de Presentación Financiera) desacoplado en una función pura y testeable.

```
┌────────────────────────────────────────────────────────┐
│               Account Domain State                     │
│  (Account, balance, creditUsed, creditAuthority, ...)  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│       getAccountBalancePresentation(params)            │
│  - Determina estado exacto (State Machine)             │
│  - Aplica reglas de The Confident Ledger               │
│  - Resuelve semántica de color (verde, neutro, rojo)   │
│  - Aplica políticas de privacidad y a11y               │
│  - Aplica fallbacks defensivos contra NaN              │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            AccountBalancePresentation                  │
│  (Objeto inmutable consumido limpiamente por la UI)    │
└────────────────────────────────────────────────────────┘
```

### 2.1 Contrato del Modelo (TypeScript)

```typescript
export type BalanceVisualTone = 'success' | 'destructive' | 'warning' | 'neutral' | 'muted';

export interface CreditBreakdownPresentation {
  usedAmount: number;
  limitAmount: number;
  formattedUsed: string;
  formattedLimit: string;
  usagePercentage: number;
  isHighUsage: boolean;
  isOverLimit: boolean;
  progressBarWidth: string; // '0%' si hideBalances = true
  progressBarTone: 'primary' | 'warning' | 'destructive';
}

export interface AccountBalancePresentation {
  primaryLabel: string;             // 'Saldo disponible' | 'Cupo disponible'
  formattedAmount: string;          // '$ 1.250.000' | '••••••'
  accessibleAmountLabel: string;    // 'Saldo disponible: $ 1.250.000' | 'Saldo oculto por privacidad'
  tone: BalanceVisualTone;          // 'success' | 'destructive' | 'warning' | 'neutral'
  isSettling: boolean;              // true si está calculando el ledger
  isUnreconciled: boolean;          // true si !creditAuthority.ready
  unreconciledBadgeText?: string;   // 'Por conciliar'
  credit?: CreditBreakdownPresentation;
}
```

### 2.2 Matriz de Estados (State Machine)

| Tipo de Cuenta | Condición de Datos | Tono Visual (`tone`) | Etiqueta / Texto Mostrado | Color Barra TC |
|---|---|---|---|---|
| **Ahorros / Efectivo** | `balance > 0` | `success` | `$ {balance}` | N/A |
| **Ahorros / Efectivo** | `balance === 0` | `neutral` | `$ 0` | N/A |
| **Ahorros / Efectivo** | `balance < 0` | `destructive` | `-$ {balance}` | N/A |
| **Ahorros / Efectivo** | `balanceSettling = true` | `muted` | `<BalanceSettling />` ("Calculando…") | N/A |
| **Tarjeta de Crédito** | `!creditAuthority.ready` | `warning` | `"Por conciliar"` + Banner | N/A |
| **Tarjeta de Crédito** | `creditUsed > creditLimit` (Sobrecupo) | `destructive` | `$ 0` (Disponible) + Alerta Sobrecupo | `bg-destructive` |
| **Tarjeta de Crédito** | `creditUsed === creditLimit` (Agotado) | `warning` | `$ 0` (Disponible) | `bg-warning` |
| **Tarjeta de Crédito** | `creditUsed > 0.8 * creditLimit` (Uso > 80%) | `warning` | `$ {disponible}` | `bg-warning` |
| **Tarjeta de Crédito** | `creditUsed <= 0.8 * creditLimit` (Uso normal) | `success` | `$ {disponible}` | `bg-primary` |

---

## 3. Especificación de Requisitos y Escenarios (OpenSpec Format)

### Requirement: Semántica de color estricta para cantidades monetarias
El color de los montos DEBE transmitir fielmente el estado financiero del usuario según `PRODUCT.md` y `DESIGN.md`.

#### Scenario: Tarjeta de crédito con cupo agotado ($0 disponible)
- **WHEN** una tarjeta de crédito válida tiene `creditUsed === creditLimit`
- **THEN** el disponible `$ 0` DEBE renderizarse con tono `text-warning` y la barra de progreso DEBE mostrar `bg-warning`
- **AND** NO DEBE mostrarse en tono `text-success`.

#### Scenario: Tarjeta de crédito en sobrecupo (`creditUsed > creditLimit`)
- **WHEN** una tarjeta de crédito tiene una deuda que excede su límite
- **THEN** el disponible DEBE mostrarse en tono `text-destructive` y la barra de progreso DEBE usar `bg-destructive`.

#### Scenario: Cuenta de ahorro o efectivo con saldo en ceros exactos
- **WHEN** una cuenta de ahorro o efectivo tiene un saldo de `0`
- **THEN** el valor `$ 0` DEBE mostrarse en tono neutro (`text-foreground`) y NO en `text-success`.

---

### Requirement: Protección total de privacidad en modo `hideBalances`
La activación del modo incógnito NO DEBE filtrar información cuantitativa ni proporcional a observadores externos.

#### Scenario: Barra de uso de tarjeta de crédito con privacidad activa
- **WHEN** `hideBalances` es `true`
- **THEN** el estilo de ancho de la barra de progreso individual DEBE fijarse en `width: 0%`
- **AND** la barra DEBE contar con `aria-hidden="true"`.

#### Scenario: Montos enmascarados accesibles
- **WHEN** `hideBalances` es `true`
- **THEN** el texto visible DEBE ser `••••••`
- **AND** el elemento DEBE contener un `aria-label` descriptivo indicando `"Saldo oculto por privacidad"`.

---

### Requirement: Tipografía Monoespaciada en cifras monetarias
Todas las cifras, montos y límites DEBEN utilizar la pila tipográfica monoespaciada para mantener la alineación tabular de columnas.

#### Scenario: Renderizado de importes en AccountCard
- **WHEN** se renderiza el saldo principal, cupo utilizado o límite en `AccountCard`
- **THEN** los elementos numéricos DEBEN incluir la clase `font-mono`.

---

### Requirement: Prevención de valores `NaN` y datos huérfanos
El sistema DEBE ser tolerante a propiedades omitidas en cuentas de crédito y a inconsistencias de llaves foráneas.

#### Scenario: Tarjeta sin `creditLimit` explícito
- **WHEN** un objeto `Account` de tipo `credit` tiene `creditLimit = undefined`
- **THEN** el modelo DEBE aplicar un fallback de `0`, previniendo que `formatCurrency` produzca `"$ NaN"`.

#### Scenario: Tarjeta de crédito con `bankAccountId` inexistente
- **WHEN** una tarjeta de crédito tiene un `bankAccountId` que no corresponde a ninguna cuenta activa
- **THEN** la vista de cuentas DEBE promover automáticamente la tarjeta a la lista principal (`mainAccounts`) para evitar que quede oculta o inaccesible.

---

### Requirement: Cálculo exacto del disponible consolidado
El disponible total del resumen consolidado DEBE representar la capacidad de compra combinada real de las tarjetas.

#### Scenario: Tarjetas con estados asimétricos de sobrecupo
- **WHEN** se calcula el resumen consolidado de tarjetas de crédito
- **THEN** `totalAvailable` DEBE calcularse como la suma de los disponibles individuales (`Σ Math.max(0, limit_i - used_i)`), impidiendo que la deuda en sobrecupo de un banco absorba el cupo disponible de otro.

---

## 4. Plan de Archivos a Modificar

1. **Nuevo helper puro:** `src/components/views/accounts/utils/accountBalancePresentation.ts`
   - Implementa `getAccountBalancePresentation(account, options)`.
   - 100% cubierto por pruebas unitarias sin dependencias de DOM.
2. **Componente Card:** [AccountCard.tsx](file:///c:/Users/camilo.guzman_pragma/Desktop/Moneytrack/src/components/views/accounts/components/AccountCard.tsx)
   - Adopta `getAccountBalancePresentation`.
   - Aplica `font-mono`, `aria-label` y `hideBalances ? '0%' : width`.
3. **Vista Cuentas:** [AccountsView.tsx](file:///c:/Users/camilo.guzman_pragma/Desktop/Moneytrack/src/components/views/accounts/AccountsView.tsx)
   - Corrige la suma de `totalAvailable` en `creditCardSummary`.
   - Corrige el filtro de `mainAccounts` para adoptar tarjetas huérfanas.
4. **Pruebas Automatizadas:**
   - `src/__tests__/views/accounts/accountBalancePresentation.test.ts` (pruebas de matriz de estados, privacidad, prevención de NaN y límites).
