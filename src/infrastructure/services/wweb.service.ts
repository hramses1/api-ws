import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Client, ClientInfo, LocalAuth } from 'whatsapp-web.js';
import * as QRCode from 'qrcode';
import { promises as fs } from 'fs';
import * as path from 'path';

@Injectable()
export class WwebService implements OnModuleInit {
  private client: Client;
  private logger = new Logger('WwebService');

  onModuleInit() {
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        args: ['--no-sandbox'],
      },
    });

    this.client.on('qr', (qr) => {
      this.logger.log('👀🗿 Remember: The QR code refreshes every minute ⚡');

      QRCode.toString(qr, { type: 'svg' })
        .then(async (svgString) => {
          const tmpPath = path.join(process.cwd(), 'tmp');
          await fs.mkdir(tmpPath, { recursive: true });
          const filePath = path.join(tmpPath, 'qr.svg');
          return await fs.writeFile(filePath, svgString, 'utf-8');
        })
        .then(() => {
          this.logger.log('✅ QR saved in tmp/qr.svg');
        })
        .catch((err) => {
          this.logger.error('❌ Error saving QR:', err);
        });
    });

    this.client.on('ready', () => {
      this.logger.log('✅ WhatsApp client is ready');
      this.logger.log(`🗿 Client info: ${JSON.stringify(this.client.info)}`);

      const tmpDir = path.join(process.cwd(), 'tmp');
      const jsonPath = path.join(tmpDir, 'client-info.json');

      fs.mkdir(tmpDir, { recursive: true })
        .then(() =>
          fs.writeFile(
            jsonPath,
            JSON.stringify(this.client.info, null, 2),
            'utf-8',
          ),
        )
        .then(() => {
          this.logger.log('📁 Client info saved to tmp/client-info.json');
        })
        .catch((err) => {
          this.logger.error('❌ Failed to save client info', err);
        });
    });

    this.client.on('auth_failure', () => {
      this.logger.error('❌ Authentication failure');
    });

    this.client.on('disconnected', () => {
      this.logger.warn('🧐 WhatsApp client disconnected');
    });

    void this.client.initialize();
  }

  async sendMessage({
    to,
    message,
  }: {
    to: string;
    message: string;
  }): Promise<void> {
    this.logger.log(message);
    const number = to.endsWith('@c.us') ? to : `${to}@c.us`;
    await this.client.sendMessage(number, message);
  }

  async getLoggedInUserInfo() {
    try {
      const jsonPath = path.join(process.cwd(), 'tmp', 'client-info.json');
      const fileContent = await fs.readFile(jsonPath, 'utf-8');

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const info: ClientInfo = JSON.parse(fileContent);

      return {
        number: info.wid?.user,
        pushname: info.pushname,
        platform: info.platform,
      };
    } catch (error) {
      this.logger.error('❌ Failed to read client info JSON', error);
      throw new Error('Client info not available');
    }
  }
}
