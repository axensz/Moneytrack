TransactionRow — a single movement in the MoneyTrack transactions list; compose many inside a `.mt-scroll-thin` column with date headers.

```jsx
import { CreditCard, ArrowRightLeft, Clock } from 'lucide-react';

<TransactionRow
  type="expense"
  icon={CreditCard}
  description="Mercado Éxito"
  account="Bancolombia Crédito"
  category="Mercado"
  date="5 jun 2026"
  amount="89.900"
  badges={[{ label: 'Pendiente', tone: 'warning', icon: Clock }, { label: '3 cuotas', tone: 'primary' }]}
/>

<TransactionRow type="income" icon={CreditCard} description="Salario" account="Bancolombia Ahorros" category="Salario" date="1 jun" amount="3.200.000" />
<TransactionRow type="transfer" icon={ArrowRightLeft} description="Pago tarjeta" account="Ahorros → Crédito" amount="500.000" />
```

`type` drives the icon tint and the amount sign/color (income green `+`, expense rose `−`, transfer blue `→`). Pass preformatted `amount`/`date` strings. `badges` appends state chips (uses the Badge tones).
