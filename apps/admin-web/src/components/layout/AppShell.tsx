'use client';

import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Menu, X } from 'lucide-react';
import { Sidebar } from './Sidebar';

/** 应用壳：桌面固定侧栏 + 移动端抽屉/顶栏 + 主内容区 */
export function AppShell({ children }: { children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden">
      {/* 桌面侧栏 */}
      <div className="hidden lg:block h-full">
        <Sidebar />
      </div>

      {/* 移动端抽屉 */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawerOpen(false)} />
          <div className="absolute left-0 top-0 h-full">
            <Sidebar onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* 移动端顶栏 */}
        <header className="lg:hidden flex items-center gap-3 px-4 h-14 bg-white border-b border-outline-variant/40 shrink-0">
          <button
            className="p-1.5 rounded-lg text-on-surface hover:bg-surface-low"
            onClick={() => setDrawerOpen((v) => !v)}
            aria-label="菜单"
          >
            {drawerOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="font-display font-extrabold tracking-wide text-ink">UNIMATCHA</span>
        </header>

        <main className={clsx('flex-1 overflow-y-auto', 'px-4 py-5 lg:px-8 lg:py-7')}>
          <div className="max-w-6xl mx-auto space-y-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
