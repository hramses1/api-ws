import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AllExceptionsFilter } from './infrastructure/filters/all-exceptions.filter';

async function bootstrap() {
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
