/**
 * Script de debugging para verificar por qué los pagos no se detectan
 * en el extracto de tarjetas.
 *
 * USO: npx tsx scripts/debug-payment-window.ts
 *
 * Requiere: .env.local con las credenciales de Firebase configuradas
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getCycleByIndex } from '../src/utils/creditCycles';
import * as path from 'path';
import * as fs from 'fs';

// ─── Configuración ─────────────────────────────────────────────────────────────

// Buscar service account key
const possiblePaths = [
  path.join(process.env.HOME || process.env.USERPROFILE || '', '.firebase/moneytrack-service-account.json'),
  path.join(__dirname, '../serviceAccountKey.json'),
];

const serviceAccountPath = possiblePaths.find(p => fs.existsSync(p));
if (!serviceAccountPath) {
  console.error('❌ No se encontró el service account key. Colócalo en:');
  possiblePaths.forEach(p => console.error(`   - ${p}`));
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ─── Tus tarjetas ──────────────────────────────────────────────────────────────

const NOW = new Date(); // Hoy: 26 junio 2026

interface CardConfig {
  name: string;
  accountId: string; // Lo llenamos después de consultar
  cutoffDay: number;
  paymentDay: number;
}

async function main() {
  console.log(`\n📅 Fecha actual: ${NOW.toLocaleDateString('es-CO')}\n`);

  // 1. Buscar cuentas de crédito
  console.log('━━━ 1. Buscando cuentas de crédito ━━━\n');

  // Necesitamos el userId — buscar en la colección users o inferir
  const usersSnap = await db.collection('users').limit(5).get();
  if (usersSnap.empty) {
    console.error('❌ No se encontraron usuarios');
    process.exit(1);
  }

  // Listar usuarios para identificar el correcto
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    console.log(`  User: ${doc.id} — ${data.email || data.displayName || 'sin email'}`);
  }

  // Usar el primer usuario (o puedes hardcodear tu userId)
  const userId = usersSnap.docs[0].id;
  console.log(`\n  → Usando userId: ${userId}\n`);

  // Buscar cuentas de crédito
  const accountsSnap = await db
    .collection('users').doc(userId)
    .collection('accounts')
    .where('type', '==', 'credit')
    .get();

  const cards: (CardConfig & { id: string })[] = [];
  for (const doc of accountsSnap.docs) {
    const data = doc.data();
    console.log(`  💳 ${data.name}: cutoff=${data.cutoffDay}, payment=${data.paymentDay}, usedCredit=${data.usedCredit}`);
    cards.push({
      name: data.name,
      accountId: doc.id,
      cutoffDay: data.cutoffDay,
      paymentDay: data.paymentDay,
      id: doc.id,
    });
  }

  // 2. Buscar transacciones de tipo income/transfer hacia las tarjetas (pagos)
  console.log('\n━━━ 2. Buscando pagos a tarjetas (últimos 2 meses) ━━━\n');

  const twoMonthsAgo = new Date(NOW);
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  const txSnap = await db
    .collection('users').doc(userId)
    .collection('transactions')
    .where('date', '>=', twoMonthsAgo)
    .orderBy('date', 'desc')
    .get();

  console.log(`  Total transacciones últimos 2 meses: ${txSnap.size}\n`);

  for (const card of cards) {
    console.log(`\n  ────── ${card.name} (id: ${card.id}) ──────`);

    // Calcular ciclos
    const cycle0 = getCycleByIndex(card.cutoffDay, card.paymentDay, 0, NOW);
    const cycleMinus1 = getCycleByIndex(card.cutoffDay, card.paymentDay, -1, NOW);
    const cycle1 = getCycleByIndex(card.cutoffDay, card.paymentDay, 1, NOW);

    console.log(`\n  Ciclo actual (index=0):`);
    console.log(`    cycleStart: ${cycle0.cycleStart.toLocaleDateString('es-CO')}`);
    console.log(`    cycleEnd:   ${cycle0.cycleEnd.toLocaleDateString('es-CO')}`);
    console.log(`    paymentDue: ${cycle0.paymentDueDate.toLocaleDateString('es-CO')}`);

    console.log(`\n  Ciclo anterior (index=-1):`);
    console.log(`    cycleStart: ${cycleMinus1.cycleStart.toLocaleDateString('es-CO')}`);
    console.log(`    cycleEnd:   ${cycleMinus1.cycleEnd.toLocaleDateString('es-CO')}`);
    console.log(`    paymentDue: ${cycleMinus1.paymentDueDate.toLocaleDateString('es-CO')}`);

    // Ventana de pago para ciclo 0: (prev.paymentDueDate, next.cycleEnd]
    const lowerBound = cycleMinus1.paymentDueDate;
    const upperBound = cycle1.cycleEnd;

    console.log(`\n  Ventana de pago para ciclo 0:`);
    console.log(`    después de: ${lowerBound.toLocaleDateString('es-CO')} (exclusivo)`);
    console.log(`    hasta:      ${upperBound.toLocaleDateString('es-CO')} (inclusivo)`);

    // Filtrar pagos hacia esta tarjeta
    const payments = txSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter((tx: any) => {
        // income directamente en la tarjeta
        if (tx.type === 'income' && tx.accountId === card.id) return true;
        // transfer hacia la tarjeta
        if (tx.type === 'transfer' && tx.toAccountId === card.id) return true;
        return false;
      });

    console.log(`\n  Pagos encontrados: ${payments.length}`);

    for (const p of payments as any[]) {
      const date = p.date?.toDate ? p.date.toDate() : new Date(p.date);
      const inWindow = date > lowerBound && date <= upperBound;

      console.log(`    ${inWindow ? '✅' : '❌'} ${date.toLocaleDateString('es-CO')} — $${p.amount?.toLocaleString('es-CO')} — paid=${p.paid} — cat="${p.category}" — desc="${p.description}"`);
      if (!inWindow) {
        if (date <= lowerBound) console.log(`       ↳ FUERA: fecha <= lowerBound (${lowerBound.toLocaleDateString('es-CO')})`);
        if (date > upperBound) console.log(`       ↳ FUERA: fecha > upperBound (${upperBound.toLocaleDateString('es-CO')})`);
      }
      if (!p.paid) {
        console.log(`       ↳ IGNORADO: paid === false`);
      }
    }

    // Ventana para ciclo -1
    const prevPrev = getCycleByIndex(card.cutoffDay, card.paymentDay, -2, NOW);
    const lowerBoundM1 = prevPrev.paymentDueDate;
    const upperBoundM1 = cycle0.cycleEnd;

    console.log(`\n  Ventana de pago para ciclo -1:`);
    console.log(`    después de: ${lowerBoundM1.toLocaleDateString('es-CO')} (exclusivo)`);
    console.log(`    hasta:      ${upperBoundM1.toLocaleDateString('es-CO')} (inclusivo)`);

    const paymentsInM1Window = (payments as any[]).filter(p => {
      const date = p.date?.toDate ? p.date.toDate() : new Date(p.date);
      return date > lowerBoundM1 && date <= upperBoundM1 && p.paid !== false;
    });
    console.log(`  Pagos en ventana ciclo -1: ${paymentsInM1Window.length}`);
    for (const p of paymentsInM1Window) {
      const date = p.date?.toDate ? p.date.toDate() : new Date(p.date);
      console.log(`    ✅ ${date.toLocaleDateString('es-CO')} — $${p.amount?.toLocaleString('es-CO')}`);
    }
  }

  console.log('\n━━━ Fin del diagnóstico ━━━\n');
}

main().catch(console.error);
