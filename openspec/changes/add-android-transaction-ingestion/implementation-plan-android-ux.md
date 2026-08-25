# MoneyTrack Android UX Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refinar toda la interfaz del compañero Android con la identidad canónica de MoneyTrack, jerarquía clara, fuentes privadas, autenticación comprensible y adaptación accesible, sin alterar la captura ni la autoridad contable.

**Architecture:** Se conserva la única `MainActivity` AppCompat con vistas XML. La lógica pura existente recibe dos políticas pequeñas y comprobables —visibilidad de fuentes y estado de autenticación—; los recursos Android resuelven identidad, color, controles, light/dark y estados, mientras Firestore, el parser y la PWA permanecen intactos.

**Tech Stack:** Kotlin, AppCompat 1.8.0, Core SplashScreen 1.2.0, vistas XML, Firebase Auth/Firestore, Credential Manager 1.6.0, JUnit 4, Gradle 9.5.0, AGP 9.3.0, API 26–36 y ADB.

**Spec:** `openspec/changes/add-android-transaction-ingestion/design.md`, `openspec/changes/add-android-transaction-ingestion/specs/android-notification-capture/spec.md` y la sección 12 de `openspec/changes/add-android-transaction-ingestion/tasks.md`.

## Global Constraints

- Ejecutar desde `C:\Users\camilo.guzman_pragma\AppData\Local\Temp\Moneytrack-android-transaction-ingestion` y usar `gradlew.bat`, `npm.cmd` y `npx.cmd` en PowerShell.
- Mantener `MainActivity`, AppCompat/XML, Credential Manager, Firebase y `NotificationListenerService`; no añadir Compose, Material 3, Navigation, DI, analítica, motion ni otra dependencia.
- Reutilizar los tokens exactos de `PRODUCT.md` y `DESIGN.md`: marca `#7c3aed`/`#8b5cf6`, `primary-solid` `#7c3aed`/`#6d28d9`, pares success existentes, tipografía del sistema, contraste AA y controles de 48 dp.
- Mantener una sola acción primaria violeta por estado; secundarias tonales o delineadas, terciarias de texto, todas en estilo oración.
- Google Wallet permanece recomendada pero desmarcada hasta consentimiento; `com.android.shell`, paquetes y confianza no aparecen en la experiencia normal.
- El texto crudo, PAN, CVV, OTP, monto, comercio y últimos cuatro no entran en logs, capturas de evidencia ni nuevos estados de UI.
- No cambiar parser, contrato Firestore, fingerprint, repositorio de candidatos, PWA, libro mayor, reglas, índices ni datos remotos.
- Antes de cada commit ejecutar las pruebas enfocadas del bloque, `git diff --check` y revisar `git diff --cached --name-only`; nunca usar `git add .`.
- Preservar y no stagear los cambios concurrentes actuales bajo `src/__tests__/components/`, `src/__tests__/utils/accountCardKeyboardReorder.test.tsx`, `src/components/views/accounts/` y `src/components/views/transactions/components/TransactionImportInbox.tsx`.
- El activo canónico es `public/icons/icon-512x512-maskable.png`, SHA-256 `E6214DE36FF97B667D85837CD02114670822E5533592C2FF96A3FD3CA0413BD6`.
- No marcar 11.8, 11.10 ni 12.2–12.11 como completadas hasta que exista la evidencia exacta solicitada.

---

## Planned File Structure

```text
public/icons/icon-512x512-maskable.png               # fuente canónica, sin editar
android-capture/app/src/main/
  AndroidManifest.xml                                # launcher y nombre canónicos
  java/com/moneytrack/capture/
    MainActivity.kt                                  # render, acciones, ancho y feedback
    auth/
      AuthenticationUiState.kt                       # nuevo estado puro single-flight
      GoogleSignInController.kt                      # se conserva sin ampliar interfaz
    core/
      AvailableCaptureSourceCatalog.kt               # política de fuentes de producto
      SourceLabelResolver.kt                         # fallback neutral
    notification/
      MoneyNotificationListenerService.kt            # aplica allowlist saneado
  res/
    drawable/
      button_utility.xml                              # fila web con borde y ripple
      ic_appearance.xml                               # icono neutral
      ic_check_circle.xml                             # estado, nunca color solo
      status_success_panel.xml                       # par success semántico
    drawable-nodpi/
      moneytrack_icon_maskable.png                   # copia byte a byte del activo web
    mipmap/
      ic_launcher.xml                                # launcher previo a API 26
    mipmap-anydpi-v26/
      ic_launcher.xml                                # icono adaptativo
    layout/activity_main.xml                         # flujo completo
    values/
      colors.xml
      dimens.xml
      strings.xml
      styles.xml
    values-night/
      colors.xml
      styles.xml
    values-v27/styles.xml
    values-night-v27/styles.xml
android-capture/app/src/test/java/com/moneytrack/capture/
  AndroidBrandThemeContractTest.kt                   # nuevo
  GuidedUiLayoutContractTest.kt                      # nuevo
  ReadyScreenLayoutTest.kt                           # ampliar
  SourceDialogListSizingTest.kt                      # ampliar con ancho
  auth/AuthenticationUiStateTest.kt                  # nuevo
  core/AvailableCaptureSourceCatalogTest.kt          # ampliar
  core/SourceLabelResolverTest.kt                    # ajustar
```

El plan elimina los drawables sustituidos `drawable/ic_launcher.xml`, `drawable/ic_moneytrack_wallet.xml` e `drawable/ic_theme.xml`. No se crea un componente, framework o módulo adicional.

### Task 1: Marca canónica y apariencia AppCompat

**Files:**

- Create: `android-capture/app/src/test/java/com/moneytrack/capture/AndroidBrandThemeContractTest.kt`
- Create: `android-capture/app/src/main/res/drawable-nodpi/moneytrack_icon_maskable.png`
- Create: `android-capture/app/src/main/res/mipmap/ic_launcher.xml`
- Create: `android-capture/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
- Create: `android-capture/app/src/main/res/drawable/ic_appearance.xml`
- Modify: `android-capture/app/src/main/AndroidManifest.xml:5-14`
- Modify: `android-capture/app/src/main/res/layout/activity_main.xml:30-43`
- Modify: `android-capture/app/src/main/res/values/strings.xml:2-38`
- Modify: `android-capture/app/src/main/res/values/styles.xml:2-16`
- Modify: `android-capture/app/src/main/res/values-night/styles.xml:2-16`
- Modify: `android-capture/app/src/main/res/values-v27/styles.xml:2-14`
- Modify: `android-capture/app/src/main/res/values-night-v27/styles.xml:2-14`
- Delete: `android-capture/app/src/main/res/drawable/ic_launcher.xml`
- Delete: `android-capture/app/src/main/res/drawable/ic_moneytrack_wallet.xml`
- Delete: `android-capture/app/src/main/res/drawable/ic_theme.xml`

**Interfaces:**

- Consumes: el PNG maskable canónico de la PWA y los tokens `brand_violet`/`surface_background`.
- Produces: `@mipmap/ic_launcher`, `@drawable/moneytrack_icon_maskable`, `@drawable/ic_appearance` y el tema `Theme.MoneytrackCapture` con accent AppCompat violeta.

- [ ] **Step 1: Escribir el contrato RED de marca, launcher, splash y accent**

```kotlin
package com.moneytrack.capture

