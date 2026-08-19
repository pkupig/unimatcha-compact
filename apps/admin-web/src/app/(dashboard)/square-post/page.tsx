/* Interface outline: implementation bodies removed. */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Send, Megaphone, Plus, X, ShieldAlert } from 'lucide-react';
import { createOfficialPost } from '@/lib/api';
import { getAdminInfo, type AdminRole } from '@/lib/auth';
import {
  PageHeader,
  Card,
  Badge,
  EmptyState,
  Field,
  Input,
  Textarea,
  RoleGate,
} from '@/components/ui';

type AuthorType = 'STUDENT_UNION' | 'TEAM' | 'SPONSOR';
function SquarePostInner();
  useEffect(() =>;
  setAdmin(info);
  setSchool(info?.schoolName || info?.schoolId || '');
  setIsSponsored(true);
  setImages([...images, url]);
  setImageInput('');
  setSubmitting(true);
  setTitle('');
  setContent('');
  setImages([]);
  setImageInput('');
  setSubmitting(false);
type="button"
type="text"
type="text"
type="url"
type="button"
type="button"
