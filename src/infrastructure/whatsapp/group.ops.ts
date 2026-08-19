import { Injectable, Logger } from '@nestjs/common';
import { Chat, Client, GroupChat } from 'whatsapp-web.js';
import { WwebService } from '../services/wweb.service';
import { resolveMedia, MediaSource } from './media.util';
import { toChatId } from '../utils/phone.util';
import {
  toWhatsappException,
  WhatsappException,
} from '../filters/whatsapp.exception';
import {
  GroupDetail,
  GroupInvite,
  GroupSummary,
  MembershipRequestSummary,
  ParticipantActionResult,
} from './wweb.types';

const INVITE_BASE_URL = 'https://chat.whatsapp.com/';

/**
 * The runtime class behind the GroupChat interface. The package exports the
 * class but only publishes the interface in its typings, hence the require.
 */

const GroupChatCtor =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('whatsapp-web.js/src/structures/GroupChat') as new (
    client: Client,
    data: unknown,
  ) => GroupChat;

/** Group lifecycle and administration. */
@Injectable()
export class GroupOps {
  private readonly logger = new Logger('GroupOps');

  constructor(private readonly wweb: WwebService) {}

  async create(
    title: string,
    participants: string[],
  ): Promise<{
    groupId: string;
    title: string;
    participants: ParticipantActionResult[];
  }> {
    const ids = participants.map((p) =>
      toChatId(p, { allow: ['user', 'lid'] }),
    );

    try {
      const result = await this.wweb.withClient((client) =>
        client.createGroup(title, ids),
      );

      // The library returns a plain string when the group could not be created.
      if (typeof result === 'string') {
        throw WhatsappException.conflict(result);
      }

      return {
        groupId: result.gid?._serialized ?? '',
        title: result.title,
        participants: Object.entries(result.participants ?? {}).map(
          ([id, value]) => ({
            id,
            status: value.statusCode === 200 ? 'ok' : 'failed',
            code: value.statusCode,
            message: value.message,
          }),
        ),
      };
    } catch (error) {
      throw toWhatsappException(error, `Could not create group "${title}"`);
    }
  }

  async list(): Promise<GroupSummary[]> {
    try {
      const chats = await this.wweb.withClient((client) => client.getChats());
      return chats.filter((chat) => chat.isGroup).map(toSummary);
    } catch (error) {
      throw toWhatsappException(error, 'Could not list groups');
    }
  }

  async detail(groupId: string): Promise<GroupDetail> {
    const group = await this.fetch(groupId);
    return {
      ...toSummary(group),
      owner: group.owner?._serialized ?? null,
      createdAt: group.createdAt
        ? new Date(group.createdAt).toISOString()
        : null,
      description: group.description ?? '',
      participants: (group.participants ?? []).map((participant) => ({
        id: participant.id?._serialized ?? '',
        isAdmin: participant.isAdmin,
        isSuperAdmin: participant.isSuperAdmin,
      })),
    };
  }

  async update(
    groupId: string,
    changes: { subject?: string; description?: string },
  ): Promise<void> {
    const group = await this.fetch(groupId);
    try {
      await this.wweb.withClient(async () => {
        if (changes.subject !== undefined) {
          await group.setSubject(changes.subject);
        }
        if (changes.description !== undefined) {
          await group.setDescription(changes.description);
        }
      });
    } catch (error) {
      throw toWhatsappException(error, 'Could not update group info');
    }
  }

  /**
   * Adding participants reports per-participant outcomes (a contact may block
   * being added to groups), so a partial success is still a success.
   */
  async addParticipants(
    groupId: string,
    participants: string[],
  ): Promise<ParticipantActionResult[]> {
    const group = await this.fetch(groupId);
    const ids = participants.map((p) =>
      toChatId(p, { allow: ['user', 'lid'] }),
    );

    try {
      const result = await this.wweb.withClient(() =>
        group.addParticipants(ids),
      );

      if (typeof result === 'string') {
        throw WhatsappException.conflict(result);
      }

      // The published typings wrap the per-participant record one level deeper
      // than the runtime value, so read it through a flat shape.
      const byParticipant = result as unknown as Record<
        string,
        { code?: number; message?: string }
      >;

      return Object.entries(byParticipant).map(([id, value]) => ({
        id,
        status: value.code === 200 ? ('ok' as const) : ('failed' as const),
        code: value.code,
        message: value.message,
      }));
    } catch (error) {
      throw toWhatsappException(error, 'Could not add participants');
    }
  }

