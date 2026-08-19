/* Interface outline: implementation bodies removed. */
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  LayoutDashboard,
  Users,
  School,
  ShieldCheck,
  Megaphone,
  ShieldAlert,
  CalendarDays,
  Banknote,
  Inbox,
  Send,
  ClipboardList,
  Zap,
  Settings,
  Store,
  Wallet,
  User,
  LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { clearAuth, isTeam, isUnion, ROLE_LABELS, type AdminInfo } from '@/lib/auth';

interface NavItem {
function navForAdmin(admin: AdminInfo | null): NavItem[];
  clearAuth();
