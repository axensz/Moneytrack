# Formato CSV para importar a MoneyTrack

MoneyTrack importa extractos en **CSV**, **Excel (.xlsx)** y **PDF** (vía IA). Esta guía
documenta el formato CSV recomendado y todo lo que el importador entiende.

## Formato mínimo (siempre funciona)

```
Fecha;Descripcion;Monto
01/06/2026;Compra supermercado;-25000
15/06/2026;Pago nómina;1500000
```

- **Monto negativo** → gasto. **Monto positivo** → ingreso (cuando no hay columna de tipo).
- La primera fila reconocible se usa como encabezado.

## Formato extendido (recomendado)

```
Fecha;Descripcion;Categoria;Tipo;Monto;Moneda;TRM
2026-05-10;Compra Amazon;Compras Personales;Gasto;-99,99;USD;4000
```

Todas las columnas extra son **opcionales**.

### Columnas reconocidas

| Concepto | Encabezados aceptados (con o sin tilde, ES/EN) |
|---|---|
| Fecha | `Fecha`, `Date`, `Fecha Mov`, `F.Mov` |
| Descripción | `Descripcion`, `Descripción`, `Concepto`, `Detalle`, `Referencia`, `Movimiento` |
| Monto unificado | `Monto`, `Valor`, `Importe`, `Amount`, `Vlr` |
| Débito / Crédito (separados) | `Debito`/`Cargo`/`Retiro` y `Credito`/`Abono`/`Ingreso` |
| Tipo / D-C | `Tipo`, `Type`, `D/C`, `Signo`, `Clase` |
| Categoría | `Categoria`, `Categoría`, `Category`, `Rubro` |
| Moneda | `Moneda`, `Divisa`, `Currency` |
| TRM (tasa de cambio) | `TRM`, `Tasa de cambio`, `Exchange rate` |

### Separadores

Se detecta automáticamente: `;` (punto y coma), `,` (coma), tabulador o `|` (pipe).
Los valores entre comillas dobles se respetan.

### Fechas

Formatos soportados:

- `DD/MM/YYYY` y `DD-MM-YYYY` (orden colombiano: día primero)
- `YYYY-MM-DD` (ISO)
- `DD/MM/YY`
- `YYYYMMDD`
- **Mes textual**: `04 may 2026`, `27 MAY 2026`, `4-may-2026` (ES e EN)
- Fechas con hora (`2026-06-01 13:45`) → se ignora la hora

> Nota: `05/04/2026` se interpreta como **5 de abril** (DD/MM). Fechas inválidas
> (p. ej. `32/13/2026`) se descartan.

### Montos

- Formato colombiano: `1.234.567,89` (punto = miles, coma = decimal)
- Formato US: `1,234,567.89`
- Decimal simple: `99,99` o `99.99`
- Con símbolo/código: `COP $ 10.000,00`, `USD $ 99,99`
- Negativos: `-10000` o contable `(10.000)`

### Tipo de movimiento

| Valor en la columna Tipo | Se interpreta como |
|---|---|
| `Gasto`, `expense`, `egreso`, `débito`, `D` | gasto |
| `Ingreso`, `income`, `entrada`, `crédito`, `C`, `abono` | ingreso |
| `Transferencia`, `transfer` | transferencia |

### Categorías

- Si traes `Categoria` y coincide (sin distinguir tildes/mayúsculas) con una de tus
  categorías, **se respeta** y no se sobrescribe.
- Si no, MoneyTrack la deduce por reglas de palabras clave en la descripción.
- Lo que queda en **Otros** puede recategorizarse con IA (opcional, como fallback).

### Transferencias internas y pagos de tarjeta

Descripciones como `Gracias por tu pago`, `Pago PSE Nu`, `Pago Suc Virt TC`,
`Abono Sucursal Virtual`, etc. se detectan como **transferencias** y **se excluyen
de ingresos/gastos en los reportes** (no son movimientos reales). Se desmarcan por
defecto en la vista previa; puedes incluirlas manualmente.

### Moneda extranjera (USD, etc.)

- `Moneda=USD` + `TRM=4000` → se convierte a COP (`amount = monto × TRM`) y se guarda
  el detalle original (`originalAmount`, `originalCurrency`, `exchangeRate`).
- `Moneda=USD` **sin** `TRM` → no se puede convertir: se **excluye** con una
  advertencia. Agrega la columna TRM o edita el movimiento manualmente.
- El balance y los reportes **siempre** trabajan en COP.

### Cuotas

Se detectan en la descripción: `cuota 3 de 12`, `3/12`, `12 cuotas`. Una compra a
cuotas ocupa el cupo de la tarjeta por su **monto total** desde la compra.

## Duplicados

Al importar se detectan duplicados (mismo tipo, día, monto y descripción contra la
cuenta destino). Para **transferencias y pagos de tarjeta** la huella es **monto+día**
(sin descripción), de modo que el mismo pago visto en dos extractos con textos
distintos (`Pago PSE Nu` en el banco vs `Gracias por tu pago` en la tarjeta) se
detecta como duplicado. Los duplicados se excluyen por defecto y pueden incluirse
manualmente.

## Bancos probados

Bancolombia (cuenta y tarjeta), Davivienda, BBVA, Nequi, Nu, Scotiabank Colpatria,
Banco de Bogotá. Para PDF se usa IA (Gemini) y funciona con cualquier banco.
