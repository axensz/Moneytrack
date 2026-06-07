SegmentedControl — the type selector from the add-transaction form; pick one of 2–3 short options, each able to carry its own semantic color.

```jsx
const [type, setType] = React.useState('expense');

<SegmentedControl
  ariaLabel="Tipo de movimiento"
  value={type}
  onChange={setType}
  options={[
    { value: 'expense', label: 'Gasto', tone: 'danger' },
    { value: 'income', label: 'Ingreso', tone: 'success' },
    { value: 'transfer', label: 'Transferencia', tone: 'info' },
  ]}
/>
```

The active segment adopts its option's `tone` (muted fill + AA text + ring); inactive segments are muted. Renders as an ARIA `radiogroup` with 44px touch targets. Set `fullWidth={false}` for a compact, content-width group. Best for 2–3 options — use a `Select` for longer lists.
