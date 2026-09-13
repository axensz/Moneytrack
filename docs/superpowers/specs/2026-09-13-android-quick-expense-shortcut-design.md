# Diseño — Acceso directo Android para registrar gastos y actualización OTA

- **Fecha:** 2026-09-13
- **Estado:** Ready for Review
- **Alcance:** PWA MoneyTrack, compañero Android `android-capture/`, Firestore y entrega privada de APK
- **North Star:** *The Confident Ledger*

## 1. Resultado aprobado

MoneyTrack ofrecerá un acceso directo nativo de Android llamado **Registrar gasto**. Al tocarlo, se abrirá una captura rápida dentro del compañero Android, no un formulario web genérico ni una secuencia de diálogos del sistema.

La persona completará:

1. ¿En qué gastaste?
2. Fecha, con hoy como valor inicial.
3. Monto en COP.
4. Categoría de gasto.
5. Método de pago, entendido como la **cuenta o tarjeta de MoneyTrack** que conserva la autoridad financiera.

La acción **Continuar a MoneyTrack** guardará un borrador privado sin efecto contable y abrirá la PWA directamente en la revisión de ese borrador. Solo **Confirmar gasto** en MoneyTrack creará la transacción y afectará saldo, cupo, estadísticas o presupuesto.

La APK incorporará además una actualización OTA privada: detectará una versión posterior, descargará el APK publicado, verificará integridad y firma, y entregará la instalación al instalador oficial de Android. Android seguirá exigiendo confirmación visible del usuario; no se intentará una instalación silenciosa.

## 2. Contexto actual verificado

- MoneyTrack sigue siendo la PWA principal; el módulo Kotlin/AppCompat `android-capture/` es un compañero nativo que comparte Firebase Auth y Firestore.
- `Account` es la autoridad de dinero. El texto de producto **Método de pago** seleccionará una `Account`; no se creará una segunda entidad financiera paralela.
- La colección `users/{uid}/transactionImportCandidates` ya implementa borradores no contables con estados `pending`, `confirmed` y `dismissed`.
- `confirmTransactionImport` ya usa la frontera autenticada, atómica e idempotente del libro y es la única ruta que puede transformar un candidato Android en una `Transaction`.
- La PWA solo enruta hoy por `?view=<vista>` y la APK abre la URL canónica con `ACTION_VIEW`.
- La APK actual es `0.1.0` con `versionCode 1` y no contiene un actualizador OTA.
- El APK canario publicado fue firmado con el mismo certificado Android Debug disponible en este entorno. Su huella SHA-256 es `87e88b8490a7f1bc4fa64995ae383e7fd17fcf8953f4b454849d570544ed4de7`.
- La línea base antes de este diseño está verde: 1.566 pruebas web y `testDebugUnitTest` de Android pasaron.

## 3. Alcance

### Incluido

- Acceso directo estático compatible con Android 8 o posterior, acorde con el `minSdk 26` actual.
- Pantalla nativa dedicada de captura rápida en español.
- Lectura privada de cuentas y categorías del usuario autenticado desde Firestore.
- Creación idempotente de un candidato manual normalizado.
- Apertura de la PWA con un identificador opaco para revisar exactamente ese borrador.
- Precarga y revalidación de los cinco datos en la revisión web.
- Confirmación mediante el escritor contable existente.
- Actualización OTA privada basada en una publicación firmada y un manifiesto pequeño de versión.
- Pruebas de contrato, seguridad, UI, reglas Firestore, integración y actualización.

### No incluido

- Contabilización directa o automática desde Android.
- Enviar monto, comercio, cuenta o categoría en la URL.
- Crear un concepto nuevo de “método de pago” separado de `Account`.
- Captura por voz, Google Assistant, automatizaciones de terceros o widgets en esta primera versión.
- Crear cuentas o categorías desde la pantalla rápida.
- Confirmar transacciones sin conexión.
- Instalación silenciosa de APK, rotación de clave de firma o publicación en Google Play.
- Reescribir el compañero en Compose, añadir Navigation, WorkManager o una librería de actualización.

## 4. Recorrido de usuario

### 4.1 Descubrir el acceso directo

- Al mantener presionado el icono de MoneyTrack, Android mostrará **Registrar gasto**.
- El acceso se podrá arrastrar a la pantalla de inicio como icono independiente.
- El acceso directo apuntará a una `QuickExpenseActivity` y no aceptará datos financieros de aplicaciones externas.

### 4.2 Capturar el gasto

