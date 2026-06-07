// MoneyTrack UI kit — Préstamos (debts), Presupuestos (budgets), Metas (goals)
(function () {
  const { Icon } = window;
  const { formatCOP, savingsGoals, debts, budgets } = window.MTData;
  const DS = () => window.MoneyTrackDesignSystem_daa395;

  const Target = Icon('Target'), Trophy = Icon('Trophy'), Check = Icon('CheckCircle2'),
    Cal = Icon('Calendar'), Plus = Icon('Plus'), Dollar = Icon('DollarSign'), Trash = Icon('Trash2'),
    HandCoins = Icon('HandCoins'), ArrowDown = Icon('ArrowDownLeft'), ArrowUp = Icon('ArrowUpRight'),
    Pie = Icon('PieChart'), Wallet = Icon('Wallet'), TrendingDown = Icon('TrendingDown');

  // Small summary tile (semantic surfaces, flexible label) ──
  const SURF = {
    primary: { bg: 'var(--surface-primary)', fg: 'var(--primary)', val: 'var(--primary-text)' },
    success: { bg: 'var(--surface-income)', fg: 'var(--success)', val: 'var(--success-text)' },
    danger:  { bg: 'var(--surface-expense)', fg: 'var(--destructive)', val: 'var(--destructive-text)' },
    warning: { bg: 'var(--surface-pending)', fg: 'var(--warning)', val: 'var(--warning-text)' },
    info:    { bg: 'var(--surface-info)', fg: 'var(--info)', val: 'var(--info-text)' },
  };
  function MiniStat({ tone = 'primary', icon: I, label, value, neutralValue }) {
    const s = SURF[tone];
    return (
      <div style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
        <span style={{ display: 'inline-flex', padding: 8, borderRadius: 'var(--radius-md)', background: s.bg, color: s.fg, marginBottom: 10 }}><I size={18} /></span>
        <div style={{ fontSize: 12, color: 'var(--muted-foreground)', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, color: neutralValue ? 'var(--foreground)' : s.val, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    );
  }

  function ViewHeader({ title, subtitle, action }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{title}</h2>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>{subtitle}</p>
        </div>
        <button className="mt-btn mt-btn-primary" style={{ flexShrink: 0 }}><Plus size={16} /> {action}</button>
      </div>
    );
  }

  function IconAction({ label, color, bg, icon: I }) {
    return (
      <button aria-label={label} title={label} className="mt-btn" style={{ minHeight: 36, minWidth: 36, padding: 8, background: bg, color }}>
        <I size={15} />
      </button>
    );
  }

  // ── Metas (Goals) ──────────────────────────────────────────
  function GoalsView() {
    const { ProgressBar } = DS();
    const { isMobile } = window.useViewport();
    const active = savingsGoals;
    const totalTarget = active.reduce((s, g) => s + g.target, 0);
    const totalSaved = active.reduce((s, g) => s + g.current, 0);
    return (
      <div className="mt-card">
        <ViewHeader title="Metas de Ahorro" subtitle="Define y alcanza tus objetivos financieros" action="Nueva meta" />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
          <MiniStat tone="primary" icon={Target} label="Metas activas" value={active.length} />
          <MiniStat tone="info" icon={Target} label="Objetivo total" value={formatCOP(totalTarget)} />
          <MiniStat tone="success" icon={Check} label="Ahorrado" value={formatCOP(totalSaved)} />
          <MiniStat tone="warning" icon={Trophy} label="Completadas" value={1} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {active.map((g) => {
            const pct = Math.round((g.current / g.target) * 100);
            const done = pct >= 100;
            return (
              <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--card)', padding: 16, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{g.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 12, color: g.daysLeft < 30 ? 'var(--warning-text)' : 'var(--muted-foreground)' }}>
                      <Cal size={12} /> {g.daysLeft} días restantes
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <IconAction label="Agregar ahorro" icon={Dollar} bg="var(--surface-income)" color="var(--success-text)" />
                    <IconAction label="Eliminar meta" icon={Trash} bg="var(--surface-expense)" color="var(--destructive-text)" />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary-text)', fontVariantNumeric: 'tabular-nums' }}>{formatCOP(g.current)}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>de {formatCOP(g.target)}</span>
                </div>
                <ProgressBar value={g.current} max={g.target} tone={done ? 'success' : 'primary'} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted-foreground)', marginTop: 8 }}>
                  <span>{pct}% completado</span>
                  <span>Faltan {formatCOP(Math.max(g.target - g.current, 0))}</span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--info-text)', margin: '8px 0 0' }}>Ahorra {formatCOP(g.suggestedMonthly)}/mes para alcanzar tu meta a tiempo.</p>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Préstamos (Debts) ──────────────────────────────────────
  function DebtsView() {
    const { ProgressBar } = DS();
    const { isMobile } = window.useViewport();
    const owed = debts.filter((d) => d.type === 'owed').reduce((s, d) => s + (d.total - d.paid), 0);
    const lent = debts.filter((d) => d.type === 'lent').reduce((s, d) => s + (d.total - d.paid), 0);
    const monthly = debts.reduce((s, d) => s + d.monthly, 0);
    return (
      <div className="mt-card">
        <ViewHeader title="Préstamos" subtitle="Lo que debes y lo que te deben" action="Nuevo préstamo" />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 22 }}>
          <MiniStat tone="danger" icon={ArrowUp} label="Debes" value={formatCOP(owed)} />
          <MiniStat tone="success" icon={ArrowDown} label="Te deben" value={formatCOP(lent)} />
          <MiniStat tone="warning" icon={Cal} label="Cuota mensual" value={formatCOP(monthly)} />
          <MiniStat tone="primary" icon={HandCoins} label="Préstamos activos" value={debts.length} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {debts.map((d) => {
            const isOwed = d.type === 'owed';
            const remaining = d.total - d.paid;
            const pct = Math.round((d.paid / d.total) * 100);
            return (
              <div key={d.id} style={{ position: 'relative', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--card)', padding: '16px 16px 16px 20px', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: isOwed ? 'var(--destructive)' : 'var(--success)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{d.name}</h3>
                      <span className={`mt-badge ${isOwed ? 'mt-badge-danger' : 'mt-badge-success'}`}>{isOwed ? 'Debes' : 'Te deben'}</span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6, fontSize: 12, color: 'var(--muted-foreground)' }}>
                      <span>Próximo pago: <b style={{ color: 'var(--foreground)' }}>{d.nextDate}</b></span>
                      <span>Cuota: <b style={{ color: 'var(--foreground)' }}>{formatCOP(d.monthly)}</b></span>
                      {d.rate && <span>Tasa E.A.: <b style={{ color: 'var(--primary-text)' }}>{d.rate.toFixed(1).replace('.', ',')}%</b></span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Saldo</div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: isOwed ? 'var(--destructive-text)' : 'var(--success-text)', fontVariantNumeric: 'tabular-nums' }}>{formatCOP(remaining)}</div>
                  </div>
                </div>
                <ProgressBar value={d.paid} max={d.total} tone={isOwed ? 'primary' : 'success'}
                  label="Pagado" detail={`${formatCOP(d.paid)} / ${formatCOP(d.total)} · ${pct}%`} />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Presupuestos (Budgets) ─────────────────────────────────
  function BudgetsView() {
    const { ProgressBar } = DS();
    const { isMobile } = window.useViewport();
    const totalLimit = budgets.reduce((s, b) => s + b.limit, 0);
    const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
    const available = totalLimit - totalSpent;
    return (
      <div className="mt-card">
        <ViewHeader title="Presupuestos" subtitle="Controla tu gasto por categoría este mes" action="Nuevo presupuesto" />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 12, marginBottom: 22 }}>
          <MiniStat tone="primary" icon={Pie} label="Presupuesto total" value={formatCOP(totalLimit)} />
          <MiniStat tone="danger" icon={TrendingDown} label="Gastado" value={formatCOP(totalSpent)} />
          <MiniStat tone="success" icon={Wallet} label="Disponible" value={formatCOP(available)} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {budgets.map((b) => {
            const over = b.spent > b.limit;
            const pct = Math.round((b.spent / b.limit) * 100);
            return (
              <div key={b.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{b.category}</span>
                    {over && <span className="mt-badge mt-badge-danger">Excedido</span>}
                    {!over && pct >= 90 && <span className="mt-badge mt-badge-warning">Casi al límite</span>}
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--muted-foreground)', fontVariantNumeric: 'tabular-nums' }}>
                    <b style={{ color: over ? 'var(--destructive-text)' : 'var(--foreground)' }}>{formatCOP(b.spent)}</b> / {formatCOP(b.limit)}
                  </span>
                </div>
                <ProgressBar value={b.spent} max={b.limit} autoWarn />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  window.MTViews = { GoalsView, DebtsView, BudgetsView };
})();
