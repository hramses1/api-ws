import { Injectable } from '@nestjs/common';
import { WwebService } from '../services/wweb.service';
import { toChatId } from '../utils/phone.util';
import { toWhatsappException } from '../filters/whatsapp.exception';

/**
 * Contact lookups. Phase 2 grows this with listing, profile pictures and
 * blocking; for now it only carries what the existing endpoints need.
 */
@Injectable()
export class ContactOps {
  constructor(private readonly wweb: WwebService) {}

  async checkNumber(
    input: string,
  ): Promise<{ input: string; chatId: string; isRegistered: boolean }> {
    const chatId = toChatId(input, { allow: ['user'] });
    try {
      const isRegistered = await this.wweb.withClient((client) =>
        client.isRegisteredUser(chatId),
      );
      return { input, chatId, isRegistered };
    } catch (error) {
      throw toWhatsappException(error, `Could not check ${chatId}`);
    }
  }
}
