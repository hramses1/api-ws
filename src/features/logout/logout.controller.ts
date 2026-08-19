import { Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { WwebService } from 'src/infrastructure/services/wweb.service';

@ApiTags('WhatsApp')
@ApiSecurity('api-key')
@Controller('whatsapp')
export class LogoutController {
  constructor(private readonly wwebService: WwebService) {}

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unlink the WhatsApp session (logout)' })
  @ApiResponse({ status: 200, description: 'Session unlinked' })
  async logout(): Promise<{ message: string }> {
    await this.wwebService.logout();
    return { message: 'Logged out. Restart and scan QR to link again.' };
  }
}
