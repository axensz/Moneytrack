# DIAGNÓSTICO COMPLETO: SISTEMA DE NOTIFICACIONES

**Fecha:** 22 de febrero de 2026  
**Analista:** Ingeniero Senior (Frontend + Firebase/Firestore)  
**Problema:** Notificaciones duplicadas masivas (48+ sin leer) y logs repetitivos

---

## 1. TRAZA SECUENCIAL (TIMELINE)

### 1.1 Montaje Inicial de la Aplicación

```
1. App monta → finance-tracker.tsx renderiza
2. useNotifications(userId) se ejecuta
   ├─ useNotificationStore(userId) → suscripción Firestore
   ├─ useNotificationPreferences(userId) → carga preferencias
   └─ useMemo crea NotificationManager con deps: [addNotification, updateNotification, deleteNotification, storeClearAll, storeMarkAllAsRead, notifications, preferences]
3. useNotificationMonitoring se ejecuta con deps: [notificationManager, budgets, transactions, recurringPayments, accounts, debts]
```

### 1.2 Inicialización de Monitores (useNotificationMonitoring)

```
4. useEffect #1 (línea 64-102) se dispara
   ├─ Dependencias: [notificationManager, budgets, transactions, recurringPayments, accounts, debts]
   ├─ Crea instancias de monitores:
   │  ├─ BudgetMonitor
   │  ├─ PaymentMonitor
   │  ├─ SpendingAnalyzer
   │  ├─ BalanceMonitor
   │  └─ DebtMonitor
   └─ Log: "Notification monitors initialized"
```


### 1.3 Checks Diarios (useNotificationMonitoring)

```
5. useEffect #2 (línea 104-122) se dispara
   ├─ Dependencias: [monitorsRef.current.paymentMonitor, monitorsRef.current.debtMonitor]
   ├─ Guard: dailyCheckDoneRef.current (previene re-ejecución)
   ├─ Log: "Running daily notification checks"
   ├─ Ejecuta:
   │  ├─ paymentMonitor.checkUpcomingPayments()
   │  └─ debtMonitor.checkOverdueDebts()
   └─ Log: "Daily notification checks completed"
```

### 1.4 Monitoreo de Transacciones

```
6. useEffect #3 (línea 124-167) se dispara
   ├─ Dependencias: [transactions]
   ├─ Detecta cambios en transactions.length
   ├─ Para cada nueva transacción:
   │  ├─ budgetMonitor.evaluateBudgetAlerts(transaction)
   │  ├─ spendingAnalyzer.evaluateUnusualSpending(transaction)
   │  └─ balanceMonitor.evaluateBalanceAlerts(accountId)
   └─ Actualiza prevTransactionCountRef.current
```

### 1.5 Creación de Notificación

```
7. Monitor llama createNotification(notification)
8. NotificationManager.createNotification()
   ├─ Verifica si tipo está habilitado
   ├─ Verifica duplicado con isDuplicate() → debounceMap (1 segundo)
   ├─ Llama addNotification() → Firestore/localStorage
   ├─ Actualiza debounceMap
   └─ Log: "Notification created"
9. Firestore onSnapshot detecta cambio
10. setFirestoreNotifications actualiza estado
11. notifications cambia → NotificationManager se recrea (useMemo)
12. notificationManager cambia → useNotificationMonitoring useEffect #1 se dispara de nuevo
```

---

## 2. ROOT CAUSE: CICLO DE RE-INICIALIZACIÓN

### 2.1 Problema Principal: Dependencias Circulares

**El problema está en la cadena de dependencias:**


```
notifications cambia
  ↓
NotificationManager se recrea (useMemo en useNotifications.ts línea 30-44)
  ↓
notificationManager cambia
  ↓
useNotificationMonitoring useEffect #1 se dispara (línea 64-102)
  ↓
Monitores se reinicializan
  ↓
Log: "Notification monitors initialized" (REPETIDO)
  ↓
Si hay datos, los monitores evalúan de nuevo
  ↓
Crean notificaciones (si pasan debounce de 1 segundo)
  ↓
notifications cambia → CICLO SE REPITE
```

### 2.2 Problema Secundario: Dependencias en useEffect #2

```javascript
// useNotificationMonitoring.ts línea 104-122
useEffect(() => {
    if (dailyCheckDoneRef.current) return;
    if (!monitorsRef.current.paymentMonitor || !monitorsRef.current.debtMonitor) return;
    
    const runDailyChecks = async () => {
        // ...
    };
    
    runDailyChecks();
}, [monitorsRef.current.paymentMonitor, monitorsRef.current.debtMonitor]);
```

**Problema:** Las dependencias son `monitorsRef.current.paymentMonitor` y `monitorsRef.current.debtMonitor`, que son objetos que cambian en cada re-inicialización del useEffect #1.

**Resultado:** Aunque `dailyCheckDoneRef.current` previene la ejecución múltiple, el useEffect se dispara innecesariamente.



### 2.3 Problema Terciario: Debounce Insuficiente

El `NotificationManager` usa un debounce de **1 segundo** (línea 26):

```javascript
private readonly DEBOUNCE_MS = 1000;
```

**Problema:** En un ciclo de re-renders rápidos (HMR, fast refresh, múltiples cambios de estado), si pasan más de 1 segundo entre evaluaciones, se crearán notificaciones duplicadas.

**Ejemplo:**
- T=0s: Primera evaluación → crea notificación "Saldo bajo: Efectivo"
- T=1.5s: Re-render → evaluación de nuevo → debounce expiró → crea notificación duplicada
- T=3s: Otro re-render → evaluación de nuevo → crea otra duplicada

### 2.4 Problema Cuaternario: Sin Deduplicación Persistente

El `debounceMap` es **en memoria** y se limpia cada 5 minutos (línea 318-327). No hay verificación en Firestore para evitar duplicados del mismo día.

**Escenario:**
1. Usuario abre app → crea notificación "Saldo bajo: Efectivo"
2. Usuario cierra app (debounceMap se pierde)
3. Usuario abre app de nuevo → crea la misma notificación otra vez

---

## 3. MATRIZ DE DISPARADORES DE NOTIFICACIONES

| Tipo | Trigger Exacto | Datos Usados | Condición de Creación | Frecuencia Esperada | Dedupe Actual |
|------|---------------|--------------|----------------------|---------------------|---------------|
| **budget** | Nueva transacción de tipo expense | budgets, transactions | `spent/limit >= threshold` (80%, 90%, 100%) | 1 vez por umbral por mes | debounceMap (1s) |
| **unusual_spending** | Nueva transacción de tipo expense | transactions (90 días) | `amount > average * (threshold/100)` | 1 vez por transacción | debounceMap (1s) |
| **low_balance** | Nueva transacción que afecta cuenta | accounts, transactions | `balance < threshold` | 1 vez por día por cuenta | cooldownMap (24h) |
| **recurring** | Daily check (app mount) | recurringPayments, transactions | `daysUntilDue in [0, 1, 3]` y `!isPaid` | 1 vez por día por payment | lastCheckDate (día) |
| **debt** | Daily check (app mount) | debts | `daysOutstanding >= [30, 60, 90]` y `!isSettled` | 1 vez por semana por debt | lastReminderMap (7 días) |



