import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SendMessageDto } from './send-message.dto';
import { SendMessageResponse } from './send-message.response';
import { SendMessageService } from './send-message.service';

@ApiTags('WhatsApp')
@Controller('whatsapp')
export class SendMessageController {
  constructor(private readonly service: SendMessageService) {}

  @Post('send-message')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a message by whatsapp' })
  @ApiResponse({ status: 200, type: SendMessageResponse })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async handle(@Body() record: SendMessageDto): Promise<SendMessageResponse> {
    try {
      await this.service.handle(record);
      return {
        message: record.message,
        cellPhone: record.cellPhone,
      };
    } catch (error) {
      throw new HttpException(`${error}`, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
