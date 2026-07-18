/* Sentinel — top bar with search + notifications. */
function Topbar({ title, crumb }) {
  const { Search, Bell } = window.SentinelIcons;
  return (
    <header className="sx-top">
      <div>
        <div className="sx-top__title">{title}</div>
        {crumb && <div className="sx-top__crumb">{crumb}</div>}
      </div>
      <div className="sx-top__spacer" />
      <div className="sx-search">
        <Search size={15} />
        <input placeholder="Buscar por nome, ID ou portão…" />
      </div>
      <button className="sx-iconbtn"><Bell size={17} /><span className="sx-iconbtn__dot" /></button>
    </header>
  );
}
window.SentinelTopbar = Topbar;
