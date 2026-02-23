# TEST DE VALIDACIÓN RÁPIDA (2 MINUTOS)

**Objetivo:** Verificar que los fixes funcionan correctamente

---

## ✅ TEST 1: Badge se Actualiza a 0 (30 segundos)

### Pasos:
1. Abrir app
2. Verificar que hay notificaciones (si no, crear una cuenta con saldo bajo)
3. Observar el badge del ícono de notificaciones (debe mostrar número)
4. Click en el ícono → abrir modal
5. Click en "Limpiar todas"
6. **OBSERVAR EL BADGE INMEDIATAMENTE**

### ✅ Resultado Esperado:
- Badge cambia a 0 en menos de 100ms
- No aparece el número rojo
- Lista de notificaciones vacía

### ❌ Si Falla:
- Badge sigue mostrando número → Revisar optimistic update en `clearAll()`
- Badge se actualiza después de 2-3 segundos → Optimistic update no funciona

---

## ✅ TEST 2: No Duplicados el Mismo Día (1 minuto)

### Pasos:
1. Crear cuenta "Test Dedupe" con saldo inicial 150,000 COP
2. Agregar transacción de -60,000 COP → saldo = 90,000 (< 100,000)
3. Esperar 2 segundos
4. Verificar notificaciones → debe haber 1 "Saldo bajo: Test Dedupe"
5. Agregar transacción de -10,000 COP → saldo = 80,000
6. Esperar 2 segundos
7. Verificar notificaciones → **debe seguir siendo 1**

### ✅ Resultado Esperado:
- Solo 1 notificación "Saldo bajo: Test Dedupe"
- No se crea segunda notificación en paso 7

### ❌ Si Falla:
- Se crean 2 notificaciones → docId no es determinístico
- Revisar `generateDedupeDocId()` en `useNotificationStore.ts`

### 🔍 Verificación en Consola:
```
Paso 3:
✅ "Notification created with dedupeId" → { docId: "LOW_BALANCE_Test_Dedupe_2026-02-22" }

Paso 7:
✅ "Notification already exists, skipping" → { type: 'low_balance' }
```

---

## ✅ TEST 3: Notificación Borrada Puede Recrearse (30 segundos)

### Pasos:
1. Continuar con cuenta "Test Dedupe" del test anterior (saldo 80,000)
2. Abrir modal → "Limpiar todas"
3. Verificar: 0 notificaciones, badge = 0
4. Agregar transacción de -5,000 COP → saldo = 75,000
5. Esperar 2 segundos
6. Verificar notificaciones

### ✅ Resultado Esperado:
- Se crea 1 notificación "Saldo bajo: Test Dedupe"
- Badge = 1

### 📝 Explicación:
- La notificación se recrea porque:
  - Fue borrada manualmente
  - La condición (saldo bajo) sigue siendo verdadera
  - Es el comportamiento esperado

---

## 📊 CHECKLIST RÁPIDO

Marcar después de cada test:

- [ ] TEST 1: Badge = 0 instantáneamente ✅
- [ ] TEST 2: Solo 1 notificación (no duplica) ✅
- [ ] TEST 3: Notificación borrada se recrea ✅

**Si los 3 tests pasan → ✅ IMPLEMENTACIÓN EXITOSA**

---

## 🔍 VERIFICACIÓN EN FIRESTORE (OPCIONAL)

### Ver docIds en Firestore Console:

1. Abrir Firebase Console
2. Ir a Firestore Database
3. Navegar a: `users/{userId}/notifications`
4. Verificar docIds:

**✅ Formato Correcto:**
```
LOW_BALANCE_Test_Dedupe_2026-02-22
UNUSUAL_SPENDING_Comida_2026-02-22
BUDGET_Entretenimiento_2026-02-22
```

**❌ Formato Incorrecto (aleatorio):**
```
abc123xyz
def456uvw
```

---

## 🐛 TROUBLESHOOTING RÁPIDO

### Problema: Badge no se actualiza

**Solución Rápida:**
1. Abrir DevTools → Console
2. Buscar error en consola
3. Verificar que aparece: `"[NotificationStore] clearAll called"`
4. Si no aparece → revisar que el botón llama a `clearAll()`

### Problema: Se crean duplicados

**Solución Rápida:**
1. Abrir DevTools → Console
2. Buscar: `"Notification created with dedupeId"`
3. Verificar que el `docId` incluye fecha: `_2026-02-22`
4. Si no incluye fecha → revisar `generateDedupeDocId()`

### Problema: Notificación no se recrea después de borrar

**Solución Rápida:**
1. Verificar que la condición sigue siendo verdadera (ej: saldo sigue bajo)
2. Agregar una transacción para disparar el monitor
3. Si aún no se crea → revisar que el monitor se ejecuta

---

## ⏱️ TIEMPO TOTAL: 2 MINUTOS

**Resultado esperado:** Todos los tests pasan ✅

