# Moneytrack Capture para Android

Moneytrack Capture es un compañero mínimo de la aplicación web. Observa solo
notificaciones **futuras** que Android entregue después de que la persona
conceda acceso, filtra únicamente las aplicaciones seleccionadas y publica un
candidato normalizado para revisión manual.

No accede al historial interno de Google Wallet, no importa compras anteriores,
no lee SMS y no contabiliza transacciones automáticamente. La aplicación web
sigue siendo la autoridad para revisar la cuenta o tarjeta y confirmar el
movimiento en el libro.

## Requisitos locales

- Android Studio y Android SDK Platform 36 con licencias aceptadas.
- Android SDK mínimo del dispositivo: API 26.
- JBR incluido con Android Studio o JDK 17 o superior. En este repositorio se
  verificó `C:\Program Files\Android\Android Studio\jbr`.
- ADB disponible para instalar en un dispositivo canario.
- Acceso autorizado al proyecto Firebase existente de Moneytrack.
- Un dispositivo Android personal de prueba; el canario inicial admite una sola
  instalación de captura por usuario.

En PowerShell:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\android-capture\gradlew.bat -p android-capture --version
```

El resultado debe mostrar Gradle 9.5.0 y Java 17 o superior. Si Gradle no puede
ubicar el SDK, crea el archivo local e ignorado `android-capture/local.properties`:

```properties
sdk.dir=C:/Users/TU_USUARIO/AppData/Local/Android/Sdk
```

## Registrar la aplicación en Firebase

1. Abre el proyecto Firebase que usa la PWA de Moneytrack. El alias actual del
   repositorio es `moneytrack-889fe`; confirma el proyecto antes de descargar
   cualquier configuración.
2. Registra una aplicación Android con el package exacto
   `com.moneytrack.capture`.
3. Obtén las huellas del certificado local:

   ```powershell
   .\android-capture\gradlew.bat -p android-capture signingReport
   ```

4. Agrega en Firebase las huellas SHA-1 y SHA-256 de debug o del certificado de
   canario que realmente se usará.
5. Habilita Google como proveedor de Firebase Authentication y descarga el
   `google-services.json` actualizado, que debe contener el cliente OAuth web.
6. Guarda el archivo únicamente en
   `android-capture/app/google-services.json`.
7. Verifica antes de continuar:

   ```powershell
   git check-ignore -v android-capture/app/google-services.json
   git status --short -- android-capture/app/google-services.json
   ```

El primer comando debe señalar `.gitignore` y el segundo no debe mostrar el
archivo. Nunca lo agregues con `-f`, nunca lo copies a documentación y nunca
subas keystores ni propiedades de firma.

El proyecto puede compilar pruebas sin esta configuración para facilitar CI,
pero el inicio de sesión muestra un error de configuración y no captura nada
hasta que exista un `google-services.json` válido del mismo proyecto de la PWA.

## Verificar, construir e instalar

Desde la raíz del repositorio:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\android-capture\gradlew.bat -p android-capture clean testDebugUnitTest lintDebug assembleDebug
adb install -r android-capture/app/build/outputs/apk/debug/app-debug.apk
```

No continúes al dispositivo si fallan pruebas o lint. Después del build, confirma
que Git no ofrece ningún archivo generado:

```powershell
git status --short
git ls-files -- android-capture/app/google-services.json android-capture/local.properties
```

## Entrega privada y actualizaciones OTA

La versión de arranque de este canal es **0.2.0** (`versionCode 2`). Se instala
una sola vez desde un enlace HTTPS verificado, encima del canario **0.1.0**,
sin desinstalar ni borrar datos. Desde entonces, MoneyTrack puede preparar
versiones posteriores mediante su actualizador interno; Android siempre muestra
la confirmación final de instalación.

La compilación de entrega acepta la firma únicamente desde estas cuatro
variables de entorno:

```text
MONEYTRACK_ANDROID_KEYSTORE_PATH
MONEYTRACK_ANDROID_KEY_ALIAS
MONEYTRACK_ANDROID_KEYSTORE_PASSWORD
MONEYTRACK_ANDROID_KEY_PASSWORD
```

El archivo `signing.properties.example` solo enumera el contrato y no es leído
por Gradle. No guardes claves, alias privados ni contraseñas en el repositorio,
scripts, historial de terminal, issues o artefactos de CI. Sin las cuatro
variables, `assembleRelease` falla deliberadamente antes de producir una APK de
entrega.

### 1. Construir y auditar el bootstrap 0.2.0

Inyecta las variables desde el almacén seguro autorizado y ejecuta un build
limpio:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
.\android-capture\gradlew.bat -p android-capture --no-configuration-cache clean testDebugUnitTest lintDebug assembleRelease
```

La opción `--no-configuration-cache` es obligatoria en una compilación firmada:
evita que Gradle persista las credenciales de entorno dentro de su caché local
de configuración.

La salida esperada es
`android-capture/app/build/outputs/apk/release/app-release.apk`. Antes de
publicarla, usa `apksigner verify --verbose --print-certs` y comprueba:

- paquete: `com.moneytrack.capture`;
- versión: `0.2.0` y código `2`;
- verificación criptográfica exitosa;
- SHA-256 del certificado firmante:
  `87e88b8490a7f1bc4fa64995ae383e7fd17fcf8953f4b454849d570544ed4de7`.

Si la huella difiere, detén la entrega. No desinstales la versión existente para
forzar la actualización: eso ocultaría una ruptura de identidad y puede perder
estado local.

Calcula además el hash del archivo de forma independiente:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\android-capture\app\build\outputs\apk\release\app-release.apk'
(Get-Item -LiteralPath '.\android-capture\app\build\outputs\apk\release\app-release.apk').Length
```

