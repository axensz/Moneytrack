## ADDED Requirements

### Requirement: Continuidad de la vista de Deudas
La vista de Deudas MUST conservar el resumen, las agrupaciones activas, el estado vacío y la lista opcional de saldados después de separar sus componentes internos.

#### Scenario: Resumen visible
- **WHEN** el usuario abre la vista de Deudas
- **THEN** la interfaz muestra título, descripción y las métricas `Me deben`, `Debo`, `Saldados` y `Balance neto` sin solapamientos ni desbordamiento horizontal

#### Scenario: Agrupación de deudas
- **WHEN** existen préstamos entregados y deudas recibidas activas
- **THEN** la interfaz las presenta en grupos `Me deben` y `Debo`, ordenadas por próximo pago y luego por nombre

#### Scenario: Estado sin deudas activas
- **WHEN** no existen deudas activas y el formulario de alta está cerrado
- **THEN** la interfaz muestra el estado vacío y la acción para registrar un préstamo

#### Scenario: Historial saldado
- **WHEN** existen deudas saldadas y el usuario solicita mostrarlas
- **THEN** la interfaz presenta cada deuda con su monto y distingue visualmente una deuda pagada de una condonada

### Requirement: Continuidad del alta de préstamos y deudas
El formulario extraído `NewDebtForm` MUST conservar todos los campos, ayudas contextuales, estados de selección y programación disponibles antes de la separación.

#### Scenario: Selección del tipo
- **WHEN** el usuario alterna entre `Yo presté` y `Me prestaron`
- **THEN** la selección activa es inequívoca y las etiquetas y ayudas de cuenta corresponden al flujo elegido

#### Scenario: Programación sin fecha
- **WHEN** el usuario elige `Sin fecha`
- **THEN** la interfaz no muestra campos adicionales de programación

#### Scenario: Programación mensual
- **WHEN** el usuario elige `Mensual`
- **THEN** la interfaz muestra el día aproximado y la fecha puntual opcional sin alterar los demás campos del formulario

#### Scenario: Programación por fecha o meses
- **WHEN** el usuario elige `Fecha` o `Meses`
- **THEN** la interfaz muestra únicamente el campo correspondiente al modo elegido

#### Scenario: Cancelación del borrador
- **WHEN** el usuario cancela un alta y vuelve a abrirla
- **THEN** los datos del borrador y la programación regresan a sus valores iniciales

#### Scenario: Envío en progreso
- **WHEN** el registro está guardándose
- **THEN** la acción muestra `Guardando...`, queda deshabilitada y no permite un segundo envío

### Requirement: Continuidad de las tarjetas de deuda
Cada `DebtCard` MUST conservar la información financiera y temporal, junto con sus acciones inline, sin cambiar los contratos de datos.

#### Scenario: Información principal
- **WHEN** se muestra una deuda activa
- **THEN** la tarjeta presenta persona, descripción disponible, saldo pendiente, monto original cuando difiere y progreso cuando existe pago parcial

#### Scenario: Estados temporales
- **WHEN** una deuda tiene vencimiento o próximo pago
- **THEN** la tarjeta distingue fecha futura, vencimiento y pago atrasado con texto, icono y color semántico legibles

#### Scenario: Programación inline
- **WHEN** el usuario abre `Próximo pago`
- **THEN** la tarjeta muestra los cuatro modos, sus campos condicionales, una acción para guardar y una acción para cerrar

#### Scenario: Acciones financieras inline
- **WHEN** el usuario abre `Modificar saldo`, `Registrar pago` o `Condonar`
- **THEN** el panel correspondiente permanece contenido dentro de la tarjeta, conserva controles legibles y puede cerrarse sin ejecutar la acción

#### Scenario: Confirmación de borrado
- **WHEN** el usuario solicita eliminar una deuda
- **THEN** la interfaz abre un diálogo que identifica la deuda, explica el efecto sobre transacciones y saldos y permite cancelar sin borrar

### Requirement: Fidelidad visual y accesible
La refactorización MUST preservar el sistema visual de MoneyTrack y la operabilidad básica de los controles en el viewport desktop observado.

#### Scenario: Temas claro y oscuro
- **WHEN** el usuario alterna el tema
- **THEN** tarjetas, paneles, texto, estados y controles conservan contraste y jerarquía sin superficies incoherentes

#### Scenario: Contención y densidad
- **WHEN** se abren formularios o paneles inline en una tarjeta
- **THEN** el contenido no corta texto, no superpone controles y no fuerza desplazamiento horizontal de página

#### Scenario: Identificación de controles
- **WHEN** el usuario recorre los controles de la vista
- **THEN** cada acción principal puede identificarse por texto visible o nombre accesible y su foco es perceptible

### Requirement: Integridad fuera de alcance
La revisión MUST tratar los cálculos, la persistencia y los movimientos financieros como contratos invariables.

#### Scenario: Revisión no destructiva
- **WHEN** se inspeccionan pagos, ajustes, condonaciones o borrados en el navegador observado
- **THEN** la revisión abre y cierra sus superficies sin confirmar una operación que cambie datos

#### Scenario: Sin dependencia nueva
- **WHEN** se complete el OPSX
- **THEN** no se habrá agregado ninguna dependencia ni modificado código de producto
