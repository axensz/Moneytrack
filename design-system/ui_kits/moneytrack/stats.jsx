// MoneyTrack UI kit — Estadísticas (charts via Recharts)
(function () {
  const { Icon } = window;
  const { formatCOP, monthlyData, yearlyData, categoryData, interestSummary } = window.MTData;
  const Activity = Icon('Activity'), BarChart3 = Icon('BarChart3'), PieIcon = Icon('PieChart'),
    Trend = Icon('TrendingUp'), Percent = Icon('Percent');

  const INCOME = '#8b5cf6';
  const EXPENSE = '#f43f5e';
  const INTEREST = '#f59e0b';
  const CHART_COLORS = ['#8b5cf6', '#7c3aed', '#a78bfa', '#c084fc', '#c4b5fd', '#6d28d9'];

  const R = () => window.Recharts;

  function gridColor(dark) { return dark ? 'rgba(167,139,250,0.16)' : '#ede9fe'; }
  const axis = { stroke: '#9ca3af', tick: { fontSize: 11, fill: '#9ca3af' } };
  const yAxis = { ...axis, width: 46, tickFormatter: (v) => `${Math.round(v / 1000)}k` };
  const margins = { top: 5, right: 12, left: 0, bottom: 5 };

  function CustomTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    return (
      <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)', padding: '10px 12px', minWidth: 150 }}>
        {label != null && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--foreground)' }}>{label}</div>}
        {payload.map((p, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: i ? 4 : 0 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.color || (p.payload && p.payload.fill), flexShrink: 0 }} />
            <span style={{ color: 'var(--muted-foreground)' }}>{p.name}</span>
            <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{formatCOP(p.value)}</span>
          </div>
        ))}
      </div>
    );
  }

  const legendStyle = { fontSize: 12, paddingTop: 12 };

  function ChartCard({ title, subtitle, icon: I, children }) {
    return (
      <div className="mt-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{title}</h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>{subtitle}</p>
          </div>
          <span style={{ display: 'inline-flex', padding: 9, borderRadius: 'var(--radius-md)', background: 'var(--surface-transfer)', color: 'var(--primary)' }}><I size={20} /></span>
        </div>
        {children}
      </div>
    );
  }

  function CashFlow({ dark }) {
    const { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = R();
    return (
      <ChartCard title="Flujo de Caja" subtitle="Últimos 6 meses" icon={Activity}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={monthlyData} margin={margins}>
            <defs>
              <linearGradient id="gradIng" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={INCOME} stopOpacity={0.3} /><stop offset="95%" stopColor={INCOME} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradGas" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={EXPENSE} stopOpacity={0.3} /><stop offset="95%" stopColor={EXPENSE} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...yAxis} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-accent)' }} />
            <Legend iconType="circle" wrapperStyle={legendStyle} />
            <Area type="monotone" dataKey="ingresos" name="Ingresos" stroke={INCOME} strokeWidth={2.5} fill="url(#gradIng)" isAnimationActive={false} />
            <Area type="monotone" dataKey="gastos" name="Gastos" stroke={EXPENSE} strokeWidth={2.5} fill="url(#gradGas)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  function MonthlyBars({ dark }) {
    const { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = R();
    return (
      <ChartCard title="Comparación Mensual" subtitle="Últimos 6 meses" icon={BarChart3}>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyData} margin={margins}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
            <XAxis dataKey="month" {...axis} />
            <YAxis {...yAxis} />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-transfer)', opacity: 0.4 }} />
            <Legend iconType="circle" wrapperStyle={legendStyle} />
            <Bar dataKey="ingresos" name="Ingresos" fill={INCOME} radius={[6, 6, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="gastos" name="Gastos" fill={EXPENSE} radius={[6, 6, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  function CategoryDonut() {
    const { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } = R();
    const total = categoryData.reduce((s, d) => s + d.value, 0);
    return (
      <ChartCard title="Gastos por Categoría" subtitle="Distribución actual" icon={PieIcon}>
        <div style={{ position: 'relative', width: '100%', maxWidth: 300, margin: '0 auto' }}>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={55} outerRadius={78} paddingAngle={2} dataKey="value" stroke="none" isAnimationActive={false}>
                {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Total</span>
            <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCOP(total)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {categoryData.slice(0, 5).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length] }} />
                <span style={{ color: 'var(--muted-foreground)' }}>{item.name}</span>
              </div>
              <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{formatCOP(item.value)}</span>
            </div>
          ))}
        </div>
      </ChartCard>
    );
  }

  function YearlyTrend({ dark }) {
    const { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } = R();
    return (
      <ChartCard title="Tendencia Anual" subtitle="Resumen por año" icon={Trend}>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={yearlyData} margin={margins}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor(dark)} />
            <XAxis dataKey="año" {...axis} />
            <YAxis {...yAxis} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--border-accent)' }} />
            <Legend iconType="circle" wrapperStyle={legendStyle} />
            <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke={INCOME} strokeWidth={3} dot={{ fill: INCOME, r: 5 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="gastos" name="Gastos" stroke={EXPENSE} strokeWidth={3} dot={{ fill: EXPENSE, r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    );
  }

  function InterestsCard() {
    const s = interestSummary;
    const items = [
      { label: 'Interés pagado', value: s.paid, hint: 'en lo corrido del año' },
      { label: 'Interés proyectado', value: s.projected, hint: 'cuotas restantes' },
      { label: 'Capital en cuotas', value: s.principal, hint: `${s.cards} tarjeta` },
    ];
    return (
      <div className="mt-card" style={{ borderColor: 'var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Intereses de tarjetas</h3>
            <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>Costo de financiación con tasa E.A.</p>
          </div>
          <span style={{ display: 'inline-flex', padding: 9, borderRadius: 'var(--radius-md)', background: 'var(--warning-muted)', color: 'var(--warning-text)' }}><Percent size={20} /></span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          {items.map((it, i) => (
            <div key={i} style={{ padding: 16, borderRadius: 'var(--radius-lg)', background: i === 0 ? 'var(--warning-muted)' : 'var(--muted)',
              border: `1px solid ${i === 0 ? 'var(--warning)' : 'var(--border)'}` }}>
              <div style={{ fontSize: 13, color: 'var(--muted-foreground)', marginBottom: 6 }}>{it.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: i === 0 ? 'var(--warning-text)' : 'var(--foreground)', fontVariantNumeric: 'tabular-nums' }}>{formatCOP(it.value)}</div>
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 4 }}>{it.hint}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function StatsView({ dark }) {
    const { isMobile } = window.useViewport();
    if (!window.Recharts) {
      return <div className="mt-card" style={{ textAlign: 'center', padding: 48, color: 'var(--muted-foreground)' }}>Cargando gráficos…</div>;
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <CashFlow dark={dark} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 24 }}>
          <MonthlyBars dark={dark} />
          <CategoryDonut />
        </div>
        <YearlyTrend dark={dark} />
        <InterestsCard />
      </div>
    );
  }

  window.MTStats = { StatsView };
})();