  async removeParticipants(
    groupId: string,
    participants: string[],
  ): Promise<void> {
    await this.changeParticipants(groupId, participants, 'remove');
  }

  async promoteParticipants(
    groupId: string,
    participants: string[],
  ): Promise<void> {
    await this.changeParticipants(groupId, participants, 'promote');
  }

  async demoteParticipants(
    groupId: string,
    participants: string[],
  ): Promise<void> {
    await this.changeParticipants(groupId, participants, 'demote');
  }

  private async changeParticipants(
    groupId: string,
    participants: string[],
    action: 'remove' | 'promote' | 'demote',
  ): Promise<void> {
    const group = await this.fetch(groupId);
    const ids = participants.map((p) =>
      toChatId(p, { allow: ['user', 'lid'] }),
    );

    try {
      await this.wweb.withClient(() => {
        if (action === 'remove') {
          return group.removeParticipants(ids);
        }
        if (action === 'promote') {
          return group.promoteParticipants(ids);
        }
        return group.demoteParticipants(ids);
      });
    } catch (error) {
      throw toWhatsappException(error, `Could not ${action} participants`);
    }
  }

  async updateSettings(
    groupId: string,
    settings: {
      messagesAdminsOnly?: boolean;
      infoAdminsOnly?: boolean;
      addMembersAdminsOnly?: boolean;
    },
  ): Promise<void> {
    const group = await this.fetch(groupId);

    try {
      await this.wweb.withClient(async () => {
        if (settings.messagesAdminsOnly !== undefined) {
          await group.setMessagesAdminsOnly(settings.messagesAdminsOnly);
        }
        if (settings.infoAdminsOnly !== undefined) {
          await group.setInfoAdminsOnly(settings.infoAdminsOnly);
        }
        if (settings.addMembersAdminsOnly !== undefined) {
          await group.setAddMembersAdminsOnly(settings.addMembersAdminsOnly);
        }
      });
    } catch (error) {
      throw toWhatsappException(error, 'Could not update group settings');
    }
  }

  async getInvite(groupId: string): Promise<GroupInvite> {
    const group = await this.fetch(groupId);
    try {
      const code = await this.wweb.withClient(() => group.getInviteCode());
      return { code, url: `${INVITE_BASE_URL}${code}` };
    } catch (error) {
      throw toWhatsappException(error, 'Could not get the invite code');
    }
  }

  /** Invalidates the current invite code and returns the fresh one. */
  async revokeInvite(groupId: string): Promise<GroupInvite> {
    const group = await this.fetch(groupId);
    try {
      await this.wweb.withClient(() => group.revokeInvite());
    } catch (error) {
      throw toWhatsappException(error, 'Could not revoke the invite code');
    }
    return this.getInvite(groupId);
  }

  async join(inviteCode: string): Promise<{ groupId: string }> {
    const code = inviteCode.replace(INVITE_BASE_URL, '').trim();
    try {
      const groupId = await this.wweb.withClient((client) =>
        client.acceptInvite(code),
      );
      return { groupId };
    } catch (error) {
      throw toWhatsappException(error, 'Could not join the group');
    }
  }

  async setPicture(groupId: string, source: MediaSource): Promise<void> {
    const group = await this.fetch(groupId);
    const media = await resolveMedia(source);
    try {
      await this.wweb.withClient(() => group.setPicture(media));
    } catch (error) {
      throw toWhatsappException(error, 'Could not set the group picture');
    }
  }

  async deletePicture(groupId: string): Promise<void> {
    const group = await this.fetch(groupId);
    try {
      await this.wweb.withClient(() => group.deletePicture());
    } catch (error) {
      throw toWhatsappException(error, 'Could not delete the group picture');
    }
  }

  async membershipRequests(
    groupId: string,
  ): Promise<MembershipRequestSummary[]> {
    const group = await this.fetch(groupId);
    try {
      const requests = await this.wweb.withClient(() =>
        group.getGroupMembershipRequests(),
      );
      return requests.map((request) => ({
        id: serialize(request.id),
        addedBy: request.addedBy ? serialize(request.addedBy) : null,
        requestedAt: request.t
          ? new Date(request.t * 1000).toISOString()
          : null,
      }));
    } catch (error) {
      throw toWhatsappException(error, 'Could not list membership requests');
    }
  }

