Button — MoneyTrack's primary action control; use it for every clickable action from form submits to inline list buttons.

```jsx
import { Plus } from 'lucide-react';

<Button variant="primary" icon={Plus}>Agregar transacción</Button>
<Button variant="cancel">Cancelar</Button>
<Button variant="danger" size="sm">Eliminar</Button>
<Button variant="primary" loading>Guardando…</Button>
```

Variants: `primary` (gradient violet, default), `secondary` (flat violet), `cancel` (muted grey), `danger` (red), `ghost` (transparent), `edit` (blue, for inline row actions). Sizes: `sm` · `md` (default) · `lg`. All sizes meet the 44px touch floor on `md`/`lg`. Pass `icon`/`iconRight` Lucide components, `loading` for a spinner, `fullWidth` to stretch.
