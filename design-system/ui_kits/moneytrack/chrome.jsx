// MoneyTrack UI kit — app chrome: Header, TabNavigation, AuthModal, Logo
(function () {
  const { Icon } = window;
  const LogIn = Icon('LogIn'), LogOut = Icon('LogOut'), Settings = Icon('Settings'),
    Bell = Icon('Bell'), Sun = Icon('Sun'), Moon = Icon('Moon'), User = Icon('User'),
    Activity = Icon('Activity'), Wallet = Icon('Wallet'), Repeat = Icon('Repeat'),
    HandCoins = Icon('HandCoins'), PieChart = Icon('PieChart'), Target = Icon('Target'),
    BarChart = Icon('BarChart3'), X = Icon('X'), Mail = Icon('Mail'), Sparkles = Icon('Sparkles');

  function Logo({ size = 30 }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <img src="../../assets/icon-512x512.png" alt="" width={size + 8} height={size + 8} style={{ borderRadius: 9 }} />
        <h1 style={{ fontSize: size, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
          <span style={{ color: 'var(--primary)' }}>Money</span>
          <span style={{ color: 'var(--foreground)' }}>Track</span>
        </h1>
      </div>
    );
  }

  function Header({ user, dark, onToggleTheme, onLogin, onLogout }) {
    const { isMobile } = window.useViewport();
    return (
      <header style={{
        width: '100%', padding: isMobile ? '10px 14px' : '12px 24px',
        background: dark ? 'rgba(17,24,39,0.8)' : 'rgba(255,255,255,0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        position: 'sticky', top: 0, zIndex: 50,
      }}>
        <Logo size={isMobile ? 22 : 30} />
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 2 : 8 }}>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)',
                border: '2px solid var(--border-accent)' }}>
                <User size={18} />
              </div>
              {!isMobile && <span style={{ fontSize: 14, fontWeight: 500 }}>{user.name}</span>}
            </div>
          ) : (
            <button onClick={onLogin} aria-label="Acceder" style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: isMobile ? '9px 11px' : '9px 16px',
              background: dark ? '#fff' : '#111827', color: dark ? '#111827' : '#fff',
              border: 'none', borderRadius: 'var(--radius-md)', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', minHeight: 40,
            }}>
              <LogIn size={16} /> {!isMobile && 'Acceder'}
            </button>
          )}
          {!isMobile && <div style={{ width: 1, height: 24, background: 'var(--border)' }} />}
          <IconBtn onClick={onToggleTheme} title="Tema">{dark ? <Sun size={20} /> : <Moon size={20} />}</IconBtn>
          {user && !isMobile && <IconBtn title="Notificaciones" dot><Bell size={20} /></IconBtn>}
          <IconBtn title="Configuración"><Settings size={20} /></IconBtn>
          {user && <IconBtn onClick={onLogout} title="Salir"><LogOut size={18} /></IconBtn>}
        </div>
      </header>
    );
  }

  function IconBtn({ children, onClick, title, dot }) {
    const [hover, setHover] = React.useState(false);
    return (
      <button onClick={onClick} title={title} aria-label={title}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        style={{ position: 'relative', padding: 9, background: hover ? 'var(--muted)' : 'transparent',
          border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
          color: hover ? 'var(--primary)' : 'var(--muted-foreground)', minHeight: 40, minWidth: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s' }}>
        {children}
        {dot && <span style={{ position: 'absolute', top: 7, right: 8, width: 8, height: 8,
          borderRadius: '50%', background: 'var(--destructive)', border: '2px solid var(--background)' }} />}
      </button>
    );
  }

  const TABS = [
    { key: 'transactions', label: 'Transacciones', icon: Activity },
    { key: 'accounts', label: 'Cuentas', icon: Wallet },
    { key: 'recurring', label: 'Periódicos', icon: Repeat },
    { key: 'debts', label: 'Préstamos', icon: HandCoins },
    { key: 'budgets', label: 'Presupuestos', icon: PieChart },
    { key: 'goals', label: 'Metas', icon: Target },
    { key: 'stats', label: 'Estadísticas', icon: BarChart },
  ];

  function TabNavigation({ view, setView }) {
    return (
      <nav role="tablist" aria-label="Vistas" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24,
        overflowX: 'auto' }} className="mt-scroll-thin">
        {TABS.map((t) => {
          const active = view === t.key;
          const TIcon = t.icon;
          return (
            <button key={t.key} onClick={() => setView(t.key)} role="tab" aria-selected={active} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px',
              background: 'none', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
              fontSize: 15, fontWeight: 500, fontFamily: 'inherit',
              color: active ? 'var(--primary)' : 'var(--muted-foreground)',
              borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1, transition: 'color .15s',
            }}>
              <TIcon size={18} /> {t.label}
            </button>
          );
        })}
      </nav>
    );
  }

  function AuthModal({ open, onClose, onAuth }) {
    const { Modal } = window.MoneyTrackDesignSystem_daa395;
    return (
      <Modal open={open} onClose={onClose} title="Bienvenido" subtitle="Sincroniza tus finanzas" icon={Sparkles} width={400}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button onClick={onAuth} className="mt-btn" style={{ background: 'var(--card)', color: 'var(--foreground)',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', justifyContent: 'center' }}>
            <GoogleG /> Continuar con Google
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--muted-foreground)', fontSize: 12 }}>
            <span style={{ flex: 1, height: 1, background: 'var(--border)' }} /> o <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>
          <label className="mt-label" style={{ marginBottom: 0 }}>Correo electrónico</label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted-foreground)' }}><Mail size={16} /></span>
            <input className="mt-input" defaultValue="hola@moneytrack.app" style={{ paddingLeft: 38 }} aria-label="Correo electrónico" />
          </div>
          <button onClick={onAuth} className="mt-btn mt-btn-primary" style={{ justifyContent: 'center' }}>Acceder</button>
          <p style={{ fontSize: 12, color: 'var(--muted-foreground)', textAlign: 'center', margin: 0 }}>
            También puedes <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--primary-text)', cursor: 'pointer', fontWeight: 500, fontSize: 12, padding: 0 }}>continuar como invitado</button>
          </p>
        </div>
      </Modal>
    );
  }

  function GoogleG() {
    return (
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
    );
  }

  window.MTChrome = { Logo, Header, TabNavigation, AuthModal };
})();
