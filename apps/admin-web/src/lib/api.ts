/* Interface outline: implementation bodies removed. */
import axios from 'axios';

export type AdPricingModel = 'BUYOUT' | 'CPM' | 'CPC';
export type AdCampaignStatus =
export type LedgerEntryType = 'AD_SHARE' | 'SPONSOR_GRANT' | 'WITHDRAWAL' | 'ADJUSTMENT';
export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
export interface School {
export interface PricingDefaults {
export interface AdPlacement {
export interface AdDailyStatPoint {
export interface Campaign {
export interface CampaignInput {
export interface LedgerEntry {
export interface WithdrawalRequest {
export interface FinanceSummary {
export interface AdsOverview {
export interface RevenueReportRow {
export type SquareBoard = 'RECOMMEND' | 'CAMPUS_WALL';
export type SquareAuthorType = 'USER' | 'STUDENT_UNION' | 'TEAM' | 'SPONSOR';
export interface AdminSquarePost {
export interface AdminReport {
  deleteOfficialPost(id, reason);
export type PublicSubmissionType = 'SPONSOR' | 'WAITLIST';
export type PublicSubmissionStatus = 'PENDING' | 'CONTACTED' | 'APPROVED' | 'REJECTED';
export interface AdminSubmission {
type?: PublicSubmissionType | string;
export interface ConvertSubmissionInput {
export type PollReviewStatus = 'pending' | 'approved' | 'rejected';
export interface AdminPollPost {
export type AdminEventStatus = 'published' | 'closed' | 'cancelled';
export type AdminTicketStatus = 'valid' | 'used' | 'cancelled';
export interface AdminEvent {
export interface AdminEventTicket {
export interface AdminEventInput {
