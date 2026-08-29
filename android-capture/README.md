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

El botón **Abrir Moneytrack web** usa `https://moneytrack-889fe.web.app`, definido
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
