import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { WwebService } from './../src/infrastructure/services/wweb.service';
import { AllExceptionsFilter } from './../src/infrastructure/filters/all-exceptions.filter';

/**
 * Exhaustive endpoint sweep: every route the app registers is exercised with a
 * valid payload against a fake WhatsApp client, and a coverage guard fails if a
 * registered route is missing from the table below. This cannot prove the real
 * WhatsApp behaviour (that needs a linked session), but it does prove no
 * endpoint is unwired, mis-validated or crashing.
 */

const GROUP_ID = '120363000000000000@g.us';
const MESSAGE_ID = 'true_573001234567@c.us_3EB0ABC123';

const messageMock = {
  id: { _serialized: MESSAGE_ID },
  from: '573001234567@c.us',
  to: '573009999999@c.us',
  body: 'Hola',
  fromMe: true,
  timestamp: 1755500000,
  hasMedia: false,
  type: 'chat',
  isStarred: false,
  isForwarded: false,
  delete: () => Promise.resolve(),
  edit: () => Promise.resolve(null),
  react: () => Promise.resolve(),
  forward: () => Promise.resolve(),
  star: () => Promise.resolve(),
  unstar: () => Promise.resolve(),
  pin: () => Promise.resolve(true),
  unpin: () => Promise.resolve(true),
};

const groupMock = {
  id: { _serialized: GROUP_ID },
  name: 'Equipo',
  isGroup: true,
  isReadOnly: false,
  unreadCount: 0,
  owner: { _serialized: '573009999999@c.us' },
  createdAt: new Date('2026-01-15T18:20:00.000Z'),
  description: 'Grupo de prueba',
  participants: [
    {
      id: { _serialized: '573001111111@c.us' },
      isAdmin: true,
      isSuperAdmin: false,
    },
  ],
  addParticipants: () =>
    Promise.resolve({
      '573001111111@c.us': { code: 200, message: 'ok', isInviteV4Sent: false },
    }),
  removeParticipants: () => Promise.resolve({ status: 200 }),
  promoteParticipants: () => Promise.resolve({ status: 200 }),
  demoteParticipants: () => Promise.resolve({ status: 200 }),
  setSubject: () => Promise.resolve(true),
  setDescription: () => Promise.resolve(true),
  setMessagesAdminsOnly: () => Promise.resolve(true),
  setInfoAdminsOnly: () => Promise.resolve(true),
  setAddMembersAdminsOnly: () => Promise.resolve(true),
  getGroupMembershipRequests: () =>
    Promise.resolve([
      {
        id: { _serialized: '573002222222@c.us' },
        addedBy: null,
        t: 1755500000,
      },
    ]),
  approveGroupMembershipRequests: () =>
    Promise.resolve([{ requesterId: '573002222222@c.us', message: 'ok' }]),
  rejectGroupMembershipRequests: () =>
    Promise.resolve([{ requesterId: '573002222222@c.us', message: 'ok' }]),
  getInviteCode: () => Promise.resolve('AbCdEf1234567'),
  revokeInvite: () => Promise.resolve(),
  leave: () => Promise.resolve(),
  setPicture: () => Promise.resolve(true),
  deletePicture: () => Promise.resolve(true),
};

const clientMock = {
  sendMessage: () => Promise.resolve({ id: { _serialized: MESSAGE_ID } }),
  isRegisteredUser: () => Promise.resolve(true),
  getChats: () => Promise.resolve([groupMock]),
  getChatById: () => Promise.resolve(groupMock),
  getMessageById: () => Promise.resolve(messageMock),
  createGroup: () =>
    Promise.resolve({
      title: 'Equipo',
      gid: { _serialized: GROUP_ID },
      participants: {
        '573001111111@c.us': {
          statusCode: 200,
          message: 'ok',
          isGroupCreator: false,
          isInviteV4Sent: false,
        },
      },
    }),
  acceptInvite: () => Promise.resolve(GROUP_ID),
};

const wwebMock = {
  getStatus: () => ({ status: 'READY', qrAvailable: false, webVersion: null }),
  getPoolStats: () => ({ inFlight: 0, queued: 0, limit: 5 }),
  withClient: <T>(fn: (client: typeof clientMock) => Promise<T>) =>
    fn(clientMock),
  expectOutgoingId: () => ({
    promise: Promise.resolve(''),
    cancel: () => undefined,
  }),
  getQr: () => 'raw-qr-string',
  getQrPng: () => 'data:image/png;base64,AAA',
  getLoggedInUserInfo: () => ({
    number: '573001234567',
    pushname: 'Test',
    platform: 'web',
  }),
  logout: () => Promise.resolve(),
};

