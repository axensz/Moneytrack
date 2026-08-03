## Context

La prueba real de borrado de “Isabella — Celular” confirmó una divergencia entre el cliente y las reglas desplegadas. `createAccountOperationRelease()` construye el tombstone correcto, pero los consumidores lo escriben con `set(..., { merge: true })`; Firestore conserva `acquiredAt` dentro del mapa anidado y `isValidAccountOperationRelease()` rechaza el resultado. La deuda y su transacción se restauraron, pero el error quedó en la consola. El mismo patrón aparece en adquisición, renovación y liberación para `delete-account`, `merge-credit-cards`, `set-default-account` y `delete-debt`.

`useDebts` ya elimina deuda, transacciones vinculadas y efectos de `usedCredit` en un batch protegido por lease. En cambio, `addDebt` crea primero la deuda y después delega la transacción; `registerDebtPayment` hace la transacción antes de actualizar la deuda. Esa separación permite estados parciales. La vista ofrece borrado solo en tarjetas activas y no tiene una operación de reasignación de cuenta.

La autoridad para tarjetas es `Account.usedCredit`; `creditDeltasByAccount()` contiene la semántica compartida. Las lecturas autenticadas pueden usar caché, pero las mutaciones financieras requieren conexión. El modo invitado conserva su almacenamiento local. Next.js se despliega como exportación estática con imágenes sin optimización de servidor.

Al 2 de agosto de 2026, GitHub reporta 17 alertas abiertas. Una simulación aislada confirmó que actualizar el árbol permitido y forzar sharp `^0.35.3` deja `npm audit` en cero sin agregar dependencias.

## Goals / Non-Goals

**Goals:**

- Hacer que todo estado del lease escriba un mapa exacto aceptado por las reglas.
- Mantener deuda, transacciones y `usedCredit` en una sola unidad atómica por operación autenticada.
- Permitir borrar préstamos activos o saldados y reasignar su cuenta sin reescribir pagos históricos.
- Exponer errores recuperables mediante la capa de toast existente.
- Cerrar las vulnerabilidades conocidas con las actualizaciones mínimas compatibles y conservar el build estático.
- Dejar pruebas que ejecuten las reglas reales y no solo mocks de Firestore.

**Non-Goals:**

- No relajar owner-scoping, validaciones de esquema ni serialización de Firestore.
- No rediseñar `DebtsView`, navegación, tarjetas o cálculos estadísticos.
- No migrar pagos históricos a otra cuenta ni cambiar su importe, fecha o categoría.
- No habilitar middleware, Server Actions, rewrites, servidor personalizado u optimización de imágenes.
- No actualizar dependencias de runtime ajenas a las alertas, salvo las resoluciones transitivas inevitables del lockfile. La única dependencia nueva será `@firebase/rules-unit-testing` para el contrato del emulador.
- No eliminar ni modificar “Isabella — Celular” durante la implementación sin una nueva autorización expresa.

## Decisions

### 1. Reemplazar el mapa del lease, no fusionar sus campos

Las escrituras de adquisición, renovación y liberación usarán `mergeFields: ['accountOperationLock']` —o la operación equivalente que reemplace ese campo superior— en vez de `{ merge: true }`. Así el documento raíz conserva sus demás campos, pero el mapa contiene exactamente `id`, `kind`, `acquiredAt` o exactamente `id`, `kind`, `releasedAt`.

Se conservará `createAccountOperationRelease()` y el protocolo actual; el defecto está en la semántica de escritura compartida. Cambiar las reglas para aceptar campos sobrantes ocultaría estados ambiguos y se descarta.

### 2. Probar el protocolo contra el emulador y las reglas del repositorio

Se agregará `@firebase/rules-unit-testing` `^5.0.1` y un script que inicie el emulador únicamente para la prueba contractual. Es compatible con Firebase 12 y Node.js 22. La regresión cubrirá adquirir, renovar, liberar y volver a adquirir después del tombstone, además de un mapa fusionado inválido. Los mocks existentes permanecerán como pruebas rápidas, pero no serán evidencia suficiente para este contrato.

### 3. Mantener la orquestación de deudas feature-local y reutilizar la semántica financiera existente

Las rutas autenticadas de crear, pagar, borrar y reasignar usarán transacciones o batches de Firestore dentro del dominio de deudas. Reutilizarán `creditDeltasByAccount`, `increment`, los límites atómicos y la publicación de caché existentes. No se introducirá una capa genérica de comandos ni otra dependencia.

Crear y pagar usarán una transacción Firestore que lea los documentos necesarios antes de escribir la deuda, la transacción vinculada y el `usedCredit`. El identificador de deuda se reservará antes del commit para que ambos documentos compartan `debtId`. Si no hay cuenta asociada, la deuda se confirma sin crear un movimiento financiero.

Eliminar continuará usando lease, lecturas de servidor y un solo batch. El botón se ofrecerá también para saldados; el batch borrará todos los movimientos con `debtId`, revertirá sus efectos sobre tarjetas y borrará la deuda. Si excede el límite seguro, no escribirá nada y explicará el bloqueo.

### 4. Reasignar la operación original y conservar los pagos donde ocurrieron

