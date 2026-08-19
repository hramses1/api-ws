import { Controller, Get, HttpCode } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { WwebService } from 'src/infrastructure/services/wweb.service';
import { GetLoggedInUserInfoResponse } from './get-logged-in-user-info.response';

@ApiTags('WhatsApp')
@ApiSecurity('api-key')
@Controller('whatsapp')
export class GetLoggedInUserInfoController {
  constructor(private readonly service: WwebService) {}

  @Get('get-logged-in-user-info')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get logged in user info' })
  @ApiResponse({ status: 200, type: GetLoggedInUserInfoResponse })
  @ApiResponse({ status: 503, description: 'Client not ready' })
  handle(): GetLoggedInUserInfoResponse {
    return this.service.getLoggedInUserInfo();
  }
}
