import { Injectable } from '@nestjs/common';
import { WwebService } from 'src/infrastructure/services/wweb.service';

@Injectable()
export class SendMessageService {
  constructor(private readonly wwebService: WwebService) {}

  async handle({
    cellPhone,
    message,
  }: {
    cellPhone: string;
    message: string;
  }): Promise<void> {
    await this.wwebService.sendMessage({
      to: cellPhone,
      message,
    });
  }
}
