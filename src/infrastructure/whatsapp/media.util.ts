import { BadRequestException } from '@nestjs/common';
import { MessageMedia } from 'whatsapp-web.js';

export interface MediaSource {
  url?: string;
  base64?: string;
  mimetype?: string;
  filename?: string;
}

/**
 * Builds a MessageMedia from either a public URL or raw base64 data.
 * Shared by message sending and group/profile pictures.
 */
export async function resolveMedia(source: MediaSource): Promise<MessageMedia> {
  if (source.url) {
    return MessageMedia.fromUrl(source.url, { unsafeMime: true });
  }

  if (source.base64 && source.mimetype) {
    return new MessageMedia(
      source.mimetype,
      source.base64,
      source.filename ?? null,
    );
  }

  throw new BadRequestException(
    'Provide either "url" or both "base64" and "mimetype".',
  );
}
