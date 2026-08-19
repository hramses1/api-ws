import { Controller, Get, HttpCode } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { WwebService } from 'src/infrastructure/services/wweb.service';
import { Public } from 'src/infrastructure/decorators/public.decorator';

@ApiTags('Health')
@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly wwebService: WwebService) {}

  @Public()
  @Get('health')
  @HttpCode(200)
  @ApiOperation({ summary: 'Liveness probe (no auth)' })
  @ApiResponse({ status: 200, description: 'Service is up' })
  health() {
    const { status } = this.wwebService.getStatus();
    return {
      status: 'ok',
      whatsapp: status,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }
}
