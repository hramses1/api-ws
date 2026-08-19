/**
 * Types returned by the *Ops services. Nothing from whatsapp-web.js crosses
 * this boundary: features/ depends on these shapes only.
 */

export interface MessageSummary {
  id: string;
  chatId: string;
  from: string;
  to: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  hasMedia: boolean;
  type: string;
  isStarred?: boolean;
  isForwarded?: boolean;
}

export interface BulkItemResult {
  to: string;
  status: 'sent' | 'failed';
  messageId?: string;
  error?: string;
}

export interface BulkResult {
  total: number;
  sent: number;
  failed: number;
  results: BulkItemResult[];
}

export interface GroupParticipantSummary {
  id: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface GroupSummary {
  id: string;
  name: string;
  participantCount: number;
  isReadOnly: boolean;
  unreadCount: number;
}

export interface GroupDetail extends GroupSummary {
  owner: string | null;
  createdAt: string | null;
  description: string;
  participants: GroupParticipantSummary[];
}

export interface GroupInvite {
  code: string;
  url: string;
}

export interface MembershipRequestSummary {
  id: string;
  addedBy: string | null;
  requestedAt: string | null;
}

export interface ParticipantActionResult {
  id: string;
  status: 'ok' | 'failed';
  code?: number;
  message?: string;
}
