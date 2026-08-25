# Evidencia privada del canario de captura Android

Esta plantilla prueba la migración sin convertir datos financieros personales
en evidencia del repositorio. Guárdala en una ubicación privada durante la
ejecución y publica únicamente el resumen agregado y sanitizado.

## Prohibiciones de evidencia

No registres, pegues ni adjuntes:

- texto crudo de la notificación, título, cuerpo, `bigText` o `subText`;
- nombre del comercio, monto, moneda observada o últimos cuatro;
- UID, correo, token, clave de notificación o ID de instalación;
- capturas de pantalla de movimientos reales o documentos Firestore completos.

El prefijo permitido del candidato son únicamente sus primeros ocho caracteres.
No amplíes el prefijo para resolver colisiones; usa un número consecutivo local.

## Identificación del ejercicio

| Campo | Valor privado |
| --- | --- |
| Responsable |  |
| Versión/commit del APK |  |
| Proyecto Firebase verificado | Sí / No |
| Mismo UID que la PWA verificado sin copiarlo | Sí / No |
| Inicio del canario |  |
| Cierre del canario |  |
| Dispositivo de captura único | Sí / No |
| Paquete inicialmente permitido |  |

## Registro seguro de eventos

Usa `N/A` cuando un evento rechazado no deba crear candidato ni permitir revisar
monto o sugerencia. El código de parser debe ser uno de los códigos enumerados
por la aplicación; no reemplaces el código con una explicación que revele el
contenido.

| Evento | Día canario | ID candidato (prefijo 8) | Paquete fuente | Código parser | Candidato en PWA | Monto revisado correcto | Sugerencia de cuenta correcta | Falso positivo | Posteo duplicado |
| ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 |  |  |  | Sí / No / N/A | Sí / No / N/A | Sí / No / N/A | Sí / No / N/A | Sí / No / N/A |
| 2 | 1 |  |  |  | Sí / No / N/A | Sí / No / N/A | Sí / No / N/A | Sí / No / N/A | Sí / No / N/A |

## Pruebas operativas obligatorias

Marca cada punto solo después de observarlo en el dispositivo y la PWA:

- [ ] Una notificación sintética aceptada crea un candidato pendiente y no
  cambia ningún saldo.
- [ ] Una notificación sintética rechazada no crea candidato.
- [ ] Confirmar dos veces el mismo candidato tras simular pérdida de respuesta
  deja una sola transacción y un solo efecto contable.
- [ ] Una cuenta de crédito seleccionada incrementa `usedCredit` exactamente una
  vez; una cuenta no crediticia no lo modifica.
- [ ] Revocar acceso impide cualquier candidato nuevo.
- [ ] Un evento válido sin red queda en cola y aparece una sola vez después de
  reconectar.
- [ ] El documento candidato se auditó por lista de claves y no contiene texto
  crudo, PAN, CVV, OTP, clave de notificación ni ID de instalación.
- [ ] Los logs del APK contienen únicamente códigos enumerados.

## Cálculo de aceptación

Completa el canario durante al menos 14 días y con al menos 50 notificaciones
elegibles. Conserva numerador y denominador para que cada porcentaje sea
reproducible.

| Métrica | Cálculo | Resultado | Umbral |
| --- | --- | ---: | ---: |
| Duración | último día − primer día + 1 |  | ≥ 14 días |
| Notificaciones elegibles | conteo de eventos dentro del alcance |  | ≥ 50 |
| Candidatos sin payload crudo | documentos conformes / candidatos auditados |  | 100 % |
| Exactitud de monto | montos correctos / candidatos revisados |  | ≥ 95 % |
| Exactitud de sugerencia | sugerencias correctas / casos con sugerencia esperada |  | ≥ 90 % |
| Falsos positivos | falsos positivos / candidatos revisados |  | ≤ 5 % |
| Dobles contabilizaciones | candidatos con segundo efecto contable |  | 0 |

No declares 100 % cuando el denominador sea cero. Una sugerencia ambigua que la
UI deja sin seleccionar es correcta si el contrato esperaba ambigüedad; no la
fuerces para mejorar la métrica.

## Decisión

- [ ] **Aceptado:** se cumplieron todos los umbrales y las pruebas operativas.
- [ ] **No aceptado:** al menos un umbral o control falló.

Si falla cualquier criterio, conserva la confirmación manual, deshabilita la
fuente o parser afectado y abre otro cambio OpenSpec. Incluye solamente fixtures
sintéticos o sanitizados; no debilites el parser ni habilites auto-confirmación
como parte de esta migración.
