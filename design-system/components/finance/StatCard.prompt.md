StatCard — the metric tile in the MoneyTrack dashboard summary grid.

```jsx
import { Wallet, TrendingUp, TrendingDown, Calendar } from 'lucide-react';

<StatCard tone="balance" label="Balance" value="$ 4.250.000" icon={Wallet} />
<StatCard tone="income"  label="Ingresos" period="este mes" value="$ 1.250.000" icon={TrendingUp} />
<StatCard tone="expense" label="Gastos"   period="este mes" value="$ 890.000" icon={TrendingDown} />
<StatCard tone="pending" label="Pendientes" value="$ 120.000" icon={Calendar} />
```

Tones: `balance` (violet gradient hero — span 2 cols on desktop), `income` (green chip), `expense` (rose chip), `pending` (amber chip). Pass a preformatted `value` string; figures render with tabular numerals. Lay four out in a `grid` with `gap: var(--space-4)`.
