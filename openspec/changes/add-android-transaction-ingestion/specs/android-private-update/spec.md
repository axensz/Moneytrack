## ADDED Requirements

### Requirement: El canal OTA acepta solo manifiestos canarios estrictos
La APK MUST consultar el manifiesto HTTPS fijo de MoneyTrack fuera del hilo principal y MUST aceptar únicamente el conjunto exacto de campos, tipos y límites del esquema canario vigente. El APK anunciado MUST usar una URL bajo el prefijo de GitHub Releases permitido y MUST tener un `versionCode` mayor que el instalado.

#### Scenario: Existe una versión posterior válida
- **WHEN** el manifiesto tiene esquema `1`, canal `canary`, campos exactos, URL permitida, hash y tamaño válidos, y un `versionCode` mayor
- **THEN** MoneyTrack presenta esa versión como actualización disponible

#### Scenario: El manifiesto no cumple el contrato
- **WHEN** el manifiesto agrega claves, cambia tipos, supera 32 KiB, redirige, usa otra URL o anuncia una versión actual o anterior
- **THEN** MoneyTrack no ofrece el APK y conserva operativas sus demás funciones

### Requirement: Las consultas automáticas son acotadas y no bloqueantes
MoneyTrack MUST limitar una consulta automática exitosa a una ventana de 24 horas, MUST permitir que una consulta manual omita esa ventana y MUST NOT exponer el cuerpo remoto, excepciones ni datos técnicos como texto de producto.

#### Scenario: La aplicación vuelve al primer plano dentro de la ventana
- **WHEN** ya hubo una respuesta válida durante las 24 horas anteriores
- **THEN** MoneyTrack omite la consulta automática y continúa con la pantalla solicitada

#### Scenario: La persona busca manualmente
- **WHEN** la persona pulsa `Buscar actualización`
- **THEN** MoneyTrack consulta el manifiesto aunque exista una consulta automática reciente

#### Scenario: La consulta falla
- **WHEN** ocurre un timeout, falta de red, respuesta HTTP no válida o JSON rechazado
- **THEN** una consulta automática permanece silenciosa y una consulta manual muestra una salida reparable
- **AND** ninguna de las dos bloquea la captura, el gasto rápido ni la apertura web

### Requirement: Las actualizaciones privadas se verifican antes de instalar
La APK MUST aceptar únicamente una versión con `versionCode` mayor, `versionCode` y `versionName` idénticos a los anunciados, URL HTTPS permitida, tamaño y SHA-256 exactos, paquete `com.moneytrack.capture` y al menos un certificado de firma coincidente con la instalación actual.

#### Scenario: Asset válido
- **WHEN** la persona solicita una versión posterior y la descarga coincide en tamaño, hash, paquete y certificado
- **THEN** la app entrega el APK mediante `FileProvider` al instalador oficial de Android
- **AND** Android conserva la confirmación final de la persona

#### Scenario: Tamaño o hash diferente
- **WHEN** la descarga no coincide con el tamaño o SHA-256 anunciado
- **THEN** MoneyTrack elimina únicamente ese archivo de actualización, conserva la versión instalada y no abre el instalador

#### Scenario: Versión, paquete o firma diferente
- **WHEN** el APK descargado no coincide con la versión anunciada, pertenece a otro paquete o no comparte un certificado con la instalación actual
- **THEN** MoneyTrack elimina únicamente ese archivo, conserva la versión instalada y no abre el instalador

### Requirement: La descarga requiere una decisión visible y almacenamiento acotado
MoneyTrack MUST iniciar la descarga solo después de la acción `Actualizar MoneyTrack`, MUST usar el directorio específico `android-updates` de la aplicación y MUST NOT solicitar acceso general al almacenamiento.

#### Scenario: La actualización está disponible pero no fue aceptada
- **WHEN** MoneyTrack presenta una versión posterior y la persona no pulsa la acción de actualización
- **THEN** la app no descarga ningún APK

#### Scenario: La persona inicia la actualización
- **WHEN** la persona pulsa `Actualizar MoneyTrack`
- **THEN** Android descarga el APK con estado visible dentro del directorio acotado de MoneyTrack

### Requirement: Android conserva autoridad sobre la instalación
MoneyTrack MUST usar un `FileProvider` no exportado con permiso de lectura temporal y MUST entregar el APK mediante el instalador oficial. Si la fuente no está autorizada, MUST abrir únicamente el ajuste específico de la aplicación y MUST NOT instalar silenciosamente.

#### Scenario: Falta autorización para esta fuente
- **WHEN** un APK verificado está listo pero Android no permite instalar desde MoneyTrack
- **THEN** la app abre `ACTION_MANAGE_UNKNOWN_APP_SOURCES` para su propio paquete y deja la decisión a la persona

#### Scenario: La fuente está autorizada
- **WHEN** el APK ya fue verificado y Android permite instalar desde MoneyTrack
- **THEN** la app abre `ACTION_INSTALL_PACKAGE` con acceso temporal de solo lectura

### Requirement: El estado OTA no compite con la tarea principal
Las dos entradas Android MUST compartir los estados `HIDDEN`, `AVAILABLE`, `DOWNLOADING`, `READY_TO_INSTALL`, `PERMISSION_REQUIRED` y `ERROR`. El aviso MUST ser secundario, accesible y reparable, y MUST NOT deshabilitar la acción principal de `MainActivity` ni de `QuickExpenseActivity`.

#### Scenario: No hay una actualización posterior
- **WHEN** la versión instalada es igual o mayor a la anunciada
- **THEN** la superficie OTA permanece oculta y no ocupa espacio

#### Scenario: Una descarga falla
- **WHEN** el updater entra en `ERROR`
- **THEN** muestra `No pudimos preparar la actualización. Intenta de nuevo.` y la pantalla mantiene habilitada su acción principal

### Requirement: La entrega de arranque es explícita y conserva identidad
MoneyTrack MUST describir que `0.2.0` con `versionCode 2` se instala por enlace HTTPS sobre `0.1.0`, y MUST usar el actualizador interno solo para versiones posteriores. Todo APK MUST conservar `applicationId` y certificado; las credenciales de firma MUST permanecer fuera del repositorio.

#### Scenario: Instalar el bootstrap
- **WHEN** la persona abre el enlace HTTPS verificado de `0.2.0` desde un dispositivo con `0.1.0`
- **THEN** Android ofrece actualizar la aplicación existente sin requerir desinstalación ni limpieza de datos

#### Scenario: Preparar la primera OTA interna
- **WHEN** todavía no existe un asset remoto posterior al bootstrap publicado y verificado
- **THEN** `update.json` continúa anunciando el canario actual y no ofrece una actualización inexistente

#### Scenario: Falta continuidad de firma
- **WHEN** la compilación de release no puede demostrar el mismo certificado de la instalación actual
- **THEN** la publicación se detiene y MoneyTrack no recomienda desinstalar como solución inicial
