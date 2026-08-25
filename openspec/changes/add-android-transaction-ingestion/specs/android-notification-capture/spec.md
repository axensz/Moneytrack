## ADDED Requirements

### Requirement: La captura requiere consentimiento y fuentes explícitas
El compañero Android MUST permanecer inactivo hasta que el usuario autenticado habilite acceso a notificaciones y seleccione al menos un paquete financiero; el allowlist MUST iniciar vacío.

#### Scenario: Primera apertura sin permiso
- **WHEN** el usuario abre el compañero por primera vez
- **THEN** la aplicación explica el alcance, muestra acceso deshabilitado y ofrece abrir los ajustes del sistema sin capturar nada

#### Scenario: Paquete no seleccionado
- **WHEN** llega una notificación de una aplicación fuera del allowlist
- **THEN** el servicio la descarta antes de analizar o persistir su contenido

#### Scenario: Descubrir una fuente sin inventariar todas las aplicaciones
- **WHEN** una aplicación aún no permitida emite una notificación después de conceder acceso al listener
- **THEN** el compañero puede recordar localmente solo su paquete y etiqueta para ofrecerla en el selector, sin leer los extras ni solicitar acceso general al inventario de aplicaciones

#### Scenario: Revocar el permiso
- **WHEN** el usuario revoca el acceso a notificaciones o desactiva la captura
- **THEN** no se crean candidatos nuevos y la pantalla comunica el estado real

### Requirement: Android usa la misma identidad autenticada de Moneytrack
El compañero MUST autenticar con Google mediante Credential Manager y Firebase Auth en el mismo proyecto de la PWA, y MUST detener escrituras si no existe una sesión Firebase válida.

#### Scenario: Iniciar sesión con la misma cuenta Google
- **WHEN** el usuario autentica el compañero con la cuenta usada en Moneytrack web
- **THEN** Firebase devuelve el mismo UID y los candidatos se guardan bajo `users/{uid}`

#### Scenario: Sesión cerrada o vencida
- **WHEN** no hay `currentUser` válido al llegar una notificación
- **THEN** el servicio descarta el evento sin crear datos para otro usuario ni aparentar sincronización

#### Scenario: Modo invitado
- **WHEN** una persona no inicia sesión
- **THEN** no puede activar una cola local de transacciones que luego se atribuya automáticamente a una cuenta

### Requirement: El parser acepta solo compras COP inequívocas
El parser MUST emitir un candidato únicamente cuando encuentre exactamente un monto COP positivo, un marcador de compra permitido y ningún marcador de rechazo, reverso o seguridad; toda salida `low` MUST descartarse localmente.

#### Scenario: Compra completa
- **WHEN** una notificación permitida contiene un único monto COP, comercio, marcador de compra y últimos cuatro
- **THEN** el parser produce un candidato `high` normalizado

#### Scenario: Compra sin terminación
- **WHEN** existe monto y marcador de compra inequívocos pero no últimos cuatro
- **THEN** el parser puede producir un candidato `medium` sin `cardLast4` para revisión humana

#### Scenario: Múltiples montos
- **WHEN** el texto contiene dos montos que el parser no puede desambiguar
- **THEN** el evento se descarta y no se adivina un valor

#### Scenario: Rechazo, reverso o código de seguridad
- **WHEN** la notificación contiene `rechazada`, `declinada`, `fallida`, `anulada`, `reversada`, `código`, `clave` u `OTP`
- **THEN** el parser no crea candidato aunque también aparezca un monto

#### Scenario: Moneda distinta de COP
- **WHEN** la única compra observada está expresada en USD u otra moneda
- **THEN** el primer canario no la sube y no inventa una TRM

### Requirement: El contenido crudo nunca sale del proceso
El compañero MUST mantener título y texto de la notificación solo en memoria durante el análisis y MUST prohibir su persistencia o logging, junto con PAN, CVV, OTP e identificadores de hardware.

#### Scenario: Persistir un candidato válido
- **WHEN** el parser acepta una compra
- **THEN** el repositorio recibe únicamente el contrato normalizado y no tiene acceso a campos crudos

#### Scenario: Parser falla
- **WHEN** el evento no cumple el contrato
- **THEN** el log local puede registrar solo un código de resultado y nunca monto, comercio, últimos cuatro o texto original

#### Scenario: Identidad del dispositivo
- **WHEN** la instalación necesita distinguir su origen
- **THEN** usa un UUID aleatorio de instalación y nunca IMEI, número telefónico, Android ID o serial

### Requirement: Cada evento tiene identidad determinista
El compañero MUST derivar un `candidateId` hexadecimal de 64 caracteres a partir de instalación, paquete, clave del sistema y `postTime`, y MUST reutilizarlo en actualizaciones o reintentos del mismo evento.

#### Scenario: La notificación se actualiza
- **WHEN** Android vuelve a publicar la misma clave y tiempo de una compra
- **THEN** el compañero intenta el mismo documento y no crea una segunda fila candidata

#### Scenario: Dos compras diferentes
- **WHEN** cambia la clave o el tiempo observado
- **THEN** el hash produce identidades distintas

### Requirement: La captura sobrevive a pérdida temporal de red
El compañero MUST usar la persistencia local de Firestore para encolar únicamente candidatos normalizados y MUST sincronizarlos al volver la red, sin prometer que ya están en la PWA mientras la escritura siga pendiente.

#### Scenario: Compra observada offline
- **WHEN** el dispositivo autenticado y autorizado recibe una compra válida sin red
- **THEN** Firestore conserva la escritura normalizada local y la envía al reconectar

#### Scenario: Escritura rechazada al reconectar
- **WHEN** reglas o autenticación rechazan una escritura encolada
- **THEN** la pantalla muestra un estado de error genérico y el compañero no declara la captura como disponible en Moneytrack

### Requirement: La pantalla Android expone estado operativo verificable
El compañero MUST mostrar sesión, acceso a notificaciones, captura activa, paquetes seleccionados y último resultado no financiero, y MUST ofrecer acciones para iniciar/cerrar sesión, abrir ajustes y abrir la PWA.

#### Scenario: Configuración lista
- **WHEN** existe sesión, permiso y al menos un paquete seleccionado
- **THEN** la pantalla indica “Captura activa” y qué aplicaciones están habilitadas

#### Scenario: Configuración incompleta
- **WHEN** falta cualquiera de las precondiciones
- **THEN** la pantalla identifica exactamente cuál falta y no muestra un éxito engañoso

### Requirement: No se promete historial ni acceso interno a Wallet
El compañero MUST describir que observa notificaciones futuras visibles después de habilitar el permiso y MUST abstenerse de afirmar que sincroniza el historial de Google Wallet.

#### Scenario: Activar hoy el servicio
- **WHEN** el usuario habilita la captura
- **THEN** solo se procesan notificaciones futuras recibidas por el listener y no aparecen compras anteriores
