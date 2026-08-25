## ADDED Requirements

### Requirement: Un candidato pendiente no tiene autoridad financiera
El sistema MUST mantener cada candidato fuera del libro hasta su confirmación y MUST excluirlo de saldos, `usedCredit`, estadísticas, presupuestos, deudas y conciliación.

#### Scenario: Recibir una compra capturada
- **WHEN** Android crea un candidato `pending`
- **THEN** la PWA puede mostrarlo, pero ningún saldo, cupo ni indicador financiero cambia

#### Scenario: Alterar un candidato desde un cliente
- **WHEN** un cliente intenta usar un candidato para escribir directamente una transacción fuera de la confirmación canónica
- **THEN** el flujo de importación no lo reconoce como confirmado y el candidato conserva cero efecto contable

### Requirement: La bandeja muestra un conjunto pendiente acotado y honesto
El sistema MUST consultar como máximo los 100 candidatos pendientes más recientes y MUST mostrar monto COP, comercio, fecha observada y terminación disponible sin presentarlos como transacciones guardadas; paquete Android y confianza MUST permanecer ocultos en la interfaz normal.

#### Scenario: Abrir la bandeja con candidatos
- **WHEN** existen candidatos pendientes válidos
- **THEN** la vista Transacciones muestra un contador, filas de revisión y copy que indica que aún no afectan el saldo

#### Scenario: Mostrar una relación inequívoca
- **WHEN** la terminación del candidato coincide con un único medio activo
- **THEN** la fila muestra su alias y cuenta vinculada en lugar de metadatos técnicos del parser

#### Scenario: Documento inválido
- **WHEN** Firestore entrega un documento con esquema desconocido, monto inválido o estado incompatible
- **THEN** el decodificador lo excluye de la bandeja y expone un error reparable sin asumir valores

#### Scenario: Más de cien pendientes
- **WHEN** existen más de 100 candidatos pendientes
- **THEN** la consulta inicial muestra los 100 más recientes y comunica el límite sin cargar un historial ilimitado

### Requirement: La revisión permite corregir lo que la notificación no sabe
El sistema MUST exigir una cuenta y categoría válidas, permitir corregir monto, comercio y fecha, y MUST solicitar cuotas/interés explícitos para gastos de TC sin inferirlos.

#### Scenario: Confirmar un gasto de ahorro
- **WHEN** el usuario revisa un candidato COP, selecciona una cuenta de ahorro y categoría válidas y confirma
- **THEN** el sistema usa los valores revisados para preparar una transacción `expense`

#### Scenario: Revisar un gasto de TC
- **WHEN** la cuenta seleccionada es `credit`
- **THEN** la revisión permite elegir cuotas e interés y no inventa esos valores a partir del texto observado

#### Scenario: Corregir el monto capturado
- **WHEN** la persona escribe o pega letras junto al monto
- **THEN** el campo elimina los caracteres ajenos, presenta el valor en formato colombiano y confirma únicamente el valor visible normalizado

#### Scenario: Recordar un medio nuevo
- **WHEN** un candidato incluye últimos cuatro sin coincidencia y el usuario selecciona una cuenta y “Recordar este medio de pago”
- **THEN** la confirmación crea el medio mínimo y lo vincula a esa cuenta dentro de la misma operación

### Requirement: La confirmación es servidor-actual, atómica e idempotente
El sistema MUST confirmar mediante la frontera contable autenticada con `operationId` y documento `ledger-mutation:android:<candidateId>`, MUST usar `mutationSource: android` y MUST escribir transacción, autoridad de crédito, medio recordado, estado del candidato y liberación del lease en un único batch.

#### Scenario: Confirmación exitosa
- **WHEN** el candidato sigue pendiente y las cuentas servidor-actuales aceptan el gasto
- **THEN** un único commit crea la transacción canónica, ajusta `usedCredit` cuando corresponde y cambia el candidato a `confirmed` con el mismo `transactionId`

#### Scenario: Respuesta perdida después del commit
- **WHEN** el commit tuvo éxito pero el cliente reintenta porque no recibió respuesta
- **THEN** el sistema devuelve la transacción ya confirmada y no vuelve a cambiar saldo ni cupo

#### Scenario: Candidato descartado o alterado
- **WHEN** la confirmación encuentra el candidato `dismissed`, una identidad distinta o una cuenta ya inexistente
- **THEN** el sistema rechaza la operación completa sin escrituras financieras parciales

#### Scenario: Fondos o cupo insuficientes
- **WHEN** la frontera contable servidor-actual rechaza el gasto
- **THEN** el candidato permanece pendiente, no se crea transacción y la UI conserva los valores para corregir o reintentar

### Requirement: Descartar es terminal y no financiero
El sistema MUST permitir la transición `pending → dismissed`, MUST impedir reabrir estados terminales y MUST conservar cero efecto financiero al descartar.

#### Scenario: Descartar falso positivo
- **WHEN** el usuario descarta una captura que no corresponde a una compra
- **THEN** el candidato pasa a `dismissed`, sale de la bandeja y no se crea ninguna transacción

#### Scenario: Intentar reabrir un descartado
- **WHEN** un cliente intenta cambiar un candidato `dismissed` a `pending` o `confirmed`
- **THEN** las reglas rechazan la transición

### Requirement: La confirmación offline se bloquea de forma explícita
El sistema MUST impedir la mutación del libro mientras la PWA está offline, conservar el formulario de revisión y permitir reintento cuando regresa la conectividad.

#### Scenario: Confirmar sin red
- **WHEN** el usuario intenta confirmar un candidato sin conexión
- **THEN** la UI explica que el libro no se puede modificar offline, mantiene los datos revisados y no marca el candidato como confirmado

### Requirement: La primera entrega prohíbe contabilización autónoma
El sistema MUST exigir una acción humana por candidato durante el canario y MUST carecer de una ruta Android que escriba directamente en `transactions`.

#### Scenario: Candidato de confianza alta
- **WHEN** Android clasifica una compra con confianza `high`
- **THEN** la captura sigue pendiente hasta que una persona la confirma sin exponer la clasificación técnica como etiqueta de producto

#### Scenario: Servicio Android sincroniza
- **WHEN** el compañero logra subir un candidato
- **THEN** solo escribe el contrato de candidato y nunca crea o actualiza una transacción contable
