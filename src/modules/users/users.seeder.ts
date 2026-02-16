import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { RolesService } from '../roles/services/roles.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersSeeder implements OnModuleInit {
  private readonly logger = new Logger(UsersSeeder.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly rolesService: RolesService,
  ) {}

  async onModuleInit() {
    // Wait for roles to be seeded first
    setTimeout(() => this.seedAdminUser(), 3000);
  }

  async seedAdminUser() {
    try {
      const adminEmail = 'admin@gmail.com';
      const adminPassword = 'Admin@123';
      const adminFirstName = 'System';
      const adminLastName = 'Administrator';

      // Check if admin user already exists
      const existingAdmin = await this.userRepository.findOne({
        where: { email: adminEmail },
        relations: ['roles'],
      });

      if (existingAdmin) {
        const hasAdminRole = existingAdmin.roles?.some(r => r.name === 'admin');
        
        if (!hasAdminRole) {
          await this.assignAdminRole(existingAdmin);
          this.logger.log('✅ Admin role assigned to existing admin user');
        } else {
          this.logger.log('ℹ️ Admin user already exists with admin role');
        }
        return;
      }

      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      const adminRole = await this.rolesService.getRoleByName('admin');

      if (!adminRole) {
        this.logger.warn('⚠️ Admin role not found. Skipping admin user creation...');
        return;
      }

      const adminUser = this.userRepository.create({
        email: adminEmail,
        password: hashedPassword,
        firstName: adminFirstName,
        lastName: adminLastName,
        emailVerified: true,
        isActive: true,
        roles: [adminRole],
      });

      await this.userRepository.save(adminUser);

      this.logger.log('✅ ==========================================');
      this.logger.log('✅ ADMIN USER CREATED SUCCESSFULLY');
      this.logger.log('✅ ==========================================');
      this.logger.log(`✅ Email: ${adminEmail}`);
      this.logger.log(`✅ Password: ${adminPassword}`);
      this.logger.log(`✅ Role: admin (full access)`);
      this.logger.log('✅ ==========================================');
      this.logger.warn('⚠️  CHANGE THIS PASSWORD IN PRODUCTION!');
      this.logger.log('✅ ==========================================');

    } catch (error) {
      this.logger.error('❌ Failed to seed admin user:', error);
    }
  }

  private async assignAdminRole(user: User) {
    const adminRole = await this.rolesService.getRoleByName('admin');

    if (adminRole && !user.roles.some(r => r.id === adminRole.id)) {
      user.roles.push(adminRole);
      await this.userRepository.save(user);
    }
  }
}