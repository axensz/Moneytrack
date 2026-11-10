# Comprobación del estado de captura — 2026-09-29

Corrección local en `feature/capture-status`. Instalada en el teléfono autorizado mediante actualización, sin desinstalar ni borrar datos. No publicada por OTA.

## Cambio

- `Captura activa` exige permiso vigente y conexión confirmada por Android.
- Consultar el estado no solicita ni prolonga una reconexión. El intento explícito tiene nueve segundos de espera; la pantalla visible se actualiza sin necesitar otro callback.
- Durante la espera aparece `Conectando la captura`; al vencer, `Reactiva la captura` y la acción de recuperación. Se mantiene la prioridad de sesión, permiso y captura habilitada.
- Se sustituyeron las pruebas que exigían tratar una reconexión sin confirmar como captura activa. No se modificaron el parser de Wallet ni la entrega de candidatos.

## Validación

- Las seis regresiones fallaron contra el código anterior y pasaron con la corrección.
- Compilación de APK, 24 pruebas centradas en captura e interfaz y `lintDebug`: correctos. Lint conserva tres advertencias de versiones de SDK/dependencia.
- Suite completa: 201 de 202 pruebas aprobadas. El fallo previo `QuickExpenseShortcutContractTest`, línea 59, exige el título `Registrar gasto`; el código base ya contiene `Gasto rápido`. Ni esa prueba ni ese título se cambiaron.
- En el teléfono: desactivar el permiso oculta `Captura activa` y pide acceso; restaurarlo y volver a la aplicación muestra `Captura activa`, con Google Wallet seleccionada y listener vivo confirmado por Android.
- Tras 15 segundos en segundo plano, permiso y listener seguían activos. La aplicación quedó abierta, autorizada y conectada.
- Android impidió deshabilitar artificialmente el componente para simular un listener bloqueado conservando el permiso. Ese escenario no se reprodujo físicamente; el vencimiento y la ausencia de falsos positivos están cubiertos por las regresiones automatizadas.
- No se realizó una compra nueva ni se recuperaron compras históricas. Falta observar una notificación real nueva de Wallet y su llegada a Pendientes en la web. El texto histórico `Última compra enviada` no prueba esa entrega nueva.
- Se actualizó la especificación existente; la CLI de OpenSpec no está disponible y no se ejecutó su validador.

## APK instalada

- Variante local debug, `0.2.2`, código `4`; conserva la versión del proyecto.
- SHA-256 del archivo compilado y del instalado, comprobados iguales: `04ef00ee3ea73136b11c6d3f2e221ab8436e2d899a5c2d85bec8f75e8edca25d`.
- Certificado SHA-256, igual al de la APK anterior: `87e88b8490a7f1bc4fa64995ae383e7fd17fcf8953f4b454849d570544ed4de7`.
- Copia recuperable de la APK anterior: `C:\Users\camilo.guzman_pragma\AppData\Local\Temp\moneytrack-before-capture-status.apk`.

## Entorno de compilación

Gradle/Java en este Windows fallaba al abrir el socket local Unix. Para esta ejecución se configuró `JDK_JAVA_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Users\camilo.guzman_pragma\.codex\worktrees\capture-status\Moneytrack\android-capture\.gradle\tcp-fallback` con una ruta inexistente, usando así el fallback TCP local de OpenJDK. La variable solo se aplicó al proceso de compilación; no se modificó la configuración permanente del equipo ni la del proyecto.
