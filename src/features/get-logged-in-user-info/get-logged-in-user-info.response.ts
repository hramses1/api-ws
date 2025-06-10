import { ApiProperty } from '@nestjs/swagger';

export class GetLoggedInUserInfoResponse {
  @ApiProperty({
    description: 'WhatsApp phone number (only numbers, without @c.us)',
    example: '573001234567',
  })
  number: string;

  @ApiProperty({
    description: 'Display name of the logged-in WhatsApp user',
    example: 'Juan Pérez',
  })
  pushname: string;

  @ApiProperty({
    description: 'Platform used by the WhatsApp client',
    example: 'Android',
  })
  platform: string;
}
