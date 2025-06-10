import {
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { WwebService } from 'src/infrastructure/services/wweb.service';
import { GetLoggedInUserInfoResponse } from './get-logged-in-user-info.response';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class GetLoggedInUserInfoController {
  constructor(private readonly service: WwebService) {}

  @Get('get-logged-in-user-info')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get logged in user info' })
  @ApiResponse({
    status: 200,
    type: GetLoggedInUserInfoResponse,
  })
  @ApiResponse({ status: 404, description: 'Client not found' })
  async handle(): Promise<GetLoggedInUserInfoResponse> {
    try {
      const info = await this.service.getLoggedInUserInfo();
      return {
        number: info.number,
        pushname: info.pushname,
        platform: info.platform,
      };
    } catch (error) {
      throw new HttpException(`${error}`, HttpStatus.NOT_FOUND);
    }
  }
}