  /** `requesterIds` empty means "act on every pending request". */
  async resolveMembershipRequests(
    groupId: string,
    action: 'approve' | 'reject',
    requesterIds: string[],
  ): Promise<ParticipantActionResult[]> {
    const group = await this.fetch(groupId);
    const ids = requesterIds.length
      ? requesterIds.map((p) => toChatId(p, { allow: ['user', 'lid'] }))
      : null;

    try {
      const results = await this.wweb.withClient(() =>
        action === 'approve'
          ? group.approveGroupMembershipRequests({
              requesterIds: ids,
              sleep: null,
            })
          : group.rejectGroupMembershipRequests({
              requesterIds: ids,
              sleep: null,
            }),
      );

      return results.map((result) => ({
        id: Array.isArray(result.requesterId)
          ? result.requesterId.join(',')
          : (result.requesterId ?? ''),
        status: result.error ? 'failed' : 'ok',
        code: result.error,
        message: result.message,
      }));
    } catch (error) {
      throw toWhatsappException(
        error,
        `Could not ${action} membership requests`,
      );
    }
  }

  async leave(groupId: string): Promise<void> {
    const group = await this.fetch(groupId);
    try {
      await this.wweb.withClient(() => group.leave());
      this.logger.log(`👋 Left group ${groupId}`);
    } catch (error) {
      throw toWhatsappException(error, 'Could not leave the group');
    }
  }

  /**
   * Resolves a group chat, rejecting ids that exist but are not groups so the
   * caller gets a 404 instead of a confusing failure deeper in the library.
   */
  private async fetch(groupId: string): Promise<GroupChat> {
    const chatId = toChatId(groupId, { allow: ['group'] });

    let chat: Chat | null = null;
    try {
      chat = await this.wweb.withClient((client) => client.getChatById(chatId));
    } catch (error) {
      this.logger.warn(
        `getChatById failed for ${chatId}, reading the chat directly: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return this.fetchFromPage(chatId);
    }

    if (!chat?.isGroup) {
      throw WhatsappException.notFound(`Group ${chatId}`);
    }
    return chat as GroupChat;
  }

  /**
   * Fallback for WhatsApp Web builds where the library's injected `getChat`
   * helper breaks. The GroupChat methods themselves only need a valid
   * `id._serialized` — they call WhatsApp's modules directly — so reading the
   * chat straight out of the in-page collection is enough to keep every group
   * action working, and gives real data for the read endpoints when the model
   * still serializes.
   */
  private async fetchFromPage(chatId: string): Promise<GroupChat> {
    const built = await this.wweb.withClient(async (client) => {
      const page = (client as unknown as { pupPage?: PageLike }).pupPage;
      if (!page) {
        return null;
      }

      const raw = await page.evaluate((id: string) => {
        const scope = window as unknown as {
          require: (module: string) => {
            createWid?: (value: string) => unknown;
            Chat?: { get: (wid: unknown) => unknown };
          };
        };
        const wid = scope.require('WAWebWidFactory').createWid?.(id);
        const chat = scope.require('WAWebCollections').Chat?.get(wid) as
          | { serialize?: () => unknown }
          | undefined;

        if (!chat) {
          return null;
        }
        try {
          return chat.serialize?.() ?? null;
        } catch {
          // Enough for the action endpoints even when the model will not
          // serialize on this build.
          return { id: { _serialized: id }, isGroup: true, groupMetadata: {} };
        }
      }, chatId);

      return raw ? new GroupChatCtor(client, raw) : null;
    });

    if (!built) {
      throw WhatsappException.notFound(`Group ${chatId}`);
    }
    return built;
  }
}

/** Minimal shape of the puppeteer page, to avoid depending on its types. */
interface PageLike {
  evaluate<T>(fn: (arg: string) => T, arg: string): Promise<T>;
}

function toSummary(chat: Chat): GroupSummary {
  const group = chat as GroupChat;
  return {
    id: chat.id?._serialized ?? '',
    name: chat.name,
    participantCount: group.participants?.length ?? 0,
    isReadOnly: chat.isReadOnly,
    unreadCount: chat.unreadCount,
  };
}

/** Membership request ids come back as raw wid objects. */
function serialize(wid: unknown): string {
  if (typeof wid === 'string') {
    return wid;
  }
  const candidate = wid as { _serialized?: string };
  return candidate?._serialized ?? String(wid);
}
