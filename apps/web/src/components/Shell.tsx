import { Activity, Database, LayoutList, Tags } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { api } from '../api';

const links = [
  { to: '/', label: '活跃', icon: Activity, end: true },
  { to: '/events', label: '事件', icon: LayoutList },
  { to: '/labels', label: '标签', icon: Tags },
  { to: '/data', label: '数据', icon: Database }
];

export function Shell() {
  const navigate = useNavigate();
  async function logout() {
    await api.logout();
    navigate('/login', { replace: true });
    window.location.reload();
  }
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><img src="/sagnex-mark.svg" alt="" /><span>SAGNEX</span></div>
      <nav aria-label="主导航">
        {links.map(({ to, label, icon: Icon, end }) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}><Icon /><span>{label}</span></NavLink>)}
      </nav>
      <button className="nav-link nav-logout" type="button" onClick={() => void logout()}><LogOut /><span>退出登录</span></button>
    </aside>
    <main className="main-content"><Outlet /></main>
  </div>;
}
