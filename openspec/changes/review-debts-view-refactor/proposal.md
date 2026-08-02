## Why

La refactorización de `DebtsView` separó la tarjeta de deuda, el formulario de alta y la programación de pagos en archivos feature-locales. Como el cambio fue integrado antes de contar con un OPSX propio, falta un contrato explícito que permita comprobar que la reorganización conserva la experiencia visible y los flujos financieros actuales.

## What Changes

- Documentar la separación existente entre el contenedor `DebtsView`, `DebtCard`, `NewDebtForm`, `PaymentScheduleFields` y sus utilidades feature-locales.
- Definir una matriz de revisión visual para la vista de Deudas: resumen, estados vacíos, alta, tarjetas activas, paneles inline, vencimientos, deudas saldadas y confirmación de borrado.
- Verificar en la aplicación real que la extracción no produjo regresiones de jerarquía, espaciado, desbordamiento, contenido condicional, modo oscuro o interacción.
- Registrar hallazgos con evidencia y severidad antes de proponer cualquier corrección adicional.
- No cambiar cálculos, persistencia, contratos públicos, dependencias, navegación ni diseño visual.

## Capabilities

### New Capabilities

- `debts-view-continuity`: Define el contrato de continuidad funcional y visual que debe cumplir la vista de Deudas después de una refactorización interna.

### Modified Capabilities

Ninguna. El cambio documenta y verifica comportamiento existente; no introduce requisitos nuevos al producto.

## Impact

El alcance se limita a `src/components/views/debts/**`, sus pruebas enfocadas y los artefactos OPSX de esta revisión. La validación visual desktop comenzó en la pestaña local de Vivaldi y se completó con una re-verificación mediante la extensión de Chrome; no se rediseñará la experiencia móvil. El comportamiento de datos, Firestore, modo invitado, cálculos financieros y dependencias queda fuera de alcance.
