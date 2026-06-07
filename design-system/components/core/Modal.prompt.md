Modal — the centered dialog used across MoneyTrack for auth, forms and confirmations; renders a backdrop + card with a title/icon header and an optional footer action row.

```jsx
const [open, setOpen] = React.useState(false);
const { Trash2 } = lucide;

<Button variant="danger" onClick={() => setOpen(true)}>Eliminar cuenta</Button>

<Modal
  open={open}
  onClose={() => setOpen(false)}
  title="¿Eliminar cuenta?"
  subtitle="Esta acción no se puede deshacer."
  icon={Trash2}
  footer={<>
    <Button variant="cancel" onClick={() => setOpen(false)}>Cancelar</Button>
    <Button variant="danger" onClick={confirm}>Eliminar</Button>
  </>}
>
  <p>Se eliminarán todos los movimientos asociados a esta cuenta.</p>
</Modal>
```

Closes on ESC, backdrop click, or the built-in close button (`hideClose` to remove it). Focus moves to the dialog on open. Use `contained` to scope the overlay to a positioned parent for previews. Compose `Button`s in `footer`.
