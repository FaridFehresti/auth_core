import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { RolesModule } from '../roles/roles.module';
import { UsersSeeder } from './users.seeder';

@Module({
  imports: [TypeOrmModule.forFeature([User]),RolesModule],
  controllers: [UsersController],
  providers: [UsersService,UsersSeeder],
  exports: [UsersService,UsersSeeder],
})
export class UsersModule {}