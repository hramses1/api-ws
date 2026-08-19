import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './infrastructure/filters/all-exceptions.filter';

/**
 * Puppeteer rejects in-flight page calls when Chrome or a frame goes away
 * (session logout, disconnect, restart). Those rejections originate inside
 * whatsapp-web.js, outside any promise chain we own, and on Node 22 an
 * unhandled rejection terminates the process — a WhatsApp disconnect would
 * take the whole API down. Log and keep serving instead: the client
 * reconnects on its own, and /status reports the real state meanwhile.
 */
function guardAgainstBrowserCrashes(): void {
  const logger = new Logger('Process');

  process.on('unhandledRejection', (reason) => {
    logger.error(
      `Unhandled rejection (API stays up): ${
        reason instanceof Error ? reason.message : String(reason)
      }`,
    );
  });

  process.on('uncaughtException', (error) => {
    logger.error(`Uncaught exception (API stays up): ${error.message}`);
  });
}

async function bootstrap() {
  guardAgainstBrowserCrashes();

  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.setGlobalPrefix('api/');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  // Required so OnModuleDestroy fires on restart/SIGINT and the WhatsApp
  // client/Chrome is destroyed cleanly (prevents re-init binding crash).
  app.enableShutdownHooks();

  const config = new DocumentBuilder()
    .setTitle('API Ws Crazy')
    .setDescription(
      'WhatsApp API: send, reply (quoted), receive and store chat history.',
    )
    .setVersion('1.0')
    .addTag('WhatsApp', 'WhatsApp messaging and chat history endpoints')
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true, tagsSorter: 'alpha' },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(
    `🚀 API on http://localhost:${port}/api — docs at /docs`,
  );
}

void bootstrap();