import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidBrandThemeContractTest {
    @Test
    fun `android packages the exact canonical PWA mark`() {
        assertArrayEquals(
            file("public/icons/icon-512x512-maskable.png", "../public/icons/icon-512x512-maskable.png")
                .readBytes(),
            file(
                "android-capture/app/src/main/res/drawable-nodpi/moneytrack_icon_maskable.png",
                "app/src/main/res/drawable-nodpi/moneytrack_icon_maskable.png",
            ).readBytes(),
        )
        val manifest = text("android-capture/app/src/main/AndroidManifest.xml", "app/src/main/AndroidManifest.xml")
        assertTrue(manifest.contains("android:icon=\"@mipmap/ic_launcher\""))
        assertTrue(manifest.contains("android:roundIcon=\"@mipmap/ic_launcher\""))
    }

    @Test
    fun `splash and appearance use the canonical mark and neutral icon`() {
        val styles = text(
            "android-capture/app/src/main/res/values/styles.xml",
            "app/src/main/res/values/styles.xml",
        )
        val layout = text(
            "android-capture/app/src/main/res/layout/activity_main.xml",
            "app/src/main/res/layout/activity_main.xml",
        )
        assertTrue(styles.contains("@drawable/moneytrack_icon_maskable"))
        assertTrue(layout.contains("@drawable/ic_appearance"))
        assertFalse(layout.contains("@drawable/ic_theme"))
    }

    @Test
    fun `every theme variant defines the AppCompat accent`() {
        listOf(
            "values/styles.xml",
            "values-night/styles.xml",
            "values-v27/styles.xml",
            "values-night-v27/styles.xml",
        ).forEach { relative ->
            val value = text(
                "android-capture/app/src/main/res/$relative",
                "app/src/main/res/$relative",
            )
            assertTrue("$relative misses AppCompat colorAccent", value.contains("<item name=\"colorAccent\">"))
            assertTrue(value.contains("<item name=\"android:colorAccent\">"))
        }
    }

    @Test
    fun `visible identity and appearance copy use MoneyTrack casing`() {
        val strings = text(
            "android-capture/app/src/main/res/values/strings.xml",
            "app/src/main/res/values/strings.xml",
        )
        assertTrue(strings.contains("<string name=\"app_name\">MoneyTrack</string>"))
        assertTrue(strings.contains("<string name=\"theme_dialog_title\">Apariencia</string>"))
        assertTrue(strings.contains("<string name=\"theme_button_description\">Cambiar apariencia</string>"))
        assertFalse(strings.contains("Moneytrack Capture"))
    }

    private fun text(vararg candidates: String) = file(*candidates).readText()

    private fun file(vararg candidates: String): File =
        candidates.map(::File).firstOrNull(File::isFile)
            ?: error("Missing resource; checked " + candidates.toList())
}
```

- [ ] **Step 2: Ejecutar el contrato y comprobar el fallo**

Run:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests com.moneytrack.capture.AndroidBrandThemeContractTest
```

Expected: FAIL porque falta `drawable-nodpi/moneytrack_icon_maskable.png`, el manifiesto usa `@drawable/ic_launcher`, el diálogo dice `Tema` y los temas carecen del atributo AppCompat sin prefijo.

- [ ] **Step 3: Copiar el activo exacto y crear launcher adaptativo**

Run:

```powershell
New-Item -ItemType Directory -Force -Path 'android-capture\app\src\main\res\drawable-nodpi','android-capture\app\src\main\res\mipmap','android-capture\app\src\main\res\mipmap-anydpi-v26' | Out-Null
Copy-Item -LiteralPath 'public\icons\icon-512x512-maskable.png' -Destination 'android-capture\app\src\main\res\drawable-nodpi\moneytrack_icon_maskable.png'
Get-FileHash -Algorithm SHA256 -LiteralPath 'public\icons\icon-512x512-maskable.png','android-capture\app\src\main\res\drawable-nodpi\moneytrack_icon_maskable.png'
```

Both hashes MUST equal `E6214DE36FF97B667D85837CD02114670822E5533592C2FF96A3FD3CA0413BD6`.

Create the legacy resource:

```xml
<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/brand_violet_solid" />
    <item android:drawable="@drawable/moneytrack_icon_maskable" />
</layer-list>
```

Create the API 26 adaptive resource:

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/brand_violet_solid" />
    <foreground android:drawable="@drawable/moneytrack_icon_maskable" />
</adaptive-icon>
```

Wire `AndroidManifest.xml` and the splash:

```xml
<application
    android:icon="@mipmap/ic_launcher"
    android:label="@string/app_name"
    android:roundIcon="@mipmap/ic_launcher"
    android:theme="@style/Theme.MoneytrackCapture.Starting">
```

```xml
<style name="Theme.MoneytrackCapture.Starting" parent="Theme.SplashScreen">
    <item name="windowSplashScreenBackground">@color/surface_background</item>
    <item name="windowSplashScreenAnimatedIcon">@drawable/moneytrack_icon_maskable</item>
    <item name="postSplashScreenTheme">@style/Theme.MoneytrackCapture</item>
</style>
```

- [ ] **Step 4: Corregir accent, icono y copy de apariencia**

Add both attributes to every `Theme.MoneytrackCapture` variant:

```xml
<item name="colorAccent">@color/brand_violet</item>
<item name="android:colorAccent">@color/brand_violet</item>
```

Create `ic_appearance.xml` as a neutral contrast mark:

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="@android:color/transparent"
        android:pathData="M12,3a9,9 0,1 0,0,18a9,9 0,1 0,0,-18"
        android:strokeColor="@color/brand_violet"
        android:strokeWidth="1.8" />
    <path
        android:fillColor="@color/brand_violet"
        android:pathData="M12,3a9,9 0,0 0,0,18Z" />
</vector>
```

Update the header and strings:

```xml
android:contentDescription="@string/theme_button_description"
android:src="@drawable/ic_appearance"
```

```xml
<string name="app_name">MoneyTrack</string>
<string name="notification_listener_label">Captura de compras de MoneyTrack</string>
<string name="theme_button_description">Cambiar apariencia</string>
<string name="theme_dialog_title">Apariencia</string>
```

Delete the three replaced drawable XML files with `apply_patch` so no stale icon remains.

- [ ] **Step 5: Ejecutar pruebas, lint de recursos y diff**

