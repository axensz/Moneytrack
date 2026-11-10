# Préstamos con tarjeta, intereses y transacción de origen

**Objetivo:** registrar intereses fijos en dinero, porcentaje total o tasa E.A. de una tarjeta, y permitir reutilizar un movimiento con sus cuotas sin duplicarlo.

**Alcance:** creación de préstamos prestados/recibidos, selección de cuenta/tarjeta, vínculo opcional a transacción existente, persistencia autenticada/invitado y detalle de capital/interés/total. Los intereses quedan congelados al registrar; no hay devengo diario.

**Arquitectura:** conservar `originalAmount` como capital y `remainingAmount` como total pendiente incluido el interés. Reutilizar la calculadora de cuotas existente. Asociar la transacción principal y crear la deuda en la misma operación atómica; tomar los datos del movimiento nuevamente dentro de esa operación. No cambiar saldos al asociar un movimiento.

**Restricciones:** preservar cambios previos del usuario; sin dependencias nuevas; mantener tokens y componentes actuales. Un préstamo antiguo sin campos de interés equivale a interés cero.

- [x] Añadir pruebas de creación, pagos y asociación sin duplicados en el hook real; observar los fallos.
- [x] Añadir cálculo/validación y snapshots de intereses; adaptar creación y conciliación al total.
- [x] Añadir selección de transacción y campos de interés al formulario; mostrar tarjeta, cuotas e intereses en activos/saldados.
- [x] Validar reglas de persistencia y casos inválidos; ejecutar pruebas del dominio, tipos y lint.
- [x] Revisar el resultado y verificar la interfaz cuando el entorno local lo permita.

**Riesgos a comprobar:** transacción ya vinculada, movimiento no pagado o de dirección incorrecta, tasa/importe no finito, tarjeta sin tasa, cambio posterior de tasa, pagos superiores al capital que todavía no cubren intereses, y conservación de intereses al editar movimientos.

**Resultado:** asociación atómica en ambos modos, pagos en cuenta elegible y restauración coherente. El capital de planes financiados queda protegido contra ajustes que desalineen cuotas e interés. Se verificó el flujo en navegador aislado a 1440px/390px, con compra financiada existente y cobro completo en ahorros. Suite general: 2.071 pruebas pasaron; reglas en emulador: 111 pasaron. Se ejecutaron regresiones focalizadas después de los últimos ajustes. Sin despliegue.
