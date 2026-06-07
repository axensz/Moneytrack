ProgressBar — the credit-usage / quota meter from MoneyTrack; a gradient bar on a tinted track with an optional caption row.

```jsx
<ProgressBar value={1310000} max={4000000} label="Cupo utilizado" detail="$ 1.310.000 / $ 4.000.000" autoWarn />

<ProgressBar value={72} max={100} tone="success" label="Meta de ahorro" detail="72%" />
```

`autoWarn` flips the fill orange→rose once usage passes `warnAt` (default 0.8) — used for credit-limit warnings. Tones: `primary` (violet, default), `success`, `warning`. Pass `label`/`detail` for the caption row; the bar exposes a `progressbar` ARIA role.
