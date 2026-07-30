/* Sentinel — Dashboard: live stats, recognition feed, camera monitor, status. */
function StatCard({ s }) {
  const toneClass = s.tone === "warning" ? "sx-stat__delta--warn" : (s.delta.startsWith("+") || s.delta.startsWith("−") && s.tone === "success") ? "sx-stat__delta--up" : "";
  return (
    <div className="sx-stat">
      <div className="sx-stat__label">{s.label}</div>
      <div className="sx-stat__value">{s.value}</div>
      <div className={"sx-stat__delta " + (s.tone === "warning" ? "sx-stat__delta--warn" : "sx-stat__delta--up")}>{s.delta} vs. ontem</div>
    </div>
  );
}

function StatusPill(status) {
  const { Badge } = window.FlauzinoDesignSystem_b9b227;
  if (status === "granted") return <Badge variant="success" dot>Autorizado</Badge>;
  if (status === "denied") return <Badge variant="danger" dot>Negado</Badge>;
  return <Badge variant="warning" dot>Revisão</Badge>;
}

function Dashboard() {
  const data = window.SENTINEL_DATA;
  const { Camera } = window.SentinelIcons;

  return (
    <React.Fragment>
      {window.SentinelTopbar && React.createElement(window.SentinelTopbar, { title: "Painel", crumb: "Visão geral em tempo real" })}
      <div className="sx-scroll">
        <div className="sx-pagehead">
          <div>
            <h1>Bem-vinda, Iris</h1>
            <p>7 câmeras ativas · 4 portões monitorados · atualizado há 3s</p>
          </div>
        </div>

        <div className="sx-stats">
          {data.stats.map((s, i) => <StatCard key={i} s={s} />)}
        </div>

        <div className="sx-cols">
          <div className="sx-panel">
            <div className="sx-panel__head">
              <h3>Reconhecimentos recentes</h3>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Portão Principal · Laboratórios · Recepção</span>
            </div>
            <table className="sx-table">
              <thead>
                <tr><th>ID</th><th>Pessoa</th><th>Portão</th><th>Horário</th><th>Confiança</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.events.map(e => (
                  <tr className="sx-row" key={e.id}>
                    <td className="sx-cell-id">{e.id}</td>
                    <td className="sx-cell-person"><div><b>{e.name}</b><span>{e.role}</span></div></td>
                    <td>{e.gate}</td>
                    <td className="sx-conf">{e.time}</td>
                    <td className="sx-conf">{e.conf.toFixed(1)}%</td>
                    <td>{StatusPill(e.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div className="sx-panel">
              <div className="sx-panel__head"><h3>Portão Principal</h3><Camera size={16} /></div>
              <div style={{ padding: 14 }}>
                <div className="sx-cam">
                  <div className="sx-cam__grid" />
                  <div className="sx-scan" />
                  <div className="sx-cam__hud"><span>CAM-01 · PORTÃO PRINCIPAL</span><span className="sx-cam__rec"><i />AO VIVO</span></div>
                  <div className="sx-cam__box" />
                  <div className="sx-cam__tag">Helena Braga · 99.2%</div>
                </div>
              </div>
            </div>
            <div className="sx-panel">
              <div className="sx-panel__head"><h3>Status dos portões</h3></div>
              <div className="sx-statusline">
                <div className="sx-statusrow"><span>Portão Principal</span><b style={{ color: "var(--success-600)" }}>Ativo</b></div>
                <div className="sx-statusrow"><span>Laboratório 1</span><b style={{ color: "var(--success-600)" }}>Ativo</b></div>
                <div className="sx-statusrow"><span>Doca de Carga</span><b style={{ color: "var(--warning-600)" }}>Alerta</b></div>
                <div className="sx-statusrow"><span>Recepção</span><b style={{ color: "var(--success-600)" }}>Ativo</b></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  );
}
window.SentinelDashboard = Dashboard;