- Si la sesión Firebase sigue activa, la pantalla cargará cuentas y categorías de gasto.
- Si no hay sesión, mostrará una explicación breve y la acción de inicio de sesión existente. No exigirá acceso a notificaciones para registrar un gasto manual.
- **Fecha** inicia en hoy.
- **Método de pago** muestra el nombre de las cuentas y tarjetas actuales. Se preselecciona únicamente la cuenta marcada como predeterminada; si no existe una opción inequívoca, queda sin selección.
- **Categoría** muestra solo categorías `expense` y queda sin selección para evitar clasificaciones silenciosas.
- **Monto** usa teclado numérico, formato colombiano visible y la misma normalización a centavos usada por los candidatos actuales.
- Todos los campos tienen etiqueta persistente, mensaje de error junto al control y objetivos táctiles de al menos 48 dp.

### 4.3 Continuar a MoneyTrack

Al pulsar **Continuar a MoneyTrack**:

1. Android valida localmente los cinco campos.
2. Genera una identidad aleatoria de 32 bytes representada como 64 caracteres hexadecimales. Ningún dato financiero forma parte del ID.
3. Ejecuta una transacción Firestore que requiere red y crea el borrador solo si el documento no existe; si ya existe, acepta únicamente un documento idéntico.
4. Espera confirmación del servidor. Una escritura solamente encolada en la caché Android no se presenta como lista para la PWA, porque la caché nativa no es compartida con el navegador.
5. Abre `https://axensz.github.io/Moneytrack/?view=transactions&reviewAndroid=<candidateId>` mediante `ACTION_VIEW`.
6. Finaliza la pantalla nativa después de entregar el intent. Si no existe una aplicación capaz de abrir la URL, conserva el estado guardado y ofrece **Abrir MoneyTrack** para reintentar.

La URL contiene solo el ID opaco. Firestore Auth y las reglas por UID siguen siendo la autorización real.

### 4.4 Revisar y confirmar

- La PWA valida el formato de `reviewAndroid`, mantiene la vista `transactions`, espera la suscripción del usuario actual y abre solo el candidato pendiente cuyo ID coincide.
- La bandeja se expande y el modal usa el título **Revisar gasto rápido** para `source: android-shortcut`.
- Cuenta y categoría se precargan solo si todavía existen entre las opciones actuales. Monto, descripción y fecha se precargan desde el candidato.
- Si el usuario inició la PWA con otra cuenta, si el borrador no existe o si ya es terminal, se muestra un mensaje reparable y no se abre otro candidato por aproximación.
- La PWA elimina `reviewAndroid` de la barra mediante `history.replaceState` después de resolverlo, sin quitar otros parámetros válidos.
- El usuario puede corregir cualquier campo. Para una tarjeta de crédito, la PWA conserva la revisión actual de cuotas e interés.
- **Confirmar gasto** vuelve a cargar candidato y cuentas desde servidor y usa `confirmTransactionImport`. El commit crea una sola transacción, ajusta `usedCredit` cuando aplica y cambia el candidato a `confirmed` en el mismo batch.

## 5. Contrato del borrador manual

Se ampliará `transactionImportCandidates` con una variante discriminada, sin crear otra colección ni otro inbox.

| Campo | Contrato para captura rápida |
| --- | --- |
| `schemaVersion` | literal `3` |
| `source` | literal `android-shortcut` |
| `occurredAt` | fecha elegida, anclada de forma estable en la zona local del dispositivo |
| `amountMinor` | entero positivo en centavos; conserva el máximo actual |
| `currency` | literal `COP` |
| `merchant` | respuesta a “¿En qué gastaste?”, de 1 a 140 caracteres |
| `suggestedAccountId` | ID de la cuenta o tarjeta seleccionada, máximo 1.500 caracteres |
| `suggestedCategory` | nombre de categoría seleccionado, de 1 a 100 caracteres |
| `createdAt` | timestamp del servidor |
| `status` | `pending`, `confirmed` o `dismissed` |
| `transactionId`, `confirmedAt` | solo en `confirmed` |
| `dismissedAt` | solo en `dismissed` |

La variante manual no incluye `sourcePackage`, `parserId`, `confidence`, últimos cuatro ni alias observado porque no proviene de una notificación ni de un parser. Las variantes v1 y v2 actuales permanecen válidas y sin cambios de significado.

## 6. Reglas e invariantes