interface Case {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  /** Path as registered by Nest, e.g. /api/whatsapp/messages/:id */
  route: string;
  /** Concrete URL to call. */
  url: string;
  body?: Record<string, unknown>;
  expected: number;
}

const CASES: Case[] = [
  // --- session / health -----------------------------------------------------
  { method: 'get', route: '/api/health', url: '/api/health', expected: 200 },
  {
    method: 'get',
    route: '/api/whatsapp/status',
    url: '/api/whatsapp/status',
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/qr',
    url: '/api/whatsapp/qr',
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/get-session-qr-code',
    url: '/api/whatsapp/get-session-qr-code',
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/get-logged-in-user-info',
    url: '/api/whatsapp/get-logged-in-user-info',
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/logout',
    url: '/api/whatsapp/logout',
    expected: 200,
  },
  // --- chat history ---------------------------------------------------------
  {
    method: 'get',
    route: '/api/whatsapp/chats',
    url: '/api/whatsapp/chats',
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/chat-history',
    url: '/api/whatsapp/chat-history?cellPhone=573001234567',
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/chat-history/:chatId',
    url: '/api/whatsapp/chat-history/573001234567%40c.us',
    expected: 200,
  },
  // --- legacy ---------------------------------------------------------------
  {
    method: 'post',
    route: '/api/whatsapp/send-message',
    url: '/api/whatsapp/send-message',
    body: { cellPhone: '573001234567', message: 'Hola' },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/send-media',
    url: '/api/whatsapp/send-media',
    body: { cellPhone: '573001234567', base64: 'AAA', mimetype: 'image/png' },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/reply-message',
    url: '/api/whatsapp/reply-message',
    body: {
      cellPhone: '573001234567',
      message: 'Hola',
      quotedMessageId: MESSAGE_ID,
    },
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/check-number',
    url: '/api/whatsapp/check-number?cellPhone=573001234567',
    expected: 200,
  },
  // --- messages -------------------------------------------------------------
  {
    method: 'post',
    route: '/api/whatsapp/messages/send',
    url: '/api/whatsapp/messages/send',
    body: { to: '573001234567', message: 'Hola' },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/messages/bulk',
    url: '/api/whatsapp/messages/bulk',
    body: { recipients: ['573001111111', '573002222222'], message: 'Hola' },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/messages/media',
    url: '/api/whatsapp/messages/media',
    body: { to: '573001234567', base64: 'AAA', mimetype: 'image/png' },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/messages/media/bulk',
    url: '/api/whatsapp/messages/media/bulk',
    body: {
      recipients: ['573001111111'],
      base64: 'AAA',
      mimetype: 'image/png',
    },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/messages/reply',
    url: '/api/whatsapp/messages/reply',
    body: { to: '573001234567', message: 'Hola', quotedMessageId: MESSAGE_ID },
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/messages/:id',
    url: `/api/whatsapp/messages/${encodeURIComponent(MESSAGE_ID)}`,
    expected: 200,
  },
  {
    method: 'delete',
    route: '/api/whatsapp/messages/:id',
    url: `/api/whatsapp/messages/${encodeURIComponent(MESSAGE_ID)}?everyone=true`,
    expected: 200,
  },
  {
    method: 'patch',
    route: '/api/whatsapp/messages/:id',
    url: `/api/whatsapp/messages/${encodeURIComponent(MESSAGE_ID)}`,
    body: { message: 'Corregido' },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/messages/:id/react',
    url: `/api/whatsapp/messages/${encodeURIComponent(MESSAGE_ID)}/react`,
    body: { reaction: '👍' },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/messages/:id/forward',
    url: `/api/whatsapp/messages/${encodeURIComponent(MESSAGE_ID)}/forward`,
    body: { to: '573009999999' },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/messages/:id/star',
    url: `/api/whatsapp/messages/${encodeURIComponent(MESSAGE_ID)}/star`,
    body: { starred: true },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/messages/:id/pin',
    url: `/api/whatsapp/messages/${encodeURIComponent(MESSAGE_ID)}/pin`,
    body: { pinned: true, durationSeconds: 3600 },
    expected: 200,
  },
  // --- groups ---------------------------------------------------------------
  {
    method: 'post',
    route: '/api/whatsapp/groups',
    url: '/api/whatsapp/groups',
    body: { title: 'Equipo', participants: ['573001111111'] },
    expected: 201,
  },
  {
    method: 'get',
    route: '/api/whatsapp/groups',
    url: '/api/whatsapp/groups',
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/groups/join',
    url: '/api/whatsapp/groups/join',
    body: { inviteCode: 'AbCdEf1234567' },
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/groups/:id',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}`,
    expected: 200,
  },
  {
    method: 'patch',
    route: '/api/whatsapp/groups/:id',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}`,
    body: { subject: 'Nuevo', description: 'Otra' },
    expected: 200,
  },
  {
    method: 'delete',
    route: '/api/whatsapp/groups/:id',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}`,
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/groups/:id/participants',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/participants`,
    body: { participants: ['573001111111'] },
    expected: 200,
  },
  {
    method: 'delete',
    route: '/api/whatsapp/groups/:id/participants',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/participants`,
    body: { participants: ['573001111111'] },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/groups/:id/participants/promote',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/participants/promote`,
    body: { participants: ['573001111111'] },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/groups/:id/participants/demote',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/participants/demote`,
    body: { participants: ['573001111111'] },
    expected: 200,
  },
  {
    method: 'patch',
    route: '/api/whatsapp/groups/:id/settings',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/settings`,
    body: { messagesAdminsOnly: true, infoAdminsOnly: true },
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/groups/:id/invite',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/invite`,
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/groups/:id/invite/revoke',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/invite/revoke`,
    expected: 200,
  },
  {
    method: 'put',
    route: '/api/whatsapp/groups/:id/picture',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/picture`,
    body: { base64: 'AAA', mimetype: 'image/png' },
    expected: 200,
  },
  {
    method: 'delete',
    route: '/api/whatsapp/groups/:id/picture',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/picture`,
    expected: 200,
  },
  {
    method: 'get',
    route: '/api/whatsapp/groups/:id/membership-requests',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/membership-requests`,
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/groups/:id/membership-requests/approve',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/membership-requests/approve`,
    body: { requesterIds: ['573002222222'] },
    expected: 200,
  },
  {
    method: 'post',
    route: '/api/whatsapp/groups/:id/membership-requests/reject',
    url: `/api/whatsapp/groups/${encodeURIComponent(GROUP_ID)}/membership-requests/reject`,
    body: {},
    expected: 200,
  },
];

