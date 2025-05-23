import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Swagger config
  const config = new DocumentBuilder()
    .setTitle('Second Brain API')
    .setDescription('API para gerenciamento de tarefas e projetos')
    .setVersion('1.0')
    .addTag('tasks') // você pode repetir esse addTag em cada controller
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // http://localhost:3000/api

  await app.listen(3000);
}
bootstrap();