### 3.1 Análisis de Deduplicación por Tipo

#### ✅ BIEN: low_balance, recurring, debt
- **low_balance:** Usa `cooldownMap` de 24 horas por cuenta
- **recurring:** Usa `lastCheckDate` para ejecutar solo 1 vez al día
- **debt:** Usa `lastCheckDate` + `lastReminderMap` (7 días entre recordatorios)

#### ❌ MAL: budget, unusual_spending
- **budget:** Solo debounce de 1 segundo, sin cooldown por día/mes
- **unusual_spending:** Solo debounce de 1 segundo, sin verificación de "ya notificado para esta transacción"

**Resultado:** Si el ciclo de re-inicialización ocurre después de 1 segundo, se crearán múltiples notificaciones de budget y unusual_spending para las mismas condiciones.

---

## 4. DIAGNÓSTICO DE DUPLICADOS (ROOT CAUSE)

### 4.1 Causa Raíz #1: NotificationManager en useMemo con Dependencias Inestables

**Archivo:** `src/hooks/useNotifications.ts` línea 30-44

```javascript
const notificationManager = useMemo(() => {
    return new NotificationManager({
      addNotification,
      updateNotification,
      deleteNotification,
      clearAll: storeClearAll,
      markAllAsRead: storeMarkAllAsRead,
      notifications,  // ← CAMBIA CADA VEZ QUE SE CREA UNA NOTIFICACIÓN
      preferences,
    });
  }, [
    addNotification,
    updateNotification,
    deleteNotification,
    storeClearAll,
    storeMarkAllAsRead,
    notifications,  // ← DEPENDENCIA INESTABLE
    preferences,
  ]);
```

**Problema:** `notifications` es un array que cambia cada vez que Firestore emite un nuevo snapshot. Esto causa que `NotificationManager` se recree constantemente.



### 4.2 Causa Raíz #2: useNotificationMonitoring con notificationManager como Dependencia

**Archivo:** `src/hooks/useNotificationMonitoring.ts` línea 64-102

```javascript
useEffect(() => {
    if (!notificationManager) return;
    // ... crea monitores
    logger.info('Notification monitors initialized');
}, [notificationManager, budgets, transactions, recurringPayments, accounts, debts]);
```

