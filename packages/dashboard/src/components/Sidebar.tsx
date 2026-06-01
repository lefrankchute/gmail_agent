'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/',                  label: 'Resumen',     icon: '◎' },
  { href: '/emails',            label: 'Correos',     icon: '✉' },
  { href: '/finance',           label: 'Finanzas',    icon: '₿' },
  { href: '/finance/reports',   label: 'Informes',    icon: '⊞' },
  { href: '/config',            label: 'Config',      icon: '⚙' },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-slate-900 flex flex-col z-10">
      <div className="px-5 py-5 border-b border-slate-700">
        <span className="text-white font-semibold text-sm tracking-wide">Gmail Agent</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ href, label, icon }) => {
          const active = href === '/' ? path === '/' : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-base">{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-3 border-t border-slate-700">
        <p className="text-slate-500 text-xs">fpabon10@gmail.com</p>
      </div>
    </aside>
  );
}
