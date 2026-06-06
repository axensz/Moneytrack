# MoneyTrack

Aplicación de finanzas personales desarrollada con Next.js y Firebase. Permite llevar un control detallado de ingresos, gastos, cuentas bancarias, tarjetas de crédito y pagos periódicos.

---


## Características Principales

- **Gestión de Transacciones**: Registra ingresos, gastos y transferencias entre cuentas
- **Múltiples Tipos de Cuenta**: Soporta cuentas de ahorro, efectivo y tarjetas de crédito
- **Tarjetas de Crédito con Intereses**: Calcula intereses por cuotas (1, 3, 6, 12, 24, 36 meses) usando tasa E.A.
- **Pagos Periódicos**: Gestiona suscripciones y pagos recurrentes con alertas de vencimiento
- **Estadísticas Visuales**: Gráficos de flujo de caja, distribución por categoría, comparativas mensuales y tendencias anuales
- **Categorías Personalizables**: Crea y organiza categorías de ingresos y gastos
- **Filtros Avanzados**: Filtra por cuenta, categoría, estado de pago y rango de fechas
- **Tema Claro/Oscuro**: Interfaz adaptable con soporte para preferencias del sistema
- **Sincronización en la Nube**: Los datos se sincronizan automáticamente con Firebase cuando inicias sesión
- **Modo Offline**: Funciona sin conexión usando almacenamiento local (localStorage)
- **Diseño Responsivo**: Optimizado para escritorio y dispositivos móviles

---

## Requisitos Previos

- Node.js 18.x o superior
- npm, yarn, pnpm o bun
- Cuenta de Firebase (gratuita)

---

## Instalación

1. Clona el repositorio:
```bash
git clone <url-del-repositorio>
cd MoneyTrack
```

2. Instala las dependencias:
```bash
npm install
```

