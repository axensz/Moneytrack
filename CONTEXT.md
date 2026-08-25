# Moneytrack

Moneytrack es un registro financiero personal cuya verdad se expresa mediante cuentas contables y transacciones confirmadas. Los datos observados desde sistemas externos solo adquieren autoridad financiera después de una confirmación explícita.

## Language

**Cuenta contable**:
Contenedor financiero cuyo saldo disponible o deuda cambia cuando se confirma una transacción. Una tarjeta de crédito se representa como una cuenta contable de crédito.
_Avoid_: Tarjeta, plástico, medio de pago

**Tarjeta de crédito (TC)**:
Cuenta contable de crédito que conserva cupo, deuda, fechas e intereses, independientemente de cuántos plásticos o tokens permitan usarla.
_Avoid_: Tarjeta física, tarjeta de wallet

**Medio de pago**:
Plástico o token de wallet que identifica cómo se presentó una cuenta contable al pagar. Cada medio de pago pertenece a una sola cuenta contable; una cuenta puede tener varios.
_Avoid_: Cuenta, TC

**Alias del medio de pago**:
Nombre corto elegido por la persona para reconocer un medio de pago, por ejemplo `Oro` o `Nu`. Ayuda a presentar una recomendación, pero no identifica por sí solo una cuenta contable.
_Avoid_: Nombre de cuenta, banco, identidad de tarjeta

**Terminación del medio de pago**:
Últimos cuatro dígitos de un plástico o token de wallet, conservados como identificador mínimo para buscar una coincidencia inequívoca. No es el número completo de la tarjeta ni pertenece a la cuenta contable.
_Avoid_: Número de tarjeta, últimos cuatro de la cuenta

**Evento de pago observado**:
Señal emitida por una fuente externa que parece describir una compra, pero aún no tiene autoridad sobre el registro financiero.
_Avoid_: Transacción, movimiento confirmado

**Candidato de importación**:
Propuesta financiera normalizada a partir de un evento de pago observado. No modifica saldos, deuda ni estadísticas mientras siga pendiente.
_Avoid_: Transacción automática, transacción

**Bandeja de importación**:
Conjunto de candidatos pendientes que una persona puede revisar, confirmar o descartar.
_Avoid_: Libro, historial de transacciones

**Transacción confirmada**:
Movimiento canónico del registro que sí participa en saldos, deuda, estadísticas y conciliación.
_Avoid_: Candidato, notificación
