# Android Private OTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que el compañero Android privado detecte, descargue, verifique e instale futuras APK firmadas, con un bootstrap HTTPS de `0.1.0` a `0.2.0` y OTA interna desde `0.2.0`.

**Architecture:** Un manifiesto JSON estático en GitHub Pages anuncia un asset de GitHub Releases. Código Kotlin pequeño e inyectable consulta el manifiesto, descarga con `DownloadManager`, valida tamaño/SHA-256/certificado y delega la instalación al Package Installer; una UI compartida expone estados sin bloquear el registro de gastos.

**Tech Stack:** Kotlin/AppCompat XML, `HttpURLConnection`, `DownloadManager`, `PackageManager`, `FileProvider`, GitHub Pages/Releases, Gradle signing config, JVM resource-contract tests.

**Spec:** `docs/superpowers/specs/2026-09-13-android-quick-expense-shortcut-design.md`

## Global Constraints

- `0.1.0` no puede autoactualizarse; `0.2.0` se entrega por enlace HTTPS y se instala encima sin ADB ni desinstalación.
- Desde `0.2.0`, toda actualización interna requiere `applicationId com.moneytrack.capture`, `versionCode` mayor y el mismo certificado instalado.
- Android conserva la confirmación del Package Installer; no hay instalación silenciosa.
- El APK se rechaza ante URL no HTTPS/GitHub permitida, tamaño, SHA-256 o firma incorrectos.
- La clave y contraseñas de firma nunca entran a Git, logs, manifiesto web ni APK.
- Sin WorkManager, librería de red, framework de updater, analítica o telemetría.
- El aviso OTA es secundario y nunca bloquea captura, sincronización o apertura de MoneyTrack.

---

### Task 1: Registrar la capacidad OTA en OpenSpec

**Files:**
- Modify: `openspec/changes/add-android-transaction-ingestion/proposal.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/design.md`
- Create: `openspec/changes/add-android-transaction-ingestion/specs/android-private-update/spec.md`
- Modify: `openspec/changes/add-android-transaction-ingestion/tasks.md`

**Interfaces:**
- Consumes: sección 8 del diseño aprobado y evidencia de firma del canario actual.
- Produces: requisitos OTA y tareas 15.1–15.8.

- [ ] **Step 1: Crear el delta OTA**

Escribir requisitos MUST y escenarios concretos:

```markdown
## ADDED Requirements

### Requirement: Las actualizaciones privadas se verifican antes de instalar
La APK MUST aceptar únicamente una versión con `versionCode` mayor, URL HTTPS permitida, tamaño y SHA-256 exactos, y el mismo certificado de firma que la instalación actual.

#### Scenario: Asset válido
- **WHEN** la persona solicita una versión posterior y la descarga coincide en tamaño, hash y certificado
- **THEN** la app entrega el APK mediante `FileProvider` al instalador oficial de Android
- **AND** Android conserva la confirmación final de la persona

#### Scenario: Firma diferente
- **WHEN** el APK descargado no está firmado por el certificado de la instalación actual
- **THEN** MoneyTrack elimina el archivo, conserva la versión instalada y no abre el instalador

### Requirement: La entrega de arranque es explícita
MoneyTrack MUST describir que `0.2.0` se instala por enlace HTTPS sobre `0.1.0`, y MUST usar el actualizador interno solo para versiones posteriores.
```

- [ ] **Step 2: Ampliar propuesta, diseño y tareas**

Añadir canal, bootstrap, formato del manifiesto, descarga, firma, permiso por fuente, estados UI, orden de releases y no-goals. Añadir sección `## 15. Approved private Android OTA` con tareas que reflejen este plan.

- [ ] **Step 3: Validar y commit**

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict
git diff --check
git add -- openspec/changes/add-android-transaction-ingestion
git commit -m "docs(openspec): specify private Android OTA"
```

---

### Task 2: Definir y decodificar el manifiesto de actualización

**Files:**
- Create: `public/android/update.json`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/AndroidUpdateManifest.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/AndroidUpdateManifestDecoder.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/update/AndroidUpdateManifestDecoderTest.kt`
- Modify: `android-capture/app/build.gradle.kts`

**Interfaces:**
- Produces: `AndroidUpdateManifest`, `AndroidUpdateManifestDecoder.decode(text)` y `UpdateDecision`.

