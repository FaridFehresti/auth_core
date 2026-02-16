import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, RoleType } from '../entities/role.entity';
import { PermissionsService } from '../../permissions/services/permissions.service';

export interface CreateRoleDto {
    name: string;
    description?: string;
    permissionCodes?: string[];
    isDefault?: boolean;
}

export interface UpdateRoleDto {
    name?: string;
    description?: string;
    permissionCodes?: string[];
}

@Injectable()
export class RolesService {
    constructor(
        @InjectRepository(Role)
        private readonly roleRepository: Repository<Role>,
        private readonly permissionsService: PermissionsService,
    ) { }
    async onModuleInit() {
        // Seed roles first, before admin user seeder runs
        await this.seedSystemRoles();
    }

    async findAll(): Promise<Role[]> {
        return this.roleRepository.find({ relations: ['permissions'] });
    }

    async findById(id: string): Promise<Role> {
        const role = await this.roleRepository.findOne({
            where: { id },
            relations: ['permissions'],
        });
        if (!role) throw new NotFoundException('Role not found');
        return role;
    }

    async findByName(name: string): Promise<Role | null> {
        return this.roleRepository.findOne({
            where: { name },
            relations: ['permissions'],
        });
    }

    async create(dto: CreateRoleDto): Promise<Role> {
        const existing = await this.findByName(dto.name);
        if (existing) throw new ConflictException('Role already exists');

        const role = this.roleRepository.create({
            name: dto.name,
            description: dto.description,
            type: RoleType.CUSTOM,
            isDefault: dto.isDefault || false,
        });

        if (dto.permissionCodes?.length) {
            role.permissions = await this.permissionsService.findByCodes(dto.permissionCodes);
        }

        return this.roleRepository.save(role);
    }

    async update(id: string, dto: UpdateRoleDto): Promise<Role> {
        const role = await this.findById(id);

        if (role.isSystem) {
            throw new ConflictException('Cannot modify system roles');
        }

        Object.assign(role, dto);

        if (dto.permissionCodes) {
            role.permissions = await this.permissionsService.findByCodes(dto.permissionCodes);
        }

        return this.roleRepository.save(role);
    }

    async delete(id: string): Promise<void> {
        const role = await this.findById(id);
        if (role.isSystem) {
            throw new ConflictException('Cannot delete system roles');
        }
        await this.roleRepository.remove(role);
    }
   async getRoleByName(name: string): Promise<Role | null> {
  return this.roleRepository.findOne({
    where: { name },
    relations: {
      permissions: true,
    },
  });
}
    // Add this method to ensure admin role exists before user seeder runs
    async ensureAdminRole(): Promise<Role> {
        let adminRole = await this.roleRepository.findOne({ where: { name: 'admin' } });

        if (!adminRole) {
            const allPermissions = await this.permissionsService.findAll();

            adminRole = this.roleRepository.create({
                name: 'admin',
                description: 'Full system access - God user',
                type: RoleType.SYSTEM,
                isSystem: true,
                permissions: allPermissions,
            });

            await this.roleRepository.save(adminRole);
        }

        return adminRole;
    }
    // Initialize system roles
    async seedSystemRoles(): Promise<void> {
        const adminRole = await this.roleRepository.findOne({ where: { name: 'admin' } });
        if (!adminRole) {
            const allPermissions = await this.permissionsService.findAll();
            await this.roleRepository.save({
                name: 'admin',
                description: 'Full system access',
                type: RoleType.SYSTEM,
                isSystem: true,
                permissions: allPermissions,
            });
            console.log('✅ Created admin role with all permissions');
        }

        const userRole = await this.roleRepository.findOne({ where: { name: 'user' } });
        if (!userRole) {
            await this.roleRepository.save({
                name: 'user',
                description: 'Standard user',
                type: RoleType.SYSTEM,
                isSystem: true,
                isDefault: true,
                permissions: [], // Will be populated with basic permissions
            });
            console.log('✅ Created default user role');
        }
    }
}