/* Interface outline: implementation bodies removed. */
import { S } from '../state.js';

async function openNotifications();
function closeNotifications();
function localizeNotif(n);
function maybeSurfaceRefund(notifs);
async function fetchNotifPage(page);
async function loadNotifications();
async function loadMoreNotifications();
function renderNotifications();
async function markNotificationRead(id, el);
function openNotificationDetail(id);
function closeNotificationDetail();
async function refreshUnreadBadge();
async function refreshNotifications();
function notifPollTick();
function startNotifPolling();
function stopNotifPolling();