- [ ] **Step 1: Publicar un manifiesto inicial que no anuncie una actualización falsa**

Usar el canario actual verificado:

```json
{
  "schemaVersion": 1,
  "channel": "canary",
  "versionCode": 1,
  "versionName": "0.1.0",
  "apkUrl": "https://github.com/axensz/Moneytrack/releases/download/android-wallet-canary-2026-08-26/MoneyTrack-Google-Wallet-canary.apk",
  "sha256": "d952d9448995f41faf4521ea4e6ee0bba04e71dbb7bda5f214d518add878dbdc",
  "sizeBytes": 9942363,
  "releaseNotes": ["Canario inicial de captura Android"]
}
```

Así `0.2.0` no verá una versión nueva hasta que el release con `versionCode 3` esté realmente publicado y verificado.

- [ ] **Step 2: Escribir pruebas rojas del decoder**

Cubrir manifiesto válido, campos extra, duplicados, tipos incorrectos, `versionCode <= 0`, versión vacía, SHA distinto de 64 hex, tamaño no positivo, más de cinco notas, nota >160 y URLs fuera de:

```text
https://github.com/axensz/Moneytrack/releases/download/
```

Probar `decideUpdate(installed=2, remote=3) == AVAILABLE` y que 2/2 o 3/2 sean `CURRENT`.

- [ ] **Step 3: Ejecutar rojo**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*AndroidUpdateManifestDecoderTest*'
```

- [ ] **Step 4: Implementar decoder estricto**

El modelo exacto:

```kotlin
data class AndroidUpdateManifest(
    val schemaVersion: Int,
    val channel: String,
    val versionCode: Long,
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
    val sizeBytes: Long,
    val releaseNotes: List<String>,
)

enum class UpdateDecision { CURRENT, AVAILABLE }
```

Usar `org.json.JSONObject` en producción y `testImplementation("org.json:json:20250517")` únicamente para ejecutar la misma implementación en JVM. Enumerar y comparar el conjunto exacto de claves antes de extraer valores.

- [ ] **Step 5: Ejecutar verde y commit**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*AndroidUpdateManifestDecoderTest*'
git add -- public/android/update.json android-capture/app/build.gradle.kts android-capture/app/src/main/java/com/moneytrack/capture/update android-capture/app/src/test/java/com/moneytrack/capture/update
git commit -m "feat(android): validate OTA manifests"
```

---

### Task 3: Consultar versiones sin bloquear la aplicación

**Files:**
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/UpdateManifestTransport.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/UpdateChecker.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/UpdatePreferences.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/update/UpdateCheckerTest.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/update/UpdatePreferencesTest.kt`
- Modify: `android-capture/app/src/main/res/values/strings.xml`

**Interfaces:**
- Consumes: decoder del Task 2 y `BuildConfig.VERSION_CODE`.
- Produces: `UpdateCheckResult.Current`, `.Available(manifest)` o `.Failed`; chequeo automático 24 h y manual sin throttle.

- [ ] **Step 1: Escribir pruebas rojas de transporte/checker**

Mediante un transporte falso probar 200 válido, HTTP distinto de 200, body >32 KiB, timeout, JSON inválido, versión actual y versión posterior. Ningún error contiene body remoto ni stack técnico en copy de producto.

- [ ] **Step 2: Escribir pruebas rojas del throttle**

Inyectar reloj y SharedPreferences falso: primer check permitido, segundo antes de 24 h omitido, manual permitido y reloj atrasado vuelve a permitir de forma segura.

- [ ] **Step 3: Ejecutar rojo**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*UpdateCheckerTest*' --tests '*UpdatePreferencesTest*'
```

- [ ] **Step 4: Implementar transporte JDK**

`HttpsUpdateManifestTransport` usa `HttpURLConnection` con:

```kotlin
connectTimeout = 8_000
readTimeout = 8_000
instanceFollowRedirects = false
setRequestProperty("Accept", "application/json")
setRequestProperty("User-Agent", "MoneyTrack-Android/${BuildConfig.VERSION_NAME}")
```

Aceptar solo `200`, leer máximo 32 KiB y cerrar streams/conexión. Ejecutar desde un `Executor`, nunca en main thread.

