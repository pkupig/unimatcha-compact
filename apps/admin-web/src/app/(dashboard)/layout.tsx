'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { isAuthenticated, getAdminInfo, type AdminInfo } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [admin, setAdmin] = useState<AdminInfo | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    setAdmin(getAdminInfo());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-surface flex">
      <Sidebar admin={admin} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-10 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-surface-high transition-colors"
            aria-label="打开菜单"
          >
            <Menu size={20} />
          </button>
          <span className="font-display font-extrabold tracking-tighter text-on-surface">
            UniMatcha
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-neon" aria-hidden />
        </header>

        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
