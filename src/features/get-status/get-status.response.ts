import { ApiProperty } from '@nestjs/swagger';

export class PoolStatsResponse {
  @ApiProperty({
    example: 2,
    description: 'Operations currently hitting the browser',
  })
  inFlight: number;

  @ApiProperty({
    example: 0,
    description: 'Operations waiting for a free slot',
  })
  queued: number;

  @ApiProperty({ example: 5, description: 'Configured WWEB_MAX_CONCURRENCY' })
  limit: number;
}

export class GetStatusResponse {
  @ApiProperty({
    example: 'READY',
    enum: [
      'INITIALIZING',
      'QR_REQUIRED',
      'AUTHENTICATED',
      'READY',
      'DISCONNECTED',
      'AUTH_FAILURE',
    ],
    description: 'Current WhatsApp connection status',
  })
  status: string;

  @ApiProperty({
    example: false,
    description: 'True when a QR code is waiting to be scanned',
  })
  qrAvailable: boolean;

  @ApiProperty({
    type: PoolStatsResponse,
    description:
      'Concurrency pool usage, useful when diagnosing slow bulk sends',
  })
  pool: PoolStatsResponse;
}