- [ ] **Step 5: Implementar checker/preferencias y dejar verde**

La URL fija es `https://axensz.github.io/Moneytrack/android/update.json`. Solo persistir epoch del último check exitoso y metadatos no financieros del manifiesto disponible.

- [ ] **Step 6: Commit**

```powershell
git add -- android-capture/app/src/main/java/com/moneytrack/capture/update android-capture/app/src/test/java/com/moneytrack/capture/update android-capture/app/src/main/res/values/strings.xml
git commit -m "feat(android): check private OTA versions"
```

---

### Task 4: Descargar, verificar y entregar al instalador oficial

**Files:**
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/ApkDownloadManager.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/ApkIntegrityVerifier.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/ApkSignatureVerifier.kt`
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/ApkInstaller.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/update/ApkIntegrityVerifierTest.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/update/ApkSignatureVerifierTest.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/update/ApkInstallerContractTest.kt`
- Modify: `android-capture/app/src/main/AndroidManifest.xml`
- Create: `android-capture/app/src/main/res/xml/file_paths.xml`

**Interfaces:**
- Consumes: `AndroidUpdateManifest`.
- Produces: `DownloadState`, `IntegrityResult`, `SignatureResult`, `InstallAction` y gateway de Package Installer.

- [ ] **Step 1: Escribir pruebas rojas de integridad**

Crear archivos temporales y probar tamaño/hash exactos, tamaño distinto, hash distinto, archivo ausente y SHA esperado inválido. La comparación usa tiempo constante mediante `MessageDigest.isEqual`.

- [ ] **Step 2: Escribir pruebas rojas de firma**

Extraer a una función pura `sameSigner(installedDigests, archiveDigests)`; exigir conjuntos no vacíos y al menos un certificado actual coincidente. Probar distinto, vacío y match.

- [ ] **Step 3: Escribir contrato rojo de instalación**

Verificar manifest para `REQUEST_INSTALL_PACKAGES`, `FileProvider` no exportado/grantUriPermissions, path limitado a `external-files-path/android-updates`, y que el código solo usa `ACTION_MANAGE_UNKNOWN_APP_SOURCES` o `ACTION_INSTALL_PACKAGE`.

- [ ] **Step 4: Ejecutar rojo**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*Apk*'
```

- [ ] **Step 5: Implementar descarga acotada**

`DownloadManager.Request` acepta solo la URL ya validada, deshabilita roaming, muestra notificación del sistema y escribe `MoneyTrack-<versionName>.apk` en `getExternalFilesDir("android-updates")`. Guardar solo download ID y versión; observar `ACTION_DOWNLOAD_COMPLETE` con receiver no exportado.

- [ ] **Step 6: Implementar verificación y Package Installer**

- SHA-256 por stream de 64 KiB.
- Certificado instalado desde `packageManager.getPackageInfo(packageName, GET_SIGNING_CERTIFICATES)`.
- Certificado del archivo desde `getPackageArchiveInfo(path, GET_SIGNING_CERTIFICATES)` y package name exacto.
- Si `canRequestPackageInstalls()` es false, producir intent al ajuste específico `package:<applicationId>`.
- Si es true, URI `content://com.moneytrack.capture.fileprovider/...`, `ACTION_INSTALL_PACKAGE`, `FLAG_GRANT_READ_URI_PERMISSION`.
- Ante rechazo, borrar únicamente el APK dentro del directorio `android-updates` validado.

- [ ] **Step 7: Ejecutar verde, lint y commit**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*Apk*'
.\android-capture\gradlew.bat -p android-capture lintDebug
git add -- android-capture/app/src/main/AndroidManifest.xml android-capture/app/src/main/java/com/moneytrack/capture/update android-capture/app/src/main/res/xml/file_paths.xml android-capture/app/src/test/java/com/moneytrack/capture/update
git commit -m "feat(android): verify and install OTA packages"
```

---

### Task 5: Integrar estados OTA en ambas entradas Android

**Files:**
- Create: `android-capture/app/src/main/java/com/moneytrack/capture/update/UpdateUiController.kt`
- Create: `android-capture/app/src/main/res/layout/include_update_status.xml`
- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/MainActivity.kt`
- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/QuickExpenseActivity.kt`
- Modify: `android-capture/app/src/main/res/layout/activity_main.xml`
- Modify: `android-capture/app/src/main/res/layout/activity_quick_expense.xml`
- Modify: `android-capture/app/src/main/res/values/strings.xml`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/update/UpdateUiStateTest.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/UpdateUiContractTest.kt`