Run:

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests com.moneytrack.capture.AndroidBrandThemeContractTest
.\android-capture\gradlew.bat -p android-capture lintDebug
git diff --check -- android-capture
```

Expected: contract PASS, zero lint errors and no whitespace errors.

- [ ] **Step 6: Commit de marca y apariencia**

```powershell
git add -- android-capture/app/src/main/AndroidManifest.xml android-capture/app/src/main/res android-capture/app/src/test/java/com/moneytrack/capture/AndroidBrandThemeContractTest.kt
git diff --cached --name-only
git commit -m "feat(android): align capture brand and appearance"
```

The staged list MUST contain only Task 1 Android files.

### Task 2: Privacidad y consentimiento de fuentes

**Files:**

- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/core/AvailableCaptureSourceCatalog.kt:17-39`
- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/core/SourceLabelResolver.kt:3-14`
- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/notification/MoneyNotificationListenerService.kt:22-35`
- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/MainActivity.kt:146-161,194-223,319-337`
- Modify: `android-capture/app/src/main/res/values/strings.xml:20-25`
- Modify: `android-capture/app/src/test/java/com/moneytrack/capture/core/AvailableCaptureSourceCatalogTest.kt`
- Modify: `android-capture/app/src/test/java/com/moneytrack/capture/core/SourceLabelResolverTest.kt`

**Interfaces:**

- Consumes: `DiscoveredNotificationSource`, el allowlist privado y la opción conocida de Google Wallet.
- Produces: `AvailableCaptureSourceCatalog.productAllowedPackages(allowedPackages: Set<String>): Set<String>` y `options(observedSources: List<DiscoveredNotificationSource>, allowedPackages: Set<String>, includeDiagnostics: Boolean = false): List<AvailableCaptureSource>`. La Activity y el listener usan siempre la política de producto; el parámetro diagnóstico queda disponible solo para pruebas o una variante futura explícita.

- [ ] **Step 1: Añadir pruebas RED para shell, Wallet y fallback neutral**

Append to `AvailableCaptureSourceCatalogTest.kt`:

```kotlin
@Test
fun `product options hide shell and remove it from the effective allowlist`() {
    val allowed = setOf("com.android.shell", "com.banco.uno")
    val observed = listOf(
        DiscoveredNotificationSource("com.android.shell", "Shell"),
        DiscoveredNotificationSource("com.banco.uno", "Banco Uno"),
    )

    assertEquals(
        setOf("com.banco.uno"),
        AvailableCaptureSourceCatalog.productAllowedPackages(allowed),
    )
    assertEquals(
        listOf("com.google.android.apps.walletnfcrel", "com.banco.uno"),
        AvailableCaptureSourceCatalog.options(observed, allowed).map { it.packageName },
    )
}

@Test
fun `diagnostic options can name shell without making Wallet selected`() {
    val sources = AvailableCaptureSourceCatalog.options(
        observedSources = listOf(DiscoveredNotificationSource("com.android.shell", "Shell")),
        allowedPackages = setOf("com.android.shell"),
        includeDiagnostics = true,
    )

    assertFalse(sources.first().isSelected)
    assertEquals("com.android.shell", sources.last().packageName)
    assertTrue(sources.last().isSelected)
}
```

Change the fallback assertion in `SourceLabelResolverTest.kt`:

```kotlin
val fallback = "Aplicación detectada"
```

- [ ] **Step 2: Ejecutar las pruebas y comprobar el fallo**

Run:

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests com.moneytrack.capture.core.AvailableCaptureSourceCatalogTest --tests com.moneytrack.capture.core.SourceLabelResolverTest
```

Expected: FAIL porque no existen `productAllowedPackages` ni `includeDiagnostics` y el recurso aún dice `Aplicación financiera`.

- [ ] **Step 3: Implementar la política pura de fuentes**

Replace the catalog object with the following interface:

```kotlin
object AvailableCaptureSourceCatalog {
    const val GOOGLE_WALLET_PACKAGE = "com.google.android.apps.walletnfcrel"
    const val DIAGNOSTIC_SHELL_PACKAGE = "com.android.shell"

    private val googleWallet = AvailableCaptureSource(
        packageName = GOOGLE_WALLET_PACKAGE,
        label = "Google Wallet",
        origin = CaptureSourceOrigin.KNOWN,
        isSelected = false,
    )

    fun productAllowedPackages(allowedPackages: Set<String>): Set<String> =
        allowedPackages - DIAGNOSTIC_SHELL_PACKAGE

    fun options(
        observedSources: List<DiscoveredNotificationSource>,
        allowedPackages: Set<String>,
        includeDiagnostics: Boolean = false,
    ): List<AvailableCaptureSource> {
        val effectiveAllowed = if (includeDiagnostics) {
            allowedPackages.toSet()
        } else {
            productAllowedPackages(allowedPackages)
        }
        return (listOf(googleWallet) + observedSources.map { source ->
            AvailableCaptureSource(
                packageName = source.packageName,
                label = source.label,
                origin = CaptureSourceOrigin.OBSERVED,
                isSelected = false,
            )
        })
            .distinctBy { it.packageName }
            .filter { includeDiagnostics || it.packageName != DIAGNOSTIC_SHELL_PACKAGE }
            .map { source -> source.copy(isSelected = source.packageName in effectiveAllowed) }
    }
}
```

Keep `SourceLabelResolver` able to label an explicit diagnostic source, but change the resource passed as `fallbackLabel`:

```xml
<string name="source_unnamed">Aplicación detectada</string>
<string name="source_help">Las aplicaciones aparecen después de enviar una notificación. Google Wallet siempre está disponible.</string>
```

- [ ] **Step 4: Aplicar la misma política en UI y listener**

In `MainActivity.render`:

```kotlin
val allowedPackages = AvailableCaptureSourceCatalog.productAllowedPackages(
    preferences.allowedPackages(),
)
```

In `MainActivity.availableSources`:

```kotlin
private fun availableSources(allowedPackages: Set<String>): List<AvailableCaptureSource> =
    AvailableCaptureSourceCatalog.options(
        observedSources = preferences.discoveredSources(),
        allowedPackages = allowedPackages,
    )
```

In `MoneyNotificationListenerService.onNotificationPosted`, reject shell before remembering a discovered source and evaluate only the sanitized set:

```kotlin
import com.moneytrack.capture.core.AvailableCaptureSourceCatalog

val preferences = CapturePreferences.create(this)
if (sourcePackage == AvailableCaptureSourceCatalog.DIAGNOSTIC_SHELL_PACKAGE) {
    record(preferences, CaptureResultCode.PACKAGE_NOT_ALLOWED)
    return
}
val allowedPackages = AvailableCaptureSourceCatalog.productAllowedPackages(
    preferences.allowedPackages(),
)
```

