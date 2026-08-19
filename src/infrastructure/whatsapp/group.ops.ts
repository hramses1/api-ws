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
import { serializeWid } from './message-id.util';

const INVITE_BASE_URL = 'https://chat.whatsapp.com/';

/** What WhatsApp answers to an add-participants request. */
interface AddParticipantsPayload {
  status?: number;
  participants?: Array<{
    userWid?: unknown;
    username?: string | null;
    code?: string | number;
    invite_code?: string;
  }>;
}

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
        groupId: serializeWid(result.gid),
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
      owner: serializeWid(group.owner) || null,
      createdAt: toIsoDate(group.createdAt),
      description: group.description ?? '',
      participants: (group.participants ?? []).map((participant) => ({
        id: serializeWid(participant.id),
        isAdmin: participant.isAdmin,
        isSuperAdmin: participant.isSuperAdmin,
      })),
    };
  }

  async update(
    groupId: string,
    changes: { subject?: string; description?: string },
  ): Promise<void> {
    if (changes.subject !== undefined) {
      const group = await this.fetch(groupId);
      try {
        await this.wweb.withClient(() => group.setSubject(changes.subject!));
      } catch (error) {
        throw toWhatsappException(error, 'Could not update the group subject');
      }
    }

    if (changes.description !== undefined) {
      await this.setDescription(groupId, changes.description);
    }
  }

  /**
   * Set in-page rather than through the library: its implementation reads
   * `chat.groupMetadata.descId` unguarded, and a group that never had a
   * description has none, which blows up before the call is even made.
   */
  private async setDescription(
    groupId: string,
    description: string,
  ): Promise<void> {
    const chatId = toChatId(groupId, { allow: ['group'] });

    try {
      const failure = await this.inPage(
        (payload: string) => {
          const { id, description: text } = JSON.parse(payload) as {
            id: string;
            description: string;
          };
          const scope = window as unknown as {
            require: (m: string) => Record<string, unknown>;
            WWebJS: { getChat: (id: string, o: unknown) => Promise<unknown> };
          };

          const factory = scope.require('WAWebWidFactory') as {
            createWid: (v: string) => unknown;
          };
          const wid = factory.createWid(id);

          return Promise.resolve(
            scope.WWebJS.getChat(id, { getAsModel: false }),
          )
            .then(async (chat) => {
              const metadata = (chat as { groupMetadata?: { descId?: string } })
                ?.groupMetadata;
              const keys = scope.require('WAWebMsgKey') as {
                newId: () => Promise<string> | string;
              };
              const newId = await keys.newId();
              // Current builds take a single options object; whatsapp-web.js
              // still calls it with four positional arguments, which is why its
              // own setDescription fails reading `.toJid()` of undefined.
              const job = scope.require('WAWebGroupModifyInfoJob') as {
                setGroupDescription: (options: {
                  groupWid: unknown;
                  description: string;
                  descId: unknown;
                  prevDescId?: string;
                }) => Promise<unknown>;
              };
              await job.setGroupDescription({
                groupWid: wid,
                description: text,
                descId: newId,
                prevDescId: metadata?.descId,
              });
              return '';
            })
            .catch((err: Error) => String(err?.message ?? err) || 'unknown');
        },
        JSON.stringify({ id: chatId, description }),
      );

      if (failure) {
        throw new Error(failure);
      }
    } catch (error) {
      throw toWhatsappException(
        error,
        'Could not update the group description',
      );
    }
  }

  /**
   * Adding participants reports per-participant outcomes (a contact may block
   * being added to groups), so a partial success is still a success.
   */
  /**
   * Adds participants.
   *
   * Not delegated to the library: it resolves each number through WhatsApp's
   * contact store first, and for a number that is not in the address book that
   * path dies with "this.findImpl is not a function". Handing the group action
   * plain Wids skips the lookup entirely.
   */
  async addParticipants(
    groupId: string,
    participants: string[],
  ): Promise<ParticipantActionResult[]> {
    const chatId = toChatId(groupId, { allow: ['group'] });
    const wanted = participants.map((p) =>
      toChatId(p, { allow: ['user', 'lid'] }),
    );

    const raw = await this.inPage(
      (payload: string) => {
        const { id, ids } = JSON.parse(payload) as {
          id: string;
          ids: string[];
        };
        const scope = window as unknown as {
          require: (m: string) => Record<string, unknown>;
          WWebJS: { getChat: (i: string, o: unknown) => Promise<unknown> };
        };

        const factory = scope.require('WAWebWidFactory') as {
          createWid: (v: string) => unknown;
        };
        const wids = ids.map((value) => factory.createWid(value));

        return Promise.resolve(scope.WWebJS.getChat(id, { getAsModel: false }))
          .then(async (chat) => {
            const action = scope.require(
              'WAWebModifyParticipantsGroupAction',
            ) as {
              addParticipants: (
                chat: unknown,
                targets: unknown[],
              ) => Promise<unknown>;
            };
            const collections = scope.require('WAWebCollections') as {
              Contact?: {
                get: (w: unknown) => unknown;
                find?: (w: unknown) => Promise<unknown>;
              };
            };
            const contacts = await Promise.all(
              wids.map(async (w) => {
                const cached = collections.Contact?.get(w);
                if (cached) return cached;
                try {
                  return (await collections.Contact?.find?.(w)) ?? undefined;
                } catch {
                  return undefined;
                }
              }),
            );

            const targets = contacts.filter(Boolean);
            if (targets.length === 0) {
              return JSON.stringify({
                ok: false,
                error: 'WhatsApp does not know those numbers',
              });
            }

            try {
              const result = await action.addParticipants(chat, targets);
              return JSON.stringify({ ok: true, result });
            } catch (err) {
              return JSON.stringify({
                ok: false,
                error: String((err as Error)?.message).slice(0, 200),
              });
            }
          })
          .catch((err: Error) =>
            JSON.stringify({
              ok: false,
              error: String(err?.message ?? err).slice(0, 200),
            }),
          );
      },
      JSON.stringify({ id: chatId, ids: wanted }),
    );

    // Same convention as the other in-page operations: nothing back means
    // nothing went wrong.
    const outcome = raw
      ? (JSON.parse(raw) as {
          ok: boolean;
          error?: string;
          result?: AddParticipantsPayload;
        })
      : { ok: true, result: undefined };

    if (!outcome.ok) {
      throw toWhatsappException(
        new Error(outcome.error ?? 'unknown'),
        'Could not add participants',
      );
    }

    const entries = outcome.result?.participants ?? [];
    if (entries.length === 0) {
      return wanted.map((id) => ({ id, status: 'ok' as const }));
    }

    return entries.map((entry) => {
      const code = Number(entry.code ?? 0);
      const id =
        serializeWid(entry.userWid) ||
        (typeof entry.userWid === 'string' ? entry.userWid : '');

      if (code === 200 || code === 0) {
        return { id, status: 'ok' as const, code };
      }

      // 403 with an invite code: the person restricts who can add them, so
      // WhatsApp hands back a link to send them instead of adding them.
      if (entry.invite_code) {
        return {
          id,
          status: 'invited' as const,
          code,
          message:
            'Their privacy settings do not allow being added directly. Send them the invite link.',
          inviteUrl: `${INVITE_BASE_URL}${entry.invite_code.replace(/^\//, '')}`,
        };
      }

      return {
        id,
        status: 'failed' as const,
        code,
        message: entry.username ?? undefined,
      };
    });
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

  /**
   * Promote, demote or remove participants.
   *
   * Not delegated to the library: it resolves each participant through its own
   * lid/phone lookup, which comes back empty on current builds — group members
   * are keyed by `@lid` while callers pass phone numbers — so it ends up asking
   * WhatsApp to act on an empty list. Matching against the group's own roster
   * (by lid or by phone) is what makes this work.
   */
  private async changeParticipants(
    groupId: string,
    participants: string[],
    action: 'remove' | 'promote' | 'demote',
  ): Promise<void> {
    const chatId = toChatId(groupId, { allow: ['group'] });
    const wanted = participants.map((p) =>
      toChatId(p, { allow: ['user', 'lid'] }),
    );

    const outcome = await this.inPage(
      (payload: string) => {
        const { id, ids, method } = JSON.parse(payload) as {
          id: string;
          ids: string[];
          method: string;
        };

        const scope = window as unknown as {
          require: (m: string) => Record<string, unknown>;
          WWebJS: { getChat: (i: string, o: unknown) => Promise<unknown> };
        };

        return Promise.resolve(scope.WWebJS.getChat(id, { getAsModel: false }))
          .then(async (chat) => {
            const roster = (
              chat as {
                groupMetadata?: {
                  participants?: {
                    getModelsArray?: () => Array<Record<string, unknown>>;
                  };
                };
              }
            )?.groupMetadata?.participants;

            const models = roster?.getModelsArray?.() ?? [];
            const migration = scope.require('WAWebLidMigrationUtils') as {
              toPn?: (wid: unknown) => { _serialized?: string } | undefined;
            };

            const targets = models.filter((model) => {
              const wid = model.id as { _serialized?: string } | undefined;
              const serialized = wid?._serialized;
              const phone = migration.toPn?.(wid)?._serialized;
              return (
                (serialized !== undefined && ids.includes(serialized)) ||
                (phone !== undefined && ids.includes(phone))
              );
            });

            if (targets.length === 0) {
              return 'NOT_IN_GROUP';
            }

            const actions = scope.require(
              'WAWebModifyParticipantsGroupAction',
            ) as Record<
              string,
              (chat: unknown, targets: unknown[]) => Promise<unknown>
            >;

            await actions[method](chat, targets);
            return '';
          })
          .catch((err: Error) => String(err?.message ?? err) || 'unknown');
      },
      JSON.stringify({
        id: chatId,
        ids: wanted,
        method: `${action}Participants`,
      }),
    );

    if (outcome === 'NOT_IN_GROUP') {
      throw WhatsappException.notFound(
        `None of those participants belong to ${chatId}`,
      );
    }
    if (outcome) {
      throw toWhatsappException(
        new Error(outcome),
        `Could not ${action} participants`,
      );
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

  /**
   * Invalidates the current invite code and returns the fresh one.
   *
   * Not delegated to the library: it looks resetGroupInviteCode up on
   * WAWebGroupQueryJob, while the function lives on WAWebGroupInviteJob, so its
   * own call fails with an undefined-is-not-a-function error.
   */
  async revokeInvite(groupId: string): Promise<GroupInvite> {
    const chatId = toChatId(groupId, { allow: ['group'] });

    try {
      const code = await this.inPage((id: string) => {
        const scope = window as unknown as {
          require: (m: string) => {
            createWid?: (v: string) => unknown;
            resetGroupInviteCode?: (wid: unknown) => Promise<{ code?: string }>;
          };
        };
        const wid = scope.require('WAWebWidFactory').createWid?.(id);
        const job = scope.require('WAWebGroupInviteJob');
        return Promise.resolve(job.resetGroupInviteCode?.(wid)).then(
          (res) => res?.code ?? '',
        );
      }, chatId);

      if (!code) {
        return this.getInvite(chatId);
      }
      return { code, url: `${INVITE_BASE_URL}${code}` };
    } catch (error) {
      throw toWhatsappException(error, 'Could not revoke the invite code');
    }
  }

  async join(inviteCode: string): Promise<{ groupId: string }> {
    const code = inviteCode.replace(INVITE_BASE_URL, '').trim();
    try {
      const groupId = await this.wweb.withClient((client) =>
        client.acceptInvite(code),
      );
      return { groupId };
    } catch (error) {
      // The library surfaces a minified error here whatever went wrong, and in
      // practice the code is either wrong, expired or already used.
      throw toWhatsappException(
        error,
        `Could not join with invite code "${code}" (wrong, expired or already used)`,
      );
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

  /**
   * Deletes the conversation itself. Leaving a group only removes you from it;
   * the chat stays in the list until it is deleted, which is a separate action.
   */
  async deleteChat(groupId: string): Promise<boolean> {
    const chatId = toChatId(groupId, { allow: ['group'] });

    try {
      return await this.inPage((id: string) => {
        const scope = window as unknown as {
          WWebJS: { sendDeleteChat: (i: string) => Promise<boolean> };
        };
        return scope.WWebJS.sendDeleteChat(id);
      }, chatId);
    } catch (error) {
      throw toWhatsappException(error, `Could not delete the chat ${chatId}`);
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
   * Runs code inside the WhatsApp Web page. Needed where whatsapp-web.js calls
   * an internal module that moved or disappeared in the current build.
   */
  private async inPage<T>(
    fn: (payload: string) => T | Promise<T>,
    payload: string,
  ): Promise<T> {
    return this.wweb.withClient(async (client) => {
      const page = (client as unknown as { pupPage?: PageLike }).pupPage;
      if (!page) {
        throw WhatsappException.unavailable('Browser page not available');
      }
      return page.evaluate(fn, payload);
    });
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
    id: serializeWid(chat.id),
    name: chat.name ?? '',
    participantCount: group.participants?.length ?? 0,
    isReadOnly: chat.isReadOnly ?? false,
    unreadCount: chat.unreadCount ?? 0,
  };
}

/**
 * A group we already left comes back without a usable creation date, and
 * `new Date(undefined).toISOString()` throws "Invalid time value" — which used
 * to surface as a 500 on an otherwise fine request.
 */
function toIsoDate(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Membership request ids come back as raw wid objects. */
function serialize(wid: unknown): string {
  if (typeof wid === 'string') {
    return wid;
  }
  const candidate = wid as { _serialized?: string };
  return candidate?._serialized ?? String(wid);
}
