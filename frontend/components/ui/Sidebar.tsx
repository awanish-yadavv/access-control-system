'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { UserType } from '@/types/api.types';
import cn from '@/lib/cn';

interface SidebarProps {
  userType: UserType;
  email: string;
}

const LockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="2" y="5" width="11" height="9" rx="1.5" />
    <path d="M4.5 5V4a3 3 0 0 1 6 0v1" strokeLinecap="round" />
    <circle cx="7.5" cy="9.5" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard',   href: '/',            icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor"><path d="M1 1h5v5H1V1zm8 0h5v5H9V1zM1 9h5v5H1V9zm8 0h5v5H9V9z"/></svg> },
      { label: 'Live Events', href: '/access-logs', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7.5 1L14 4.5v6L7.5 14 1 10.5v-6L7.5 1z"/><circle cx="7.5" cy="7.5" r="2"/></svg> },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Tenants',    href: '/tenants',  icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="1" width="13" height="13" rx="1.5"/><path d="M4 7h7M4 4.5h7M4 9.5h4"/></svg> },
      { label: 'Devices',    href: '/devices',  icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="4" width="11" height="8" rx="1"/><path d="M5 4V3a2.5 2.5 0 0 1 5 0v1"/><circle cx="7.5" cy="8" r="1"/></svg> },
      { label: 'RFID Cards', href: '/cards',    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="3" width="11" height="8" rx="1"/><path d="M5 11v1M10 11v1"/><circle cx="7.5" cy="7" r="1.5"/></svg> },
      { label: 'Users',      href: '/users',    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7.5" cy="5" r="2.5"/><path d="M1 13c0-3.037 2.91-5.5 6.5-5.5S14 9.963 14 13"/></svg> },
    ],
  },
  {
    label: 'Platform',
    items: [
      { label: 'Plans & Billing', href: '/billing',  icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2"/><circle cx="7.5" cy="7.5" r="3.5"/></svg> },
      { label: 'Roles',           href: '/roles',    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 3h13M1 7.5h13M1 12h13"/></svg> },
      { label: 'Settings',        href: '/settings', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7.5" cy="7.5" r="2"/><path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.697 2.697l1.06 1.06M11.243 11.243l1.06 1.06M2.697 12.303l1.06-1.06M11.243 3.757l1.06-1.06"/></svg> },
    ],
  },
];

const Sidebar = ({ userType, email }: SidebarProps) => {
  const pathname = usePathname();
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <aside className="[grid-area:nav] border-r border-sidebar-border bg-sidebar flex flex-col sticky top-0 h-screen overflow-hidden">

      {/* Brand */}
      <div className="px-5 py-[18px] border-b border-sidebar-border flex items-center gap-2.5">
        <div className="w-[30px] h-[30px] bg-sidebar-primary rounded-md grid place-items-center shrink-0 text-sidebar-primary-foreground">
          <LockIcon />
        </div>
        <div>
          <div className="text-[11px] font-bold tracking-[0.04em] text-sidebar-foreground uppercase">NEYOFIT</div>
          <div className="text-[8px] font-mono text-sidebar-ring tracking-[0.12em] uppercase">ACCESS OS</div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label} className="px-3 pt-3 pb-1">
            <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-sidebar-foreground/50 px-2 mb-1.5">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'relative flex items-center gap-2.5 px-2.5 py-[9px] rounded-[4px] text-[13px] font-medium no-underline mb-px tracking-[0.02em] transition-all duration-150',
                    active
                      ? 'text-sidebar-primary bg-sidebar-accent'
                      : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50',
                  )}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-[60%] bg-sidebar-ring rounded-r-sm" />
                  )}
                  <span className={cn('shrink-0', active ? 'opacity-100' : 'opacity-70')}>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      {/* User */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[4px] cursor-pointer hover:bg-sidebar-accent/50 transition-colors duration-150"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-primary to-brand-secondary grid place-items-center text-[10px] font-bold text-sidebar-primary shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-xs font-semibold text-sidebar-foreground truncate">{email}</div>
            <div className="text-[9px] font-mono text-sidebar-ring tracking-[0.08em] uppercase">{userType}</div>
          </div>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
