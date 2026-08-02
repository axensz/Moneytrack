## 1. Delimitar y documentar el cambio integrado

- [x] 1.1 Confirmar en Git que la extracción corresponde a `304aaf4` y que el estado actual contiene los siete archivos feature-locales esperados.
- [x] 1.2 Actualizar el grafo de revisión al `HEAD` activo y localizar componentes, dependencias y pruebas enfocadas de Deudas.
- [x] 1.3 Documentar alcance, responsabilidades, no objetivos y contrato de continuidad visual en proposal, design y spec.

## 2. Validación automatizada proporcional

- [x] 2.1 Ejecutar `debtsViewFormBehavior.test.tsx`, `debtPaymentScheduleForm.test.ts` y `debtPaymentSchedule.test.ts` y registrar el resultado exacto.
- [x] 2.2 Ejecutar typecheck y lint enfocado sobre `src/components/views/debts/**` sin atribuir al cambio errores de otros archivos locales.
- [x] 2.3 Ejecutar el build de producción y registrar cualquier diferencia entre un defecto del cambio y un fallo preexistente del checkout.

## 3. Revisión visual en navegador

- [x] 3.1 Registrar URL, viewport, tema y estado de datos de la pestaña abierta antes de interactuar.
- [x] 3.2 Verificar encabezado, cuatro métricas, estado vacío o agrupaciones activas y ausencia de desbordamiento horizontal.
- [x] 3.3 Abrir el alta y revisar `Yo presté`/`Me prestaron`, campos, ayuda contextual, cuenta asociada, cancelación y estado de guardado sin confirmar una creación innecesaria.
- [x] 3.4 Recorrer `Sin fecha`, `Mensual`, `Fecha` y `Meses`, comprobando que solo aparezcan los campos esperados y que el layout permanezca estable.
- [x] 3.5 En una tarjeta existente, revisar montos, progreso, fechas, badges y las superficies de programar, modificar, pagar y condonar; abrir y cerrar sin ejecutar movimientos.
- [x] 3.6 Revisar lista de saldados y abrir/cancelar la confirmación de borrado sin eliminar datos.
- [x] 3.7 Alternar claro/oscuro y comprobar contraste, superficies, estados, foco visible y ausencia de cortes o solapamientos.

## 4. Cierre de revisión

- [x] 4.1 Registrar cada hallazgo con pasos reproducibles, evidencia, severidad y alcance afectado.
- [x] 4.2 Marcar explícitamente los escenarios no verificables por falta de datos o viewport, sin tratarlos como aprobados.
- [x] 4.3 Validar el OPSX en modo estricto y entregar el resultado sin modificar código de producto.
