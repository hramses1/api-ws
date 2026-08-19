import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { WwebService } from './../src/infrastructure/services/wweb.service';

// Mock WwebService so the e2e does not launch a real Chrome/WhatsApp client.
// The *Ops services reach the library only through withClient, so a fake
// client here is enough to cover them.
const clientMock = {
  sendMessage: () => Promise.resolve({ id: { _serialized: 'msg-id' } }),
  isRegisteredUser: () => Promise.resolve(true),
  getChats: () => Promise.resolve([]),
};

const POOL_STATS = { inFlight: 0, queued: 0, limit: 5 };

const wwebMock = {
  getStatus: () => ({ status: 'READY', qrAvailable: false }),
  getPoolStats: () => POOL_STATS,
  withClient: <T>(fn: (client: typeof clientMock) => Promise<T>) =>
    fn(clientMock),
  expectOutgoingId: () => ({
    promise: Promise.resolve(''),
    cancel: () => undefined,
  }),
  getQr: () => null,
  getQrPng: () => null,
  getLoggedInUserInfo: () => ({
    number: '573001234567',
    pushname: 'Test',
    platform: 'web',
  }),
};

async function buildApp(): Promise<INestApplication<App>> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(WwebService)
    .useValue(wwebMock)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

describe('WhatsApp API (e2e)', () => {
  describe('without API_KEY (dev mode, open)', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      delete process.env.API_KEY;
      app = await buildApp();
    });
    afterAll(async () => app.close());

    it('GET /api/whatsapp/status → 200 (public)', () =>
      request(app.getHttpServer())
        .get('/api/whatsapp/status')
        .expect(200)
        .expect({ status: 'READY', qrAvailable: false, pool: POOL_STATS }));

    it('GET /api/health → 200 (public)', () =>
      request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          const body = res.body as { status?: string };
          if (body.status !== 'ok') throw new Error('health not ok');
        }));

    it('POST /api/whatsapp/send-message empty body → 400', () =>
      request(app.getHttpServer())
        .post('/api/whatsapp/send-message')
        .send({})
        .expect(400));

    it('POST /api/whatsapp/send-media without url/base64 → 400', () =>
      request(app.getHttpServer())
        .post('/api/whatsapp/send-media')
        .send({ cellPhone: '573001234567' })
        .expect(400));

    it('POST /api/whatsapp/messages/send → 200', () =>
      request(app.getHttpServer())
        .post('/api/whatsapp/messages/send')
        .send({ to: '573001234567', message: 'Hola' })
        .expect(200)
        .expect({ to: '573001234567@c.us', messageId: 'msg-id' }));

    it('POST /api/whatsapp/messages/bulk reports each recipient', () =>
      request(app.getHttpServer())
        .post('/api/whatsapp/messages/bulk')
        .send({ recipients: ['573001111111', '123'], message: 'Hola' })
        .expect(200)
        .expect((res) => {
          const body = res.body as { sent: number; failed: number };
          if (body.sent !== 1 || body.failed !== 1) {
            throw new Error(`unexpected bulk result: ${JSON.stringify(body)}`);
          }
        }));

    it('DELETE /api/whatsapp/groups/:id rejects a non-group id → 400', () =>
      request(app.getHttpServer())
        .delete('/api/whatsapp/groups/573001234567%40c.us')
        .expect(400));
  });

  describe('with API_KEY set (auth enforced)', () => {
    let app: INestApplication<App>;
    const KEY = 'super-secret-test-key';

    beforeAll(async () => {
      process.env.API_KEY = KEY;
      app = await buildApp();
    });
    afterAll(async () => {
      await app.close();
      delete process.env.API_KEY;
    });

    it('GET /api/whatsapp/chats without key → 401', () =>
      request(app.getHttpServer()).get('/api/whatsapp/chats').expect(401));

    it('GET /api/whatsapp/chats with key → 200', () =>
      request(app.getHttpServer())
        .get('/api/whatsapp/chats')
        .set('x-api-key', KEY)
        .expect(200));

    it('GET /api/whatsapp/status without key → 200 (public)', () =>
      request(app.getHttpServer()).get('/api/whatsapp/status').expect(200));
  });
});
