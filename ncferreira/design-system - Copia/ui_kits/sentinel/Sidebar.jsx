/* Sentinel — left navigation rail. */
function Sidebar({ page, onNavigate, onLogout }) {
  const { Logo } = window.FlauzinoDesignSystem_b9b227;
  const { Dashboard, ScanFace, Users, Shield, Settings, LogOut } = window.SentinelIcons;
  const items = [
    { key: "dashboard", label: "Painel", icon: Dashboard },
    { key: "events", label: "Reconhecimentos", icon: ScanFace },
    { key: "identities", label: "Identidades", icon: Users },
    { key: "access", label: "Controle de Acesso", icon: Shield },
  ];
  return (
    <aside className="sx-side">
      <div className="sx-side__brand"><Logo variant="lockup" size={30} color="#fff" tagline="Sentinel" /></div>
      <nav className="sx-nav">
        <div className="sx-nav__section">Monitoramento</div>
        {items.map(it => (
          <button key={it.key} className={"sx-nav__item" + (page === it.key ? " sx-nav__item--active" : "")}
            onClick={() => onNavigate(it.key)}>
            <it.icon size={17} /> {it.label}
          </button>
        ))}
        <div className="sx-nav__section">Sistema</div>
        <button className="sx-nav__item" onClick={() => onNavigate("settings")}><Settings size={17} /> Configurações</button>
      </nav>
      <div className="sx-side__foot">
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--accent-600)", color: "#fff",
          display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600, flex: "none" }}>IN</div>
        <div className="sx-side__user"><b>Iris Nunes</b><span>Segurança · Online</span></div>
        <button className="sx-nav__item" style={{ width: 34, flex: "none", padding: 8, marginLeft: "auto" }} onClick={onLogout} title="Sair">
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
window.SentinelSidebar = Sidebar;
