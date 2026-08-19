/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Plus, Search } from 'lucide-react';
import { getSchools, createSchool, type School } from '@/lib/api';
import { formatNumber, bpsToPercent } from '@/lib/format';
import {
  PageHeader,
  Card,
  DataTable,
  Badge,
  Modal,
  Money,
  RoleGate,
  Field,
  Input,
  Select,
  type Column,
} from '@/components/ui';

type Column,
function SchoolsContent();
  useEffect(() =>;
  load();
  setLoading(true);
  setSchools(data.items || []);
  setTotal(data.total || 0);
  setLoading(false);
  setSaving(true);
  setShowCreate(false);
  setName('');
  setCity('');
  load();
  setSaving(false);
  setSearch(e.target.value);
  setPage(1);
  setActiveFilter(e.target.value);
  setPage(1);
