Card — the base surface for everything in MoneyTrack; wraps content in a rounded-lg white panel with a soft shadow.

```jsx
<Card>Contenido</Card>
<Card variant="stat">Métrica con hover-lift</Card>
<Card variant="balance">Balance total: $4.250.000</Card>
```

Variants: `default` (white, md shadow), `stat` (lifts to lg shadow + violet border on hover — use for metric tiles), `balance` (violet gradient hero for the headline money figure), `flat` (no shadow). 20px padding and 12px radius match the product. Pass any extra style via `style`.