Publica esa APK como asset inmutable de un GitHub Release canario y
descárgala otra vez por su URL final. El archivo descargado debe conservar el
mismo tamaño, SHA-256, paquete, versión y certificado. Solo entonces puede
compartirse el enlace HTTPS de **0.2.0**. En el dispositivo con **0.1.0**, abre
el enlace y acepta la actualización ofrecida por Android; no uses `adb uninstall`
ni limpieza de datos.

### 2. Preparar la primera OTA interna

La primera versión ofrecida dentro de la app debe ser posterior al bootstrap;
por ejemplo **0.2.1** (`versionCode 3`). El orden de entrega es obligatorio:

1. desplegar primero las reglas de Firestore y la PWA compatibles;
2. construir código 3 con el mismo certificado y repetir la auditoría anterior;
3. publicar la APK y descargar de nuevo el asset desde su URL final;
4. generar `public/android/update.json` desde ese archivo remoto ya verificado;
5. revisar el diff del manifiesto y solo después desplegarlo en Pages;
6. desde **0.2.0**, pulsar **Buscar actualización**, descargar, verificar y
   aceptar la instalación de Android; confirmar al final que aparece código 3 y
   que la sesión y preferencias siguen presentes.

El manifiesto se genera sin dependencias y nunca accede a la clave de firma:

```powershell
node .\scripts\write-android-update-manifest.mjs `
  --apk 'C:\ruta-segura\MoneyTrack-0.2.1-descargada.apk' `
  --version-code 3 `
  --version-name '0.2.1' `
  --apk-url 'https://github.com/axensz/Moneytrack/releases/download/android-capture-v0.2.1/MoneyTrack-0.2.1.apk' `
  --release-note 'Atajo de gasto rápido y actualización privada' `
  --output '.\public\android\update.json'
```

Hasta que el asset de código 3 exista y pase esa auditoría, el manifiesto debe
seguir anunciando el canario actual de código 1. Nunca publiques primero un
manifiesto que apunte a una descarga ausente o no verificada.

## Activar la captura en el dispositivo

1. Abre Moneytrack Capture e inicia sesión con la misma cuenta Google usada en
   Moneytrack web. La igualdad de correo no sustituye la comprobación del mismo
   UID y proyecto durante el canario.
2. Pulsa **Abrir acceso a notificaciones** y habilita únicamente el listener de
   Moneytrack.
3. Espera una notificación futura de la aplicación financiera que quieras usar.
   Mientras no esté permitida, Moneytrack recuerda localmente solo su paquete y
   etiqueta; no lee el título ni el cuerpo.
4. Regresa a la aplicación, selecciona una sola fuente confiable y activa
   **Permitir captura de compras**.
5. La aplicación solo muestra **Captura activa** después de que Android enlaza
   realmente el listener. Si aparece **Verifica la captura**, abre la ficha de
   la aplicación, permite el inicio automático y selecciona batería **Sin
   restricciones**; después regresa para repetir la comprobación.
6. En Xiaomi/HyperOS también puedes abrir **Ajustes > Aplicaciones > Permisos >
   Inicio automático en segundo plano** y habilitar MoneyTrack. Esta autorización
   debe revisarse después de reinstalar la APK o si el sistema la revoca.
7. Genera primero una notificación sintética válida y otra rechazada. Solo la
   válida debe aparecer como candidato pendiente en Moneytrack web.
8. Revisa en la web el monto y la cuenta o tarjeta sugerida. La confirmación
   manual es el único paso que crea la transacción y actualiza el saldo.

El botón **Abrir Moneytrack web** usa `https://axensz.github.io/Moneytrack/`, definido
en `app/src/main/res/values/strings.xml`. Verifica ese destino contra el entorno
que se vaya a usar y actualiza el recurso en otro cambio si el despliegue oficial
tiene un host diferente.

## Privacidad y operación

- El texto de la notificación existe solo en memoria durante el parseo.
- Firestore recibe únicamente monto normalizado, moneda COP, comercio
  normalizado, últimos cuatro opcionales, paquete, fecha, parser, confianza y
  estado pendiente.
- No se persisten título, cuerpo, payload, PAN, CVV, OTP, clave de notificación,
  ID de instalación ni tokens de autenticación.
- Los logs de la aplicación contienen solo códigos enumerados sin valores
  financieros.
- La instalación aleatoria y la lista de fuentes viven en preferencias privadas,
  excluidas de backup y transferencia de dispositivo.
- Sin sesión, permiso, fuente permitida o interruptor activo, el pipeline se
  detiene antes de leer contenido.

Para detener nuevas capturas, desactiva el interruptor, revoca el acceso a
notificaciones o desinstala la aplicación. Los candidatos pendientes nunca
cambian saldos por sí solos.

## Evidencia del canario

Usa exclusivamente [la plantilla privada del canario](../docs/android-capture-canary.md).
No pegues notificaciones ni datos financieros en issues, commits, capturas de
pantalla o logs de CI.
