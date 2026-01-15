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
