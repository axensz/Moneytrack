## ADDED Requirements

### Requirement: La captura requiere consentimiento y fuentes explícitas
El compañero Android MUST permanecer inactivo hasta que el usuario autenticado habilite acceso a notificaciones y seleccione al menos una fuente; el allowlist MUST iniciar vacío.

#### Scenario: Primera apertura sin permiso
- **WHEN** el usuario abre el compañero por primera vez
- **THEN** la aplicación explica el alcance, muestra acceso deshabilitado y ofrece abrir los ajustes del sistema sin capturar nada

#### Scenario: Paquete no seleccionado
- **WHEN** llega una notificación de una aplicación fuera del allowlist
- **THEN** el servicio la descarta antes de analizar o persistir su contenido

#### Scenario: Descubrir una fuente sin inventariar todas las aplicaciones
- **WHEN** una aplicación aún no permitida emite una notificación después de conceder acceso al listener
- **THEN** el compañero puede recordar localmente solo su paquete y etiqueta para ofrecerla en el selector, sin leer los extras ni solicitar acceso general al inventario de aplicaciones

#### Scenario: Google Wallet como fuente conocida
- **WHEN** la persona abre la selección de fuentes antes de que Google Wallet haya emitido una notificación
- **THEN** el compañero muestra `Google Wallet` como opción recomendada mediante su paquete exacto interno, pero la deja fuera del allowlist hasta que la persona la active y guarde

#### Scenario: Conservar Google Wallet elegida
- **WHEN** la persona activa Google Wallet y vuelve a abrir o actualizar el compañero
- **THEN** la selección persiste y solo sus notificaciones futuras pueden pasar el filtro del paquete antes del parser

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
El compañero MUST derivar un `candidateId` hexadecimal de 64 caracteres a partir de instalación, paquete, clave del sistema y una generación activa anclada al primer `postTime`; MUST reutilizar esa generación en actualizaciones o reintentos mientras la notificación continúe activa y MUST olvidarla cuando Android retire el evento o expire el límite defensivo de 24 horas.

#### Scenario: La notificación se actualiza
- **WHEN** Android vuelve a publicar la misma clave de una compra activa aunque cambie su `postTime`
- **THEN** el compañero intenta el mismo documento y no crea una segunda fila candidata

#### Scenario: Dos compras diferentes
- **WHEN** cambia la clave, Android retiró la entrega anterior o su generación superó 24 horas
- **THEN** el hash produce identidades distintas

### Requirement: La captura sobrevive a pérdida temporal de red
El compañero MUST usar la persistencia local de Firestore para encolar únicamente candidatos normalizados y MUST sincronizarlos al volver la red, sin prometer que ya están en la PWA mientras la escritura siga pendiente.

#### Scenario: Compra observada offline
- **WHEN** el dispositivo autenticado y autorizado recibe una compra válida sin red
- **THEN** Firestore conserva la escritura normalizada local y la envía al reconectar

#### Scenario: Escritura rechazada al reconectar
- **WHEN** reglas o autenticación rechazan una escritura encolada
- **THEN** la pantalla lista oculta `Captura activa` y muestra un error genérico persistente sin datos financieros; resultados irrelevantes no lo borran y únicamente una escritura posterior `STORED` restablece el estado activo

### Requirement: La pantalla Android expone estado operativo verificable
El compañero MUST comunicar sesión, acceso a notificaciones, captura activa y fuentes seleccionadas en la etapa o resumen correspondiente, y MUST ofrecer las acciones aplicables para iniciar/cerrar sesión, abrir ajustes y abrir la PWA; MUST NOT exponer códigos técnicos ni un bloque de último resultado en la interfaz normal.

#### Scenario: Configuración lista
- **WHEN** existe sesión, permiso y al menos una fuente seleccionada
- **THEN** la pantalla indica “Configuración completa” y “Captura activa”, muestra qué aplicaciones están habilitadas y ofrece administrarlas

