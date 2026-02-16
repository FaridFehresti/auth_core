import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ThrottlerModule } from '@nestjs/throttler';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import jwtConfig from './config/jwt.config';
import redisConfig from './config/redis.config';
import { validationSchema } from './config/validation.schema';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { EventsModule } from './shared/events/events.module';
import { EmailModule } from './modules/email/email.module';
import { RolesService } from './modules/roles/services/roles.service';
// ❌ REMOVE: import { UsersSeeder } from './modules/users/users.seeder';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [appConfig, databaseConfig, jwtConfig, redisConfig],
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        ...configService.get('database'),
      }),
      inject: [ConfigService],
    }),

    RedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        url: configService.get('redis.url'),
      }),
      inject: [ConfigService],
    }),

    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        throttlers: [{
          ttl: configService.get('app.throttleTtl', 60),
          limit: configService.get('app.throttleLimit', 10),
        }],
      }),
      inject: [ConfigService],
    }),

    // Feature Modules
    EmailModule,
    EventsModule,
    PermissionsModule,
    RolesModule,
    UsersModule,
    AuthModule,
    SessionsModule,
    AuditModule,
    HealthModule,
  ],
  // ❌ REMOVE: providers: [UsersSeeder],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(
    private readonly rolesService: RolesService,
    // ❌ REMOVE: private readonly usersSeeder: UsersSeeder,
  ) {}

  async onModuleInit() {
    setTimeout(async () => {
      this.logger.log('🌱 Seeding system roles...');
      try {
        await this.rolesService.seedSystemRoles();
        this.logger.log('✅ System roles seeded successfully');
        
        // ❌ REMOVE: await this.usersSeeder.seedAdminUser();
        // The UsersSeeder will run automatically from UsersModule
      } catch (error: any) {
        this.logger.error('❌ Failed to seed:', error?.message || String(error));
      }
    }, 2000);
  }
}