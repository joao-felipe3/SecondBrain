import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { TasksModule } from './tasks/tasks.module';
import { ProjectsModule } from './projects/projects.module';
import { SettingsModule } from './settings/settings.module';
import { AIModule } from './ai/ai.module';
import { MongooseModule } from '@nestjs/mongoose';
import * as Joi from 'joi';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true, // permite usar sem precisar importar em outros módulos
      validationSchema: Joi.object({
        MONGODB_URI: Joi.string().required(),
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        // Endurecer conexao para Atlas em redes instaveis.
        maxPoolSize: Number(configService.get('MONGODB_MAX_POOL_SIZE') || 10),
        minPoolSize: Number(configService.get('MONGODB_MIN_POOL_SIZE') || 1),
        serverSelectionTimeoutMS: Number(
          configService.get('MONGODB_SERVER_SELECTION_TIMEOUT_MS') || 8000,
        ),
        connectTimeoutMS: Number(configService.get('MONGODB_CONNECT_TIMEOUT_MS') || 10000),
        socketTimeoutMS: Number(configService.get('MONGODB_SOCKET_TIMEOUT_MS') || 120000),
        maxIdleTimeMS: Number(configService.get('MONGODB_MAX_IDLE_TIME_MS') || 60000),
        waitQueueTimeoutMS: Number(configService.get('MONGODB_WAIT_QUEUE_TIMEOUT_MS') || 20000),
        heartbeatFrequencyMS: Number(configService.get('MONGODB_HEARTBEAT_FREQUENCY_MS') || 5000),
        retryWrites: true,
        w: 'majority',
        family: 4, // Force IPv4

        // Mongoose retry
        retryAttempts: 3,
        retryDelay: 2000,
      }),
    }),

    TasksModule,
    ProjectsModule,
    SettingsModule,
    AIModule,
  ],
})
export class AppModule {}
