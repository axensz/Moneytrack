Input / Select — labelled form fields with the product's violet focus ring; use for every text and dropdown field.

```jsx
<Input label="Descripción" placeholder="(opcional)" />
<Input label="Monto" defaultValue="89.900" hint="Sin decimales para pesos" />
<Input label="Correo" error="Correo no válido" />

<Select label="Cuenta">
  <option>Bancolombia Ahorros</option>
  <option>Efectivo</option>
</Select>
```

Both are 44px tall (mobile touch floor) and share the muted label + violet focus ring. `Input` takes `hint` (muted helper) or `error` (red border, replaces hint). `Select` renders a chevron and takes `<option>` children.
