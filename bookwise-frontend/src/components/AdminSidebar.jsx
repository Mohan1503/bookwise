import { NavLink, useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Building2,
  ExternalLink,
  LayoutDashboard,
  Library,
  LogOut,
  Settings,
  Tag,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './AdminSidebar.css';

const groups = [
  { label: 'Main', items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    label: 'Catalog',
    items: [
      { to: '/admin/books', label: 'Books', icon: BookOpen },
      { to: '/admin/authors', label: 'Authors', icon: Users },
      { to: '/admin/categories', label: 'Categories', icon: Tag },
      { to: '/admin/publishers', label: 'Publishers', icon: Building2 },
    ],
  },
  { label: 'System', items: [{ to: '/admin/settings', label: 'Settings', icon: Settings }] },
];

export default function AdminSidebar({ onNavigate }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/admin/login', { replace: true });
  }

  return (
    <aside className="admin-sidebar" aria-label="Admin navigation">
      <NavLink to="/admin" end className="admin-sidebar__brand" onClick={onNavigate}>
        <span className="admin-sidebar__logo" aria-hidden="true"><Library size={18} /></span>
        BookWise Admin
      </NavLink>

      <nav className="admin-sidebar__nav">
        {groups.map((group) => (
          <div key={group.label} className="admin-sidebar__group">
            <div className="admin-sidebar__label">{group.label}</div>
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) => `admin-sidebar__link${isActive ? ' active' : ''}`}
              >
                <Icon size={18} aria-hidden="true" /> {label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="admin-sidebar__footer">
        <a href="/" className="admin-sidebar__link" target="_blank" rel="noreferrer">
          <ExternalLink size={18} aria-hidden="true" /> View store
        </a>
        <button type="button" className="admin-sidebar__link" onClick={handleLogout}>
          <LogOut size={18} aria-hidden="true" /> Log out
        </button>
      </div>
    </aside>
  );
}
