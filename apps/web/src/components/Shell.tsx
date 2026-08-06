import { Activity, Database, LayoutList, Tags } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: '活跃', icon: Activity, end: true },
  { to: '/events', label: '事件', icon: LayoutList },
  { to: '/labels', label: '标签', icon: Tags },
  { to: '/data', label: '数据', icon: Database }
];

export function Shell() {
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img src="/sagnex-mark.svg" alt="" /><span>SAGNEX</span></div>
      <nav aria-label="主导航">
        {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><Icon /><span>{label}</span></NavLink>)}
      </nav>
    </aside>
    <main className="main-content"><Outlet /></main>
  </div>;
}