interface ExpressLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe('every endpoint (e2e, fake WhatsApp client)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    delete process.env.API_KEY;
    // The sweep fires far more than 30 requests, so the throttler would start
    // answering 429 halfway through and mask real failures.
    process.env.THROTTLE_LIMIT = '10000';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(WwebService)
      .useValue(wwebMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.THROTTLE_LIMIT;
  });

  it('covers every route the app registers', () => {
    // Express 5 exposes the stack as `router`; Express 4 as `_router`.
    const instance = app.getHttpAdapter().getInstance() as {
      router?: { stack: ExpressLayer[] };
      _router?: { stack: ExpressLayer[] };
    };
    const stack = (instance.router ?? instance._router)?.stack ?? [];
    expect(stack.length).toBeGreaterThan(0);

    const registered = stack
      .filter((layer) => layer.route)
      .flatMap((layer) =>
        Object.keys(layer.route!.methods).map(
          (method) => `${method.toUpperCase()} ${layer.route!.path}`,
        ),
      )
      .filter((entry) => !entry.startsWith('ACL'));

    const covered = new Set(
      CASES.map((c) => `${c.method.toUpperCase()} ${c.route}`),
    );
    const missing = registered.filter((entry) => !covered.has(entry));

    // Guards against a vacuous pass if route introspection ever breaks.
    expect(registered.length).toBeGreaterThanOrEqual(40);
    expect(missing).toEqual([]);
  });

  it.each(CASES.map((c) => [`${c.method.toUpperCase()} ${c.url}`, c] as const))(
    '%s',
    async (_name, testCase) => {
      const req = request(app.getHttpServer())[testCase.method](testCase.url);
      const res = await (testCase.body ? req.send(testCase.body) : req);

      if (res.status !== testCase.expected) {
        throw new Error(
          `expected ${testCase.expected}, got ${res.status}: ${JSON.stringify(res.body)}`,
        );
      }
    },
  );
});
