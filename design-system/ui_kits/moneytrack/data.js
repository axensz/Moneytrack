// Fake MoneyTrack data + formatters (window-attached, no exports)
(function () {
  const formatCOP = (n) => {
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(Math.round(n)).toLocaleString('es-CO');
    return `${sign}$ ${v}`;
  };

  const accounts = [
    { id: 'a1', name: 'Bancolombia Ahorros', type: 'savings', balance: 3120000, isDefault: true },
    { id: 'a2', name: 'Efectivo', type: 'cash', balance: 240000 },
    { id: 'a3', name: 'Nu Crédito', type: 'credit', creditLimit: 4000000, creditUsed: 1310000,
      interestRate: 28.4, cutoff: '15 jun', payment: '3 jul' },
  ];

  // category, type, account, paid, installments, hasInterest, recurring
  const seedTransactions = [
    { id: 't1', type: 'income',   desc: 'Salario junio',      account: 'a1', category: 'Salario',      date: '2026-06-01', amount: 3200000, paid: true },
    { id: 't2', type: 'expense',  desc: 'Mercado Éxito',      account: 'a3', category: 'Mercado',      date: '2026-06-05', amount: 289900,  paid: false, installments: 3 },
    { id: 't3', type: 'expense',  desc: 'Netflix',            account: 'a3', category: 'Suscripciones', date: '2026-06-05', amount: 38900,   paid: true, recurring: 'Netflix' },
    { id: 't4', type: 'transfer', desc: 'Pago tarjeta Nu',    account: 'a1', toAccount: 'a3', category: 'Transferencia', date: '2026-06-04', amount: 500000, paid: true },
    { id: 't5', type: 'expense',  desc: 'Gasolina',           account: 'a2', category: 'Transporte',   date: '2026-06-04', amount: 120000,  paid: true },
    { id: 't6', type: 'expense',  desc: 'Almuerzo trabajo',   account: 'a2', category: 'Restaurantes',  date: '2026-06-03', amount: 32000,   paid: true },
    { id: 't7', type: 'income',   desc: 'Freelance diseño',   account: 'a1', category: 'Trabajo extra', date: '2026-06-02', amount: 850000,  paid: true },
    { id: 't8', type: 'expense',  desc: 'Cuota gimnasio',     account: 'a3', category: 'Salud',         date: '2026-06-02', amount: 95000,   paid: false, hasInterest: true },
  ];

  const categories = {
    expense: ['Mercado', 'Restaurantes', 'Transporte', 'Suscripciones', 'Salud', 'Hogar', 'Ocio', 'Otros'],
    income: ['Salario', 'Trabajo extra', 'Inversiones', 'Regalo', 'Otros'],
  };

  const recurring = [
    { id: 'r1', name: 'Netflix', amount: 38900, category: 'Suscripciones', day: 5, account: 'Nu Crédito', status: 'soon' },
    { id: 'r2', name: 'Arriendo', amount: 1450000, category: 'Hogar', day: 1, account: 'Bancolombia Ahorros', status: 'paid' },
    { id: 'r3', name: 'Spotify', amount: 16900, category: 'Suscripciones', day: 12, account: 'Nu Crédito', status: 'ok' },
    { id: 'r4', name: 'Gimnasio SmartFit', amount: 95000, category: 'Salud', day: 2, account: 'Nu Crédito', status: 'overdue' },
  ];

  const monthLabel = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const dayHeader = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  window.MTData = { formatCOP, accounts, seedTransactions, categories, recurring, monthLabel, dayHeader };

  // ── Stats datasets (6-month cash flow, yearly trend, category split) ──
  const monthlyData = [
    { month: 'Ene', ingresos: 3650000, gastos: 2980000 },
    { month: 'Feb', ingresos: 3200000, gastos: 3120000 },
    { month: 'Mar', ingresos: 4100000, gastos: 2740000 },
    { month: 'Abr', ingresos: 3400000, gastos: 3360000 },
    { month: 'May', ingresos: 3900000, gastos: 2650000 },
    { month: 'Jun', ingresos: 4050000, gastos: 575800 },
  ];

  const yearlyData = [
    { 'año': '2023', ingresos: 38200000, gastos: 33400000 },
    { 'año': '2024', ingresos: 42600000, gastos: 36900000 },
    { 'año': '2025', ingresos: 45100000, gastos: 35200000 },
    { 'año': '2026', ingresos: 22300000, gastos: 15400000 },
  ];

  const categoryData = [
    { name: 'Hogar', value: 1450000 },
    { name: 'Mercado', value: 720000 },
    { name: 'Transporte', value: 410000 },
    { name: 'Suscripciones', value: 145000 },
    { name: 'Salud', value: 95000 },
    { name: 'Restaurantes', value: 78000 },
  ];

  // Credit-card interest summary (row 4 of the real Estadísticas view)
  const interestSummary = {
    paid: 184500,        // interés ya pagado este año
    projected: 312000,   // interés proyectado restante
    principal: 1310000,  // capital en cuotas
    cards: 1,
  };

  Object.assign(window.MTData, { monthlyData, yearlyData, categoryData, interestSummary });

  // ── Goals / Debts / Budgets datasets ───────────────────────
  const savingsGoals = [
    { id: 'g1', name: 'Vacaciones San Andrés', current: 1850000, target: 3000000, daysLeft: 84, suggestedMonthly: 410000 },
    { id: 'g2', name: 'Fondo de emergencia', current: 4200000, target: 6000000, daysLeft: 152, suggestedMonthly: 360000 },
    { id: 'g3', name: 'MacBook nueva', current: 2400000, target: 2500000, daysLeft: 12, suggestedMonthly: 100000 },
  ];

  const debts = [
    { id: 'd1', name: 'Préstamo a Andrés', type: 'lent', total: 1200000, paid: 700000, monthly: 250000, nextDate: '15 jun' },
    { id: 'd2', name: 'Crédito de libre inversión', type: 'owed', total: 8000000, paid: 5200000, monthly: 480000, nextDate: '5 jul', rate: 22.5 },
    { id: 'd3', name: 'Le debo a Mamá', type: 'owed', total: 600000, paid: 200000, monthly: 100000, nextDate: '20 jun' },
  ];

  const budgets = [
    { id: 'b1', category: 'Hogar', spent: 1450000, limit: 1600000 },
    { id: 'b2', category: 'Mercado', spent: 720000, limit: 700000 },
    { id: 'b3', category: 'Transporte', spent: 410000, limit: 600000 },
    { id: 'b4', category: 'Restaurantes', spent: 78000, limit: 250000 },
    { id: 'b5', category: 'Ocio', spent: 190000, limit: 200000 },
  ];

  Object.assign(window.MTData, { savingsGoals, debts, budgets });
})();