This ensures an old stored shell allowlist cannot keep `READY` active or enter the parser.

- [ ] **Step 5: Ejecutar pruebas puras y captura enfocada**

Run:

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests com.moneytrack.capture.core.AvailableCaptureSourceCatalogTest --tests com.moneytrack.capture.core.SourceLabelResolverTest --tests com.moneytrack.capture.core.CaptureSetupFlowTest --tests com.moneytrack.capture.core.NotificationCaptureCoordinatorTest
.\android-capture\gradlew.bat -p android-capture lintDebug
git diff --check -- android-capture
```

Expected: all focused tests PASS; lint has zero errors; Wallet remains first, recommended and unchecked.

- [ ] **Step 6: Commit de privacidad de fuentes**

```powershell
git add -- android-capture/app/src/main/java/com/moneytrack/capture/MainActivity.kt android-capture/app/src/main/java/com/moneytrack/capture/core/AvailableCaptureSourceCatalog.kt android-capture/app/src/main/java/com/moneytrack/capture/core/SourceLabelResolver.kt android-capture/app/src/main/java/com/moneytrack/capture/notification/MoneyNotificationListenerService.kt android-capture/app/src/main/res/values/strings.xml android-capture/app/src/test/java/com/moneytrack/capture/core/AvailableCaptureSourceCatalogTest.kt android-capture/app/src/test/java/com/moneytrack/capture/core/SourceLabelResolverTest.kt
git diff --cached --name-only
git commit -m "fix(android): hide diagnostic notification sources"
```

### Task 3: Jerarquía visual, READY semántico y adaptación

**Files:**

- Create: `android-capture/app/src/test/java/com/moneytrack/capture/GuidedUiLayoutContractTest.kt`
- Create: `android-capture/app/src/main/res/drawable/button_utility.xml`
- Create: `android-capture/app/src/main/res/drawable/ic_check_circle.xml`
- Create: `android-capture/app/src/main/res/drawable/status_success_panel.xml`
- Modify: `android-capture/app/src/main/res/layout/activity_main.xml:1-290`
- Modify: `android-capture/app/src/main/res/values/colors.xml`
- Modify: `android-capture/app/src/main/res/values-night/colors.xml`
- Modify: `android-capture/app/src/main/res/values/dimens.xml`
- Modify: `android-capture/app/src/main/res/values/strings.xml`
- Modify: `android-capture/app/src/main/res/values/styles.xml`
- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/MainActivity.kt:38-363`
- Modify: `android-capture/app/src/test/java/com/moneytrack/capture/ReadyScreenLayoutTest.kt`
- Modify: `android-capture/app/src/test/java/com/moneytrack/capture/SourceDialogListSizingTest.kt`

**Interfaces:**

- Consumes: los cuatro estados de `CaptureSetupFlow` y los tokens actuales.
- Produces: estilos `Widget.MoneyTrack.Button.Primary`, `Tertiary` y `Utility`; `contentColumnWidth(availableWidth, maximumWidth)`; el estado listo compacto y un `SwitchCompat` para captura.

- [ ] **Step 1: Escribir contratos RED de controles, jerarquía y ancho**

Create `GuidedUiLayoutContractTest.kt`:

```kotlin
package com.moneytrack.capture

import java.io.File
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GuidedUiLayoutContractTest {
    @Test
    fun `capture uses a switch and actions use semantic styles`() {
        val layout = resource("layout/activity_main.xml")
        assertTrue(layout.contains("<androidx.appcompat.widget.SwitchCompat"))
        assertTrue(layout.contains("style=\"@style/Widget.MoneyTrack.Button.Primary\""))
        assertTrue(layout.contains("style=\"@style/Widget.MoneyTrack.Button.Tertiary\""))
        assertTrue(layout.contains("style=\"@style/Widget.MoneyTrack.Button.Utility\""))
        assertFalse(layout.contains("<CheckBox\n                android:id=\"@+id/capture_switch\""))
    }

    @Test
    fun `ready and completion use icon plus semantic success surface`() {
        val layout = resource("layout/activity_main.xml")
        assertTrue(layout.contains("@+id/setup_progress_panel"))
        assertTrue(layout.contains("@+id/progress_track"))
        assertTrue(layout.contains("@drawable/status_success_panel"))
        assertTrue(layout.contains("@drawable/ic_check_circle"))
        assertTrue(layout.contains("@+id/content_column"))
    }

    @Test
    fun `button labels are sentence case and privacy copy is neutral`() {
        val styles = resource("values/styles.xml")
        val layout = resource("layout/activity_main.xml")
        assertTrue(styles.contains("<item name=\"android:textAllCaps\">false</item>"))
        assertTrue(layout.contains("android:textColor=\"@color/text_secondary\""))
    }

    private fun resource(relative: String): String {
        val candidates = listOf(
            File("android-capture/app/src/main/res/$relative"),
            File("app/src/main/res/$relative"),
            File("src/main/res/$relative"),
        )
        return candidates.firstOrNull(File::isFile)?.readText()
            ?: error("Missing Android resource $relative")
    }
}
```

Extend `SourceDialogListSizingTest.kt`:

```kotlin
@Test
fun `content stays fluid on compact widths and capped on expanded widths`() {
    assertEquals(280, contentColumnWidth(availableWidth = 280, maximumWidth = 600))
    assertEquals(400, contentColumnWidth(availableWidth = 400, maximumWidth = 600))
    assertEquals(600, contentColumnWidth(availableWidth = 920, maximumWidth = 600))
    assertEquals(0, contentColumnWidth(availableWidth = -1, maximumWidth = 600))
}
```

Extend `ReadyScreenLayoutTest.kt` so the web action is a utility row:

```kotlin
assertTrue(layout.contains("style=\"@style/Widget.MoneyTrack.Button.Utility\""))
assertTrue(layout.contains("@drawable/ic_open_in_new"))
assertFalse(layout.contains("@string/ready_sources_heading"))
```

- [ ] **Step 2: Ejecutar las pruebas y comprobar el fallo**

Run:

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests com.moneytrack.capture.GuidedUiLayoutContractTest --tests com.moneytrack.capture.ReadyScreenLayoutTest --tests com.moneytrack.capture.SourceDialogListSizingTest
```

Expected: FAIL porque captura sigue siendo `CheckBox`, faltan estilos/success drawables y no existe `contentColumnWidth`.

- [ ] **Step 3: Crear tokens, estilos y drawables semánticos**

Add `primary_muted`:

```xml
<!-- values/colors.xml -->
<color name="primary_muted">#F3E8FF</color>

<!-- values-night/colors.xml -->
<color name="primary_muted">#2E1065</color>
```

Add `content_max_width`:

```xml
<dimen name="content_max_width">600dp</dimen>
```

Add these styles to base `values/styles.xml`:

```xml
<style name="Widget.MoneyTrack.Button.Primary" parent="Widget.AppCompat.Button">
    <item name="android:backgroundTint">@color/brand_violet_solid</item>
    <item name="android:minHeight">@dimen/control_min_height</item>
    <item name="android:textAllCaps">false</item>
    <item name="android:textColor">@color/primary_foreground</item>
