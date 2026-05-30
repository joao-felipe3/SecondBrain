import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Increase body size limits to support bulk task saves (e.g. /tasks/bulk)
  // Default express/json limit (100kb) is too small for dozens/hundreds of tasks.
  app.use(express.json({ limit: process.env.BODY_LIMIT || '10mb' }));
  app.use(
    express.urlencoded({
      extended: true,
      limit: process.env.BODY_LIMIT || '10mb',
    }),
  );

  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:8080'], // permite requisições do frontend
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 3600,
  });
  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('Second Brain API')
    .setDescription('API para gerenciamento de tarefas e projetos')
    .setVersion('1.0')
    .addTag('tasks') // você pode repetir esse addTag em cada controller
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // http://localhost:3000/api

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Backend running on http://localhost:${port}`);
}
bootstrap();
