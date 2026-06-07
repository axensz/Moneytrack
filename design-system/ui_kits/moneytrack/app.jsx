// MoneyTrack UI kit — app wiring
(function () {
  const { Header, TabNavigation, AuthModal } = window.MTChrome;
  const { StatCards, TransactionsView, AccountsView, RecurringView, Placeholder } = window.MTFinance;
  const { accounts, seedTransactions, categories, recurring, formatCOP } = window.MTData;

  function App() {
    const [dark, setDark] = React.useState(false);
    const [user, setUser] = React.useState(null);
    const [authOpen, setAuthOpen] = React.useState(false);
    const [view, setView] = React.useState('transactions');
    const [transactions, setTransactions] = React.useState(seedTransactions);
    const [hidden, setHidden] = React.useState(false);
    const [filter, setFilter] = React.useState({ cat: 'all', q: '' });
    const { isMobile } = window.useViewport();

    React.useEffect(() => {
      document.documentElement.classList.toggle('dark', dark);
    }, [dark]);

    const accountName = (t) => {
      const a = accounts.find((x) => x.id === t.account);
      if (t.type === 'transfer' && t.toAccount) {
        const b = accounts.find((x) => x.id === t.toAccount);
        return `${a ? a.name : '—'} → ${b ? b.name : '—'}`;
      }
      return a ? a.name : 'Cuenta';
    };

    const totals = React.useMemo(() => {
      const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const pending = transactions.filter((t) => !t.paid).reduce((s, t) => s + t.amount, 0);
      const balance = accounts.reduce((s, a) => s + (a.type === 'credit' ? (a.creditLimit - a.creditUsed) : a.balance), 0);
      return { income, expense, pending, balance };
    }, [transactions]);

    const addTxn = (t) => setTransactions((prev) => [t, ...prev]);
    const delTxn = (id) => setTransactions((prev) => prev.filter((t) => t.id !== id));

    return (
      <div style={{ minHeight: '100vh', background: 'var(--background)', color: 'var(--foreground)' }}>
        <Header user={user} dark={dark} onToggleTheme={() => setDark((d) => !d)}
          onLogin={() => setAuthOpen(true)} onLogout={() => setUser(null)} />
        <main style={{ maxWidth: 1080, margin: '0 auto', padding: isMobile ? '16px 12px 56px' : '28px 24px 64px' }}>
          {!user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', marginBottom: 20, flexWrap: 'wrap',
              borderRadius: 'var(--radius-lg)', background: 'var(--info-muted)', border: '1px solid var(--border-accent)',
              color: 'var(--info-text)', fontSize: 14 }}>
              <b>Modo invitado.</b> <span style={{ opacity: 0.85 }}>Tus datos se guardan en este dispositivo.</span>
              <button onClick={() => setAuthOpen(true)} style={{ marginLeft: isMobile ? 0 : 'auto', background: 'none', border: 'none',
                color: 'var(--primary-text)', fontWeight: 600, cursor: 'pointer', fontSize: 14, padding: 0 }}>Acceder para sincronizar →</button>
            </div>
          )}
          <StatCards totals={totals} hidden={hidden} setHidden={setHidden} />
          <TabNavigation view={view} setView={setView} />
          {view === 'transactions' && (
            <TransactionsView transactions={transactions} accountName={accountName} hidden={hidden}
              filter={filter} setFilter={setFilter} categories={categories} onAdd={addTxn} onDelete={delTxn} />
          )}
          {view === 'accounts' && <AccountsView accounts={accounts} hidden={hidden} />}
          {view === 'recurring' && <RecurringView recurring={recurring} />}
          {view === 'stats' && <window.MTStats.StatsView dark={dark} />}
          {view === 'debts' && <window.MTViews.DebtsView />}
          {view === 'budgets' && <window.MTViews.BudgetsView />}
          {view === 'goals' && <window.MTViews.GoalsView />}
        </main>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)}
          onAuth={() => { setUser({ name: 'Camila' }); setAuthOpen(false); }} />
      </div>
    );
  }

  window.MTApp = App;
})();