**Interfaces:**
- Consumes: checker, downloader, verifier e installer.
- Produces: estados `HIDDEN`, `AVAILABLE`, `DOWNLOADING`, `READY_TO_INSTALL`, `PERMISSION_REQUIRED`, `ERROR` y UI compartida.

- [ ] **Step 1: Escribir pruebas rojas de state machine y recursos**

Probar transiciones válidas y que:

- sin update el include está `gone`;
- available muestra versión/notas y acción secundaria `Actualizar MoneyTrack`;
- downloading anuncia progreso;
- error muestra `No pudimos preparar la actualización. Intenta de nuevo.`;
- ninguna Activity bloquea su acción primaria por un fallo OTA;
- `Buscar actualización` existe en MainActivity como acción terciaria/manual.

- [ ] **Step 2: Ejecutar rojo**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests '*UpdateUi*'
```

- [ ] **Step 3: Implementar controlador compartido**

`UpdateUiController.bind(activity, root, lifecycleCallbacks)` posee la comprobación, render y callbacks. Registra/anula el receiver en `onStart/onStop`; Activities solo delegan. Evitar referencias estáticas a Activity y cancelar el executor en `onDestroy`.

- [ ] **Step 4: Implementar jerarquía visual**

El panel usa superficie neutral/borde, icono y texto. El botón OTA usa estilo secundario; nunca aparece como segunda acción primaria. `accessibilityLiveRegion=polite`, 48 dp, sentence case y textos sin códigos técnicos.

- [ ] **Step 5: Ejecutar Android completo y commit**

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest lintDebug assembleDebug
git add -- android-capture/app/src/main/java/com/moneytrack/capture android-capture/app/src/main/res android-capture/app/src/test/java/com/moneytrack/capture
git commit -m "feat(android): expose private OTA updates"
```

---

### Task 6: Fijar firma, versiones y artefactos reproducibles

**Files:**
- Modify: `android-capture/app/build.gradle.kts`
- Create: `scripts/write-android-update-manifest.mjs`
- Modify: `android-capture/README.md`
- Modify: `.gitignore`
- Create: `android-capture/signing.properties.example`
- Create: `src/__tests__/scripts/writeAndroidUpdateManifest.test.ts`

**Interfaces:**
- Produces: release `0.2.0` code 2 firmado externamente, generador determinista del manifiesto y proceso bootstrap/code 3.

- [ ] **Step 1: Escribir prueba roja del generador**

Crear un APK fixture temporal, invocar el módulo con versión/URL y comprobar JSON exacto, tamaño y SHA. Rechazar URL fuera del repositorio, versionCode no entero, versión vacía y archivo inexistente.

- [ ] **Step 2: Implementar generador sin dependencia**

Exportar `buildAndroidUpdateManifest({ apkPath, versionCode, versionName, apkUrl, releaseNotes })` usando `node:crypto`, `node:fs/promises` y serialización JSON con newline final. CLI exige flags explícitos y nunca lee/escribe keystore.

- [ ] **Step 3: Configurar firma externa**

En Gradle leer únicamente:

```text
MONEYTRACK_ANDROID_KEYSTORE_PATH
MONEYTRACK_ANDROID_KEY_ALIAS
MONEYTRACK_ANDROID_KEYSTORE_PASSWORD
MONEYTRACK_ANDROID_KEY_PASSWORD
```

Configurar `signingConfigs.create("privateRelease")` solo si las cuatro existen. `assembleRelease` de entrega debe fallar antes de publicar si falta alguna. Fijar bootstrap `versionCode = 2`, `versionName = "0.2.0"`.

- [ ] **Step 4: Documentar bootstrap y respaldo de clave**

README debe incluir:

- firma esperada auditada;
- build limpio;
- `apksigner verify --print-certs`;
- publicación de release;
- descarga y hash independiente;
- instalación HTTPS sobre `0.1.0` sin desinstalar;
- bump a code 3 para probar updater interno;
- prohibición de commitear keystore/credenciales.