3. Crea un archivo `.env.local` en la raíz del proyecto con tus credenciales de Firebase:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=tu-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tu-proyecto
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=tu-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=tu-app-id
```

4. Inicia el servidor de desarrollo:
```bash
npm run dev
```

5. Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

---

## Despliegue en GitHub Pages

El proyecto usa `output: 'export'` de Next.js. El workflow `.github/workflows/nextjs.yml` compila y publica automáticamente en cada push a `main`.

**Pasos para configurar el despliegue:**

1. En tu repositorio → **Settings → Pages** → Source: `GitHub Actions`.
2. En **Settings → Secrets and variables → Actions**, añade los mismos secrets que usas en `.env.local`:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
3. Haz un push a `main`; el workflow desplegará la app automáticamente.

---

## Rotar API Keys

### Clave de Gemini (IA)

La clave de Gemini AI se guarda **solo en tu navegador** (localStorage). No se sube a ningún servidor.

Para cambiarla:
1. Abre la app → menú de configuración → **Clave de API de Gemini**.
2. Ingresa la nueva clave y guarda.
3. La clave anterior queda inmediatamente invalidada en ese dispositivo.

> Si usas la app en varios dispositivos, repite el proceso en cada uno.

Para obtener o rotar una clave en Google AI Studio:
1. Ve a [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
2. Crea una nueva clave y elimina la anterior.

### Claves de Firebase

Las claves de Firebase (`NEXT_PUBLIC_FIREBASE_*`) se configuran en `.env.local` (local) y en los Secrets del repositorio (producción).

Para rotarlas:
1. En la [Consola de Firebase](https://console.firebase.google.com) → tu proyecto → **Configuración del proyecto → Tus apps** → regenera las credenciales o crea una nueva app web.
2. Actualiza `.env.local` localmente.
3. Actualiza cada secret en **GitHub → Settings → Secrets and variables → Actions**.
4. Haz push a `main` para que el nuevo despliegue use las claves actualizadas.

> Las claves `NEXT_PUBLIC_*` de Firebase son públicas por diseño (se incluyen en el bundle del cliente). La seguridad real se gestiona desde las **Reglas de Firestore** y la **configuración de Auth**.

---

## Migración de Datos

### De modo invitado a cuenta registrada

Al iniciar sesión con Google o correo, la app detecta automáticamente si tienes datos de invitado y ofrece migrarlos a tu cuenta en la nube. Acepta el diálogo de migración y tus transacciones, cuentas y categorías se copiarán a Firestore.

> Los datos de invitado se almacenan en `localStorage` bajo claves con el prefijo `guest_`. Después de migrar, esas claves se eliminan automáticamente.

### Entre cuentas de usuario distintas

No existe una migración directa entre dos cuentas registradas. El flujo recomendado es:

1. Con la cuenta de **origen** activa, exporta tus transacciones en **Transacciones → Exportar CSV**.
2. Inicia sesión con la cuenta de **destino**.
3. Importa el CSV desde **Transacciones → Importar**.

> Cuentas, categorías y pagos periódicos deben recrearse manualmente en la cuenta de destino.

### Eliminar todos los datos de un usuario

Desde la app no hay un botón de "borrar todo". Para eliminar manualmente:
1. Ve a la [Consola de Firebase](https://console.firebase.google.com) → **Firestore Database**.
2. Filtra por el `userId` del usuario y elimina sus documentos en cada colección (`transactions`, `accounts`, `categories`, `recurringPayments`, `budgets`, `savingsGoals`, `debts`, `notifications`).
3. En **Authentication**, elimina el usuario si es necesario.

---

## Troubleshooting

### La app muestra datos desactualizados o en blanco

Firestore usa una caché local persistente (`persistentLocalCache`). Si la caché queda en mal estado:

1. En la app, abre el menú → **Limpiar caché de Firestore** (si el botón está disponible en tu versión).
2. Si no está disponible, abre DevTools → **Application → IndexedDB** → elimina las bases de datos con prefijo `firestore/`.
3. Recarga la app.

### Error `quota-exceeded` en Firestore

El plan gratuito de Firebase (Spark) tiene límites de lecturas/escrituras diarias. Si los superas:
- La app seguirá funcionando **offline** con la caché local.
- Las escrituras nuevas se encolarán y se sincronizan cuando el cupo se renueve (al día siguiente UTC).
- Considera hacer upgrade al plan Blaze si usas la app intensivamente.

### Error `permission-denied` en Firestore

Ocurre cuando las Reglas de Firestore no permiten la operación al usuario actual. Verifica:
1. Que el usuario esté autenticado (no en modo invitado).
2. Que las reglas en la consola de Firebase sean correctas:
   ```
   match /users/{userId}/{document=**} {
     allow read, write: if request.auth != null && request.auth.uid == userId;
   }
   ```

### La app no carga en Firefox / Safari con Firestore

El `persistentMultipleTabManager` requiere IndexedDB con soporte de locks. En Firefox en modo privado o en Safari con "Bloquear todo el almacenamiento" activo, Firestore puede fallar al inicializar. Usa el modo normal del navegador o deshabilita la protección de almacenamiento estricta para el dominio de la app.

### Los cambios no se reflejan en otras pestañas

La sincronización de datos de UI (filtros, tema, preferencias) entre pestañas usa el evento `storage` del navegador. Asegúrate de que la app no esté abierta en un iframe, que puede bloquear ese evento.

### Error al importar CSV

- El archivo debe estar codificado en **UTF-8** (sin BOM). Guárdalo desde Excel con "CSV UTF-8".
- Las columnas mínimas requeridas dependen del perfil detectado (Bancolombia, Nu, genérico). Revisa el encabezado del CSV con un editor de texto si la importación falla.

---

## Desarrollo

```bash
npm run dev          # Servidor de desarrollo en localhost:3000
npm run build        # Build de producción (output: export → carpeta /out)
npm run lint         # ESLint
npx tsc --noEmit     # Verificación de tipos TypeScript
npx vitest run       # Suite de tests (Vitest + Testing Library)
npx vitest           # Tests en modo watch
```

---
