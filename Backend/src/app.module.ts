import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TasksModule } from './tasks/tasks.module';
import { ProjectsModule } from './projects/projects.module';
import { MongooseModule } from '@nestjs/mongoose';
import * as Joi from 'joi';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // permite usar sem precisar importar em outros módulos
      validationSchema: Joi.object({
        MONGODB_URI: Joi.string().required(),
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),

    TasksModule,
    ProjectsModule,
  ],
})
export class AppModule {}
