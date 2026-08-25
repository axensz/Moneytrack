## Context

Moneytrack es hoy una PWA Next/React con Firebase. `Account` es la autoridad contable de cuentas de ahorro, efectivo y tarjetas de crédito; `Transaction.accountId` determina qué autoridad cambia, y `executeAuthenticatedLedgerMutation` coordina la validación servidor-actual, el lease, el batch y el ajuste atómico de `usedCredit`. Esa frontera debe seguir siendo la única forma de convertir una captura en dinero real del registro.

Google Wallet no expone al usuario una fuente pública de historial de compras que Moneytrack pueda consumir. Android sí ofrece `NotificationListenerService`, siempre que la persona habilite el acceso en ajustes y el servicio se declare con `BIND_NOTIFICATION_LISTENER_SERVICE` ([referencia oficial](https://developer.android.com/reference/android/service/notification/NotificationListenerService.html)). Por eso el insumo será la notificación visible de Wallet o de la aplicación financiera elegida, no el historial interno de la wallet.

La PWA ya autentica con Google en Firebase. El compañero Android usará Credential Manager y `FirebaseAuth.signInWithCredential`, de modo que ambas superficies obtengan el mismo UID en el mismo proyecto ([guía oficial de Firebase](https://firebase.google.com/docs/auth/android/google-signin)). Firestore para Android mantiene persistencia local por defecto y encola escrituras cuando no hay red ([documentación oficial](https://firebase.google.com/docs/firestore/manage-data/enable-offline)); esa cola se usará solo para candidatos normalizados.

Hay cambios OpenSpec activos sobre integridad del libro y entrega de notificaciones. Esta propuesta depende de la frontera contable ya presente en el código, pero no depende del backend/Web Push propuesto por `harden-notification-delivery-and-recurring-reminders`: una notificación bancaria observada es una entrada no confiable, mientras una notificación de Moneytrack es una salida posterior al commit.

## Goals / Non-Goals

**Goals:**

- Capturar automáticamente compras notificadas por aplicaciones Android seleccionadas.
- Separar el medio de pago observado de la cuenta contable que conserva saldo o deuda.
- Mantener toda captura fuera del libro hasta que una persona confirme monto, cuenta, categoría y detalles necesarios.
- Hacer la confirmación atómica, reintentable e idempotente mediante la frontera contable existente.
- No persistir ni registrar texto crudo, PAN, CVV, códigos de seguridad ni identificadores de hardware.
- Entregar una migración aditiva y reversible, sin backfill ni cambio de significado de datos existentes.
- Funcionar en PWA móvil/escritorio y en un compañero Android pequeño, accesible y verificable.
- Reducir la primera configuración Android a los pasos necesarios y omitir los ya satisfechos en aperturas posteriores.

**Non-Goals:**

- Acceso directo a la base de datos o historial de Google Wallet.
- Contabilización automática, detección de reversos, cuotas inferidas, conciliación bancaria o soporte de monedas diferentes de COP en el primer canario.
- Captura para invitados, iOS, múltiples dispositivos activos garantizados, publicación en Play Store, analítica, telemetría o un backend nuevo.
- Parser específico para cada banco antes de contar con ejemplos sanitizados y pruebas de ese emisor.
- Rediseñar navegación, cálculos financieros, `Account`, `bankAccountId`, deuda, pagos de TC o persistencia existente.

## Decisions

### 1. Mantener PWA y añadir un compañero Android mínimo

El repositorio incorporará `android-capture/` como una aplicación nativa separada. La PWA seguirá siendo el producto principal para administrar cuentas, categorías, históricos y candidatos; Android solo autenticará, solicitará acceso, filtrará fuentes y publicará candidatos.

Alternativas descartadas:

- **Reescribir Moneytrack como Android nativo:** duplica todas las superficies y crea una migración innecesaria.
- **Confiar solo en la PWA:** un navegador no puede observar notificaciones de otras aplicaciones.
- **Añadir primero un backend u Open Banking:** amplía costo, credenciales y alcance sin ser necesario para probar la captura.

### 2. Separar cuenta, medio de pago, candidato y transacción

La relación canónica es:

```text
Account (1) <--- (N) PaymentInstrument
                         |
                         | coincidencia opcional por últimos 4
                         v
TransactionImportCandidate (0..1) ---> Transaction confirmada (0..1)
```

- `Account` conserva la autoridad financiera. Una TC sigue siendo `Account.type === 'credit'` y `bankAccountId` sigue significando cuenta bancaria de pago.
- `PaymentInstrument` identifica un plástico o token de wallet y apunta a exactamente una cuenta existente. Una cuenta puede tener cero o más.
- `TransactionImportCandidate` es una propuesta sin efecto contable.
- `Transaction` solo aparece después de la confirmación canónica.

Esta separación permite que una TC tenga plástico físico y token de Google Wallet con terminaciones distintas sin duplicar deuda ni cupo.

### 3. Contratos persistidos explícitos y pequeños

`users/{uid}/paymentInstruments/{instrumentId}`:

| Campo | Contrato |
| --- | --- |
| `schemaVersion` | entero literal `1` |
| `label` | string de 1–80 caracteres |
| `accountId` | ID de una cuenta existente del mismo usuario |
| `kind` | `physical-card` o `wallet-token` |
| `last4` | exactamente cuatro dígitos; nunca PAN completo |
| `network` | `visa`, `mastercard`, `amex`, `other` o `unknown` |
| `active` | booleano; un instrumento inactivo no se preselecciona |
| `createdAt`, `updatedAt` | timestamps |

`users/{uid}/transactionImportCandidates/{candidateId}`:

| Campo | Contrato |
| --- | --- |
| `schemaVersion` | entero literal `1` |
| `source` | literal `android-notification` |
| `sourcePackage` | paquete Android elegido, máximo 160 caracteres |
| `occurredAt` | timestamp observado |
| `amountMinor` | entero positivo en centavos, máximo `100000000000` |
| `currency` | literal `COP` |
| `merchant` | descripción normalizada de 1–140 caracteres |
| `cardLast4` | cuatro dígitos opcionales |
| `parserId`, `parserVersion` | `strict-cop-purchase` y entero `1` |
| `confidence` | `high` o `medium`; `low` nunca se sube |
| `status` | `pending`, `confirmed` o `dismissed` |
| `transactionId`, `confirmedAt` | solo para `confirmed` |
| `dismissedAt` | solo para `dismissed` |

El documento MUST rechazar cualquier clave cruda como `title`, `text`, `bigText`, `subText`, `rawPayload`, `pan`, `cvv`, `otp` o equivalentes. El decodificador web también será fail-closed: un documento que no cumpla el contrato no entra a la bandeja.

### 4. Identidad determinista antes de sincronizar

Android calculará `candidateId = SHA-256(deviceInstallId | packageName | statusBarNotification.key | postTime)` como 64 caracteres hexadecimales. `deviceInstallId` es un UUID aleatorio conservado únicamente en preferencias privadas del dispositivo; no se sube como campo. Una actualización o reintento del mismo evento conserva la identidad; dos notificaciones diferentes no comparten documento. El contenido financiero no forma parte del path ni se imprime en logs.

La primera versión admite un dispositivo de captura por usuario como configuración operativa. Un segundo dispositivo puede generar candidatos equivalentes, pero nunca una segunda transacción silenciosa porque todos requieren revisión y la confirmación de cada candidato es idempotente. La deduplicación entre dispositivos se evaluará después del canario, sin introducir ahora un registro global de dispositivos.

### 5. Parser local estricto, no un recolector genérico

`MoneyNotificationListenerService` descarta de inmediato eventos si falta sesión, permiso, paquete permitido o configuración activa. El allowlist empieza vacío y vive en preferencias privadas del dispositivo. Para poblar el selector sin solicitar `QUERY_ALL_PACKAGES`, el listener puede guardar localmente solo `packageName` y etiqueta de aplicaciones que ya hayan emitido una notificación; antes de que el usuario permita una fuente no lee sus extras, y solo eventos futuros de esa fuente pasan al parser.

El pipeline puro es `RawNotification` en memoria → `StrictCopPurchaseParser` → `NormalizedPurchaseCandidate` → `FirebaseCandidateRepository`. Para emitir un candidato deben cumplirse todos estos puntos:

- existir exactamente un monto COP inequívoco;
- existir un marcador de compra (`compra`, `consumo`, `pagaste` o `pago realizado`);
- no existir marcadores de rechazo, reverso o seguridad (`rechazada`, `declinada`, `fallida`, `anulada`, `reversada`, `código`, `clave`, `OTP`);
- normalizar comercio, últimos cuatro y fecha cuando estén disponibles;
- clasificar `high` cuando monto, comercio y últimos cuatro sean inequívocos; en ausencia de comercio o últimos cuatro, usar `medium` y exigir revisión igualmente.

El texto original solo existe durante la llamada. No se guarda en archivo, preferencias, Firestore, crash report ni logging. No se añadirá Crashlytics o Analytics.

### 6. La bandeja es una frontera de confianza

`TransactionImportInbox` consultará como máximo los 100 candidatos `pending` más recientes y mostrará comercio, monto COP, fecha observada y terminación si existe. La fila identifica el canal funcional como `Android`; cuando la terminación resuelva un único medio activo, añade la cuenta vinculada (`Android · <cuenta>`), no el alias del medio. `sourcePackage` y `confidence` permanecen en el contrato normalizado para diagnóstico del canario, pero no se presentan como lenguaje de producto. Ningún candidato participa en saldos, cupo, estadísticas, presupuestos o conciliación.

La revisión exige cuenta y categoría válidas. Si existe un medio activo coincidente, se preselecciona su cuenta; si no existe, la persona elige una cuenta y puede marcar “Recordar este medio de pago” cuando hay `cardLast4`. Ese instrumento se crea dentro del mismo commit de confirmación con la etiqueta inicial `Tarjeta •••• NNNN` y podrá editarse desde Cuentas. El campo monetario reutiliza la normalización visible de los demás formularios MoneyTrack: elimina caracteres ajenos al monto, conserva el formato colombiano y nunca confirma silenciosamente el texto crudo.

La revisión de un gasto en TC permite indicar cuotas e interés; no los infiere de la notificación. La persona puede corregir monto, comercio, fecha y cuenta antes de confirmar.

### 7. Confirmación atómica e idempotente

Se añadirá `confirmTransactionImport` junto a la orquestación Firestore. Antes de escribir deberá cargar desde servidor el candidato, los medios actuales que puedan coincidir y las cuentas afectadas. La identidad será `ledger-mutation:android:<candidateId>`; ese valor también será el ID del documento `Transaction` y `mutationSource` será `android`.

Un único `executeAuthenticatedLedgerMutation` MUST preparar y confirmar:

1. la transacción canónica;
2. el incremento de `usedCredit` si la cuenta es de crédito;
3. el medio de pago recordado, cuando aplique;
4. la transición de candidato `pending → confirmed` con `transactionId`;
5. la liberación del lease existente.

Si el primer commit fue exitoso y la respuesta se perdió, un reintento carga el candidato `confirmed`, comprueba que su `transactionId` coincide con la identidad esperada y devuelve la transacción existente sin escribir dinero otra vez. Un candidato `dismissed`, una cuenta eliminada, un instrumento inactivo o un valor que cambió en servidor bloquean la confirmación con un mensaje reparable.

Descartar usa la transición irreversible `pending → dismissed`, no crea transacción y no altera ninguna cuenta. La contabilización directa desde Android queda prohibida por diseño y fuera de esta propuesta.

### 8. Integridad referencial en el ciclo de cuentas

`mergeCreditCardsOrchestrated` cargará los instrumentos de las tarjetas fuente y reasignará `accountId` a la tarjeta destino dentro de su batch y capacidad contada. `deleteAccountCascade` eliminará los instrumentos vinculados a la cuenta eliminada dentro del mismo commit. Los candidatos existentes no se reescriben: si su referencia deja de existir, la revisión exige seleccionar otra cuenta o medio.

### 9. Reglas e índices fail-closed

Firestore añadirá reglas con listas exactas de claves, enums, tamaños, timestamps y referencias de cuenta. Solo el propietario podrá leer o escribir sus subcolecciones.

- Instrumentos: create/update requieren cuenta existente; `last4` tiene cuatro dígitos; no se aceptan claves desconocidas.
- Candidatos: create solo permite `pending`; update solo permite un no-op idempotente con payload determinista, `pending → dismissed` o `pending → confirmed`.
- Para `confirmed`, `existsAfter` debe encontrar `transactions/{transactionId}`, su `operationId` debe ser `ledger-mutation:android:<candidateId>` y la mutación debe ocurrir bajo el lease contable.
- Estados terminales no pueden reabrirse ni cambiar de transacción.
- El índice compuesto será `status ASC, occurredAt DESC` para `transactionImportCandidates`.

Las pruebas del emulador cubrirán propietario/no propietario, esquemas prohibidos, referencias inexistentes, cada transición y el batch de confirmación.

### 10. UI aditiva y accesible

`AccountsView` incorporará una sección compacta “Medios de pago del celular” después de la lista de cuentas, sin cambiar `AccountCard`. Permitirá crear, editar, activar/desactivar y eliminar asociaciones mediante alias, tipo, red, últimos cuatro y cuenta vinculada; el copy recomendará reutilizar apodos reconocibles como `Oro` o `Nu`. `TransactionsView` incorporará una bandeja colapsable antes de los filtros, con contador y diálogo de revisión.

Se reutilizarán tokens de `theme.css`/`components.css`, tarjetas y botones existentes. No habrá gradientes nuevos, glassmorphism ni una ruta de dashboard adicional. Controles táctiles tendrán al menos 44 px, foco visible, etiquetas accesibles, diálogo con retorno de foco y mensajes de estado mediante `role=status` o toasts existentes. Las dos superficies funcionarán a 390 px y 1440 px, en claro y oscuro.

### 11. Toolchain Android fijado y pequeño

El canario usará `applicationId com.moneytrack.capture`, AGP `9.3.0`, Gradle `9.5.0`, JDK `17`, `compileSdk/targetSdk 36` y `minSdk 26`. AGP 9.3/Gradle 9.5 es una combinación oficial ([tabla de compatibilidad](https://developer.android.com/build/releases/about-agp)); API 36 cumple el requisito de nuevas publicaciones desde el 31 de agosto de 2026 ([política de Google Play](https://support.google.com/googleplay/android-developer/answer/11926878?hl=es)).

Dependencias Android fijadas:

- `com.google.firebase:firebase-bom:34.18.0`, módulos principales `firebase-auth` y `firebase-firestore` —no KTX retirados— y `com.google.gms.google-services:4.5.0` ([setup oficial](https://firebase.google.com/docs/android/setup));
- `androidx.activity:activity-ktx:1.12.4`;
- `androidx.appcompat:appcompat:1.8.0` para el tema DayNight y controles compatibles;
- `androidx.core:core-splashscreen:1.2.0` para el arranque oficial compatible;
- `androidx.credentials:credentials:1.6.0` y `credentials-play-services-auth:1.6.0`;
- `com.google.android.libraries.identity.googleid:googleid:1.1.1`.

La Activity usará vistas XML y componentes AndroidX, no Compose, Navigation, DI, base local adicional ni framework de red. Firestore cubre autenticación, persistencia offline y sincronización. `google-services.json`, keystores, `local.properties`, builds y `.gradle` estarán ignorados; el repositorio solo conserva `.env.example`/README de configuración.

### 12. Arranque y configuración Android progresivos

El sistema conservará una sola Activity y resolverá una etapa visible a partir del estado real: `SESSION`, `NOTIFICATION_ACCESS`, `CAPTURE` o `READY`. El splash oficial comparte el icono wallet, violeta y superficies de la PWA mientras se consulta sesión y preferencias; no introduce una espera artificial. Si todos los requisitos siguen satisfechos, una apertura posterior entra directamente a `READY`. Si una sesión o permiso se pierde, reaparece únicamente la primera etapa incompleta.

Cada etapa explica en pocas líneas para qué sirve su acción. La etapa de sesión muestra solo inicio de sesión; con sesión activa, el inicio desaparece y queda disponible cerrar sesión. La etapa de acceso abre los ajustes oficiales de Android. La etapa de captura permite elegir etiquetas de aplicaciones descubiertas y activar el servicio sin exponer paquetes técnicos. `READY` resume el estado, permite abrir la PWA canónica `https://axensz.github.io/Moneytrack/` y ofrece `Sistema`, `Claro` y `Oscuro` con `Sistema` como valor inicial.

La ventana usa edge-to-edge con insets de barras, recortes y navegación gestual aplicados al contenedor desplazable. Ningún título, acción o contenido puede quedar debajo de la barra de estado o de navegación. Colores claros/oscuros replican los roles semánticos existentes y mantienen objetivos de 48 dp, foco y contraste AA.

## Risks / Trade-offs

- **[Formato de notificación cambia o no contiene monto/tarjeta]** → el parser falla cerrado, el evento no sube y el canario registra solo un código local no financiero; se añade un parser específico únicamente con ejemplos sanitizados y pruebas.
- **[Notificación duplicada o actualizada]** → fingerprint determinista y confirmación idempotente; la bandeja sigue siendo obligatoria.
- **[Notificación falsa, reversada o incompleta]** → exclusiones estrictas, confianza conservada para diagnóstico y sin contabilización autónoma.
- **[Android mata el proceso o no concede acceso]** → pantalla de estado y enlace directo a ajustes; no se promete captura mientras el servicio esté deshabilitado.
- **[Sin red]** → Firestore encola el candidato normalizado; la PWA bloquea la confirmación financiera offline y conserva el formulario para reintentar.
- **[Dos dispositivos capturan el mismo evento]** → alcance inicial de un dispositivo y revisión manual; no se añade coordinación global prematura.
- **[Cuenta o instrumento cambia entre captura y confirmación]** → recarga servidor-actual y bloqueo reparable; nunca se confía en la sugerencia capturada.
- **[Reglas complejas bloquean el batch legítimo]** → pruebas con emulador para cada transición y despliegue de reglas antes del APK.
- **[Confusión entre TC y token de wallet]** → glosario en `CONTEXT.md`, modelo separado y copy consistente.

## Migration Plan

1. **Precondición:** confirmar verdes las pruebas de frontera contable e ingress parity del estado actual; no implementar sobre un writer financiero roto.
2. **Contrato aditivo:** desplegar tipos, decodificadores, reglas e índice. No hay backfill y clientes actuales ignoran las nuevas colecciones.
3. **PWA:** desplegar gestión de medios e inbox vacío. Verificar creación, transición y confirmación con emulador y proyecto de prueba.
4. **Firebase Android:** registrar `com.moneytrack.capture` en el mismo proyecto, agregar SHA-1/SHA-256 de debug/canario, descargar `google-services.json` local y verificar que Google Sign-In produce el mismo UID de la PWA.
5. **Canario privado:** construir e instalar APK debug/release interno en un solo dispositivo; habilitar una fuente a la vez y mantener confirmación manual.
6. **Criterio de aceptación:** revisar al menos 50 notificaciones elegibles durante un mínimo de 14 días, con cero dobles contabilizaciones, 100 % de candidatos sin texto crudo persistido, al menos 95 % de monto correcto, al menos 90 % de preselección de cuenta correcta y máximo 5 % de falsos positivos en la bandeja.
7. **Siguiente decisión:** solo después de aceptar el canario se podrá proponer otro cambio OpenSpec para auto-confirmación por instrumento y parser confiable. No se habilita como parte de este cambio.

### Rollback

- Deshabilitar el acceso a notificaciones o desinstalar el compañero detiene nuevas capturas de inmediato.
- Revertir la UI PWA y las reglas de creación oculta la capacidad; las colecciones nuevas pueden permanecer sin afectar cálculos existentes.
- Los candidatos pendientes/dismissed no requieren reparación porque nunca tocaron el libro.
- Las transacciones ya confirmadas son transacciones canónicas y no se borran automáticamente; se corrigen con las operaciones normales del libro si una persona decide revertirlas.
- No se eliminan datos existentes ni se ejecuta migración destructiva durante despliegue o rollback.

## Open Questions

No hay preguntas bloqueantes para implementar el canario. Los parsers específicos por emisor y la posible auto-confirmación son decisiones posteriores que requieren evidencia sanitizada y las métricas de aceptación anteriores.
