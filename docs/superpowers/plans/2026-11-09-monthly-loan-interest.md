# Interés de préstamos por fecha de corte

**Decisión del usuario:** elegir entre todo el interés al registrar o cargos mensuales. Cada cargo mensual se calcula sobre el capital original; no hay interés compuesto ni reducción de la base por abonos. La tarjeta aporta tasa E.A. y día de corte; el porcentaje manual expresa tasa mensual y permite elegir el día.

**Revisión solicitada por el usuario:** investigar si la base original corresponde al funcionamiento real de TC. Investigación primaria confirma que Nu calcula por saldo y días, y Banco Popular por capital pendiente. Por tanto, la base original sigue siendo un acuerdo posible para porcentaje personal; el modo TC no debe presentarse como réplica del banco con esa base. La implementación TC está pendiente de contrastar la tarjeta concreta, el período inicial, el beneficio de una cuota y la imputación de pagos. Fuentes: https://blog.nu.com.co/tasa-de-interes-de-nu-tu-controlas-cuanto-pagas/ y https://www.bancopopular.com.co/wps/portal/bancopopular/inicio/para-ti/tarjeta-de-credito . No se ha publicado el worker mensual.

**Compatibilidad:** préstamos sin modalidad nueva conservan el interés fijo ya acordado. La transacción de origen no se duplica ni cambia de monto al asociarla. Los cargos mensuales aumentan el saldo del préstamo, sin crear entradas o salidas de dinero ficticias. Liquidar el préstamo detiene los cargos futuros.

**Contrato compartido:** módulo puro `functions/src/shared/debtMonthlyInterest.ts`, consumido por cliente y servidor. Campos nuevos opcionales en Debt: `interestAccrual: 'upfront' | 'monthly'`, `interestCutoffDay: number`, `nextInterestDate: Date`. `totalInterestAmount` conserva los intereses ya agregados; `remainingAmount` incluye capital e interés pendiente. Tasa de tarjeta E.A. se convierte a mensual; porcentaje manual mensual /100. Primer corte estrictamente posterior a la fecha de origen; días 29–31 se ajustan a fin de mes. Zona horaria America/Bogota.

**API pura:** `calculateMonthlyInterestCharge(principal, mode, rate): number`; `getFirstInterestDate(origin: unknown, cutoffDay: number): Date`; `getMonthlyInterestAccrual(debt, now: Date): {totalInterestAmount:number; remainingAmount:number; nextInterestDate:Date} | null`. La última función acepta fechas Date/string/Timestamp con toDate, recupera cortes pendientes y es idempotente por nextInterestDate. No supera el límite monetario de 1.000.000.000.

- [ ] Reproducir y corregir el permiso publicado que rechaza capital más interés al asociar una transacción.
- [ ] Implementar núcleo de cálculo y pruebas de calendario, límites y reintentos.
- [ ] Programar actualización en servidor, respetando el bloqueo coordinado de operaciones del usuario.
- [ ] Añadir modalidad/día de corte y desglose mensual al formulario y detalle.
- [ ] Actualizar saldos al abrir y antes de registrar pagos, en invitado y autenticado.
- [ ] Ampliar validación de reglas y verificar conjunto preparado para publicación.
- [ ] Revisar, probar en navegador y comunicar cualquier publicación pendiente.

**Reparto:** agente backend: módulo compartido, worker, export e índice necesarios y pruebas de Functions. Principal: permisos, formularios, tipos, sincronización de préstamos/pagos y validación integral. Sin commits ni publicación por agentes delegados.
