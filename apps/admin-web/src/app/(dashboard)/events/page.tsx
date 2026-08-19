/* Interface outline: implementation bodies removed. */
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { CalendarDays, ScanLine, Ticket, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  getAdminEvents,
  createAdminEvent,
  updateAdminEventStatus,
  getAdminEventTickets,
  checkinEventTicket,
  type AdminEvent,
  type AdminEventStatus,
  type AdminEventTicket,
  type AdminEventInput,
} from '@/lib/api';
import { isTeam } from '@/lib/auth';
import { formatDateTime, formatNumber, fenToYuan } from '@/lib/format';
import {
  PageHeader,
  DataTable,
  Badge,
  Modal,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  Money,
  RoleGate,
  useAdminInfo,
  type Column,
  type BadgeVariant,
} from '@/components/ui';

type AdminEvent,
type AdminEventStatus,
type AdminEventTicket,
type AdminEventInput,
type Column,
type BadgeVariant,
function normalizeList<T = any>(data: any):;
function localToIso(value: string): string | undefined;
function Pager(...);
function CheckinBar(...);
  setLoading(true);
  setResult(...);
  setCode('');
  onCheckedIn();
  setResult(...);
  setLoading(false);
function CreateEventModal(...);
  setForm((f) =>(...);
  setForm(...);
  onClose();
  setSubmitting(true);
  setForm(...);
  onClose();
  onCreated();
  setSubmitting(false);
type="datetime-local"
type="datetime-local"
type="number"
type="number"
function TicketsModal(...);
  useEffect(() =>;
  setLoading(true);
  setTickets([]);
  getAdminEventTickets(eventId);
  setTickets(data.tickets || []);
  setSummary(...);
function EventsInner();
  setLoading(true);
  setItems(items);
  setTotal(total);
  useEffect(() =>;
  load();
  setStatusUpdatingId(ev.id);
  load();
  setStatusUpdatingId(null);
  setSubmitting(true);
  setCancelTarget(null);
  load();
  setSubmitting(false);
  setTicketsEvent(ev);
  handleStatus(ev, 'closed');
  handleStatus(ev, 'published');
  setCancelTarget(ev);
  setPage(1);
  load();
