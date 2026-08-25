## Why

Registrar manualmente cada compra hecha con una tarjeta del celular genera omisiones y cuentas desactualizadas. Moneytrack necesita capturar esas señales automáticamente sin convertir una notificación ambigua en una mutación silenciosa del libro: la automatización debe aumentar la cobertura y conservar la confianza de “The Confident Ledger”.

## What Changes

- Añadir un proyecto Android complementario que, con permiso explícito de acceso a notificaciones, observe solo las aplicaciones financieras elegidas, extraiga datos normalizados de compras y envíe candidatos idempotentes al mismo proyecto Firebase de Moneytrack.
- Añadir medios de pago que relacionen un plástico o token de wallet con exactamente una `Account`; una cuenta o TC podrá tener varios medios de pago.
- Hacer explícitos en la PWA el alias, los últimos cuatro dígitos y la cuenta/TC de cada medio para recomendar la cuenta solo ante una coincidencia activa y única.
- Añadir en la PWA una bandeja de candidatos pendientes para revisar, completar, confirmar o descartar compras capturadas.
- Reorganizar el compañero Android como una configuración progresiva con identidad MoneyTrack, sesión, acceso a notificaciones, captura y una pantalla operativa final; respetará barras del sistema y modos claro/oscuro.
- Refinar toda la superficie Android con el logo canónico de la PWA, una acción principal inequívoca por estado, controles nativos semánticos, respuesta visible durante la autenticación y un layout legible en anchos compactos, expandidos, orientación horizontal y texto ampliado, sin migrar a Compose ni añadir una librería visual.
- Confirmar cada candidato mediante la frontera contable autenticada existente, con identidad determinista y un único batch que escriba la transacción, actualice el cupo usado cuando corresponda y cierre el candidato.
- Endurecer reglas e índices de Firestore para aceptar únicamente esquemas normalizados del propietario y transiciones válidas; título, texto completo, PAN, CVV y payload crudo de la notificación quedan prohibidos.
- Integrar las asociaciones con la fusión y eliminación de cuentas para no dejar medios de pago apuntando a cuentas inexistentes.
- Entregar primero un APK de canario privado; la captura es automática, pero la contabilización seguirá requiriendo confirmación durante esta propuesta.

### Non-goals

- No leer historial interno de Google Wallet ni depender de una API de Wallet para consumidores.
- No importar notificaciones históricas ni modificar transacciones, cuentas o saldos existentes.
- No contabilizar candidatos de forma autónoma, ni implementar reversos automáticos, conciliación bancaria u Open Banking.
- No reescribir la PWA como aplicación nativa, no crear un backend o Cloud Function y no implementar iOS.
- No publicar en Google Play dentro de esta propuesta; la preparación técnica conservará compatibilidad con una publicación posterior.

## Capabilities

### New Capabilities

- `payment-instrument-linking`: alta, edición, desactivación y relación segura de plásticos o tokens de wallet con cuentas contables existentes.
- `transaction-import-inbox`: ciclo de vida de candidatos, revisión en la PWA y confirmación atómica e idempotente en el libro.
- `android-notification-capture`: consentimiento, filtrado, análisis local, privacidad, deduplicación y sincronización de compras observadas en Android.

### Modified Capabilities

Ninguna. Las especificaciones principales actuales no cambian; las nuevas capacidades consumen la frontera contable existente sin alterar su autoridad.

## Impact

- **Web/PWA:** nuevos tipos, decodificadores, hooks y componentes bajo `src/`; integración localizada en `AccountsView`, `TransactionsView` y el escritor contable autenticado.
- **Datos:** nuevas subcolecciones `users/{uid}/paymentInstruments` y `users/{uid}/transactionImportCandidates`; las colecciones actuales y sus documentos no requieren backfill.
- **Seguridad:** cambios aditivos en `firestore.rules`, `firestore.indexes.json` y pruebas del emulador. El propietario autenticado continúa siendo el único lector/escritor.
- **Android:** nuevo proyecto `android-capture/`, `applicationId` `com.moneytrack.capture`, `minSdk 26`, `compileSdk/targetSdk 36`, autenticación Google mediante Credential Manager y Firebase Auth, Cloud Firestore, AppCompat DayNight y Core SplashScreen.
- **Dependencias:** no se añaden dependencias npm ni servicios backend. Android usa AGP 9.3.0, Gradle 9.5.0, JDK 17, Firebase BoM 34.18.0, Google Services 4.5.0, Activity KTX 1.12.4 y Credentials 1.6.0.
- **Superficies:** la gestión y revisión se adaptan a escritorio y móvil con los componentes/tokens existentes. El modo invitado no ofrece captura ni importación Android.
