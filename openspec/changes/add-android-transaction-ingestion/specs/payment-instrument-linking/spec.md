## ADDED Requirements

### Requirement: Un medio de pago se vincula a una cuenta contable existente
El sistema MUST permitir que un usuario autenticado vincule cada plástico o token de wallet con exactamente una cuenta contable propia existente, y MUST permitir varios medios de pago para la misma cuenta.

#### Scenario: Vincular un token de wallet a una TC
- **WHEN** el usuario guarda un medio `wallet-token` con últimos cuatro válidos y selecciona una cuenta `credit` propia
- **THEN** el sistema persiste el medio con ese `accountId` sin crear otra cuenta ni duplicar cupo o deuda

#### Scenario: Vincular un token solo por el apodo visible
- **WHEN** el usuario guarda un medio `wallet-token` v2 con el apodo exacto `Oro`, sin terminación, y selecciona una cuenta propia
- **THEN** el sistema persiste el medio sin inventar dígitos y permite usar el apodo como pista de coincidencia

#### Scenario: Vincular plástico y token a la misma cuenta
- **WHEN** el usuario crea dos medios con terminaciones diferentes para una misma cuenta
- **THEN** ambos medios permanecen relacionados con la misma autoridad contable

#### Scenario: Rechazar una cuenta ajena o inexistente
- **WHEN** un cliente intenta guardar un medio con un `accountId` que no existe para el usuario autenticado
- **THEN** el sistema rechaza la escritura sin crear una asociación colgante

### Requirement: Los medios de pago conservan solo identificadores mínimos
El sistema MUST aceptar únicamente versión, etiqueta, tipo, red, últimos cuatro opcionales para `wallet-token` v2, cuenta, estado y timestamps del medio, y MUST rechazar PAN completo, CVV, OTP, credenciales o claves desconocidas. Un `physical-card` y todo medio v1 MUST conservar exactamente cuatro dígitos.

#### Scenario: Guardar identificación mínima
- **WHEN** el usuario registra `Tarjeta personal`, `wallet-token`, `visa` y `1234`
- **THEN** el sistema guarda esos metadatos mínimos y nunca solicita el número completo o CVV

#### Scenario: Omitir terminación en una tarjeta física
- **WHEN** un cliente intenta guardar `physical-card` sin exactamente cuatro dígitos
- **THEN** la validación y las reglas rechazan el medio

#### Scenario: Rechazar payload sensible
- **WHEN** un cliente incluye `pan`, `cvv`, `otp`, texto crudo u otra clave no permitida
- **THEN** las reglas de datos rechazan la escritura completa

### Requirement: La PWA permite identificar cada medio de forma reconocible
La gestión web MUST permitir crear y editar un medio mediante alias, tipo, red, cuenta contable vinculada y terminación cuando esté disponible. Para `wallet-token`, el alias MUST explicar que debe coincidir con el apodo visible en Wallet y los últimos cuatro MUST ser opcionales; para `physical-card`, MUST exigir exactamente cuatro. La lista MUST omitir la terminación enmascarada cuando no exista, sin mostrar `undefined` ni solicitar el PAN.

#### Scenario: Registrar un apodo de Wallet
- **WHEN** la persona registra el alias `Oro`, la terminación `9876` y selecciona su TC
- **THEN** la PWA guarda el medio vinculado y lo presenta como `Oro` y `•••• 9876`

#### Scenario: Escribir caracteres ajenos en la terminación
- **WHEN** la persona pega espacios, letras o más de cuatro dígitos
- **THEN** el control conserva solo los primeros cuatro dígitos y, si el medio es físico o el campo no está vacío, exige exactamente cuatro antes de guardar

### Requirement: La coincidencia automática usa señales activas e inequívocas
El sistema MUST preseleccionar una cuenta solo cuando las señales observadas resuelvan exactamente un medio activo: la terminación puede comparar cualquier tipo y el apodo normalizado puede comparar únicamente `wallet-token`. Cuando ambas señales existan MUST converger en el mismo medio; una coincidencia ausente, ambigua, conflictiva o inactiva MUST requerir selección humana.

#### Scenario: Preselección inequívoca
- **WHEN** un candidato termina en `1234` y existe un único medio activo `1234`
- **THEN** la bandeja presenta `Android` y la cuenta vinculada, y la revisión preselecciona esa cuenta permitiendo cambiarla antes de confirmar

#### Scenario: Preselección inequívoca por apodo de Wallet
- **WHEN** un candidato observa `MamáDébito` y existe un único `wallet-token` activo cuyo alias coincide después de NFKC, espacios y minúsculas
- **THEN** la revisión preselecciona su cuenta sin presentar el apodo como prueba de propiedad

#### Scenario: El mismo apodo pertenece a varios medios
- **WHEN** dos `wallet-token` activos normalizan al mismo apodo observado
- **THEN** el sistema marca la coincidencia como ambigua y no recomienda cuenta

#### Scenario: Apodo y terminación entran en conflicto
- **WHEN** el apodo observado coincide con un medio y los últimos cuatro coinciden con otro
- **THEN** el sistema informa conflicto y no usa ninguna de las dos cuentas

#### Scenario: Apodo desconocido o tarjeta ajena
- **WHEN** un candidato observa un apodo que no existe entre los medios activos del usuario
- **THEN** permanece sin cuenta sugerida y no crea un medio ni una cuenta automáticamente

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
El sistema MUST ofrecer la gestión de medios solo para usuarios autenticados y de forma contextual desde cada cuenta mediante un botón de icono, sin una sección global ni un panel debajo del listado. Los controles MUST ser utilizables a 390 px y 1440 px, tener foco visible, nombres accesibles y objetivos táctiles de al menos 44 px.

#### Scenario: Abrir los medios de una cuenta
- **WHEN** el usuario activa el botón con nombre accesible “Gestionar medios de pago de <cuenta>”
- **THEN** la PWA abre un único diálogo `Medios de pago · <cuenta>`, muestra solo sus medios y preselecciona esa cuenta al crear uno nuevo

#### Scenario: Añadir o editar desde el administrador
- **WHEN** el usuario elige añadir o editar un medio dentro del diálogo de la cuenta
- **THEN** el mismo diálogo cambia al formulario correspondiente sin abrir otro diálogo encima

#### Scenario: Usuario invitado
- **WHEN** una persona usa Moneytrack sin iniciar sesión
- **THEN** la gestión de medios Android no se muestra ni persiste asociaciones locales que aparenten sincronización

#### Scenario: Operar con teclado o pantalla táctil
- **WHEN** el usuario crea, edita, activa o elimina un medio mediante teclado o una pantalla de 390 px
- **THEN** todos los controles son alcanzables, tienen etiqueta y comunican éxito o error sin depender solo del color