</style>

<style name="Widget.MoneyTrack.Button.Tertiary" parent="Widget.AppCompat.Button.Borderless">
    <item name="android:minHeight">@dimen/control_min_height</item>
    <item name="android:textAllCaps">false</item>
    <item name="android:textColor">@color/text_secondary</item>
</style>

<style name="Widget.MoneyTrack.Button.Utility" parent="Widget.AppCompat.Button">
    <item name="android:background">@drawable/button_utility</item>
    <item name="android:gravity">center_vertical</item>
    <item name="android:minHeight">@dimen/control_min_height</item>
    <item name="android:paddingStart">@dimen/panel_padding</item>
    <item name="android:paddingEnd">@dimen/panel_padding</item>
    <item name="android:textAllCaps">false</item>
    <item name="android:textColor">@color/text_primary</item>
</style>
```

Create `button_utility.xml` with native ripple:

```xml
<?xml version="1.0" encoding="utf-8"?>
<ripple xmlns:android="http://schemas.android.com/apk/res/android"
    android:color="@color/primary_muted">
    <item>
        <shape android:shape="rectangle">
            <solid android:color="@color/surface_panel" />
            <stroke android:width="1dp" android:color="@color/border_subtle" />
            <corners android:radius="12dp" />
        </shape>
    </item>
</ripple>
```

Create `status_success_panel.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
    <solid android:color="@color/status_success_muted" />
    <stroke android:width="1dp" android:color="@color/status_success" />
    <corners android:radius="12dp" />
</shape>
```

Create `ic_check_circle.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:fillColor="@android:color/transparent"
        android:pathData="M12,3a9,9 0,1 0,0,18a9,9 0,1 0,0,-18"
        android:strokeColor="@color/status_success"
        android:strokeWidth="1.8" />
    <path
        android:fillColor="@android:color/transparent"
        android:pathData="M7.8,12.2l2.8,2.8l5.8,-6"
        android:strokeColor="@color/status_success"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:strokeWidth="1.8" />
</vector>
```

- [ ] **Step 4: Reestructurar el XML sin cambiar el flujo**

Give the single ScrollView child an ID and centered gravity:

```xml
<LinearLayout
    android:id="@+id/content_column"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_gravity="center_horizontal"
    android:orientation="vertical">
```

Give the progress panel and track IDs, and mark the decorative track inaccessible:

```xml
<LinearLayout
    android:id="@+id/setup_progress_panel"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="@dimen/space_large"
    android:background="@drawable/status_panel"
    android:orientation="vertical"
    android:padding="@dimen/panel_padding">

<LinearLayout
    android:id="@+id/progress_track"
    android:layout_width="match_parent"
    android:layout_height="@dimen/progress_height"
    android:layout_marginTop="@dimen/space_small"
    android:importantForAccessibility="no"
    android:orientation="horizontal">
```

Use the semantic controls:

```xml
<Button
    android:id="@+id/sign_in_button"
    style="@style/Widget.MoneyTrack.Button.Primary"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="@dimen/space_medium"
    android:text="@string/sign_in_action" />

<Button
    android:id="@+id/notification_settings_button"
    style="@style/Widget.MoneyTrack.Button.Primary"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="@dimen/space_medium"
    android:text="@string/open_notification_settings_action" />

<androidx.appcompat.widget.SwitchCompat
    android:id="@+id/capture_switch"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:minHeight="@dimen/control_min_height"
    android:text="@string/capture_switch_label" />

<LinearLayout
    android:id="@+id/ready_step"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="@dimen/space_large"
    android:background="@drawable/status_success_panel"
    android:orientation="vertical"
    android:padding="@dimen/panel_padding"
    android:visibility="gone">

<TextView
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:drawableStart="@drawable/ic_check_circle"
    android:drawablePadding="@dimen/space_small"
    android:text="@string/ready_heading"
    android:textColor="@color/status_success"
    android:textSize="20sp"
    android:textStyle="bold" />

<Button
    android:id="@+id/manage_sources_button"
    style="@style/Widget.MoneyTrack.Button.Primary"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="@dimen/space_small"
    android:text="@string/manage_sources_action" />

<Button
    android:id="@+id/open_pwa_button"
    style="@style/Widget.MoneyTrack.Button.Utility"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="@dimen/space_large"
    android:drawableStart="@drawable/ic_open_in_new"
    android:drawablePadding="@dimen/space_small"
    android:drawableTint="@color/text_primary"
    android:text="@string/open_pwa_action"
    android:visibility="gone" />

<Button
    android:id="@+id/sign_out_button"
    style="@style/Widget.MoneyTrack.Button.Tertiary"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="@dimen/space_large"
    android:text="@string/sign_out_action"
    android:visibility="gone" />
```

Keep `open_pwa_button` outside `ready_step` and leave no explanatory web card.

Use neutral copy:

```xml
<string name="screen_intro">Tus compras seleccionadas llegan a MoneyTrack para revisarlas.</string>
<string name="privacy_note">El texto original se procesa en el celular y no se conserva.</string>
```

The privacy `TextView` MUST use `@color/text_secondary`, not violet.

- [ ] **Step 5: Aplicar ancho, success completo y botones de diálogo**

Change the field type:

```kotlin
import androidx.appcompat.widget.SwitchCompat
import androidx.core.view.doOnLayout

private lateinit var captureSwitch: SwitchCompat
private lateinit var contentColumn: View
private lateinit var setupProgressPanel: View
private lateinit var progressTrack: View
```

Bind the new IDs and constrain the column after insets/layout:

```kotlin
private fun updateContentWidth(scrollView: ScrollView) {
    val availableWidth = scrollView.width - scrollView.paddingLeft - scrollView.paddingRight
    val targetWidth = contentColumnWidth(
        availableWidth = availableWidth,
        maximumWidth = resources.getDimensionPixelSize(R.dimen.content_max_width),
    )
    if (targetWidth > 0 && contentColumn.layoutParams.width != targetWidth) {
        contentColumn.layoutParams = contentColumn.layoutParams.apply { width = targetWidth }
    }
}

internal fun contentColumnWidth(availableWidth: Int, maximumWidth: Int): Int =
    minOf(availableWidth.coerceAtLeast(0), maximumWidth)
```

Import `androidx.core.view.doOnLayout`, then call the width policy at both points:

```kotlin
scrollView.doOnLayout { updateContentWidth(scrollView) }

