import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WwebService } from 'src/infrastructure/services/wweb.service';
import { Public } from 'src/infrastructure/decorators/public.decorator';
import { GetStatusResponse } from './get-status.response';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class GetStatusController {
  constructor(private readonly wwebService: WwebService) {}

  @Public()
  @Get('status')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get WhatsApp connection status' })
  @ApiResponse({ status: 200, type: GetStatusResponse })
  getStatus(): GetStatusResponse {
    return {
      ...this.wwebService.getStatus(),
      pool: this.wwebService.getPoolStats(),
    };
  }
}
