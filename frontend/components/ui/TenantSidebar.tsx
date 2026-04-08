'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { UserType } from '@/types/api.types';
import cn from '@/lib/cn';

interface TenantSidebarProps {
  tenantId: string;
  tenantName: string;
  userType: UserType;
  email: string;
  isSystemViewing?: boolean;
}

const NAV_SECTIONS = (tid: string) => [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard',    href: `/${tid}`,              icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor"><path d="M1 1h5v5H1V1zm8 0h5v5H9V1zM1 9h5v5H1V9zm8 0h5v5H9V9z"/></svg> },
      { label: 'Live Events',  href: `/${tid}/access-logs`,  icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M7.5 1L14 4.5v6L7.5 14 1 10.5v-6L7.5 1z"/><circle cx="7.5" cy="7.5" r="2"/></svg> },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'My Devices',   href: `/${tid}/devices`,    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="4" width="11" height="8" rx="1"/><path d="M5 4V3a2.5 2.5 0 0 1 5 0v1"/><circle cx="7.5" cy="8" r="1"/></svg> },
      { label: 'RFID Cards',   href: `/${tid}/cards`,      icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="3" width="11" height="8" rx="1"/><path d="M5 11v1M10 11v1"/><circle cx="7.5" cy="7" r="1.5"/></svg> },
      { label: 'Customers',    href: `/${tid}/customers`,  icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7.5" cy="5" r="2.5"/><path d="M1 13c0-3.037 2.91-5.5 6.5-5.5S14 9.963 14 13"/></svg> },
      { label: 'Members',       href: `/${tid}/members`,        icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="5.5" cy="4.5" r="2"/><circle cx="10.5" cy="4.5" r="2"/><path d="M1 12c0-2.485 2.015-4 4.5-4"/><path d="M14 12c0-2.485-2.015-4-4.5-4"/><path d="M5.5 8.5c1.38-.65 3.62-.65 5 0"/></svg> },
      { label: 'Subscriptions', href: `/${tid}/subscriptions`,  icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="3" width="13" height="10" rx="1"/><path d="M1 6h13"/><circle cx="4.5" cy="9.5" r="1"/><path d="M7 9.5h4"/></svg> },
      { label: 'Invoices',      href: `/${tid}/invoices`,       icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="2" y="1" width="11" height="13" rx="1"/><path d="M5 5h5M5 7.5h5M5 10h3"/></svg> },
    ],
  },
  {
    label: 'Account',
    items: [
      { label: 'Billing',      href: `/${tid}/billing`,    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="1" y="3" width="13" height="9" rx="1"/><path d="M1 6h13"/><path d="M4 9.5h2"/></svg> },
      { label: 'Settings',     href: `/${tid}/settings`,   icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="7.5" cy="7.5" r="2"/><path d="M7.5 1v1.5M7.5 12.5V14M1 7.5h1.5M12.5 7.5H14M2.697 2.697l1.06 1.06M11.243 11.243l1.06 1.06M2.697 12.303l1.06-1.06M11.243 3.757l1.06-1.06"/></svg> },
    ],
  },
];

const TenantSidebar = ({ tenantId, tenantName, userType, email, isSystemViewing }: TenantSidebarProps) => {
  const pathname = usePathname();
  const initials = email.slice(0, 2).toUpperCase();

  return (
    <aside className="[grid-area:nav] border-r border-sidebar-border bg-sidebar flex flex-col sticky top-0 h-screen overflow-hidden">

      {/* Brand */}
      <div className="px-5 py-[18px] border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-[30px] h-[30px] bg-sidebar-ring/20 rounded-md grid place-items-center shrink-0 text-sidebar-ring border border-sidebar-ring/30">
            <svg width="14" height="14" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="1" y="1" width="13" height="13" rx="1.5"/>
              <path d="M4 7h7M4 4.5h7M4 9.5h4"/>
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-[0.04em] text-sidebar-foreground truncate">{tenantName}</div>
            <div className="text-[8px] font-mono text-sidebar-ring tracking-[0.12em] uppercase">Tenant Portal</div>
          </div>
        </div>
        {isSystemViewing && (
          <Link href="/" className="mt-2 flex items-center gap-1.5 text-[9px] font-mono text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors tracking-[0.1em] uppercase">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2L2 5l4 3"/>
            </svg>
            Back to System
          </Link>
        )}
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto py-2">
        {NAV_SECTIONS(tenantId).map((section) => (
          <div key={section.label} className="px-3 pt-3 pb-1">
            <div className="text-[9px] font-mono tracking-[0.18em] uppercase text-sidebar-foreground/50 px-2 mb-1.5">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = pathname === item.href || (pathname !== `/${tenantId}` && pathname.startsWith(item.href));
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
                  <span className={cn('shrink-0', active ? 'opacity-100' : 'opacity-70')}>{item.icon}</span>
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
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-secondary to-brand-accent grid place-items-center text-[10px] font-bold text-white shrink-0">
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

export default TenantSidebar;