ViewCompat.setOnApplyWindowInsetsListener(scrollView) { view, insets ->
    val systemInsets = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
    )
    view.updatePadding(
        left = originalLeft + systemInsets.left,
        top = originalTop + systemInsets.top,
        right = originalRight + systemInsets.right,
        bottom = originalBottom + systemInsets.bottom,
    )
    updateContentWidth(scrollView)
    insets
}
```

In `renderStep`:

```kotlin
val ready = step == CaptureSetupStep.READY
progressTrack.visibility = if (ready) View.GONE else View.VISIBLE
setupProgressPanel.setBackgroundResource(
    if (ready) R.drawable.status_success_panel else R.drawable.status_panel,
)
stepProgress.setTextColor(getColor(if (ready) R.color.status_success else R.color.brand_violet_dark))
stepProgress.setCompoundDrawablesRelativeWithIntrinsicBounds(
    if (ready) R.drawable.ic_check_circle else 0,
    0,
    0,
    0,
)
stepProgress.compoundDrawablePadding = resources.getDimensionPixelSize(R.dimen.space_small)
```

Style both AlertDialogs after `show()` so `Cancelar`/`Guardar` stay sentence case and 48 dp:

```kotlin
private fun AlertDialog.applyMoneyTrackActions() {
    listOf(BUTTON_NEGATIVE, BUTTON_POSITIVE).forEach { which ->
        getButton(which)?.apply {
            isAllCaps = false
            minHeight = this@MainActivity.resources.getDimensionPixelSize(
                R.dimen.control_min_height,
            )
        }
    }
}
```

Replace the final `.show()` of both builders with:

```kotlin
.create()
.also { dialog ->
    dialog.show()
    dialog.applyMoneyTrackActions()
}
```

Do not create a custom dialog class.

- [ ] **Step 6: Ejecutar pruebas enfocadas y matriz de recursos**

Run:

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests com.moneytrack.capture.GuidedUiLayoutContractTest --tests com.moneytrack.capture.ReadyScreenLayoutTest --tests com.moneytrack.capture.SourceDialogListSizingTest --tests com.moneytrack.capture.core.CaptureSetupFlowTest
.\android-capture\gradlew.bat -p android-capture lintDebug
git diff --check -- android-capture
```

Expected: PASS, no lint errors, 320/400 logical widths remain fluid and expanded width caps at 600.

- [ ] **Step 7: Commit de jerarquía y responsive**

```powershell
git add -- android-capture/app/src/main/java/com/moneytrack/capture/MainActivity.kt android-capture/app/src/main/res android-capture/app/src/test/java/com/moneytrack/capture/GuidedUiLayoutContractTest.kt android-capture/app/src/test/java/com/moneytrack/capture/ReadyScreenLayoutTest.kt android-capture/app/src/test/java/com/moneytrack/capture/SourceDialogListSizingTest.kt
git diff --cached --name-only
git commit -m "feat(android): refine guided capture interface"
```

### Task 4: Autenticación single-flight y error reparable

**Files:**

- Create: `android-capture/app/src/main/java/com/moneytrack/capture/auth/AuthenticationUiState.kt`
- Create: `android-capture/app/src/test/java/com/moneytrack/capture/auth/AuthenticationUiStateTest.kt`
- Modify: `android-capture/app/src/main/java/com/moneytrack/capture/MainActivity.kt:38-160,350-360`
- Modify: `android-capture/app/src/main/res/layout/activity_main.xml:97-133`
- Modify: `android-capture/app/src/main/res/values/strings.xml:39-43`
- Modify: `android-capture/app/src/test/java/com/moneytrack/capture/GuidedUiLayoutContractTest.kt`

**Interfaces:**

- Consumes: `AuthenticationResult` from the existing `GoogleSignInController`.
- Produces: immutable `AuthenticationUiState` with `begin(): AuthenticationUiState?` and `complete(AuthenticationResult): AuthenticationUiState`. A null `begin` means “ignore duplicate gesture”.

- [ ] **Step 1: Escribir pruebas RED del estado de autenticación**

```kotlin
package com.moneytrack.capture.auth

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AuthenticationUiStateTest {
    @Test
    fun `begin is single flight and clears an earlier failure`() {
        val failed = AuthenticationUiState(failure = AuthenticationResult.FAILED)
        val started = requireNotNull(failed.begin())

        assertTrue(started.inProgress)
        assertNull(started.failure)
        assertNull(started.begin())
    }

    @Test
    fun `completion exposes only failures and clears progress`() {
        val started = requireNotNull(AuthenticationUiState().begin())

        val failure = started.complete(AuthenticationResult.CONFIGURATION_MISSING)
        assertFalse(failure.inProgress)
        assertEquals(AuthenticationResult.CONFIGURATION_MISSING, failure.failure)

        val success = started.complete(AuthenticationResult.SIGNED_IN)
        assertFalse(success.inProgress)
        assertNull(success.failure)
    }
}
```

Extend `GuidedUiLayoutContractTest`:

```kotlin
@Test
fun `authentication reserves an accessible inline feedback region`() {
    val layout = resource("layout/activity_main.xml")
    assertTrue(layout.contains("@+id/auth_feedback"))
    assertTrue(layout.contains("android:accessibilityLiveRegion=\"polite\""))
}
```

- [ ] **Step 2: Ejecutar las pruebas y comprobar el fallo**

Run:

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests com.moneytrack.capture.auth.AuthenticationUiStateTest --tests com.moneytrack.capture.GuidedUiLayoutContractTest
```

Expected: FAIL porque no existen `AuthenticationUiState` ni `auth_feedback`.

- [ ] **Step 3: Implementar el estado puro mínimo**

```kotlin
package com.moneytrack.capture.auth

data class AuthenticationUiState(
    val inProgress: Boolean = false,
    val failure: AuthenticationResult? = null,
) {
    fun begin(): AuthenticationUiState? =
        if (inProgress) null else AuthenticationUiState(inProgress = true)

    fun complete(result: AuthenticationResult): AuthenticationUiState =
        AuthenticationUiState(
            failure = result.takeIf {
                it == AuthenticationResult.CONFIGURATION_MISSING ||
                    it == AuthenticationResult.FAILED
            },
        )
}
```

Do not change `GoogleSignInController`, token handling or Firebase behavior.

- [ ] **Step 4: Añadir feedback inline y bloquear el segundo gesto**

Place this TextView immediately after `sign_in_button`:

```xml
<TextView
    android:id="@+id/auth_feedback"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:layout_marginTop="@dimen/space_small"
    android:accessibilityLiveRegion="polite"
    android:text="@string/auth_failed_actionable"
    android:textColor="@color/status_destructive"
    android:textSize="14sp"
    android:visibility="gone" />
```

Use these production strings:

```xml
<string name="auth_in_progress">Iniciando sesión…</string>
<string name="auth_failed_actionable">No pudimos iniciar sesión. Revisa tu conexión e inténtalo de nuevo.</string>
```

Remove the user-facing configuration string. Both internal configuration failure and credential failure map to the same actionable message.

In `MainActivity`:

```kotlin
import com.moneytrack.capture.auth.AuthenticationUiState