La reasignación aceptará otra cuenta o “Sin cuenta”. Bajo un lease nuevo `reassign-debt-account`, leerá la deuda, sus transacciones y cuentas desde el servidor. Al elegir otra cuenta actualizará `Debt.accountId` y la transacción principal de categoría `LOAN_CATEGORY`; al elegir “Sin cuenta” eliminará esa transacción principal y su efecto. No modificará ninguna transacción de categoría `LOAN_PAYMENT_CATEGORY`.

El saldo original, saldo pendiente, estado de liquidación y fechas no cambiarán. La nueva cuenta pasará a ser el soporte de la operación original y del saldo pendiente para pagos futuros; los pagos ya registrados conservarán tanto su cuenta como su efecto histórico. Para tarjetas, el batch calculará el antes/después con `creditDeltasByAccount` y ajustará el `usedCredit` autoritativo junto con la reasignación. Si una tarjeta quedaría con deuda negativa o falta una referencia necesaria, la operación completa se rechazará con un mensaje accionable.

Una deuda heredada sin transacción principal podrá cambiar la cuenta para pagos futuros, pero no inventará un movimiento retroactivo. Si hay más de una transacción principal candidata, se rechazará la reasignación para evitar escoger silenciosamente la incorrecta.

### 5. Mantener paridad funcional en modo invitado sin fingir atomicidad remota

El modo autenticado requerirá conexión y tendrá garantía atómica de Firestore. El modo invitado aplicará la misma semántica visible sobre el estado local, con validación previa y restauración del snapshot anterior si falla una operación vinculada. No se anunciará disponibilidad offline para escrituras autenticadas.

### 6. Los errores pertenecen al límite de interacción

Los hooks seguirán lanzando errores descriptivos y no importarán la librería de toast. `DebtsView` y los consumidores de cuentas envolverán las acciones async con `try/catch`, mostrarán el mensaje mediante `showToast.error` y solo cerrarán modales o paneles después del éxito. Se reutilizarán `BaseModal`, `useModalA11y`, tokens semánticos y objetivos táctiles existentes.

### 7. Actualizar únicamente la línea base vulnerable

`package.json` elevará los pisos a Next.js y `eslint-config-next` `^16.2.12`, PostCSS `^8.5.25`, el override de PostCSS `^8.5.25` y un override de sharp `^0.35.3`. El lockfile resolverá al menos protobufjs `7.6.5`, js-yaml `4.3.1` y brace-expansion `1.1.18`, `2.1.4` y `5.0.9` según cada línea mayor.

El override de sharp es necesario porque Next.js `16.2.12` todavía declara `^0.34.5`. Se acepta esta excepción porque la aplicación configura `images.unoptimized: true`, no ejecuta la Image Optimization API y el build completo verificará compatibilidad. No se descartarán alertas como “no aplicables”: se eliminarán las versiones vulnerables del lockfile.

## Risks / Trade-offs

- **Una reasignación podría producir `usedCredit` negativo en una tarjeta** → validar el estado persistido y abortar todo el batch con una explicación, sin clamping silencioso.
- **Una deuda heredada puede tener vínculos ambiguos** → no adivinar; permitir solo el cambio para pagos futuros cuando no existe principal y rechazar múltiples principales.
- **El historial puede exceder el límite del batch** → conservar `assertAtomicBatchCapacity`, mostrar el límite y no hacer escrituras parciales.
- **Las pruebas mockeadas pueden volver a ocultar semántica de merge** → hacer obligatoria una prueba con el emulador y el `firestore.rules` real.
- **sharp `0.35.x` queda fuera del rango opcional declarado por Next.js** → fijar el override, ejecutar `npm ci` y el build estático; revertir el override si Next publica una versión compatible antes de implementar.
- **Dependabot solo cierra alertas al reescanear la rama por defecto** → exigir lockfile seguro y `npm audit = 0` en el PR, y comprobar el cierre posterior al merge sin auto-descartar avisos.
- **Desplegar cliente antes de admitir `reassign-debt-account` bloquearía esa acción** → desplegar primero las reglas compatibles y después la exportación estática.

## Migration Plan

1. Integrar primero las pruebas contractuales y el reemplazo exacto del mapa de lease; verificar los cuatro consumidores actuales.
2. Agregar `reassign-debt-account` a tipos y reglas, y validar el conjunto completo en el emulador.
3. Implementar por separado creación/pago atómicos, borrado saldado y reasignación, cada uno con regresiones financieras.
4. Actualizar dependencias y lockfile en un commit aislado; ejecutar `npm ci`, `npm audit`, typecheck, lint, pruebas y build.
5. Desplegar las reglas backward-compatible antes del cliente. El cliente anterior seguirá siendo válido.
6. Verificar en Chrome con una deuda descartable en cuentas normales y de crédito. No usar el registro Isabella sin autorización.
7. Tras merge, esperar el reescaneo de Dependabot y confirmar cero alertas correspondientes.

Rollback: revertir el cliente y el lockfile no requiere migración de datos. Las reglas nuevas solo agregan un `kind` estricto y pueden permanecer durante el rollback. Cada mutación es all-or-nothing, por lo que un fallo o rollback no necesita reparación parcial.

## Open Questions

Ninguna. El usuario aprobó explícitamente conservar los pagos históricos en sus cuentas y mover únicamente la operación original al reasignar.