#### Scenario: Administrar fuentes desde el estado listo
- **WHEN** la persona abre `Administrar aplicaciones`, activa o desactiva fuentes descubiertas y guarda
- **THEN** un diálogo sobre la misma Activity muestra la fuente conocida y todas las fuentes observadas con casillas, persiste exactamente esa selección y, si queda vacía, regresa a la etapa `CAPTURE`

#### Scenario: Cancelar la administración de fuentes
- **WHEN** la persona cambia casillas y pulsa `Cancelar`
- **THEN** el diálogo se cierra sin modificar el allowlist ni navegar a otra pantalla

#### Scenario: Una o muchas fuentes descubiertas
- **WHEN** el diálogo contiene hasta dos fuentes o una lista más larga
- **THEN** la lista usa su altura natural en el primer caso y un contenedor desplazable acotado desde tres fuentes, sin ocultar casillas

#### Scenario: La fuente deseada aún no está disponible
- **WHEN** la persona abre `Administrar aplicaciones` antes de que otra aplicación haya emitido una notificación
- **THEN** el diálogo explica que aparecerá después de una notificación futura y no solicita acceso al inventario general de aplicaciones

#### Scenario: Resumen listo sin texto repetido
- **WHEN** la configuración está completa y existe al menos una fuente seleccionada
- **THEN** un tratamiento compacto con icono y texto comunica `Configuración completa`, y el bloque neutral `Captura activa` conserva la señal de éxito en icono/texto, muestra directamente las etiquetas de esas fuentes y la acción principal `Administrar aplicaciones`, sin repetir una explicación ni el rótulo `Aplicaciones elegidas`

#### Scenario: Abrir la aplicación web
- **WHEN** la configuración está completa
- **THEN** `Abrir MoneyTrack` aparece como una fila de utilidad secundaria con padding, borde, etiqueta visible e icono vectorial externo, fuera del bloque de captura, sin otra tarjeta explicativa y sin competir con la acción principal

#### Scenario: Fuente técnica en una variante de producción
- **WHEN** `com.android.shell` fue observada o quedó permitida localmente y la interfaz se ejecuta como producto
- **THEN** la fuente no aparece en el selector ni en el resumen, mientras una variante diagnóstica puede presentarla únicamente como `Fuente de prueba`

#### Scenario: Fuente observada sin etiqueta segura
- **WHEN** la etiqueta está vacía, equivale a un paquete, contiene controles de dirección o coincide después de normalizarse con una fuente conocida como `Google Wallet`
- **THEN** la interfaz muestra `Aplicación detectada · No verificada` y nunca el paquete técnico, una identidad conocida falsa ni una clasificación financiera inventada

#### Scenario: Fuente observada con etiqueta legible
- **WHEN** una aplicación no conocida aporta una etiqueta segura y distinta de las fuentes verificadas
- **THEN** la interfaz conserva la etiqueta sanitizada y añade `No verificada` en el selector, el diálogo y el resumen

#### Scenario: Configuración incompleta
- **WHEN** falta cualquiera de las precondiciones
- **THEN** la pantalla identifica exactamente cuál falta y no muestra un éxito engañoso

### Requirement: La configuración Android es progresiva y respeta el sistema
El compañero MUST mostrar solo la primera etapa incompleta entre sesión, acceso a notificaciones y captura, MUST entrar directamente al estado operativo cuando todo siga listo y MUST mantener el contenido fuera de las barras y recortes del sistema.

#### Scenario: Primera apertura sin sesión
- **WHEN** termina la comprobación inicial y no existe una sesión válida
- **THEN** el splash con la identidad canónica de MoneyTrack entrega una pantalla de sesión que explica su propósito y muestra solo la acción primaria de iniciar con Google

#### Scenario: Reanudar una configuración completa
- **WHEN** sesión, acceso, fuente y captura permanecen activos
- **THEN** la aplicación omite los pasos completados y abre el resumen operativo

