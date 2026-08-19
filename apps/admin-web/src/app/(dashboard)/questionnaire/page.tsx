/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Plus, ExternalLink, CheckCircle2, Clock, FileText, BarChart } from 'lucide-react';
import { getQVersions, createQVersion, publishQVersion } from '@/lib/api';
import {
  PageHeader,
  Card,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  RoleGate,
} from '@/components/ui';
import { formatDate } from '@/lib/format';

function QuestionnaireInner();
  useEffect(() =>;
  setVersions((res as any).data || []);
  setCreating(true);
  setShowCreate(false);
  setNewTitle('');
  setNewType('ROMANTIC');
  loadVersions();
  setPublishing(true);
  setPublishId(null);
  loadVersions();
type="text"