**Problema:** Cuando `notificationManager` cambia (por causa raíz #1), este useEffect se dispara y reinicializa todos los monitores.

**Resultado:** Cada vez que se crea una notificación:
1. Firestore actualiza → `notifications` cambia
2. `NotificationManager` se recrea
3. Monitores se reinicializan
4. Log "Notification monitors initialized" se repite
5. Si hay condiciones que cumplir, se crean más notificaciones
6. Vuelve al paso 1 (ciclo infinito mitigado solo por debounce de 1s)

### 4.3 Causa Raíz #3: Falta de Deduplicación Persistente

**Archivo:** `src/services/NotificationManager.ts` línea 217-236

```javascript
private getDebounceKey(notification: Omit<Notification, 'id' | 'createdAt'>): string {
    const parts = [notification.type, notification.title];
    
    if (notification.metadata) {
        const { budgetId, recurringPaymentId, transactionId, accountId, debtId } = notification.metadata;
        if (budgetId) parts.push(budgetId);
        // ...
    }
    
    return parts.join(':');
}
```

**Problema:** La clave de deduplicación NO incluye fecha/día. Esto significa:
- Clave para "Saldo bajo: Efectivo" = `low_balance:Saldo bajo: Efectivo:account123`
- Esta clave es la misma hoy, mañana, y siempre
- Solo el debounce de 1 segundo previene duplicados

**Solución esperada:** Incluir fecha en la clave para deduplicación diaria:
```javascript
const today = new Date().toISOString().split('T')[0]; // "2026-02-22"
parts.push(today);
```



### 4.4 Causa Raíz #4: Dependencias Incorrectas en useEffect #2

**Archivo:** `src/hooks/useNotificationMonitoring.ts` línea 104-122

```javascript
useEffect(() => {
    if (dailyCheckDoneRef.current) return;
    if (!monitorsRef.current.paymentMonitor || !monitorsRef.current.debtMonitor) return;
    
    const runDailyChecks = async () => {
        // ...
    };
    
    runDailyChecks();
}, [monitorsRef.current.paymentMonitor, monitorsRef.current.debtMonitor]);
//  ↑ PROBLEMA: Estas son referencias de objetos que cambian
```

**Problema:** Las dependencias son objetos que se recrean en cada ejecución del useEffect #1, causando que este useEffect se dispare innecesariamente.

**Solución:** Usar una dependencia estable o eliminar las dependencias y confiar en el guard `dailyCheckDoneRef`.

---

## 5. FIX PROPUESTO (CAMBIOS CONCRETOS)

### 5.1 Fix #1: Estabilizar NotificationManager (CRÍTICO)

**Archivo:** `src/hooks/useNotifications.ts`

**Problema:** `notifications` como dependencia causa recreación constante.

**Solución:** Usar `useRef` para mantener una instancia estable y actualizar sus deps internamente.

```typescript
// ANTES (línea 30-44)
const notificationManager = useMemo(() => {
    return new NotificationManager({
      addNotification,
      updateNotification,
      deleteNotification,
      clearAll: storeClearAll,
      markAllAsRead: storeMarkAllAsRead,
      notifications,  // ← PROBLEMA
      preferences,
    });
  }, [
    addNotification,
    updateNotification,
    deleteNotification,
    storeClearAll,
    storeMarkAllAsRead,
    notifications,  // ← PROBLEMA
    preferences,
  ]);
```



```typescript
// DESPUÉS (SOLUCIÓN)
const notificationManagerRef = useRef<NotificationManager | null>(null);

// Crear instancia solo una vez
if (!notificationManagerRef.current) {
  notificationManagerRef.current = new NotificationManager({
    addNotification,
    updateNotification,
    deleteNotification,
    clearAll: storeClearAll,
    markAllAsRead: storeMarkAllAsRead,
    notifications: [],  // Inicializar vacío
    preferences,
  });
}

// Actualizar deps sin recrear instancia
useEffect(() => {
  if (notificationManagerRef.current) {
    notificationManagerRef.current.deps = {
      addNotification,
      updateNotification,
      deleteNotification,
      clearAll: storeClearAll,
      markAllAsRead: storeMarkAllAsRead,
      notifications,
      preferences,
    };
  }
}, [addNotification, updateNotification, deleteNotification, storeClearAll, storeMarkAllAsRead, notifications, preferences]);

const notificationManager = notificationManagerRef.current;
```

**Resultado:** `notificationManager` es una referencia estable que no cambia, evitando la reinicialización de monitores.



### 5.2 Fix #2: Agregar Guard en useNotificationMonitoring (CRÍTICO)

**Archivo:** `src/hooks/useNotificationMonitoring.ts`

**Problema:** Monitores se reinicializan múltiples veces.

**Solución:** Usar `useRef` para inicializar monitores solo una vez.

```typescript
// ANTES (línea 64-102)
useEffect(() => {
    if (!notificationManager) return;
    
    const preferences = notificationManager.deps?.preferences;
    if (!preferences) return;
    
    // Create monitor instances
    monitorsRef.current.budgetMonitor = new BudgetMonitor({...});
    // ...
    
    logger.info('Notification monitors initialized');
}, [notificationManager, budgets, transactions, recurringPayments, accounts, debts]);
```

```typescript
// DESPUÉS (SOLUCIÓN)
const monitorsInitializedRef = useRef(false);

useEffect(() => {
    if (!notificationManager) return;
    if (monitorsInitializedRef.current) return;  // ← GUARD
    
    const preferences = notificationManager.deps?.preferences;
    if (!preferences) return;
    
    // Create monitor instances SOLO UNA VEZ
    monitorsRef.current.budgetMonitor = new BudgetMonitor({
        createNotification: (n) => notificationManager.createNotification(n),
        preferences,
        budgets,
        transactions,
    });
    // ... resto de monitores
    
    monitorsInitializedRef.current = true;  // ← MARCAR COMO INICIALIZADO
    logger.info('Notification monitors initialized');
}, [notificationManager]);  // ← SOLO notificationManager como dependencia
```

**Importante:** Eliminar `budgets, transactions, recurringPayments, accounts, debts` de las dependencias porque los monitores ya reciben estas referencias y las usan dinámicamente.



### 5.3 Fix #3: Deduplicación Persistente con Fecha (CRÍTICO)

**Archivo:** `src/services/NotificationManager.ts`

**Problema:** Debounce de 1 segundo es insuficiente, no hay deduplicación por día.

**Solución A: Mejorar getDebounceKey para incluir fecha**

```typescript
// ANTES (línea 217-236)
private getDebounceKey(notification: Omit<Notification, 'id' | 'createdAt'>): string {
    const parts = [notification.type, notification.title];
    
    if (notification.metadata) {
        const { budgetId, recurringPaymentId, transactionId, accountId, debtId } = notification.metadata;
        if (budgetId) parts.push(budgetId);
        if (recurringPaymentId) parts.push(recurringPaymentId);
        if (transactionId) parts.push(transactionId);
        if (accountId) parts.push(accountId);
        if (debtId) parts.push(debtId);
    }
    
    return parts.join(':');
}
```

```typescript
// DESPUÉS (SOLUCIÓN)
private getDebounceKey(notification: Omit<Notification, 'id' | 'createdAt'>): string {
    const parts = [notification.type, notification.title];
    
    // Agregar fecha para deduplicación diaria
    const today = new Date().toISOString().split('T')[0]; // "2026-02-22"
    parts.push(today);
    
    if (notification.metadata) {
        const { budgetId, recurringPaymentId, transactionId, accountId, debtId } = notification.metadata;
        if (budgetId) parts.push(budgetId);
        if (recurringPaymentId) parts.push(recurringPaymentId);
        if (transactionId) parts.push(transactionId);
        if (accountId) parts.push(accountId);
        if (debtId) parts.push(debtId);
    }
    
    return parts.join(':');
}
```

**Resultado:** Cada notificación solo se puede crear una vez por día, incluso si la app se reinicia.



**Solución B: Verificar en Firestore antes de crear (más robusto)**

```typescript
// En NotificationManager.createNotification()
async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<void> {
    // Check if notification type is enabled
    if (!this.isNotificationTypeEnabled(notification.type)) {
        logger.info(`Notification type ${notification.type} is disabled, skipping`);
        return;
    }

    // Check for duplicate (debouncing en memoria)
    if (this.isDuplicate(notification)) {
        logger.info('Duplicate notification detected (debounce), skipping', { notification });
        return;
    }

    // ← NUEVO: Verificar en Firestore si ya existe hoy
    const dedupeKey = this.getDebounceKey(notification);
    const existsInFirestore = await this.checkIfExistsToday(dedupeKey);
    if (existsInFirestore) {
        logger.info('Duplicate notification detected (Firestore), skipping', { notification });
        return;
    }

    try {
        // Store notification
        await this.deps.addNotification(notification);
        
        // Update debounce map
        this.debounceMap.set(dedupeKey, Date.now());
        
        // Show toast if appropriate
        if (this.shouldShowToast(notification)) {
            this.queueToast(notification);
        }
        
        logger.info('Notification created', { notification });
    } catch (error) {
        logger.error('Failed to create notification', { notification, error });
        throw error;
    }
}

// Nuevo método
private async checkIfExistsToday(dedupeKey: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0];
    
    // Buscar en notifications actuales si ya existe una con el mismo dedupeKey hoy
    const existingToday = this.deps.notifications.find(n => {
        const nDate = new Date(n.createdAt).toISOString().split('T')[0];
        const nKey = this.getDebounceKey(n);
        return nDate === today && nKey === dedupeKey;
    });
    
    return !!existingToday;
}
```



### 5.4 Fix #4: Corregir Dependencias en useEffect #2

**Archivo:** `src/hooks/useNotificationMonitoring.ts` línea 104-122

```typescript
// ANTES
useEffect(() => {
    if (dailyCheckDoneRef.current) return;
    if (!monitorsRef.current.paymentMonitor || !monitorsRef.current.debtMonitor) return;
    
    const runDailyChecks = async () => {
        // ...
    };
    
    runDailyChecks();
}, [monitorsRef.current.paymentMonitor, monitorsRef.current.debtMonitor]);
```

```typescript
// DESPUÉS (SOLUCIÓN)
useEffect(() => {
    if (dailyCheckDoneRef.current) return;
    if (!monitorsRef.current.paymentMonitor || !monitorsRef.current.debtMonitor) return;
    
    const runDailyChecks = async () => {
        try {
            logger.info('Running daily notification checks');
            
            await monitorsRef.current.paymentMonitor?.checkUpcomingPayments();
            await monitorsRef.current.debtMonitor?.checkOverdueDebts();
            
            dailyCheckDoneRef.current = true;
            logger.info('Daily notification checks completed');
        } catch (error) {
            logger.error('Daily notification checks failed', error);
        }
    };
    
    runDailyChecks();
}, []);  // ← DEPENDENCIAS VACÍAS, confiar en el guard dailyCheckDoneRef
```

**Alternativa:** Usar una dependencia que indique cuando los monitores están listos:

```typescript
}, [monitorsInitializedRef.current]);  // Solo ejecutar cuando monitores estén inicializados
```



### 5.5 Fix #5: Optimistic Updates en UI (markAllAsRead y clearAll)

**Archivo:** `src/hooks/useNotificationStore.ts`

**Problema:** Las operaciones son asíncronas y el UI no se actualiza inmediatamente.

**Solución:** Implementar optimistic updates con rollback en caso de error.

```typescript
// clearAll con optimistic update
const clearAll = useCallback(async () => {
    console.log('[NotificationStore] clearAll called');

    if (userId) {
        // Guardar estado anterior para rollback
        const previousNotifications = [...firestoreNotifications];
        
        // Optimistic update: limpiar inmediatamente en UI
        setFirestoreNotifications([]);
        
        try {
            const batch = writeBatch(db);
            previousNotifications.forEach((n) => {
                if (n.id) {
                    batch.delete(doc(db, `users/${userId}/notifications`, n.id));
                }
            });
            
            await batch.commit();
            logger.info('All notifications cleared successfully');
        } catch (error) {
            // Rollback en caso de error
            console.error('[NotificationStore] Error clearing notifications:', error);
            setFirestoreNotifications(previousNotifications);
            logger.error('Failed to clear all notifications', error);
            throw error;
        }
    } else {
        setLocalNotifications([]);
        logger.info('All local notifications cleared');
    }
}, [userId, firestoreNotifications, setLocalNotifications]);
```



```typescript
// markAllAsRead con optimistic update
const markAllAsRead = useCallback(async () => {
    console.log('[NotificationStore] markAllAsRead called');

    if (userId) {
        const unreadNotifications = firestoreNotifications.filter((n) => !n.isRead);
        
        if (unreadNotifications.length === 0) {
            logger.info('No unread notifications to mark');
            return;
        }
        
        // Guardar estado anterior para rollback
        const previousNotifications = [...firestoreNotifications];
        
        // Optimistic update: marcar como leídas inmediatamente en UI
        setFirestoreNotifications(prev => 
            prev.map(n => ({ ...n, isRead: true }))
        );
        
        try {
            const batch = writeBatch(db);
            unreadNotifications.forEach((n) => {
                if (n.id) {
                    batch.update(doc(db, `users/${userId}/notifications`, n.id), { isRead: true });
                }
            });
            
            await batch.commit();
            logger.info(`Marked ${unreadNotifications.length} notifications as read`);
        } catch (error) {
            // Rollback en caso de error
            console.error('[NotificationStore] Error marking as read:', error);
            setFirestoreNotifications(previousNotifications);
            logger.error('Failed to mark all as read', error);
            throw error;
        }
    } else {
        setLocalNotifications((prev) =>
            prev.map((n) => ({ ...n, isRead: true }))
        );
        logger.info('All local notifications marked as read');
    }
}, [userId, firestoreNotifications, setLocalNotifications]);
```

**Resultado:** El contador y el ícono se actualizan instantáneamente, mejorando la UX.



### 5.6 Fix #6: Aumentar Debounce y Mejorar Limpieza

**Archivo:** `src/services/NotificationManager.ts`

```typescript
// ANTES
private readonly DEBOUNCE_MS = 1000;  // 1 segundo

// DESPUÉS
private readonly DEBOUNCE_MS = 60000;  // 60 segundos (1 minuto)
```

**Justificación:** Con la deduplicación por fecha, el debounce puede ser más largo para prevenir spam en caso de múltiples re-renders rápidos.

**Además, mejorar la limpieza del debounceMap:**

```typescript
cleanupDebounceMap(): void {
    const now = Date.now();
    const yesterday = now - (24 * 60 * 60 * 1000);  // 24 horas atrás
    
    // Eliminar entradas de más de 24 horas
    for (const [key, timestamp] of this.debounceMap.entries()) {
        if (timestamp < yesterday) {
            this.debounceMap.delete(key);
        }
    }
    
    logger.info(`Cleaned up debounce map, ${this.debounceMap.size} entries remaining`);
}
```

---

## 6. VALIDACIONES Y PRUEBAS

### 6.1 Pruebas Manuales

#### Test 1: No Duplicados en Múltiples Aperturas
```
PASOS:
1. Abrir app 10 veces consecutivas (cerrar y abrir)
2. Verificar consola: "Notification monitors initialized" debe aparecer solo 1 vez por sesión
3. Verificar Firestore: No debe haber notificaciones duplicadas del mismo día

RESULTADO ESPERADO:
- Log "initialized" aparece 1 vez por sesión
- Notificaciones únicas por día
- Contador refleja el número real
```



#### Test 2: Fast Refresh / HMR
```
PASOS:
1. En modo desarrollo, hacer cambios en código para disparar HMR
2. Repetir 5 veces
3. Verificar consola y notificaciones

RESULTADO ESPERADO:
- No se crean notificaciones duplicadas
- Log "initialized" puede aparecer en HMR pero no crea notificaciones nuevas
```

#### Test 3: Clear All
```
PASOS:
1. Tener 10+ notificaciones
2. Click en "Limpiar todas"
3. Verificar inmediatamente:
   - Lista de notificaciones vacía
   - Contador = 0
   - Ícono sin badge rojo
4. Recargar página
5. Verificar que sigue vacío

RESULTADO ESPERADO:
- UI se actualiza instantáneamente (optimistic update)
- Firestore se limpia correctamente
- Estado persiste después de reload
```

#### Test 4: Mark All Read
```
PASOS:
1. Tener 10+ notificaciones sin leer
2. Click en "Marcar leídas"
3. Verificar inmediatamente:
   - Contador = 0
   - Badge desaparece
   - Todas las notificaciones sin punto azul
4. Recargar página
5. Verificar que sigue en 0

RESULTADO ESPERADO:
- UI se actualiza instantáneamente
- Firestore se actualiza correctamente
- Estado persiste después de reload
```

#### Test 5: Notificación de Saldo Bajo (Deduplicación)
```
PASOS:
1. Crear cuenta "Efectivo" con saldo bajo (< 100,000 COP)
2. Agregar transacción que baje más el saldo
3. Verificar que se crea 1 notificación
4. Esperar 1 minuto
5. Agregar otra transacción
6. Verificar que NO se crea otra notificación (cooldown de 24h)

RESULTADO ESPERADO:
- Solo 1 notificación por cuenta por día
- Cooldown funciona correctamente
```



#### Test 6: Notificación de Gasto Inusual (Deduplicación)
```
PASOS:
1. Tener historial de gastos en "Comida" (promedio 50,000 COP)
2. Agregar transacción de 200,000 COP en "Comida"
3. Verificar que se crea 1 notificación
4. Cerrar y abrir app
5. Verificar que NO se crea otra notificación

RESULTADO ESPERADO:
- Solo 1 notificación por transacción inusual
- Deduplicación por fecha funciona
```

### 6.2 Pruebas Unitarias

#### Test: NotificationManager - Deduplicación por Fecha
```typescript
describe('NotificationManager', () => {
  it('should not create duplicate notifications on same day', async () => {
    const mockDeps = {
      addNotification: jest.fn(),
      updateNotification: jest.fn(),
      deleteNotification: jest.fn(),
      clearAll: jest.fn(),
      markAllAsRead: jest.fn(),
      notifications: [],
      preferences: defaultPreferences,
    };
    
    const manager = new NotificationManager(mockDeps);
    
    const notification = {
      type: 'low_balance',
      title: 'Saldo bajo: Efectivo',
      message: 'Test',
      severity: 'warning',
      isRead: false,
      metadata: { accountId: 'acc123' },
    };
    
    // Primera creación
    await manager.createNotification(notification);
    expect(mockDeps.addNotification).toHaveBeenCalledTimes(1);
    
    // Intentar crear de nuevo (mismo día)
    await manager.createNotification(notification);
    expect(mockDeps.addNotification).toHaveBeenCalledTimes(1);  // No debe llamar de nuevo
  });
});
```



#### Test: useNotificationMonitoring - Inicialización Única
```typescript
describe('useNotificationMonitoring', () => {
  it('should initialize monitors only once', () => {
    const loggerSpy = jest.spyOn(logger, 'info');
    
    const { rerender } = renderHook(
      (props) => useNotificationMonitoring(props),
      {
        initialProps: {
          userId: 'user123',
          transactions: [],
          budgets: [],
          recurringPayments: [],
          accounts: [],
          debts: [],
          notificationManager: mockManager,
        },
      }
    );
    
    // Primera renderización
    expect(loggerSpy).toHaveBeenCalledWith('Notification monitors initialized');
    loggerSpy.mockClear();
    
    // Re-render con mismas props
    rerender({
      userId: 'user123',
      transactions: [],
      budgets: [],
      recurringPayments: [],
      accounts: [],
      debts: [],
      notificationManager: mockManager,
    });
    
    // No debe inicializar de nuevo
    expect(loggerSpy).not.toHaveBeenCalledWith('Notification monitors initialized');
  });
});
```

#### Test: useNotifications - NotificationManager Estable
```typescript
describe('useNotifications', () => {
  it('should maintain stable notificationManager reference', () => {
    const { result, rerender } = renderHook(
      (userId) => useNotifications(userId),
      { initialProps: 'user123' }
    );
    
    const firstManager = result.current.notificationManager;
    
    // Simular cambio en notifications (Firestore update)
    act(() => {
      // Trigger notifications update
    });
    
    rerender('user123');
    
    const secondManager = result.current.notificationManager;
    
    // Debe ser la misma instancia
    expect(firstManager).toBe(secondManager);
  });
});
```



### 6.3 Pruebas de Integración

#### Test: Flujo Completo de Notificación
```typescript
describe('Notification Flow Integration', () => {
  it('should create notification only once for low balance', async () => {
    // Setup: Usuario con cuenta de saldo bajo
    const user = await createTestUser();
    const account = await createTestAccount(user.id, { balance: 50000 });
    
    // Abrir app
    render(<FinanceTracker />);
    
    // Esperar inicialización
    await waitFor(() => {
      expect(screen.getByText('Notificaciones')).toBeInTheDocument();
    });
    
    // Verificar que se creó 1 notificación
    const notifications = await getNotifications(user.id);
    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('low_balance');
    
    // Cerrar y abrir app de nuevo
    cleanup();
    render(<FinanceTracker />);
    
    await waitFor(() => {
      expect(screen.getByText('Notificaciones')).toBeInTheDocument();
    });
    
    // Verificar que NO se creó otra notificación
    const notificationsAfter = await getNotifications(user.id);
    expect(notificationsAfter).toHaveLength(1);  // Sigue siendo 1
  });
});
```

---

## 7. RESUMEN EJECUTIVO

### 7.1 Problemas Identificados

1. **Ciclo de Re-inicialización:** `NotificationManager` se recrea cada vez que `notifications` cambia, causando reinicialización de monitores.
2. **Dependencias Inestables:** `useNotificationMonitoring` tiene dependencias que cambian constantemente.
3. **Debounce Insuficiente:** 1 segundo es muy corto para prevenir duplicados en re-renders.
4. **Sin Deduplicación Persistente:** No hay verificación de notificaciones del mismo día en Firestore.
5. **UI No Optimista:** `markAllAsRead` y `clearAll` no actualizan UI inmediatamente.



### 7.2 Soluciones Propuestas (Prioridad)

| Prioridad | Fix | Impacto | Esfuerzo |
|-----------|-----|---------|----------|
| 🔴 CRÍTICO | Fix #1: Estabilizar NotificationManager con useRef | Alto | Medio |
| 🔴 CRÍTICO | Fix #2: Guard en useNotificationMonitoring | Alto | Bajo |
| 🔴 CRÍTICO | Fix #3: Deduplicación por fecha | Alto | Medio |
| 🟡 ALTO | Fix #4: Corregir dependencias useEffect #2 | Medio | Bajo |
| 🟡 ALTO | Fix #5: Optimistic updates en UI | Medio | Medio |
| 🟢 MEDIO | Fix #6: Aumentar debounce | Bajo | Bajo |

### 7.3 Estrategia de Implementación

**Fase 1: Prevenir Re-inicialización (Fixes #1 y #2)**
- Implementar useRef en useNotifications
- Agregar guard en useNotificationMonitoring
- Probar que "Notification monitors initialized" aparece solo 1 vez

**Fase 2: Deduplicación Robusta (Fix #3)**
- Agregar fecha a getDebounceKey
- Implementar checkIfExistsToday
- Probar que no se crean duplicados al reabrir app

**Fase 3: Mejorar UX (Fixes #4, #5, #6)**
- Corregir dependencias
- Implementar optimistic updates
- Aumentar debounce
- Probar que UI responde instantáneamente

### 7.4 Métricas de Éxito

- ✅ Log "Notification monitors initialized" aparece máximo 1 vez por sesión
- ✅ Log "Running daily notification checks" aparece máximo 1 vez por día
- ✅ No se crean notificaciones duplicadas del mismo tipo/entidad/día
- ✅ Contador de notificaciones refleja el número real
- ✅ "Marcar leídas" actualiza UI instantáneamente
- ✅ "Limpiar todas" actualiza UI instantáneamente
- ✅ Estado persiste correctamente después de reload



---

## 8. CÓDIGO DE IMPLEMENTACIÓN COMPLETO

### 8.1 Archivo: src/hooks/useNotifications.ts (MODIFICADO)

```typescript
/**
 * Main hook for consuming notification functionality
 * Provides unified API for components
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useNotificationStore } from './useNotificationStore';
import { useNotificationPreferences } from './useNotificationPreferences';
import { NotificationManager } from '../services/NotificationManager';
import type { Notification, NotificationFilter, NotificationPreferences } from '../types/finance';

export function useNotifications(userId: string | null) {
  // Get store and preferences
  const {
    notifications,
    loading: storeLoading,
    addNotification,
    updateNotification,
    deleteNotification,
    clearAll: storeClearAll,
    markAllAsRead: storeMarkAllAsRead,
  } = useNotificationStore(userId);

  const {
    preferences,
    loading: preferencesLoading,
    updatePreferences,
  } = useNotificationPreferences(userId);

  // ✅ FIX #1: Usar useRef para mantener instancia estable
  const notificationManagerRef = useRef<NotificationManager | null>(null);

  // Crear instancia solo una vez
  if (!notificationManagerRef.current) {
    notificationManagerRef.current = new NotificationManager({
      addNotification,
      updateNotification,
      deleteNotification,
      clearAll: storeClearAll,
      markAllAsRead: storeMarkAllAsRead,
      notifications: [],  // Inicializar vacío
      preferences,
    });
  }

  // Actualizar deps sin recrear instancia
  useEffect(() => {
    if (notificationManagerRef.current) {
      notificationManagerRef.current.deps = {
        addNotification,
        updateNotification,
        deleteNotification,
        clearAll: storeClearAll,
        markAllAsRead: storeMarkAllAsRead,
        notifications,
        preferences,
      };
    }
  }, [addNotification, updateNotification, deleteNotification, storeClearAll, storeMarkAllAsRead, notifications, preferences]);

  const notificationManager = notificationManagerRef.current;

  // Get unread count
  const unreadCount = useMemo(() => {
    return notificationManager.getUnreadCount();
  }, [notificationManager, notifications]);

  // Mark as read
  const markAsRead = useCallback(
    async (id: string) => {
      await notificationManager.markAsRead(id);
    },
    [notificationManager]
  );

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    await notificationManager.markAllAsRead();
  }, [notificationManager]);

  // Delete notification
  const deleteNotif = useCallback(
    async (id: string) => {
      await notificationManager.deleteNotification(id);
    },
    [notificationManager]
  );

  // Clear all
  const clearAll = useCallback(async () => {
    await notificationManager.clearAll();
  }, [notificationManager]);

  // Get filtered notifications
  const getFilteredNotifications = useCallback(
    (filter?: NotificationFilter): Notification[] => {
      return notificationManager.getNotifications(filter);
    },
    [notificationManager, notifications]
  );

  // Create notification (exposed for manual creation if needed)
  const createNotification = useCallback(
    async (notification: Omit<Notification, 'id' | 'createdAt'>) => {
      await notificationManager.createNotification(notification);
    },
    [notificationManager]
  );

  return {
    // Data
    notifications,
    unreadCount,
    loading: storeLoading || preferencesLoading,
    preferences,

    // Operations
    markAsRead,
    markAllAsRead,
    deleteNotification: deleteNotif,
    clearAll,
    updatePreferences,
    createNotification,

    // Filters
    getFilteredNotifications,

    // Manager instance (for monitoring hook)
    notificationManager,
  };
}
```



### 8.2 Archivo: src/hooks/useNotificationMonitoring.ts (MODIFICADO)

```typescript
/**
 * Hook orchestrator for notification monitoring
 * Integrates all monitors and triggers evaluations based on data changes
 * Validates: Requirements 11.1, 11.2, 11.4
 */

import { useEffect, useRef } from 'react';
import { BudgetMonitor } from '../services/BudgetMonitor';
import { PaymentMonitor } from '../services/PaymentMonitor';
import { SpendingAnalyzer } from '../services/SpendingAnalyzer';
import { BalanceMonitor } from '../services/BalanceMonitor';
import { DebtMonitor } from '../services/DebtMonitor';
import { NotificationManager } from '../services/NotificationManager';
import { logger } from '../utils/logger';
import type {
    Transaction,
    Budget,
    RecurringPayment,
    Account,
    Debt,
} from '../types/finance';

interface UseNotificationMonitoringProps {
    userId: string | null;
    transactions: Transaction[];
    budgets: Budget[];
    recurringPayments: RecurringPayment[];
    accounts: Account[];
    debts: Debt[];
    notificationManager: NotificationManager;
}

export function useNotificationMonitoring({
    userId,
    transactions,
    budgets,
    recurringPayments,
    accounts,
    debts,
    notificationManager,
}: UseNotificationMonitoringProps) {
    // Track previous transaction count to detect changes
    const prevTransactionCountRef = useRef<number>(0);
    const dailyCheckDoneRef = useRef<boolean>(false);
    const monitorsInitializedRef = useRef<boolean>(false);  // ✅ FIX #2: Guard
    const monitorsRef = useRef<{
        budgetMonitor: BudgetMonitor | null;
        paymentMonitor: PaymentMonitor | null;
        spendingAnalyzer: SpendingAnalyzer | null;
        balanceMonitor: BalanceMonitor | null;
        debtMonitor: DebtMonitor | null;
    }>({
        budgetMonitor: null,
        paymentMonitor: null,
        spendingAnalyzer: null,
        balanceMonitor: null,
        debtMonitor: null,
    });

    // ✅ FIX #2: Initialize monitors SOLO UNA VEZ
    useEffect(() => {
        if (!notificationManager) return;
        if (monitorsInitializedRef.current) return;  // Guard

        const preferences = notificationManager.deps?.preferences;
        if (!preferences) return;

        // Create monitor instances
        monitorsRef.current.budgetMonitor = new BudgetMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            preferences,
            budgets,
            transactions,
        });

        monitorsRef.current.paymentMonitor = new PaymentMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            recurringPayments,
            transactions,
        });

        monitorsRef.current.spendingAnalyzer = new SpendingAnalyzer({
            createNotification: (n) => notificationManager.createNotification(n),
            preferences,
            transactions,
        });

        monitorsRef.current.balanceMonitor = new BalanceMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            preferences,
            accounts,
            transactions,
        });

        monitorsRef.current.debtMonitor = new DebtMonitor({
            createNotification: (n) => notificationManager.createNotification(n),
            debts,
        });

        monitorsInitializedRef.current = true;
        logger.info('Notification monitors initialized');
    }, [notificationManager]);  // Solo notificationManager como dependencia

    // ✅ FIX #4: Run daily checks on mount (sin dependencias problemáticas)
    useEffect(() => {
        if (dailyCheckDoneRef.current) return;
        if (!monitorsRef.current.paymentMonitor || !monitorsRef.current.debtMonitor) return;

        const runDailyChecks = async () => {
            try {
                logger.info('Running daily notification checks');

                await monitorsRef.current.paymentMonitor?.checkUpcomingPayments();
                await monitorsRef.current.debtMonitor?.checkOverdueDebts();

                dailyCheckDoneRef.current = true;
                logger.info('Daily notification checks completed');
            } catch (error) {
                logger.error('Daily notification checks failed', error);
            }
        };

        runDailyChecks();
    }, []);  // Dependencias vacías, confiar en el guard

    // Monitor transaction changes and trigger evaluations
    useEffect(() => {
        const currentCount = transactions.length;
        const prevCount = prevTransactionCountRef.current;

        // Skip initial load
        if (prevCount === 0 && currentCount > 0) {
            prevTransactionCountRef.current = currentCount;
            return;
        }

        // Detect new or modified transactions
        if (currentCount !== prevCount) {
            const newTransactions = transactions.slice(0, currentCount - prevCount);

            // Evaluate each new transaction
            newTransactions.forEach(async (transaction) => {
                try {
                    // Budget alerts
                    if (monitorsRef.current.budgetMonitor) {
                        await monitorsRef.current.budgetMonitor.evaluateBudgetAlerts(transaction);
                    }

                    // Unusual spending alerts
                    if (monitorsRef.current.spendingAnalyzer) {
                        await monitorsRef.current.spendingAnalyzer.evaluateUnusualSpending(transaction);
                    }

                    // Balance alerts (for affected accounts)
                    if (monitorsRef.current.balanceMonitor && transaction.accountId) {
                        await monitorsRef.current.balanceMonitor.evaluateBalanceAlerts(transaction.accountId);

                        // Also check toAccountId for transfers
                        if (transaction.type === 'transfer' && transaction.toAccountId) {
                            await monitorsRef.current.balanceMonitor.evaluateBalanceAlerts(transaction.toAccountId);
                        }
                    }
                } catch (error) {
                    logger.error('Transaction evaluation failed', { transaction, error });
                }
            });

            prevTransactionCountRef.current = currentCount;
        }
    }, [transactions]);

    // Cleanup: periodically clean up caches and debounce maps
    useEffect(() => {
        const cleanupInterval = setInterval(() => {
            try {
                monitorsRef.current.budgetMonitor?.cleanupCache();
                monitorsRef.current.spendingAnalyzer?.cleanupCache();
                monitorsRef.current.balanceMonitor?.cleanupCooldowns();
                notificationManager?.cleanupDebounceMap();
                logger.info('Notification monitoring cleanup completed');
            } catch (error) {
                logger.error('Notification monitoring cleanup failed', error);
            }
        }, 5 * 60 * 1000); // Every 5 minutes

        return () => clearInterval(cleanupInterval);
    }, [notificationManager]);

    return {
        monitors: monitorsRef.current,
    };
}
```



### 8.3 Archivo: src/services/NotificationManager.ts (MODIFICADO - Parte 1)

```typescript
/**
 * NotificationManager - Core engine for notification operations
 * Handles creation, management, filtering, and debouncing of notifications
 */

import toast from 'react-hot-toast';
import { logger } from '../utils/logger';
import type { Notification, NotificationFilter, NotificationPreferences } from '../types/finance';

interface NotificationManagerDeps {
    addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => Promise<void>;
    updateNotification: (id: string, updates: Partial<Notification>) => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    clearAll: () => Promise<void>;
    markAllAsRead: () => Promise<void>;
    notifications: Notification[];
    preferences: NotificationPreferences;
}

export class NotificationManager {
    public deps: NotificationManagerDeps;
    private debounceMap: Map<string, number> = new Map();
    private toastQueue: Notification[] = [];
    private isProcessingQueue = false;
    private readonly DEBOUNCE_MS = 60000;  // ✅ FIX #6: 60 segundos
    private readonly MAX_VISIBLE_TOASTS = 3;

    constructor(deps: NotificationManagerDeps) {
        this.deps = deps;
    }

    /**
     * Create a new notification with debouncing and deduplication
     */
    async createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<void> {
        // Check if notification type is enabled
        if (!this.isNotificationTypeEnabled(notification.type)) {
            logger.info(`Notification type ${notification.type} is disabled, skipping`);
            return;
        }

        // Check for duplicate (debouncing en memoria)
        if (this.isDuplicate(notification)) {
            logger.info('Duplicate notification detected (debounce), skipping', { notification });
            return;
        }

        // ✅ FIX #3: Verificar en Firestore si ya existe hoy
        const dedupeKey = this.getDebounceKey(notification);
        const existsInFirestore = this.checkIfExistsToday(dedupeKey);
        if (existsInFirestore) {
            logger.info('Duplicate notification detected (Firestore), skipping', { notification });
            return;
        }

        try {
            // Store notification
            await this.deps.addNotification(notification);

            // Update debounce map
            this.debounceMap.set(dedupeKey, Date.now());

            // Show toast if appropriate
            if (this.shouldShowToast(notification)) {
                this.queueToast(notification);
            }

            logger.info('Notification created', { notification });
        } catch (error) {
            logger.error('Failed to create notification', { notification, error });
            throw error;
        }
    }

    // ... (resto de métodos sin cambios: markAsRead, markAllAsRead, deleteNotification, clearAll, getNotifications, getUnreadCount, isInQuietHours, shouldShowToast)
```



### 8.4 Archivo: src/services/NotificationManager.ts (MODIFICADO - Parte 2)

```typescript
    /**
     * Check if notification type is enabled in preferences
     */
    private isNotificationTypeEnabled(type: Notification['type']): boolean {
        const { enabled } = this.deps.preferences;

        switch (type) {
            case 'budget':
                return enabled.budget;
            case 'recurring':
                return enabled.recurring;
            case 'unusual_spending':
                return enabled.unusualSpending;
            case 'low_balance':
                return enabled.lowBalance;
            case 'debt':
                return enabled.debt;
            case 'info':
                return true; // Info notifications are always enabled
            default:
                return true;
        }
    }

    /**
     * Check if notification is a duplicate (within debounce window)
     */
    private isDuplicate(notification: Omit<Notification, 'id' | 'createdAt'>): boolean {
        const key = this.getDebounceKey(notification);
        const lastTime = this.debounceMap.get(key);

        if (!lastTime) {
            return false;
        }

        const elapsed = Date.now() - lastTime;
        return elapsed < this.DEBOUNCE_MS;
    }

    /**
     * ✅ FIX #3: Generate a unique key for debouncing (incluye fecha)
     */
    private getDebounceKey(notification: Omit<Notification, 'id' | 'createdAt'>): string {
        const parts = [notification.type, notification.title];

        // Agregar fecha para deduplicación diaria
        const today = new Date().toISOString().split('T')[0]; // "2026-02-22"
        parts.push(today);

        // Add relevant metadata to key for more specific deduplication
        if (notification.metadata) {
            const { budgetId, recurringPaymentId, transactionId, accountId, debtId } = notification.metadata;
            if (budgetId) parts.push(budgetId);
            if (recurringPaymentId) parts.push(recurringPaymentId);
            if (transactionId) parts.push(transactionId);
            if (accountId) parts.push(accountId);
            if (debtId) parts.push(debtId);
        }

        return parts.join(':');
    }

    /**
     * ✅ FIX #3: Check if notification already exists today in Firestore
     */
    private checkIfExistsToday(dedupeKey: string): boolean {
        const today = new Date().toISOString().split('T')[0];

        // Buscar en notifications actuales si ya existe una con el mismo dedupeKey hoy
        const existingToday = this.deps.notifications.find(n => {
            const nDate = new Date(n.createdAt).toISOString().split('T')[0];
            const nKey = this.getDebounceKey(n);
            return nDate === today && nKey === dedupeKey;
        });

        return !!existingToday;
    }

    /**
     * Queue a toast for display
     */
    private queueToast(notification: Omit<Notification, 'id' | 'createdAt'>): void {
        // Create a temporary notification object for the queue
        const tempNotification: Notification = {
            ...notification,
            id: 'temp-' + Date.now(),
            createdAt: new Date(),
        };

        this.toastQueue.push(tempNotification);
        this.processToastQueue();
    }

    /**
     * Process the toast queue (max 3 visible at once)
     */
    private async processToastQueue(): Promise<void> {
        if (this.isProcessingQueue) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.toastQueue.length > 0) {
            // Check how many toasts are currently visible
            const visibleCount = document.querySelectorAll('[data-sonner-toast]').length;

            if (visibleCount >= this.MAX_VISIBLE_TOASTS) {
                // Wait a bit before checking again
                await new Promise((resolve) => setTimeout(resolve, 1000));
                continue;
            }

            const notification = this.toastQueue.shift();
            if (notification) {
                this.showToast(notification);
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Display a toast notification
     */
    private showToast(notification: Notification): void {
        const options = {
            duration: 5000,
            position: 'top-right' as const,
        };

        switch (notification.severity) {
            case 'error':
                toast.error(notification.message, options);
                break;
            case 'warning':
                toast(notification.message, {
                    ...options,
                    icon: '⚠️',
                    style: {
                        background: '#FEF3C7',
                        color: '#92400E',
                        border: '1px solid #FCD34D',
                    },
                });
                break;
            case 'success':
                toast.success(notification.message, options);
                break;
            case 'info':
            default:
                toast(notification.message, options);
                break;
        }
    }

    /**
     * ✅ FIX #6: Clean up old debounce entries (mejorado)
     */
    cleanupDebounceMap(): void {
        const now = Date.now();
        const yesterday = now - (24 * 60 * 60 * 1000);  // 24 horas atrás

        // Eliminar entradas de más de 24 horas
        for (const [key, timestamp] of this.debounceMap.entries()) {
            if (timestamp < yesterday) {
                this.debounceMap.delete(key);
            }
        }

        logger.info(`Cleaned up debounce map, ${this.debounceMap.size} entries remaining`);
    }
}
```



### 8.5 Archivo: src/hooks/useNotificationStore.ts (MODIFICADO - Optimistic Updates)

```typescript
// ✅ FIX #5: clearAll con optimistic update
const clearAll = useCallback(async () => {
    console.log('[NotificationStore] clearAll called, userId:', userId, 'notifications count:', notifications.length);

    if (userId) {
        // Guardar estado anterior para rollback
        const previousNotifications = [...firestoreNotifications];
        
        // Optimistic update: limpiar inmediatamente en UI
        setFirestoreNotifications([]);
        
        try {
            const batch = writeBatch(db);
            previousNotifications.forEach((n) => {
                if (n.id) {
                    batch.delete(doc(db, `users/${userId}/notifications`, n.id));
                }
            });
            
            console.log('[NotificationStore] Committing batch delete for', previousNotifications.length, 'notifications');
            await batch.commit();
            console.log('[NotificationStore] Batch delete committed successfully');
            logger.info('All notifications cleared successfully');
        } catch (error) {
            // Rollback en caso de error
            console.error('[NotificationStore] Error clearing notifications:', error);
            setFirestoreNotifications(previousNotifications);
            logger.error('Failed to clear all notifications', error);
            throw error;
        }
    } else {
        console.log('[NotificationStore] Clearing local notifications');
        setLocalNotifications([]);
        logger.info('All local notifications cleared');
    }
}, [userId, firestoreNotifications, setLocalNotifications]);

// ✅ FIX #5: markAllAsRead con optimistic update
const markAllAsRead = useCallback(async () => {
    console.log('[NotificationStore] markAllAsRead called, userId:', userId);

    if (userId) {
        const unreadNotifications = firestoreNotifications.filter((n) => !n.isRead);
        console.log('[NotificationStore] Found', unreadNotifications.length, 'unread notifications');

        if (unreadNotifications.length === 0) {
            console.log('[NotificationStore] No unread notifications to mark');
            logger.info('No unread notifications to mark');
            return;
        }

        // Guardar estado anterior para rollback
        const previousNotifications = [...firestoreNotifications];
        
        // Optimistic update: marcar como leídas inmediatamente en UI
        setFirestoreNotifications(prev => 
            prev.map(n => ({ ...n, isRead: true }))
        );
        
        try {
            const batch = writeBatch(db);
            unreadNotifications.forEach((n) => {
                if (n.id) {
                    batch.update(doc(db, `users/${userId}/notifications`, n.id), { isRead: true });
                }
            });
            
            console.log('[NotificationStore] Committing batch update for', unreadNotifications.length, 'notifications');
            await batch.commit();
            console.log('[NotificationStore] Batch update committed successfully');
            logger.info(`Marked ${unreadNotifications.length} notifications as read`);
        } catch (error) {
            // Rollback en caso de error
            console.error('[NotificationStore] Error marking as read:', error);
            setFirestoreNotifications(previousNotifications);
            logger.error('Failed to mark all as read', error);
            throw error;
        }
    } else {
        console.log('[NotificationStore] Marking all local notifications as read');
        setLocalNotifications((prev) =>
            prev.map((n) => ({ ...n, isRead: true }))
        );
        logger.info('All local notifications marked as read');
    }
}, [userId, firestoreNotifications, setLocalNotifications]);
```

---

## 9. CONCLUSIÓN

El sistema de notificaciones sufre de un **ciclo de re-inicialización** causado por dependencias inestables en `useMemo` y `useEffect`. Esto provoca:

1. Reinicialización constante de monitores
2. Evaluaciones duplicadas de condiciones
3. Creación masiva de notificaciones duplicadas
4. Logs repetitivos en consola

Las soluciones propuestas atacan el problema en múltiples niveles:

- **Nivel 1 (Crítico):** Estabilizar referencias con `useRef` y guards
- **Nivel 2 (Crítico):** Deduplicación robusta por fecha
- **Nivel 3 (Alto):** Optimistic updates para mejor UX

Con estas correcciones, el sistema funcionará correctamente en desarrollo (HMR) y producción, sin duplicados y con UI responsiva.

