import { Controller, Get, HttpCode, HttpStatus, Res } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { join } from 'path';
import { Response } from 'express';
import { promises as fs } from 'fs';
import { WwebService } from 'src/infrastructure/services/wweb.service';

@ApiTags('WhatsApp')
@ApiSecurity('api-key')
@Controller('whatsapp')
export class GetSessionQrCodeController {
  constructor(private readonly wwebService: WwebService) {}

  @Get('qr')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get QR as JSON (raw + PNG data-URL) from memory' })
  @ApiResponse({
    status: 200,
    description: 'QR payload (null when not pending)',
  })
  getQrJson() {
    const { status } = this.wwebService.getStatus();
    return {
      status,
      qr: this.wwebService.getQr(),
      pngDataUrl: this.wwebService.getQrPng(),
    };
  }

  @Get('get-session-qr-code')
  @HttpCode(200)
  @ApiOperation({ summary: 'Get QR code SVG image' })
  @ApiResponse({
    status: 200,
    description: 'QR code SVG image',
    content: {
      'image/svg+xml': {
        schema: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'No QR generated yet' })
  async handle(@Res() res: Response) {
    const filePath = join(process.cwd(), 'tmp', 'qr.svg');
    try {
      const data = await fs.readFile(filePath, 'utf8');
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.send(data);
    } catch {
      return res.status(HttpStatus.NOT_FOUND).send('No QR generated yet');
    }
  }
}