private lateinit var authFeedback: TextView
private var authenticationUiState = AuthenticationUiState()

private fun beginGoogleSignIn() {
    val started = authenticationUiState.begin() ?: return
    authenticationUiState = started
    renderAuthentication(signedIn = false)
    signInController.signIn(::showSignInResult)
}

private fun renderAuthentication(signedIn: Boolean) {
    signInButton.visibility = if (signedIn) View.GONE else View.VISIBLE
    signInButton.isEnabled = !authenticationUiState.inProgress
    signInButton.setText(
        if (authenticationUiState.inProgress) R.string.auth_in_progress else R.string.sign_in_action,
    )
    signOutButton.visibility = if (signedIn) View.VISIBLE else View.GONE
    authFeedback.visibility = if (!signedIn && authenticationUiState.failure != null) {
        View.VISIBLE
    } else {
        View.GONE
    }
}

private fun showSignInResult(result: AuthenticationResult) {
    authenticationUiState = authenticationUiState.complete(result)
    if (result == AuthenticationResult.SIGNED_IN) {
        Toast.makeText(this, R.string.auth_signed_in, Toast.LENGTH_SHORT).show()
    }
    render()
    if (authenticationUiState.failure != null) {
        authFeedback.announceForAccessibility(getString(R.string.auth_failed_actionable))
    }
}

private fun showSignOutResult(result: AuthenticationResult) {
    val message = if (result == AuthenticationResult.SIGNED_OUT) {
        R.string.auth_signed_out
    } else {
        R.string.auth_failed_actionable
    }
    Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    render()
}
```

Bind and render the state explicitly:

```kotlin
signInButton.setOnClickListener { beginGoogleSignIn() }
signOutButton.setOnClickListener { signInController.signOut(::showSignOutResult) }

authFeedback = findViewById(R.id.auth_feedback)

// Inside render(), replace the two direct auth visibility assignments:
renderAuthentication(signedIn)
```

Delete the old `showAuthenticationResult` function and remove both `auth_configuration_missing` and `auth_failed` strings. Errors from sign-in are no longer Toast-only.

- [ ] **Step 5: Ejecutar pruebas y build enfocado**

Run:

```powershell
.\android-capture\gradlew.bat -p android-capture testDebugUnitTest --tests com.moneytrack.capture.auth.AuthenticationUiStateTest --tests com.moneytrack.capture.GuidedUiLayoutContractTest
.\android-capture\gradlew.bat -p android-capture lintDebug assembleDebug
git diff --check -- android-capture
```

Expected: PASS, zero lint errors, APK assembled.

- [ ] **Step 6: Commit de autenticación**

```powershell
git add -- android-capture/app/src/main/java/com/moneytrack/capture/MainActivity.kt android-capture/app/src/main/java/com/moneytrack/capture/auth/AuthenticationUiState.kt android-capture/app/src/main/res/layout/activity_main.xml android-capture/app/src/main/res/values/strings.xml android-capture/app/src/test/java/com/moneytrack/capture/GuidedUiLayoutContractTest.kt android-capture/app/src/test/java/com/moneytrack/capture/auth/AuthenticationUiStateTest.kt
git diff --cached --name-only
git commit -m "feat(android): clarify Google sign-in feedback"
```

### Task 5: Verificación completa, dispositivo y cierre documental

**Files:**

- Modify after evidence: `openspec/changes/add-android-transaction-ingestion/tasks.md:211-end`
- Modify after evidence: `openspec/changes/add-android-transaction-ingestion/implementation-notes.md:end`
- No production file is changed in this task unless a verification finding first receives a failing regression test.

**Interfaces:**

- Consumes: Tasks 1–4 and the authorized Android device.
- Produces: green JVM/lint/APK evidence, privacy-safe device matrix and checked OpenSpec items backed by exact evidence.

- [ ] **Step 1: Verificar alcance y árbol antes de la matriz**

Run:

```powershell
git status --short
git diff --name-only HEAD -- android-capture openspec/changes/add-android-transaction-ingestion
git diff --check -- android-capture openspec/changes/add-android-transaction-ingestion
```

Expected: only the intended Android/OpenSpec files from Tasks 1–4 differ from their respective commits; concurrent `src/` changes remain unstaged and untouched.

- [ ] **Step 2: Ejecutar la matriz Android limpia**

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\android-capture\gradlew.bat -p android-capture clean testDebugUnitTest lintDebug assembleDebug
```

Expected: all unit tests PASS, zero lint errors and `android-capture/app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 3: Validar OpenSpec y revisar impacto**

Run:

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict
git diff --check
```

Expected: `Change 'add-android-transaction-ingestion' is valid` and no whitespace error.

Update the code-review graph, then run `detect_changes`, `get_affected_flows` and `tests_for` for:

```text
android-capture/app/src/main/java/com/moneytrack/capture/MainActivity.kt
android-capture/app/src/main/java/com/moneytrack/capture/auth/AuthenticationUiState.kt
android-capture/app/src/main/java/com/moneytrack/capture/core/AvailableCaptureSourceCatalog.kt
android-capture/app/src/main/java/com/moneytrack/capture/notification/MoneyNotificationListenerService.kt
```

Expected: no uncovered financial flow; any Android UI/source gap receives a focused test before proceeding.

- [ ] **Step 4: Instalar sin borrar la sesión del dispositivo autorizado**

Discover the physical device without recording its serial:

```powershell
$deviceSerial = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' } | ForEach-Object {
    $serial = ($_ -split '\s+')[0]
    if ((adb -s $serial shell getprop ro.kernel.qemu).Trim() -ne '1') { $serial }
} | Select-Object -First 1
if (-not $deviceSerial) { throw 'No authorized physical Android device found.' }
adb -s $deviceSerial install -r 'android-capture\app\build\outputs\apk\debug\app-debug.apk'
adb -s $deviceSerial shell am force-stop com.moneytrack.capture
adb -s $deviceSerial shell monkey -p com.moneytrack.capture -c android.intent.category.LAUNCHER 1
```

Expected: install `Success` and `MainActivity` foreground without clearing Firebase or preferences.

- [ ] **Step 5: Verificar 320 dp sin alterar el tamaño del teléfono físico**

Use an emulator only:

```powershell
$emulatorSerial = adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' } | ForEach-Object {
    $serial = ($_ -split '\s+')[0]
    if ((adb -s $serial shell getprop ro.kernel.qemu).Trim() -eq '1') { $serial }
} | Select-Object -First 1
if (-not $emulatorSerial) { throw 'The 320 dp gate requires an emulator; do not override the physical display size.' }
try {
    adb -s $emulatorSerial shell wm size 640x1280
    adb -s $emulatorSerial shell wm density 320
    adb -s $emulatorSerial install -r 'android-capture\app\build\outputs\apk\debug\app-debug.apk'
    adb -s $emulatorSerial shell am force-stop com.moneytrack.capture
    adb -s $emulatorSerial shell monkey -p com.moneytrack.capture -c android.intent.category.LAUNCHER 1
    Start-Sleep -Seconds 2
    New-Item -ItemType Directory -Force -Path 'tmp\android-ux-evidence' | Out-Null
    adb -s $emulatorSerial shell screencap -p /sdcard/moneytrack-320dp.png
    adb -s $emulatorSerial pull /sdcard/moneytrack-320dp.png 'tmp\android-ux-evidence\320dp.png'
    adb -s $emulatorSerial shell rm /sdcard/moneytrack-320dp.png

    adb -s $emulatorSerial shell wm size 1400x1200
    adb -s $emulatorSerial shell am force-stop com.moneytrack.capture
    adb -s $emulatorSerial shell monkey -p com.moneytrack.capture -c android.intent.category.LAUNCHER 1
    Start-Sleep -Seconds 2
    adb -s $emulatorSerial shell screencap -p /sdcard/moneytrack-medium-700dp.png
    adb -s $emulatorSerial pull /sdcard/moneytrack-medium-700dp.png 'tmp\android-ux-evidence\medium-700dp.png'
    adb -s $emulatorSerial shell rm /sdcard/moneytrack-medium-700dp.png

    adb -s $emulatorSerial shell wm size 1800x1200
    adb -s $emulatorSerial shell am force-stop com.moneytrack.capture
    adb -s $emulatorSerial shell monkey -p com.moneytrack.capture -c android.intent.category.LAUNCHER 1
    Start-Sleep -Seconds 2
    adb -s $emulatorSerial shell screencap -p /sdcard/moneytrack-expanded-900dp.png
    adb -s $emulatorSerial pull /sdcard/moneytrack-expanded-900dp.png 'tmp\android-ux-evidence\expanded-900dp.png'
    adb -s $emulatorSerial shell rm /sdcard/moneytrack-expanded-900dp.png
} finally {
    adb -s $emulatorSerial shell wm size reset
    adb -s $emulatorSerial shell wm density reset
}
```

Inspect `320dp.png`, `medium-700dp.png` and `expanded-900dp.png` with the local image viewer. Verify no horizontal clipping, 48 dp actions, ScrollView access and a centered column capped at 600 dp. Capture launcher/splash separately during a cold start. If no emulator is available, this task remains unchecked; the denied HyperOS `WRITE_SECURE_SETTINGS` probe is not evidence.

- [ ] **Step 6: Verificar estados y restaurar configuración del dispositivo**

Capture the original device settings before the reversible font/orientation check:

```powershell
$fontBefore = (adb -s $deviceSerial shell settings get system font_scale).Trim()
$rotationModeBefore = (adb -s $deviceSerial shell settings get system accelerometer_rotation).Trim()
$rotationBefore = (adb -s $deviceSerial shell settings get system user_rotation).Trim()
try {
    adb -s $deviceSerial shell settings put system font_scale 1.3
    adb -s $deviceSerial shell settings put system accelerometer_rotation 0
    adb -s $deviceSerial shell settings put system user_rotation 0
    adb -s $deviceSerial shell am force-stop com.moneytrack.capture
    adb -s $deviceSerial shell monkey -p com.moneytrack.capture -c android.intent.category.LAUNCHER 1
    Start-Sleep -Seconds 2
    New-Item -ItemType Directory -Force -Path 'tmp\android-ux-evidence' | Out-Null
    adb -s $deviceSerial shell screencap -p /sdcard/moneytrack-font-portrait.png
    adb -s $deviceSerial pull /sdcard/moneytrack-font-portrait.png 'tmp\android-ux-evidence\font-1.3-portrait.png'
    adb -s $deviceSerial shell rm /sdcard/moneytrack-font-portrait.png

    adb -s $deviceSerial shell settings put system user_rotation 1
    adb -s $deviceSerial shell am force-stop com.moneytrack.capture
    adb -s $deviceSerial shell monkey -p com.moneytrack.capture -c android.intent.category.LAUNCHER 1
    Start-Sleep -Seconds 2
    adb -s $deviceSerial shell screencap -p /sdcard/moneytrack-font-landscape.png
    adb -s $deviceSerial pull /sdcard/moneytrack-font-landscape.png 'tmp\android-ux-evidence\font-1.3-landscape.png'
    adb -s $deviceSerial shell rm /sdcard/moneytrack-font-landscape.png
} finally {
    adb -s $deviceSerial shell settings put system font_scale $fontBefore
    adb -s $deviceSerial shell settings put system accelerometer_rotation $rotationModeBefore
    adb -s $deviceSerial shell settings put system user_rotation $rotationBefore
}
```

Inspect both local screenshots before recording the matrix. They are temporary, untracked evidence and MUST contain no financial notification or identifier.

On the device, verify all of these without financial notifications visible:

```text
- launcher and splash use the PWA logo and MoneyTrack casing
- SESSION shows one violet Google action; repeated taps do not duplicate the flow
- a recoverable sign-in failure appears inline without configuration details
- NOTIFICATION_ACCESS explains why the system setting is needed
- CAPTURE uses one SwitchCompat and source checkboxes
- Google Wallet is Recomendada and initially unchecked
- com.android.shell and package IDs are absent
- READY shows compact Configuración completa, semantic Captura activa and one Administrar aplicaciones action
- Abrir MoneyTrack is a separate bordered row; Cerrar sesión is tertiary
- Apariencia uses a neutral icon, title Apariencia, violet radios, Cancelar and Guardar
- light, dark and system modes preserve AA contrast
- 400 dp portrait, landscape and font 1.3× preserve system bars, content, modal scrolling and logical TalkBack order
```

- [ ] **Step 7: Registrar evidencia segura y actualizar checkboxes**

Append exact pass/fail observations, Gradle counts, lint findings and device matrix to `implementation-notes.md`. Do not include UID, serial, notification text, merchant, amount, last four or screenshots containing financial data.

Mark 12.2–12.11, 11.8 and 11.10 complete only where the recorded evidence satisfies each whole item. Leave the 14-day/50-event financial canary tasks untouched.

- [ ] **Step 8: Validación final y commit documental**

```powershell
npx.cmd --yes @fission-ai/openspec@1.6.0 validate add-android-transaction-ingestion --strict
git diff --check
git add -- openspec/changes/add-android-transaction-ingestion/tasks.md openspec/changes/add-android-transaction-ingestion/implementation-notes.md
git diff --cached --name-only
git commit -m "docs(android): record UX verification"
git status --short --branch
```

Expected: strict validation PASS; only the two OpenSpec evidence files are staged; concurrent `src/` changes remain outside every commit; the change stays unarchived.
