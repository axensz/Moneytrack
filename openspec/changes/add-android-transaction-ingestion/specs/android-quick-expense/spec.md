## ADDED Requirements

### Requirement: Android publica accesos rápidos para registrar un gasto
El compañero MUST publicar `Registrar gasto` como acceso directo del launcher y como acción de Ajustes rápidos. Ambas entradas MUST abrir la misma captura nativa sin depender del permiso de notificaciones y MUST NOT aceptar datos financieros enviados por intents externos. La acción de Ajustes rápidos MUST NOT anunciarse como interruptor porque no representa un estado encendido o apagado.

#### Scenario: Abrir desde el launcher
- **WHEN** la persona toca o arrastra el acceso directo publicado por MoneyTrack
- **THEN** Android abre la captura de gasto rápido con fecha de hoy y sin datos financieros recibidos por intent

#### Scenario: El acceso a notificaciones está deshabilitado
- **WHEN** existe una sesión válida pero Android no concedió acceso a notificaciones
- **THEN** el acceso directo permite registrar el gasto manual sin solicitar ese permiso

#### Scenario: Abrir desde Ajustes rápidos
- **WHEN** la persona añadió `Registrar gasto` a sus controles y toca la acción
- **THEN** Android solicita desbloquear un dispositivo protegido cuando corresponde y abre la captura nativa existente

### Requirement: La captura manual crea solo un borrador privado
La captura MUST exigir descripción, fecha, monto COP, categoría de gasto y cuenta usada; MUST crear un candidato v3 del propietario mediante una operación online idempotente; y MUST NOT escribir una transacción.

#### Scenario: Continuar con datos válidos
- **WHEN** los cinco campos son válidos y Firestore confirma el candidato
- **THEN** Android abre la URL canónica con solo `view=transactions` y `reviewAndroid=<candidateId>`
- **AND** el libro, saldos, cupos, estadísticas y presupuestos permanecen iguales

#### Scenario: Sin conexión
- **WHEN** Firestore no puede confirmar el borrador en el servidor
- **THEN** la pantalla conserva el formulario, muestra `Reintentar` y no abre la PWA

#### Scenario: Doble toque o reintento
- **WHEN** la misma captura se envía más de una vez
- **THEN** Android reutiliza el mismo ID opaco y solo acepta la creación ausente o un documento servidor-actual idéntico

#### Scenario: La sesión cambia durante la captura
- **WHEN** cambia la persona autenticada mientras hay un formulario, una carga o una escritura en curso
- **THEN** Android elimina el estado financiero local de la sesión anterior e ignora sus respuestas tardías

#### Scenario: Android restaura un borrador que parecía guardado
- **WHEN** el sistema recrea la pantalla después de guardar o mientras una escritura seguía en curso
- **THEN** Android vuelve a comprobar el mismo ID y el documento pendiente exacto antes de habilitar el handoff
- **AND** nunca genera una segunda identidad por una respuesta de red incierta

### Requirement: El borrador manual tiene un contrato v3 exacto
El sistema MUST aceptar para `schemaVersion: 3` únicamente `source: android-shortcut`, los campos comunes, `suggestedAccountId`, `suggestedCategory`, `createdAt` y los campos del estado correspondiente. MUST rechazar campos de notificación o parser, claves desconocidas, referencias ajenas y combinaciones cruzadas de esquema/fuente.

#### Scenario: Crear el borrador del propietario
- **WHEN** una persona autenticada crea un documento pendiente con cuenta y categoría de gasto válidas y `createdAt` igual a la hora del servidor
- **THEN** Firestore conserva el candidato v3 inmutable bajo `users/{uid}/transactionImportCandidates/{candidateId}`

#### Scenario: Mezclar campos de notificación
- **WHEN** un candidato v3 incluye `sourcePackage`, terminación, apodo observado, parser o confianza
- **THEN** el decoder y las reglas lo rechazan sin inferir una variante compatible

#### Scenario: Intentar usar campos v3 en un candidato de notificación
- **WHEN** un candidato v1 o v2 incluye cuenta o categoría sugerida
- **THEN** el decoder y las reglas lo rechazan sin cambiar el significado legado

### Requirement: El handoff web contiene únicamente una identidad opaca
Android MUST generar el ID con 32 bytes aleatorios y representarlo como 64 caracteres hexadecimales minúsculos. La URL MUST NOT contener descripción, monto, fecha, categoría, cuenta ni UID.

#### Scenario: Abrir MoneyTrack después de guardar
- **WHEN** el servidor confirma el borrador privado
- **THEN** Android abre `https://axensz.github.io/Moneytrack/?view=transactions&reviewAndroid=<candidateId>` y ningún dato financiero aparece en la URL

#### Scenario: No existe navegador compatible
- **WHEN** Android no puede entregar el intent de navegación
- **THEN** conserva el marcador del borrador confirmado y ofrece `Abrir MoneyTrack` para reintentar
