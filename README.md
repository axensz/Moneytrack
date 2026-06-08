# MoneyTrack

Aplicación de finanzas personales construida con **Next.js** y **Firebase**. Lleva un control detallado de ingresos, gastos, transferencias, cuentas bancarias, tarjetas de crédito (con intereses por cuotas), deudas, presupuestos, metas de ahorro y pagos periódicos — con sincronización en la nube, modo invitado offline y asistencia opcional de IA.

![Next.js](https://img.shields.io/badge/Next.js-16-black)
![React](https://img.shields.io/badge/React-19-149eca)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6)
![Firebase](https://img.shields.io/badge/Firebase-12-ffca28)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8)
![Tests](https://img.shields.io/badge/tests-442%20passing-brightgreen)

---

## Índice

- [Características](#características)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Requisitos previos](#requisitos-previos)
- [Instalación](#instalación)
- [Scripts de desarrollo](#scripts-de-desarrollo)
- [Calidad y tests](#calidad-y-tests)
- [Despliegue en GitHub Pages](#despliegue-en-github-pages)
- [Rotar API Keys](#rotar-api-keys)
- [Migración de datos](#migración-de-datos)
- [Troubleshooting](#troubleshooting)

---

## Características

**Transacciones y cuentas**
- Ingresos, gastos y **transferencias atómicas** entre cuentas.
- Tipos de cuenta: ahorro, efectivo y **tarjetas de crédito**.
- Tarjetas de crédito con **cálculo de intereses por cuotas** (1, 3, 6, 12, 24, 36 meses) usando tasa Efectiva Anual (E.A.), y consolidación/fusión de tarjetas.
- **Deudas y préstamos** (dinero prestado / pedido) con registro de pagos.

**Planificación**
- **Pagos periódicos** (suscripciones, arriendos) con alertas de vencimiento por ciclo de facturación.
- **Presupuestos** por categoría y **metas de ahorro**.

**Análisis**
- Gráficos de flujo de caja, distribución por categoría, comparativas mensuales y tendencias anuales.
- **Categorías personalizables** de ingresos y gastos.
- **Filtros avanzados** por cuenta, categoría, estado de pago y rango de fechas.

**Datos**
- **Sincronización en la nube** con Firestore al iniciar sesión (Google o correo).
- **Modo invitado offline** con `localStorage` y **migración asistida** a la nube al registrarse.
- **Importación** desde CSV, XLSX y PDF (perfiles para Bancolombia, Nu y genérico) y **exportación** a CSV.

**Experiencia**
- **PWA instalable** con service worker e indicador offline.
- **Tema claro/oscuro** con preferencia del sistema y **balances enmascarables**.
- **Notificaciones** de vencimientos, presupuestos y balances.
- **Asistente de IA opcional** (Google Gemini) para categorización y plan financiero.
- Diseño **responsivo** y accesible (focus visible, objetivos táctiles ≥44px, ARIA).

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router, `output: 'export'`) |
| UI | React 19 + Tailwind CSS 4 |
| Lenguaje | TypeScript 5 |
| Backend / datos | Firebase 12 (Auth + Firestore con caché local persistente) |
| Gráficos | Recharts 3 |
| IA | `@google/genai` (Gemini) |
| Tests | Vitest 4 + Testing Library |

---

## Arquitectura

Algunas decisiones clave que conviene conocer antes de tocar el dominio:

- **Saldos derivados vs. campo persistido.** El saldo de cuentas de ahorro/efectivo se **calcula a partir de las transacciones** (`BalanceCalculator` + estrategias en `src/utils/accountStrategies.ts`), por lo que se autocorrige. La **deuda de tarjeta de crédito** vive en un campo persistido y autoritativo, `account.usedCredit`.
- **Mutaciones atómicas de `usedCredit`.** Toda alta/baja/edición de transacción que afecta una tarjeta ajusta `usedCredit` dentro de una `runTransaction` de Firestore (ver `src/hooks/firestore/useTransactionsCRUD.ts`). El borrado de cuenta **reconcilia** `usedCredit` de forma idempotente (`reconcileUsedCredit` en `src/utils/creditDeltas.ts`) para sobrevivir a fallos parciales.
- **Estrategias de cuenta.** El comportamiento por tipo de cuenta (incluir en patrimonio, calcular saldo/cupo, validar) está encapsulado en estrategias (`accountStrategies.ts`), no esparcido por la UI.
- **Modo invitado.** Sin sesión, los datos viven en `localStorage` bajo claves con prefijo `guest_`; al iniciar sesión se ofrece migrarlos a Firestore (`src/utils/guestMigration.ts`).
- **Caché Firestore.** Se usa `persistentLocalCache` + `persistentMultipleTabManager` para lectura offline y sincronización entre pestañas.

Estructura principal (`src/`): `components/` (vistas, modales, layout, UI), `hooks/` (CRUD, suscripciones, dominio), `utils/` (cálculo, parsers, formato), `services/` (monitores de notificaciones), `contexts/` y `types/`.

---

## Requisitos previos

- **Node.js 20.x** o superior (mínimo 18.18 por Next 16)
- npm (o yarn / pnpm / bun)
- Cuenta de Firebase (plan gratuito Spark es suficiente)

---

## Instalación

1. Clona el repositorio:
```bash
git clone https://github.com/axensz/Moneytrack.git
cd Moneytrack
```

2. Instala las dependencias:
```bash
npm install
```

3. Crea un archivo `.env.local` en la raíz con tus credenciales de Firebase (plantilla en `.env.example`):
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

> La app arranca en **modo invitado** sin necesidad de Firebase; la sincronización en la nube requiere las credenciales anteriores.

---

## Scripts de desarrollo

```bash
npm run dev          # Servidor de desarrollo en localhost:3000
npm run build        # Build de producción (inyecta versión del SW + next build → /out)
npm start            # Sirve el build de producción
npm run lint         # ESLint
npm run typecheck    # Verificación de tipos (tsc --noEmit)
npm test             # Tests en modo watch (Vitest)
npm run test:run     # Suite de tests una sola vez (CI)
```

---

## Calidad y tests

- **442 tests** (Vitest + Testing Library) sobre la lógica de dominio: cálculo de saldos e intereses, deltas de `usedCredit`, reconciliación, validación de transacciones, fechas de pagos periódicos, filtros, importación y accesibilidad.
- Verificación de tipos estricta con `npm run typecheck`.

Antes de abrir un PR, ejecuta:
```bash
npm run typecheck && npm run test:run && npm run lint
```

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

> Las claves `NEXT_PUBLIC_*` de Firebase son públicas por diseño (se incluyen en el bundle del cliente). La seguridad real se gestiona desde las **Reglas de Firestore** (`firestore.rules`) y la **configuración de Auth**.

---

## Migración de datos

### De modo invitado a cuenta registrada

Al iniciar sesión con Google o correo, la app detecta automáticamente si tienes datos de invitado y ofrece migrarlos a tu cuenta en la nube. Acepta el diálogo de migración y tus transacciones, cuentas y categorías se copiarán a Firestore.

> Los datos de invitado se almacenan en `localStorage` bajo claves con el prefijo `guest_`. Después de migrar, esas claves se eliminan automáticamente. Si **rechazas** la migración, esos datos se borran al cerrar sesión — la app te lo confirma antes.

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

### El almacenamiento local se llena en modo invitado

En modo invitado los datos viven en `localStorage` (~5 MB). Si se llena, la app muestra un aviso y te recomienda iniciar sesión para sincronizar a la nube y no perder datos.

### Error `permission-denied` en Firestore

Ocurre cuando las Reglas de Firestore no permiten la operación al usuario actual. Verifica:
1. Que el usuario esté autenticado (no en modo invitado).
2. Que las reglas en la consola de Firebase coincidan con `firestore.rules` del repositorio (cada usuario solo accede a `users/{su-uid}/**`).

### La app no carga en Firefox / Safari con Firestore

El `persistentMultipleTabManager` requiere IndexedDB con soporte de locks. En Firefox en modo privado o en Safari con "Bloquear todo el almacenamiento" activo, Firestore puede fallar al inicializar. Usa el modo normal del navegador o deshabilita la protección de almacenamiento estricta para el dominio de la app.

### Los cambios no se reflejan en otras pestañas

La sincronización de datos de UI (filtros, tema, preferencias) entre pestañas usa el evento `storage` del navegador. Asegúrate de que la app no esté abierta en un iframe, que puede bloquear ese evento.

### Error al importar CSV

- El archivo debe estar codificado en **UTF-8** (sin BOM). Guárdalo desde Excel con "CSV UTF-8".
- Las columnas mínimas requeridas dependen del perfil detectado (Bancolombia, Nu, genérico). Revisa el encabezado del CSV con un editor de texto si la importación falla.

---
