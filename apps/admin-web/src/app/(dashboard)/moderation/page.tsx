/* Interface outline: implementation bodies removed. */
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ShieldAlert, MessageSquareWarning, Inbox, Vote } from 'lucide-react';
import {
  getSquarePostsAdmin,
  deleteSquarePostAdmin,
  restoreSquarePost,
  dismissPostReports,
  getAdminReports,
  updateAdminReport,
  getAdminPolls,
  reviewAdminPoll,
  type AdminSquarePost,
  type AdminReport,
  type SquareAuthorType,
  type AdminPollPost,
  type PollReviewStatus,
} from '@/lib/api';
import { isTeam } from '@/lib/auth';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  PageHeader,
  DataTable,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  Tabs,
  Field,
  Input,
  Select,
  Textarea,
  RoleGate,
  useAdminInfo,
  type Column,
  type BadgeVariant,
} from '@/components/ui';

type AdminSquarePost,
type AdminReport,
type SquareAuthorType,
type AdminPollPost,
type PollReviewStatus,
type Column,
type BadgeVariant,
function normalizeList<T = any>(data: any):;
function useDebounced<T>(value: T, delay = 400): T;
  useEffect(() =>;
function Pager(...);
function hiddenNote(p: AdminSquarePost): string;
function AuthorCell(...);
function PostsPanel(...);
  useEffect(() =>;
  setPage(1);
  setLoading(true);
  setItems(items);
  setTotal(total);
  useEffect(() =>;
  load();
  setTakedownTarget(null);
  setTakedownReason('');
  setSubmitting(true);
  closeTakedown();
  load();
  setSubmitting(false);
  setSubmitting(true);
  setRestoreTarget(null);
  load();
  setSubmitting(false);
  setSubmitting(true);
  setDismissTarget(null);
  load();
  setSubmitting(false);
  setViewPost(p);
  setDismissTarget(p);
  setRestoreTarget(p);
  setTakedownTarget(p);
function pollStatusVariant(status?: string | null): BadgeVariant;
function PollsPanel(...);
  setLoading(true);
  setItems(items);
  setTotal(total);
  useEffect(() =>;
  load();
  setSubmitting(true);
  setApproveTarget(null);
  load();
  setSubmitting(false);
  setRejectTarget(null);
  setRejectNote('');
  setSubmitting(true);
  closeReject();
  load();
  setSubmitting(false);
  setApproveTarget(p);
  setRejectTarget(p);
  setStatus(e.target.value as PollReviewStatus);
  setPage(1);
function FeedbackPanel();
  setLoading(true);
  setItems(items);
  setTotal(total);
  useEffect(() =>;
  load();
  setResolvingId(r.id);
  load();
  setResolvingId(null);
  setViewReport(r);
  handleResolve(r);
  setStatus(e.target.value);
  setPage(1);
function ModerationInner();