- Solo el propietario autenticado puede crear, leer o transicionar el borrador.
- La creación v3 exige la forma exacta, `status == pending`, `createdAt == request.time` y que `suggestedAccountId` apunte a una cuenta del mismo usuario.
- Ningún campo del borrador puede cambiar después de crearse. Solo se permite un no-op idéntico, `pending → dismissed` o la confirmación atómica existente.
- La identidad contable seguirá siendo `ledger-mutation:android:<candidateId>` para conservar el reintento idempotente y la regla de una sola transacción por candidato.
- Un borrador `pending` no participa en ningún selector financiero.
- Los documentos `confirmed` y `dismissed` se conservan como estado terminal para idempotencia y trazabilidad. No habrá borrado automático ni TTL en esta versión.
- El marcador local usado para reintentar la apertura se elimina únicamente después de comprobar que el servidor conserva el borrador exacto; nunca contiene el UID crudo ni se expone a otra sesión.

## 7. Arquitectura Android mínima

### 7.1 Entrada y UI

- Añadir `res/xml/shortcuts.xml` y la metadata `android.app.shortcuts` al launcher actual.
- Añadir `QuickExpenseActivity`, un layout XML desplazable y recursos reutilizando el tema DayNight, colores, dimensiones y jerarquía existentes.
- Mantener `MainActivity` como configuración de captura de notificaciones. La segunda Activity existe porque el shortcut es una entrada funcional independiente; no se añadirá un framework de navegación.
- Reutilizar `GoogleSignInController` y los tokens visuales existentes.

### 7.2 Datos

- Un repositorio pequeño carga `users/{uid}/accounts` y `categories`; Firestore conserva su caché local actual, sin Room ni otra base.
- Los datos cacheados pueden poblar el formulario, pero la creación del borrador usa una transacción online y las reglas vuelven a validar la cuenta.
- Si no hay cuentas o categorías, la pantalla explica qué falta y ofrece abrir MoneyTrack; no inventa valores.
- La lógica pura de validación, formato, selección predeterminada e identidad queda fuera de la Activity y tiene pruebas JVM.

## 8. Actualización OTA privada

### 8.1 Canal

- GitHub Releases alojará un único APK canario por versión.
- La PWA publicará `public/android/update.json` con `versionCode`, `versionName`, `apkUrl`, `sha256`, `sizeBytes` y notas breves.
- La APK comprobará ese manifiesto al entrar en primer plano, con una ventana de 24 horas guardada localmente. **Buscar actualización** permitirá omitir esa ventana desde la pantalla principal.
- Una versión disponible se muestra como aviso secundario y no bloquea la captura rápida ni la confirmación en la PWA.

### 8.2 Descarga e instalación

1. La persona pulsa **Actualizar MoneyTrack**.
2. Android descarga por HTTPS a un directorio específico de la app, sin permiso de almacenamiento general.
3. La app verifica tamaño y SHA-256 del APK.
4. La app obtiene el certificado del APK descargado y exige que coincida con el certificado de la instalación actual.
5. Si falta autorización para instalar desde esta fuente, abre `Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` para que la persona decida.
6. Entrega el archivo mediante `FileProvider` al instalador oficial de Android.
7. Android muestra su confirmación de instalación. Al terminar, sesión, preferencias y acceso directo permanecen porque se conserva `applicationId` y firma.

Un hash o certificado incorrecto elimina el archivo descargado y muestra un error accionable. No existe una opción para omitir esas verificaciones.

### 8.3 Firma y versión

- El siguiente APK será `versionCode 2`, `versionName 0.2.0` y conservará `applicationId com.moneytrack.capture`.
- Para actualizar sin reinstalar el canario ya instalado, el APK debe usar el certificado actual. La clave y contraseñas permanecen fuera del repositorio y se inyectan al build mediante configuración local o secretos de publicación.
- Antes de publicar se comparará la firma de la APK instalada en el dispositivo canario con la huella auditada del release actual. Si no coincide, se detiene la entrega y se diagnostica; no se sugiere desinstalar como primer paso.
- Esta continuidad de firma es apropiada para el canario privado. Antes de distribución pública se diseñará una migración separada a Play App Signing o a una clave de producción; no se rotará dentro de este cambio.

## 9. Estados de error

- **Sin sesión:** iniciar sesión y continuar en la misma captura.
- **Sin red al cargar:** usar opciones cacheadas si existen y comunicar que se necesita conexión para continuar.
- **Sin red al guardar:** conservar el formulario, no abrir la PWA y mostrar **Reintentar**.
- **Cuenta eliminada o reglas rechazadas:** mantener el formulario y solicitar recargar opciones.
- **Borrador ya guardado y apertura fallida:** bloquear cambios al snapshot almacenado y ofrecer abrir MoneyTrack de nuevo.
- **Otra cuenta en la PWA:** informar que el borrador pertenece a otra sesión sin revelar sus datos.
- **Doble toque:** deshabilitar la acción mientras se guarda y reutilizar el mismo ID.
- **Actualización sin permiso:** explicar y abrir únicamente el ajuste específico de esta aplicación.
- **Descarga incompleta, hash o firma inválida:** cancelar la instalación, borrar la descarga y conservar la versión actual.

