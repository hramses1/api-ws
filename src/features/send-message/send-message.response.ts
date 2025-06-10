import { ApiProperty } from '@nestjs/swagger';

export class SendMessageResponse {
  @ApiProperty({
    description: 'Content of the message to be sent',
  })
  message: string;

  @ApiProperty({
    description: 'WhatsApp phone number',
  })
  cellPhone: string;
}
