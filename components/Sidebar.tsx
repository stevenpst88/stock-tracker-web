'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const links = [
  { to: '/', label: '總覽', icon: '◈' },
  { to: '/holdings', label: '持倉', icon: '⊞' },
  { to: '/transactions', label: '交易紀錄', icon: '≡' },
  { to: '/analysis', label: '分析', icon: '◉' },
  { to: '/radar', label: '雷達', icon: '⊕' },
  { to: '/settings', label: '設定', icon: '⚙' },
];

export default function Sidebar({ userEmail }: { userEmail?: string }) {
  const pathname = usePathname();

  return (
    <aside className="w-52 flex flex-col bg-slate-900 border-r border-slate-800 shrink-0">
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="text-sm font-bold text-slate-100">Stock Tracker</div>
        {userEmail && (
          <div className="text-[10px] text-slate-500 truncate mt-1" title={userEmail}>
            {userEmail}
          </div>
        )}
      </div>
      <nav className="flex-1 px-2 py-2 space-y-1">
        {links.map((l) => {
          const isActive = l.to === '/' ? pathname === '/' : pathname.startsWith(l.to);
          return (
            <Link
              key={l.to}
              href={l.to}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
              )}
            >
              <span className="text-base leading-none">{l.icon}</span>
              {l.label}
            </Link>
          );
        })}
      </nav>
      <form
        action="/api/auth/signout"
        method="POST"
        className="px-2 py-2 border-t border-slate-800"
      >
        <button
          type="submit"
          className="w-full text-left px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-100 transition-colors"
        >
          登出
        </button>
      </form>
    </aside>
  );
}