## 10. Accesibilidad y sistema visual

- Voz confiada, cálida y experta; una acción primaria violeta por estado.
- Sin nuevos gradientes, glassmorphism ni tarjetas métricas.
- Labels visibles, foco lógico, mensajes con icono y texto, `accessibilityLiveRegion` para guardado/error y sin depender solo del color.
- `ScrollView`, insets de barras y recortes, modo claro/oscuro/sistema, teclado visible y restauración ante rotación.
- Verificación a 320–400 dp, ancho expandido, landscape y texto a 1,3×.
- Botones y controles de al menos 48 dp; monto con cifras tabulares y teclado numérico.

## 11. Pruebas y aceptación

### Automatizadas

- Contrato de recursos para shortcut, Activity, accesibilidad y FileProvider.
- Pruebas JVM de validación, formato COP, fecha, selección predeterminada, ID y estados de guardado.
- Repositorios Android con Firestore simulado: propietario, documento idéntico, colisión, sin red y lectura de opciones.
- Decoder web v1/v2/v3 fail-closed y rechazo de campos cruzados entre variantes.
- Reglas Firestore para forma exacta, cuenta ajena/inexistente, estados terminales y confirmación atómica.
- Inbox y modal: apertura por ID, precarga, parámetro inválido, UID incorrecto y limpieza de URL.
- OTA: versión mayor, manifiesto inválido, hash inválido, firma distinta, permiso ausente y entrega válida al instalador.
- Regresión completa web y Android, typecheck, lint, build, `assembleRelease`, OpenSpec estricto y revisión de impacto del grafo.

### Dispositivo canario

- Mantener presionado el icono, abrir y arrastrar **Registrar gasto**.
- Crear un gasto con cuenta de ahorro, efectivo y tarjeta de crédito.
- Confirmar que antes del toque web no cambian saldo, cupo, estadísticas ni presupuesto.
- Probar doble toque, offline, rotación, tema, fuente 1,3×, vuelta atrás e inicio con otra cuenta.
- Instalar `0.2.0` sobre el canario actual desde el aviso OTA, sin desinstalar, y comprobar que sesión, preferencias, permiso de notificaciones y shortcut sobreviven.
- Descargar nuevamente el asset publicado y comparar tamaño, SHA-256, certificado y commit de origen.

## 12. Orden de entrega

1. Extender y validar OpenSpec con el shortcut, candidato v3, handoff y OTA.
2. Implementar y desplegar primero reglas, decoder y PWA compatibles con v3.
3. Verificar que la PWA desplegada abre y confirma un fixture v3 sin afectar v1/v2.
4. Implementar y verificar el shortcut, captura nativa y actualizador.
5. Construir `0.2.0` limpio y firmado con el certificado compatible.
6. Publicar el APK en GitHub Releases, verificar asset y después publicar `update.json`.
7. Actualizar el canario desde la propia APK y ejecutar la matriz física.

Este orden garantiza que una APK nueva nunca emita un borrador que la versión web publicada todavía no pueda interpretar.

## 13. Alternativas descartadas

- **Shortcut que solo abre el formulario web:** es más pequeño, pero no cumple la captura nativa aprobada.
- **Datos en query params:** expone información financiera en historial, logs y compartición de URL.
- **Escritura directa de `Transaction` desde Android:** rompe la frontera de confirmación y duplica reglas contables.
- **Nueva colección `quickExpenseDrafts`:** duplica inbox, estados y confirmación ya resueltos por candidatos.
- **Reutilizar campos de notificación falsos:** mezclaría datos manuales con parser/confianza y debilitaría el contrato fail-closed.
- **Actualización silenciosa:** no es compatible con el modelo normal de seguridad de una APK privada en Android.
- **Play Core ahora:** el canario se distribuye por GitHub Releases y aún no está publicado en Google Play.

## 14. Criterio de salida

El cambio se considera listo únicamente cuando:

- el shortcut abre la captura en un toque;
- los cinco datos llegan precargados a la PWA sin aparecer en la URL;
- ninguna ruta nativa puede afectar el libro antes de confirmación;
- un reintento produce como máximo una transacción;
- v1/v2 siguen funcionando;
- la actualización `0.2.0` se instala sobre la APK canaria mediante el flujo OTA con hash y firma válidos;
- todas las verificaciones automáticas y la matriz física requerida quedan documentadas con evidencia.

No quedan decisiones funcionales abiertas para iniciar el plan de implementación después de aprobar este documento.
