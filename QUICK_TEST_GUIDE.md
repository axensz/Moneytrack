# GUÍA RÁPIDA DE TESTING - SISTEMA DE NOTIFICACIONES

**Objetivo:** Verificar que los fixes funcionan correctamente en < 10 minutos

---

## 🚀 TEST RÁPIDO (5 minutos)

### Paso 1: Verificar Logs en Consola (2 min)

1. Abrir DevTools → Console
2. Limpiar consola (Ctrl+L)
3. Recargar app (F5)
4. Buscar estos logs:

**✅ DEBE APARECER (1 vez cada uno):**
```
✅ "Notification monitors initialized"
✅ "Running daily notification checks"
✅ "Daily notification checks completed"
```

**❌ NO DEBE APARECER (múltiples veces):**
```
❌ "Notification monitors initialized" (2+ veces)
❌ "Running daily notification checks" (2+ veces)
```

**Resultado:** Si cada log aparece solo 1 vez → ✅ FIX #1 y #2 funcionan

---

### Paso 2: Verificar No Duplicados (2 min)

1. Crear cuenta "Test" con saldo 50,000 COP (< 100,000)
2. Esperar 2 segundos
3. Verificar notificaciones:
   - Abrir modal de notificaciones
   - Contar cuántas notificaciones "Saldo bajo: Test" hay

**✅ Resultado esperado:** Solo 1 notificación

4. Cerrar app (cerrar pestaña)
5. Abrir app de nuevo
6. Verificar notificaciones de nuevo

**✅ Resultado esperado:** Sigue siendo 1 notificación (no se duplicó)

**Resultado:** Si hay solo 1 notificación → ✅ FIX #3 funciona

---

### Paso 3: Verificar Optimistic Updates (1 min)

1. Tener 5+ notificaciones sin leer
2. Abrir modal de notificaciones
3. Click en "Marcar leídas"
4. Observar contador

**✅ Resultado esperado:** Contador cambia a 0 INMEDIATAMENTE (< 100ms)

5. Click en "Limpiar todas"
6. Observar lista

**✅ Resultado esperado:** Lista se vacía INMEDIATAMENTE

**Resultado:** Si UI responde instantáneamente → ✅ FIX #5 funciona

---

## 🔍 TEST DETALLADO (10 minutos)

### Test A: HMR No Causa Duplicados (3 min)

1. Tener 3 notificaciones
2. Anotar el número exacto
3. Hacer cambio trivial en código (agregar comentario)
4. Guardar → esperar HMR
5. Repetir 3 veces
6. Verificar número de notificaciones

**✅ Resultado esperado:** Número NO aumenta

---

### Test B: Deduplicación por Fecha (3 min)

1. Crear cuenta "Efectivo" con 150,000 COP
2. Agregar transacción -60,000 → saldo = 90,000
3. Verificar: 1 notificación "Saldo bajo: Efectivo"
4. Esperar 2 minutos
5. Agregar transacción -10,000 → saldo = 80,000
6. Verificar notificaciones

**✅ Resultado esperado:** Sigue siendo 1 notificación (no se creó otra)

**En consola debe aparecer:**
```
✅ "Duplicate notification detected (Firestore), skipping"
```

---

### Test C: Persistencia Después de Reload (2 min)

1. Tener 5 notificaciones
2. Click "Limpiar todas"
3. Verificar: lista vacía, contador = 0
4. Recargar página (F5)
5. Verificar notificaciones

**✅ Resultado esperado:** Sigue vacío (persistió en Firestore)

---

### Test D: Rollback en Error (2 min - opcional)

1. Desconectar internet
2. Tener 5 notificaciones
3. Click "Limpiar todas"
4. Observar UI

**✅ Resultado esperado:** 
- UI se vacía inmediatamente (optimistic)
- Después de ~5s, notificaciones vuelven (rollback)
- Toast de error aparece

---

## 📊 CHECKLIST DE VALIDACIÓN RÁPIDA

Marcar cada item después de verificar:

- [ ] Log "Notification monitors initialized" aparece solo 1 vez
- [ ] Log "Running daily notification checks" aparece solo 1 vez
- [ ] No se crean notificaciones duplicadas al reabrir app
- [ ] HMR no causa duplicados
- [ ] "Marcar leídas" actualiza UI en < 100ms
- [ ] "Limpiar todas" actualiza UI en < 100ms
- [ ] Estado persiste después de reload
- [ ] Deduplicación por fecha funciona (no crea 2da notificación mismo día)

**Si todos los items están marcados → ✅ IMPLEMENTACIÓN EXITOSA**

---

## 🐛 TROUBLESHOOTING

### Problema: Log "initialized" aparece múltiples veces

**Causa:** FIX #2 no aplicado correctamente  
**Solución:** Verificar que `monitorsInitializedRef` guard esté en línea 43 de `useNotificationMonitoring.ts`

### Problema: Notificaciones se duplican al reabrir app

**Causa:** FIX #3 no aplicado correctamente  
**Solución:** Verificar que `getDebounceKey()` incluya fecha y `checkIfExistsToday()` esté implementado

### Problema: UI no se actualiza inmediatamente

**Causa:** FIX #5 no aplicado correctamente  
**Solución:** Verificar optimistic updates en `clearAll()` y `markAllAsRead()`

### Problema: Errores de TypeScript

**Causa:** Imports faltantes  
**Solución:** Ejecutar `npm run build` y verificar errores

---

## 📝 REPORTE DE TESTING

Después de completar los tests, llenar este reporte:

```
FECHA: _______________
TESTER: _______________

TEST RÁPIDO:
[ ] Paso 1: Logs únicos → ✅ / ❌
[ ] Paso 2: No duplicados → ✅ / ❌
[ ] Paso 3: Optimistic updates → ✅ / ❌

TEST DETALLADO:
[ ] Test A: HMR → ✅ / ❌
[ ] Test B: Deduplicación → ✅ / ❌
[ ] Test C: Persistencia → ✅ / ❌
[ ] Test D: Rollback → ✅ / ❌

RESULTADO GENERAL: ✅ APROBADO / ❌ RECHAZADO

NOTAS:
_________________________________
_________________________________
_________________________________
```

---

**Tiempo total estimado:** 5-10 minutos  
**Resultado esperado:** Todos los tests ✅