#### Scenario: Permiso revocado después de configurar
- **WHEN** la aplicación vuelve al primer plano sin acceso a notificaciones
- **THEN** muestra la etapa de acceso y no declara captura activa

#### Scenario: Cambiar apariencia
- **WHEN** la persona abre el botón de apariencia con icono neutro de contraste de la cabecera y guarda `Sistema`, `Claro` u `Oscuro` en el diálogo `Apariencia`
- **THEN** la Activity aplica y conserva el modo elegido con radios y acciones violetas, colores legibles, `Cancelar` y `Guardar`, sin un selector permanente en el contenido y sin ocultarlo bajo las barras del dispositivo

#### Scenario: Pantalla compacta o texto ampliado
- **WHEN** cambia el ancho, la orientación o la escala de fuente del dispositivo
- **THEN** el contenido usa gutters adaptativos, conserva una columna legible y se ajusta o desplaza verticalmente sin solapar barras, cortar acciones ni producir desbordamiento horizontal

#### Scenario: Sesión activa
- **WHEN** Firebase conserva una persona autenticada
- **THEN** la acción de iniciar sesión no se muestra y cerrar sesión continúa disponible

### Requirement: La interfaz Android mantiene identidad, jerarquía y controles semánticos
El compañero MUST derivar launcher y SplashScreen del logo canónico de MoneyTrack, MUST conservar la arquitectura AppCompat/XML y MUST aplicar una única jerarquía visual accesible en claro y oscuro, sin añadir Compose, Material 3 ni otra dependencia visual.

#### Scenario: Inicio y launcher reconocibles
- **WHEN** la persona inicia o localiza la aplicación en Android
- **THEN** launcher, icono adaptativo y SplashScreen muestran la misma marca reconocible que la PWA y el nombre visible conserva la escritura `MoneyTrack`

#### Scenario: Acciones habilitadas
- **WHEN** un estado ofrece una acción primaria, una secundaria y una terciaria
- **THEN** existe como máximo una primaria violeta, las demás usan tratamiento delineado/tonal o texto, todas usan estilo oración y ninguna acción habilitada parece desactivada

#### Scenario: Activar o desactivar captura
- **WHEN** la etapa de captura permite cambiar el estado global y seleccionar varias fuentes
- **THEN** el estado global usa `SwitchCompat` y cada fuente usa una casilla, con objetivos de 48 dp, nombres TalkBack y estado comprensible sin depender solo del color

#### Scenario: Estado completo y captura activa
- **WHEN** la configuración está lista
- **THEN** `Configuración completa` combina icono, texto y el par success sólido-sobre-muted, mientras `Captura activa` usa la misma superficie neutral de las demás etapas y comunica el éxito solo mediante icono y texto; la privacidad se explica una sola vez con copy neutral

#### Scenario: Inicio de sesión en curso o fallido
- **WHEN** Credential Manager está abierto o devuelve un error recuperable
- **THEN** la aplicación impide un segundo gesto, comunica progreso y muestra el fallo cerca de la acción con una recomendación reparable, sin exponer tokens, paquetes de configuración ni excepciones internas

#### Scenario: Accesibilidad y adaptación verificables
- **WHEN** la interfaz se usa a 320 dp, 400 dp, ancho mediano o expandido, landscape, texto a 1,3×, tema claro u oscuro y navegación por TalkBack
- **THEN** mantiene orden lógico, nombres accesibles, objetivos de 48 dp, contraste AA, foco visible, barras seguras, modal desplazable y una columna de lectura sin contenido cortado

### Requirement: No se promete historial ni acceso interno a Wallet
El compañero MUST describir que observa notificaciones futuras visibles después de habilitar el permiso y MUST abstenerse de afirmar que sincroniza el historial de Google Wallet.

#### Scenario: Activar hoy el servicio
- **WHEN** el usuario habilita la captura
- **THEN** solo se procesan notificaciones futuras recibidas por el listener y no aparecen compras anteriores
