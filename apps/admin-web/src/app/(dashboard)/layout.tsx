/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu } from 'lucide-react';
import { isAuthenticated, getAdminInfo, type AdminInfo } from '@/lib/auth';
import Sidebar from '@/components/layout/Sidebar';

  useEffect(() =>;
  setAdmin(getAdminInfo());
