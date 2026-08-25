## ADDED Requirements

### Requirement: Un medio de pago se vincula a una cuenta contable existente
El sistema MUST permitir que un usuario autenticado vincule cada plástico o token de wallet con exactamente una cuenta contable propia existente, y MUST permitir varios medios de pago para la misma cuenta.

#### Scenario: Vincular un token de wallet a una TC
- **WHEN** el usuario guarda un medio `wallet-token` con últimos cuatro válidos y selecciona una cuenta `credit` propia
- **THEN** el sistema persiste el medio con ese `accountId` sin crear otra cuenta ni duplicar cupo o deuda

#### Scenario: Vincular plástico y token a la misma cuenta
- **WHEN** el usuario crea dos medios con terminaciones diferentes para una misma cuenta
- **THEN** ambos medios permanecen relacionados con la misma autoridad contable

#### Scenario: Rechazar una cuenta ajena o inexistente
- **WHEN** un cliente intenta guardar un medio con un `accountId` que no existe para el usuario autenticado
- **THEN** el sistema rechaza la escritura sin crear una asociación colgante

### Requirement: Los medios de pago conservan solo identificadores mínimos
El sistema MUST aceptar únicamente etiqueta, tipo, red, últimos cuatro, cuenta, estado y timestamps del medio, y MUST rechazar PAN completo, CVV, OTP, credenciales o claves desconocidas.

#### Scenario: Guardar identificación mínima
- **WHEN** el usuario registra `Tarjeta personal`, `wallet-token`, `visa` y `1234`
- **THEN** el sistema guarda esos metadatos mínimos y nunca solicita el número completo o CVV

#### Scenario: Rechazar payload sensible
- **WHEN** un cliente incluye `pan`, `cvv`, `otp`, texto crudo u otra clave no permitida
- **THEN** las reglas de datos rechazan la escritura completa

### Requirement: La PWA permite identificar cada medio de forma reconocible
La gestión web MUST permitir crear y editar un medio mediante alias, exactamente cuatro dígitos, tipo, red y cuenta contable vinculada, y MUST mostrar la terminación enmascarada sin solicitar el PAN.

#### Scenario: Registrar un apodo de Wallet
- **WHEN** la persona registra el alias `Oro`, la terminación `9876` y selecciona su TC
- **THEN** la PWA guarda el medio vinculado y lo presenta como `Oro` y `•••• 9876`

#### Scenario: Escribir caracteres ajenos en la terminación
- **WHEN** la persona pega espacios, letras o más de cuatro dígitos
- **THEN** el control conserva solo los primeros cuatro dígitos y exige cuatro antes de guardar

### Requirement: La coincidencia automática usa únicamente medios activos
El sistema MUST preseleccionar una cuenta solo cuando la terminación observada coincide con un medio activo y válido; una coincidencia ausente, ambigua o inactiva MUST requerir selección humana.

#### Scenario: Preselección inequívoca
- **WHEN** un candidato termina en `1234` y existe un único medio activo `1234`
- **THEN** la bandeja presenta `Android` y la cuenta vinculada, y la revisión preselecciona esa cuenta permitiendo cambiarla antes de confirmar

#### Scenario: Terminación ambigua
- **WHEN** dos medios activos comparten los mismos últimos cuatro
- **THEN** el sistema no decide una cuenta en silencio y solicita una selección explícita

#### Scenario: Medio desactivado
- **WHEN** la única coincidencia está inactiva
- **THEN** la bandeja no usa su cuenta como selección automática

### Requirement: El ciclo de cuentas mantiene integridad referencial
El sistema MUST reasignar los medios de tarjetas fusionadas a la cuenta destino y MUST eliminar los medios vinculados cuando se elimina su cuenta mediante la operación coordinada.

#### Scenario: Fusionar tarjetas de crédito
- **WHEN** dos cuentas de crédito se fusionan en una tarjeta destino
- **THEN** todos los medios de las cuentas fuente quedan vinculados a la cuenta destino dentro de la misma operación atómica

#### Scenario: Eliminar una cuenta
- **WHEN** el usuario confirma la eliminación coordinada de una cuenta con medios vinculados
- **THEN** el sistema elimina esos medios en el mismo commit y no deja asociaciones activas a la cuenta eliminada

#### Scenario: La terminación ya no tiene una asociación válida
- **WHEN** la terminación de un candidato pendiente coincidía con un medio que fue eliminado o reasignado
- **THEN** la revisión resuelve de nuevo el estado actual y exige una selección válida en vez de conservar una sugerencia antigua

### Requirement: La gestión es autenticada, responsive y accesible
El sistema MUST ofrecer la gestión de medios en Cuentas solo para usuarios autenticados, con controles utilizables a 390 px y 1440 px, foco visible, nombres accesibles y objetivos táctiles de al menos 44 px.

#### Scenario: Usuario invitado
- **WHEN** una persona usa Moneytrack sin iniciar sesión
- **THEN** la gestión de medios Android no se muestra ni persiste asociaciones locales que aparenten sincronización

#### Scenario: Operar con teclado o pantalla táctil
- **WHEN** el usuario crea, edita, activa o elimina un medio mediante teclado o una pantalla de 390 px
- **THEN** todos los controles son alcanzables, tienen etiqueta y comunican éxito o error sin depender solo del color
