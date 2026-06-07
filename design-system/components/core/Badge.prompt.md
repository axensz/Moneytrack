Badge — small status pill for transaction states, category tags and counts.

```jsx
import { Clock } from 'lucide-react';

<Badge tone="warning" icon={Clock}>Pendiente</Badge>
<Badge tone="primary">3 cuotas</Badge>
<Badge tone="neutral" square>Mercado</Badge>
```

Tones: `primary` · `success` · `danger` · `warning` · `info` · `neutral` (default). Pass `square` for the tiny inline category tag (4px radius) instead of the default full pill. Optional `icon` Lucide component renders at 11px before the label.
