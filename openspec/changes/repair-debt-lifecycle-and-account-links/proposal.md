## Why

MoneyTrack no puede eliminar de forma confiable ciertos préstamos porque la liberación compartida de `accountOperationLock` conserva `acquiredAt` mediante `set(..., { merge: true })`, mientras las reglas desplegadas solo aceptan `id`, `kind` y `releasedAt`. La reproducción con “Isabella — Celular” terminó en `permission-denied`; el préstamo, su transacción y el total de $5.901.500 fueron restaurados sin pérdida parcial, pero el mismo protocolo también puede bloquear operaciones de cuentas y hoy el error solo aparece en la consola.

Además, crear préstamos y registrar pagos separa la deuda, la transacción y el efecto sobre la cuenta en escrituras que pueden divergir; no se pueden eliminar préstamos saldados ni reasignar su cuenta. El árbol npm resuelto también mantiene 17 alertas Dependabot abiertas, por lo que este cambio debe restablecer conjuntamente la confianza del registro financiero y su línea base de dependencias.

## What Changes

- Corregir una sola vez el protocolo compartido de liberación de `accountOperationLock` sin relajar las reglas de Firestore, cubriendo préstamos, eliminación de cuentas, fusión de tarjetas y cambio de cuenta predeterminada.
- Mostrar al usuario los fallos de las operaciones afectadas y conservar el estado anterior cuando una mutación no se complete.
- Hacer atómicas la creación, el pago y la eliminación de préstamos junto con sus transacciones vinculadas y efectos sobre balances o `usedCredit`.
- Permitir eliminar préstamos activos y saldados, revirtiendo en la misma operación todos los efectos vinculados para dejar las cuentas como si el préstamo no hubiese existido.
- Permitir cambiar la cuenta asociada: mover la operación original y el efecto del saldo pendiente a la nueva cuenta, manteniendo cada pago histórico en la cuenta desde la que realmente se realizó.
- Actualizar las dependencias directas y transitivas necesarias para eliminar las 17 alertas actuales y cualquier vulnerabilidad adicional reportada por `npm audit`, sin incorporar paquetes de runtime al manifest/árbol del frontend raíz; la única dependencia nueva permitida en ese paquete es la dependencia oficial de desarrollo para probar reglas en el emulador.
- Agregar pruebas enfocadas contra las reglas reales mediante el emulador, además de regresiones financieras y verificación proporcional en navegador.

No se rediseñará la vista de Deudas, no se reescribirán pagos históricos durante una reasignación, no se debilitará la autorización owner-scoped de Firestore y no se introducirá un servidor de Next.js. La aplicación seguirá siendo una exportación estática y los cambios visuales se limitarán a acciones, confirmaciones y mensajes necesarios para operar estos flujos.

## Capabilities

### New Capabilities

- `account-operation-integrity`: define el protocolo válido de adquisición y liberación de bloqueos de cuenta, la recuperación sin estado parcial y la visibilidad de errores en todas sus operaciones consumidoras.
- `debt-lifecycle-integrity`: define la atomicidad de creación, pagos, eliminación y reasignación de cuenta, incluyendo transacciones vinculadas, balances, cupo usado e historial contable.
- `dependency-security-baseline`: define versiones mínimas seguras, resolución transitiva, ausencia de vulnerabilidades conocidas y validación del build estático.

### Modified Capabilities

Ninguna. Los contratos actuales de shell responsive y del asistente IA no cambian.

## Impact

- Datos y persistencia: hooks de deudas y cuentas, orquestación compartida de Firestore, transacciones vinculadas, `usedCredit`, reglas y pruebas del emulador.
- Interfaz: acciones de editar/eliminar en préstamos activos y saldados, confirmaciones y toasts; aplica a desktop y móvil sin cambiar navegación ni diseño general.
- Dependencias: `package.json` y `package-lock.json`, con actualización segura de Next.js, PostCSS, sharp, brace-expansion, js-yaml y protobufjs.
- Sistemas: Firebase/Firestore conserva sus reglas estrictas; Next.js continúa con `output: 'export'`, imágenes sin optimización de servidor y despliegue en GitHub Pages.
- Validación: pruebas enfocadas y completas, emulador de Firestore, typecheck, lint, build, `npm audit` y verificación en Chrome con un préstamo descartable. “Isabella — Celular” no se volverá a eliminar sin autorización expresa.