- [ ] **Step 5: Ejecutar pruebas y commit**

```powershell
npm.cmd run test:run -- src/__tests__/scripts/writeAndroidUpdateManifest.test.ts
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest lintDebug
git check-ignore -v android-capture/private-release.keystore android-capture/signing.properties
git add -- android-capture/app/build.gradle.kts android-capture/README.md android-capture/signing.properties.example .gitignore scripts/write-android-update-manifest.mjs src/__tests__/scripts/writeAndroidUpdateManifest.test.ts
git commit -m "build(android): prepare signed OTA releases"
```

---

### Task 7: Verificar y preparar la entrega OTA

**Files:**
- Modify after real evidence: `public/android/update.json`
- Modify after real evidence: `openspec/changes/add-android-transaction-ingestion/tasks.md`
- Modify after real evidence: `openspec/changes/add-android-transaction-ingestion/implementation-notes.md`

**Interfaces:**
- Consumes: Tasks 1–6 y el APK shortcut ya verificado.
- Produces: artefactos firmados reproducibles y gates explícitos antes de mutar GitHub Pages/Releases.

- [ ] **Step 1: Ejecutar regresión completa antes del release**

```powershell
npm.cmd run test:run
npm.cmd run test:rules
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
.\android-capture\gradlew.bat -p android-capture clean testDebugUnitTest lintDebug assembleDebug
npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict
git diff --check
```

Expected: todas las verificaciones pasan y `public/android/update.json` sigue anunciando code 1 hasta existir un asset posterior verificado.

- [ ] **Step 2: Construir y auditar bootstrap 0.2.0**

Con las cuatro variables de firma configuradas fuera del shell history:

```powershell
.\android-capture\gradlew.bat -p android-capture clean assembleRelease
& "$env:LOCALAPPDATA\Android\Sdk\build-tools\36.0.0\apksigner.bat" verify --verbose --print-certs android-capture\app\build\outputs\apk\release\app-release.apk
Get-FileHash -Algorithm SHA256 android-capture\app\build\outputs\apk\release\app-release.apk
```

Expected: v2 signature scheme válida y certificado idéntico al APK canario publicado.

- [ ] **Step 3: Gate de mutación externa**

Antes de crear tags/releases o desplegar Pages, comprobar que web/reglas v3 compatibles ya están integradas y desplegadas. Si no lo están, detener aquí y presentar commit, hash y comandos de publicación; no publicar una APK incompatible.

- [ ] **Step 4: Publicar y verificar bootstrap cuando el gate esté autorizado**

Crear release `android-quick-expense-0.2.0`, subir el APK con nombre `MoneyTrack-Android-0.2.0.apk`, descargarlo a un directorio temporal y comparar tamaño, SHA-256 y certificado con el local. Entregar el enlace HTTPS como bootstrap sobre `0.1.0`.

- [ ] **Step 5: Preparar y verificar la primera OTA interna**

Bump controlado a `versionCode 3`, `versionName 0.2.1`; construir con la misma firma; publicar `MoneyTrack-Android-0.2.1.apk`; descargar y verificar. Ejecutar el generador para actualizar `public/android/update.json` únicamente con los valores del asset remoto ya comprobado.

- [ ] **Step 6: Verificación física**

En el canario:

1. instalar `0.2.0` desde enlace HTTPS sobre `0.1.0`;
2. confirmar que sesión, preferencias y permiso sobreviven;
3. abrir MoneyTrack y detectar `0.2.1`;
4. descargar, comprobar que Android solicita autorización por fuente cuando aplica y confirmar Package Installer;
5. verificar `versionCode 3`, sesión, preferencias, permiso y shortcut;
6. probar hash/firma inválidos con fixtures locales sin publicar assets maliciosos.

- [ ] **Step 7: Grafo, evidencia y commit**

Ejecutar `detect_changes`, flujos afectados y tests_for sobre updater/Activities/build. Registrar solo resultados reales, marcar 15.1–15.7 y dejar 15.8 abierta si no hubo dispositivo o publicación autorizada.

```powershell
git add -- public/android/update.json openspec/changes/add-android-transaction-ingestion/tasks.md openspec/changes/add-android-transaction-ingestion/implementation-notes.md
git commit -m "docs(android): record OTA release verification"
```
