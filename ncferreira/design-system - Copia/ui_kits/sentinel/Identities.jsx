/* Sentinel — Identities: registered people directory. */
function IdentityCard({ p }) {
  const { Avatar, Badge } = window.FlauzinoDesignSystem_b9b227;
  const statusLabel = { online: "Online", away: "Ausente", offline: "Offline" }[p.status];
  const statusTone = { online: "success", away: "warning", offline: "neutral" }[p.status];
  return (
    <div className="sx-idcard">
      <Avatar name={p.name} size="lg" status={p.status} />
      <div className="sx-idcard__main">
        <b>{p.name}</b>
        <span>{p.role} · {p.dept}</span>
      </div>
      <div className="sx-idcard__meta">
        <div><dt>Autorização</dt><dd>{p.clearance}</dd></div>
        <div><dt>Desde</dt><dd>{p.enrolled}</dd></div>
      </div>
      <Badge variant={statusTone}>{statusLabel}</Badge>
    </div>
  );
}

function Identities() {
  const { Button, Input } = window.FlauzinoDesignSystem_b9b227;
  const { Filter, Plus } = window.SentinelIcons;
  const data = window.SENTINEL_DATA;
  return (
    <React.Fragment>
      {window.SentinelTopbar && React.createElement(window.SentinelTopbar, { title: "Identidades", crumb: "Diretório de pessoas cadastradas" })}
      <div className="sx-scroll">
        <div className="sx-pagehead">
          <div>
            <h1>Identidades cadastradas</h1>
            <p>{data.identities.length} pessoas com biometria facial registrada</p>
          </div>
          <Button variant="primary"><Plus size={16} /> Nova identidade</Button>
        </div>
        <div className="sx-toolbar">
          <Input placeholder="Buscar por nome ou departamento…" style={{ maxWidth: 320 }} />
          <button className="sx-iconbtn"><Filter size={16} /></button>
          <div className="sx-toolbar__spacer" />
        </div>
        <div className="sx-idgrid">
          {data.identities.map((p, i) => <IdentityCard p={p} key={i} />)}
        </div>
      </div>
    </React.Fragment>
  );
}
window.SentinelIdentities = Identities;
