# Cierre y entrega — integridad del ledger — 2026-08-24

## Resultado

La frontera monetaria compartida, la autoridad de crédito, la persistencia invitada, Undo agregado, recurrentes y la conciliación quedaron implementadas y verificadas. Ninguna reparación se ejecutó sobre datos financieros reales.

La única puerta que permanece manual es la matriz mutante de Chrome de la tarea 11.5. En esta revisión, Chrome se mantuvo en modo lectura sobre la cuenta real; la creación de registros desechables, contención entre dos pestañas, retry y Undo se cubrieron mediante pruebas automatizadas, pero no se repitieron como escrituras reales sin una autorización separada.

## Conciliación real en modo lectura

- Fuente: servidor, autoridad completa.
- Filas: 909 válidas y 0 inválidas.
- Huella observada: `ledger-v1-e08ab88f88ea6393afc17ecd3ee9febf`.
- Clasificaciones: 4 referencias a pagos periódicos inexistentes y 3 deudas dependientes que no coinciden con su principal, pagos o saldo.
- Saldos negativos: no existe actualmente una cuenta de ahorro o efectivo con saldo calculado negativo. Por tanto, el reporte no emite `negative-explained` ni una inconsistencia negativa para activos.
- Tarjetas: los saldos calculados negativos representan deuda; en las tres tarjetas observadas, `usedCredit` coincide con el historial y el reporte las clasifica como conciliadas.

Este resultado describe el estado observado, no autoriza reparación. Los siete hallazgos de referencias/deudas requieren un plan explícito, revisión de evidencia antes/después, frase de confirmación y autorización independiente antes de cualquier escritura.

## Evidencia de rendimiento

Línea base local determinista con Firestore simulado; no es un p95 de producción:

| Escenario | Solicitudes de lectura | Documentos leídos | Tiempo local |
| --- | ---: | ---: | ---: |
| Una cuenta, 499 movimientos | 3 | 502 | 1,40 ms |
| Una cuenta, 500 movimientos | 3 | 503 | 1,89 ms |
| Una cuenta, 501 movimientos | 3 | 504 | 0,59 ms |
| Dos cuentas, 501 movimientos | 5 | 504 | 0,70 ms |
| Mutación, 501 movimientos, 10 muestras | 3 por mutación | 504 por mutación | commit p95 16,51 ms; extremo a extremo p95 17,55 ms |

No se agrega un rollup ahora. Iniciar su diseño únicamente si la telemetría de producción muestra durante siete días consecutivos cualquiera de estas condiciones:

- p95 de una mutación sensible al saldo mayor de 1,5 s; o
- más de 2.000 lecturas facturadas por operación con alcance de cuenta.

## Orden de despliegue

1. Desplegar primero `firestore.rules` y conservar la salida verde de las 14 pruebas del emulador.
2. Confirmar que el cliente vigente falla cerrado ante autoridad de tarjeta inválida o referencias de transferencia no válidas.
3. Desplegar después el cliente estático construido desde la rama verificada.
4. Hacer canary con una cuenta de prueba, revisar rechazos de reglas y volver a ejecutar la conciliación en lectura.
5. Ampliar solo si no aparecen escrituras parciales, divergencia de crédito ni duplicados recurrentes.

## Rollback

### Cliente autenticado

- Volver a desplegar el último artefacto estático conocido como bueno.
- Mantener las reglas endurecidas: un cliente anterior puede perder temporalmente una operación, pero no debe recuperar la capacidad de persistir un ledger inválido.
- Si las reglas fueran la causa confirmada de un incidente, revertirlas únicamente al archivo exacto previamente aprobado y mediante un cambio separado; no relajarlas de forma ad hoc.
- Después del rollback, ejecutar conciliación en lectura y comparar fuente, conteos, huella y clasificaciones antes de reabrir escrituras sensibles.

### Ledger invitado

Seguir [guest-ledger-recovery.md](./guest-ledger-recovery.md): conservar el envelope actual y el anterior verificado, exportarlos antes de limpiar almacenamiento, elegir la revisión válida más alta y exigir lectura de retorno correcta. No mezclar arreglos a mano ni borrar claves antes de validar la recuperación.

## Verificación de interfaz en Chrome

- Modal abierto desde Ajustes sin ejecutar planes.
- Foco inicial en `Cerrar`; Escape cerró el diálogo y devolvió el foco a Ajustes.
- Preferencia de privacidad: 79 importes enmascarados y 0 símbolos monetarios visibles; preferencia restaurada después de la prueba.
- Anchos 375, 1214 y 1440 px: diálogo dentro del viewport, sin desbordamiento horizontal y controles visibles de 44 px de alto.
- Modos claro y oscuro verificados; tema original restaurado.
- Consola: 0 errores y 0 advertencias.

## Verificación automatizada

- Matriz focal del cambio: 50 archivos aprobados y 1 omitido; 632 pruebas aprobadas y 14 omitidas. Se excluyeron de esta atribución los dos archivos de prueba WIP del usuario.
- Reglas Firestore: 1 archivo y 14 pruebas aprobadas en el emulador real.
- Regresión completa: 155 archivos aprobados, 1 omitido; 1.396 pruebas aprobadas, 14 omitidas.
- TypeScript, ESLint, build estático y `git diff --check`: salida 0.
- OpenSpec estricto: `harden-transaction-ledger-integrity` válido usando `@fission-ai/openspec` 1.10.0 de forma transitoria, porque el comando global no está instalado.
- Revisión independiente final: ningún hallazgo Critical/Important; `Ready to merge: Sí`.

## Estado de cambios relacionados

- `clarify-ledger-metric-scopes`: completo. La matriz focal volvió a probar que cuenta, categoría, fecha y búsqueda cambian solo lista/CSV, no los cuatro valores del resumen General.
- `repair-debt-lifecycle-and-account-links`: 24/26. Conserva abiertas su puerta mutante de Chrome y el push/CI del cambio original.
- `harden-notification-delivery-and-recurring-reminders`: 0/41. Las cuatro modificaciones locales de notificaciones son trabajo del usuario, permanecen sin stage y no se atribuyen a este cierre.

## Prohibición operativa

No ejecutar migraciones reparadoras ni aplicar automáticamente planes de conciliación sobre datos reales. Toda reparación exige autorización separada, evidencia antes/después, confirmación explícita, lease vigente, commit atómico y un reporte fresco del servidor.
