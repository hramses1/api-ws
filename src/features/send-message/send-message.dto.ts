import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({
    example: 'Hola, ¿cómo estás?',
    description: 'Message content to be sent',
    maxLength: 500,
    minLength: 1,
  })
  @IsString()
  @MinLength(1, { message: 'Message cannot be empty' })
  message: string;

  @ApiProperty({
    example: '573001234567',
    description:
      'WhatsApp phone number in international format (e.g. 573001234567)',
  })
  @IsString()
  cellPhone: string;
}
