// MoneyTrack UI kit — finance views: StatCards, TransactionsView, AccountsView, RecurringView
(function () {
  const { Icon } = window;
  const { formatCOP, monthLabel, dayHeader } = window.MTData;
  const Wallet = Icon('Wallet'), Up = Icon('TrendingUp'), Down = Icon('TrendingDown'),
    Cal = Icon('Calendar'), Eye = Icon('Eye'), EyeOff = Icon('EyeOff'), Plus = Icon('Plus'),
    Upload = Icon('Upload'), Search = Icon('Search'), Card = Icon('CreditCard'),
    Swap = Icon('ArrowRightLeft'), Clock = Icon('Clock'), Edit = Icon('Edit2'), X = Icon('X'),
    Banknote = Icon('Banknote'), Grip = Icon('GripVertical'), Trash = Icon('Trash2'),
    Repeat = Icon('Repeat'), Check = Icon('Check'), Alert = Icon('AlertCircle'), Combine = Icon('Combine');

  // ── Stat cards ───────────────────────────────────────────
  function StatCards({ totals, hidden, setHidden }) {
    const v = (n) => hidden ? '••••••' : formatCOP(n);
    const { isMobile } = window.useViewport();
    const span2 = isMobile ? { gridColumn: '1 / -1' } : undefined;
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button onClick={() => setHidden(!hidden)} aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'} aria-pressed={hidden} style={{ display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500,
            color: 'var(--muted-foreground)', borderRadius: 'var(--radius-md)' }}>
            {hidden ? <Eye size={16} /> : <EyeOff size={16} />} {hidden ? 'Mostrar' : 'Ocultar'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 16 }}>
          <Stat tone="balance" label="Balance" value={v(totals.balance)} icon={Wallet} style={span2} />
          <Stat tone="income" label="Ingresos" period="este mes" value={v(totals.income)} icon={Up} />
          <Stat tone="expense" label="Gastos" period="este mes" value={v(totals.expense)} icon={Down} />
          <Stat tone="pending" label="Pendientes" value={v(totals.pending)} icon={Cal} style={span2} />
        </div>
      </div>
    );
  }

  const TONES = {
    balance: { ib: 'var(--primary)', ic: 'var(--primary-foreground)', vc: 'var(--balance-foreground)' },
    income: { ib: 'var(--surface-income)', ic: 'var(--success)', vc: 'var(--foreground)' },
    expense: { ib: 'var(--surface-expense)', ic: 'var(--destructive)', vc: 'var(--foreground)' },
    pending: { ib: 'var(--surface-pending)', ic: 'var(--warning)', vc: 'var(--foreground)' },
  };
  function Stat({ tone, label, period, value, icon: I, style }) {
    const t = TONES[tone]; const isB = tone === 'balance';
    const masked = typeof value === 'string' && value.includes('•');
    return (
      <div style={{ borderRadius: 'var(--radius-lg)', padding: 20,
        border: isB ? '2px solid var(--border-accent)' : '1px solid var(--border)',
        background: isB ? 'var(--gradient-balance)' : 'var(--card)',
        boxShadow: isB ? 'var(--shadow-balance)' : 'var(--shadow-md)', ...style }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: isB ? 'var(--balance-foreground)' : 'var(--muted-foreground)' }}>
            {label}{period && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted-foreground)', marginLeft: 4 }}>{period}</span>}
          </span>
          <span style={{ display: 'inline-flex', padding: 7, borderRadius: 'var(--radius-md)', background: t.ib, color: t.ic }}><I size={18} /></span>
        </div>
        <div aria-label={masked ? `${label}, valor oculto` : undefined} style={{ fontSize: 24, fontWeight: 700, color: t.vc, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      </div>
    );
  }

  // ── Transaction row ──────────────────────────────────────
  const TYPE = {
    income: { sign: '+', c: 'var(--success-text)', bg: 'var(--surface-income)', icColor: 'var(--success)', I: Card },
    expense: { sign: '−', c: 'var(--destructive-text)', bg: 'var(--surface-expense)', icColor: 'var(--destructive)', I: Card },
    transfer: { sign: '→', c: 'var(--info-text)', bg: 'var(--surface-transfer)', icColor: 'var(--primary)', I: Swap },
  };
  function TxnRow({ t, accountName, hidden, onEdit, onDelete }) {
    const [hover, setHover] = React.useState(false);
    const [focus, setFocus] = React.useState(false);
    const m = TYPE[t.type]; const TI = m.I;
    return (
      <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '14px 16px',
          background: 'var(--card)', boxShadow: hover ? 'var(--shadow-md)' : 'var(--shadow-sm)',
          borderColor: hover ? 'var(--border-accent)' : 'var(--border)',
          display: 'flex', gap: 12, transition: 'all .15s' }}>
        <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 'var(--radius-lg)', background: m.bg, color: m.icColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TI size={18} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.desc}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>{accountName}</p>
            </div>
            <span aria-label={hidden ? `${t.type === 'income' ? 'Ingreso' : t.type === 'expense' ? 'Gasto' : 'Transferencia'}, valor oculto` : undefined} style={{ fontWeight: 700, fontSize: 16, color: m.c, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {m.sign} {hidden ? '••••' : formatCOP(t.amount)}
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <span className="mt-badge mt-badge-neutral mt-badge-square">{t.category}</span>
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{monthLabel(t.date)}</span>
            {!t.paid && <span className="mt-badge mt-badge-warning"><Clock size={10} /> Pendiente</span>}
            {t.installments > 1 && <span className="mt-badge mt-badge-primary">{t.installments} cuotas</span>}
            {t.hasInterest && <span className="mt-badge mt-badge-warning">Con interés</span>}
            {t.recurring && <span className="mt-badge mt-badge-primary"><Repeat size={10} /> {t.recurring}</span>}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, opacity: (hover || focus) ? 1 : 0, transition: 'opacity .15s' }}>
              <RowBtn onClick={onEdit} label="Editar transacción" color="var(--primary)" onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}><Edit size={15} /></RowBtn>
              <RowBtn onClick={onDelete} label="Eliminar transacción" color="var(--destructive)" onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}><X size={15} /></RowBtn>
            </div>
          </div>
        </div>
      </div>
    );
  }
  function RowBtn({ children, onClick, label, color, onFocus, onBlur }) {
    const [h, setH] = React.useState(false);
    return <button onClick={onClick} title={label} aria-label={label}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onFocus={onFocus} onBlur={onBlur}
      style={{ padding: 6, minWidth: 36, minHeight: 36, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
        background: h ? 'var(--muted)' : 'transparent', color: h ? color : 'var(--muted-foreground)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .12s' }}>{children}</button>;
  }

  // ── Transactions view ────────────────────────────────────
  function TransactionsView({ transactions, accountName, hidden, filter, setFilter, categories, onAdd, onDelete }) {
    const [showForm, setShowForm] = React.useState(false);
    const filtered = transactions.filter((t) => {
      if (filter.cat !== 'all' && t.category !== filter.cat) return false;
      if (filter.q && !t.desc.toLowerCase().includes(filter.q.toLowerCase())) return false;
      return true;
    });
    // group by day
    const groups = [];
    filtered.forEach((t) => {
      const key = t.date;
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key, items: [] }; groups.push(g); }
      g.items.push(t);
    });

    return (
      <div className="mt-card">
        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 18 }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }}><Search size={16} /></span>
            <input className="mt-input" placeholder="Buscar transacción…" aria-label="Buscar transacción" value={filter.q}
              onChange={(e) => setFilter({ ...filter, q: e.target.value })} style={{ paddingLeft: 38 }} />
          </div>
          <select className="mt-input" value={filter.cat} onChange={(e) => setFilter({ ...filter, cat: e.target.value })}
            style={{ width: 'auto', minWidth: 150, cursor: 'pointer' }}>
            <option value="all">Todas las categorías</option>
            {[...new Set([...categories.expense, ...categories.income])].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="mt-btn mt-btn-cancel" onClick={() => {}}><Upload size={16} /> Importar</button>
          <button className="mt-btn mt-btn-primary" onClick={() => setShowForm((s) => !s)}><Plus size={16} /> Nueva</button>
        </div>

        {showForm && <AddForm categories={categories} onCancel={() => setShowForm(false)}
          onSave={(t) => { onAdd(t); setShowForm(false); }} />}

        {/* Title */}
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 700, margin: 0 }}>
            Transacciones
            <span className="mt-badge mt-badge-primary">{filtered.length}</span>
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted-foreground)' }}>
            {filter.cat === 'all' && !filter.q ? 'Todo el tiempo' : 'Filtros activos'} · {transactions.length} cargadas
          </p>
        </div>

        {/* List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {groups.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted-foreground)' }}>
              <p style={{ margin: 0, fontSize: 14 }}>No hay transacciones que coincidan con el filtro.</p>
            </div>
          )}
          {groups.map((g) => (
            <React.Fragment key={g.key}>
              <div style={{ paddingTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>{dayHeader(g.key)}</span>
              </div>
              {g.items.map((t) => <TxnRow key={t.id} t={t} accountName={accountName(t)} hidden={hidden}
                onEdit={() => {}} onDelete={() => onDelete(t.id)} />)}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  // ── Add transaction inline form ──────────────────────────
  function AddForm({ categories, onSave, onCancel }) {
    const { isMobile } = window.useViewport();
    const [type, setType] = React.useState('expense');
    const [desc, setDesc] = React.useState('');
    const [amount, setAmount] = React.useState('');
    const [cat, setCat] = React.useState(categories.expense[0]);
    const cats = type === 'income' ? categories.income : categories.expense;
    React.useEffect(() => { setCat(cats[0]); }, [type]);
    const { SegmentedControl } = window.MoneyTrackDesignSystem_daa395;

    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 18,
        background: 'var(--muted)', marginBottom: 18 }}>
        <div style={{ marginBottom: 14 }}>
          <SegmentedControl ariaLabel="Tipo de movimiento" value={type} onChange={setType} options={[
            { value: 'expense', label: 'Gasto', tone: 'danger' },
            { value: 'income', label: 'Ingreso', tone: 'success' },
            { value: 'transfer', label: 'Transferencia', tone: 'info' },
          ]} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          <div><label className="mt-label">Descripción</label><input className="mt-input" placeholder="(opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div><label className="mt-label">Categoría</label>
            <select className="mt-input" value={cat} onChange={(e) => setCat(e.target.value)} style={{ cursor: 'pointer' }}>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
          <div><label className="mt-label">Monto</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)', fontSize: 14 }}>$</span>
              <input className="mt-input" placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} style={{ paddingLeft: 26, fontVariantNumeric: 'tabular-nums' }} />
            </div></div>
          <div><label className="mt-label">Fecha</label><input className="mt-input" type="date" defaultValue="2026-06-06" /></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="mt-btn mt-btn-cancel" onClick={onCancel}>Cancelar</button>
          <button className="mt-btn mt-btn-primary" disabled={!amount}
            onClick={() => onSave({ id: 't' + Date.now(), type, desc: desc || cat, category: cat, amount: Number(amount) || 0, date: '2026-06-06', paid: type !== 'expense', account: 'a1' })}>
            <Check size={16} /> Guardar
          </button>
        </div>
      </div>
    );
  }

  // ── Accounts view ────────────────────────────────────────
  const ACC_ICON = { savings: Wallet, cash: Banknote, credit: Card };
  const ACC_LABEL = { savings: 'Cuenta de Ahorros', cash: 'Efectivo', credit: 'Crédito' };
  function AccountsView({ accounts, hidden }) {
    const { isMobile } = window.useViewport();
    return (
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 16 }}>
        {accounts.map((a) => <AccountCard key={a.id} a={a} hidden={hidden} />)}
      </div>
    );
  }
  function AccountCard({ a, hidden }) {
    const { isMobile } = window.useViewport();
    const { ProgressBar } = window.MoneyTrackDesignSystem_daa395;
    const isCredit = a.type === 'credit';
    const accent = isCredit ? 'var(--primary)' : 'var(--success)';
    const accentText = isCredit ? 'var(--primary-text)' : 'var(--success-text)';
    const surface = isCredit ? 'var(--surface-transfer)' : 'var(--surface-income)';
    const AI = ACC_ICON[a.type];
    const available = isCredit ? a.creditLimit - a.creditUsed : a.balance;
    const usage = isCredit ? Math.min((a.creditUsed / a.creditLimit) * 100, 100) : 0;
    return (
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-lg)', padding: 20,
        background: 'var(--card)', boxShadow: 'var(--shadow-md)',
        border: a.isDefault ? `2px solid ${accent}` : '1px solid var(--border)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: accent }} />
        <div style={{ paddingLeft: 8 }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-start', gap: isMobile ? 10 : 0 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Grip size={18} style={{ color: 'var(--muted-foreground)' }} />
                <span style={{ padding: 6, borderRadius: 'var(--radius-md)', background: isCredit ? 'var(--surface-transfer)' : 'var(--surface-income)', color: accent, display: 'inline-flex' }}><AI size={18} /></span>
                <h4 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{a.name}</h4>
                {a.isDefault && <span className="mt-badge" style={{ background: surface, color: accentText }}>Principal</span>}
              </div>
              <span className="mt-badge" style={{ background: surface, color: accentText }}>{ACC_LABEL[a.type]}</span>
            </div>
            <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
              {isCredit && <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Disponible</div>}
              <div aria-label={hidden ? 'Saldo oculto' : undefined} style={{ fontSize: 22, fontWeight: 700, color: accent, fontVariantNumeric: 'tabular-nums' }}>{hidden ? '••••••' : formatCOP(available)}</div>
            </div>
          </div>
          {isCredit && (
            <div style={{ marginTop: 16 }}>
              <ProgressBar value={a.creditUsed} max={a.creditLimit} autoWarn
                label="Cupo utilizado"
                detail={`${hidden ? '••••' : formatCOP(a.creditUsed)} / ${hidden ? '••••' : formatCOP(a.creditLimit)}`} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 12, fontSize: 13 }}>
                <span><span style={{ color: 'var(--muted-foreground)' }}>Corte: </span><b>{a.cutoff}</b></span>
                <span><span style={{ color: 'var(--muted-foreground)' }}>Pago: </span><b>{a.payment}</b></span>
                <span><span style={{ color: 'var(--muted-foreground)' }}>Tasa E.A.: </span><b style={{ color: 'var(--primary-text)' }}>{a.interestRate.toFixed(2).replace('.', ',')}%</b></span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="mt-btn" style={{ background: 'var(--info-muted)', color: 'var(--info-text)', minHeight: 38, padding: '6px 14px', fontSize: 14 }}><Edit size={14} /> Editar</button>
            {isCredit && <button className="mt-btn" style={{ background: 'var(--surface-transfer)', color: 'var(--primary-text)', minHeight: 38, padding: '6px 14px', fontSize: 14 }}><Combine size={14} /> Unificar</button>}
          </div>
        </div>
      </div>
    );
  }

  // ── Recurring view ───────────────────────────────────────
  const STATUS = {
    overdue: { label: 'Vencido', tone: 'danger', I: Alert },
    soon: { label: 'Próximo', tone: 'warning', I: Clock },
    ok: { label: 'Al día', tone: 'info', I: Repeat },
    paid: { label: 'Pagado', tone: 'success', I: Check },
  };
  function RecurringView({ recurring }) {
    const { isMobile } = window.useViewport();
    return (
      <div className="mt-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 700, margin: 0 }}>
            Pagos periódicos <span className="mt-badge mt-badge-primary">{recurring.length}</span>
          </h3>
          <button className="mt-btn mt-btn-primary"><Plus size={16} /> Nuevo</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recurring.map((r) => {
            const s = STATUS[r.status]; const SI = s.I;
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', flexWrap: isMobile ? 'wrap' : 'nowrap',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--card)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: 'var(--surface-transfer)', color: 'var(--primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Repeat size={20} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted-foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.category} · {r.account} · día {r.day}</p>
                </div>
                <div style={isMobile
                  ? { width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingLeft: 58 }
                  : { display: 'contents' }}>
                  <span className={`mt-badge mt-badge-${s.tone}`}><SI size={11} /> {s.label}</span>
                  <span style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums', minWidth: isMobile ? 0 : 110, textAlign: 'right' }}>{formatCOP(r.amount)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Generic placeholder for unbuilt tabs ─────────────────
  function Placeholder({ label }) {
    const Box = Icon('Construction');
    return (
      <div className="mt-card" style={{ textAlign: 'center', padding: '56px 24px', color: 'var(--muted-foreground)' }}>
        <div style={{ display: 'inline-flex', padding: 16, borderRadius: 'var(--radius-lg)', background: 'var(--muted)', marginBottom: 14 }}><Box size={28} /></div>
        <h3 style={{ margin: 0, color: 'var(--foreground)' }}>{label}</h3>
        <p style={{ margin: '8px 0 0', fontSize: 14 }}>Esta vista existe en el producto pero no se incluye en este UI kit.</p>
      </div>
    );
  }

  window.MTFinance = { StatCards, TransactionsView, AccountsView, RecurringView, Placeholder };
})();
