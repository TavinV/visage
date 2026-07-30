/* Sentinel — Login screen: brand pane + credential form. */
function Login({ onLogin }) {
  const { Logo } = window.FlauzinoDesignSystem_b9b227;
  const { Button, Input } = window.FlauzinoDesignSystem_b9b227;
  const { ScanFace } = window.SentinelIcons;
  const [email, setEmail] = React.useState("iris.nunes@flauzino.com.br");
  const [pass, setPass] = React.useState("••••••••••");

  return (
    <div className="sx-login">
      <div className="sx-login__brandpane">
        <div className="sx-login__grid" />
        <Logo variant="lockup" size={34} color="#fff" tagline="Sentinel" />
        <div>
          <div className="sx-login__headline">Reconhecimento facial de nível institucional para o seu controle de acesso.</div>
          <p className="sx-login__sub">Latência média de 284ms, auditoria completa de eventos e integração com portões físicos e digitais.</p>
        </div>
        <div className="sx-login__metrics">
          <div className="sx-login__metric"><b>99.4%</b><span>Precisão de reconhecimento</span></div>
          <div className="sx-login__metric"><b>284ms</b><span>Tempo médio de resposta</span></div>
          <div className="sx-login__metric"><b>24/7</b><span>Monitoramento contínuo</span></div>
        </div>
      </div>
      <div className="sx-login__formpane">
        <form className="sx-login__form" onSubmit={(e) => { e.preventDefault(); onLogin(); }}>
          <div className="sx-login__eyebrow">Acesso ao console</div>
          <div className="sx-login__h">Entrar no Sentinel</div>
          <Input label="E-mail corporativo" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Senha" type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
          <Button variant="primary" type="submit" style={{ marginTop: 6 }}>Entrar</Button>
          <div className="sx-login__hint"><ScanFace size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            Ou autentique-se com reconhecimento facial no leitor da recepção.</div>
        </form>
      </div>
    </div>
  );
}
window.SentinelLogin = Login;
