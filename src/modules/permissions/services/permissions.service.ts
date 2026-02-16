import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { Permission, PermissionScope } from '../entities/permission.entity';

export interface CreatePermissionDto {
  code: string;
  name: string;
  description?: string;
  scope?: PermissionScope;
  moduleName?: string;
  resource?: string;
  action?: string;
  httpMethod?: string;
  routePath?: string;
  isSystem?: boolean;
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.find({ relations: ['roles'] });
  }

  async findByCode(code: string): Promise<Permission | null> {
    return this.permissionRepository.findOne({ 
      where: { code },
      relations: ['roles'] 
    });
  }

  async findByCodes(codes: string[]): Promise<Permission[]> {
    if (codes.length === 0) return [];
    return this.permissionRepository.find({
      where: codes.map(code => ({ code })),
    });
  }

  async create(dto: CreatePermissionDto): Promise<Permission> {
    // Double-check existence to prevent race conditions
    const existing = await this.findByCode(dto.code);
    if (existing) {
      throw new ConflictException(`Permission ${dto.code} already exists`);
    }

    const permission = this.permissionRepository.create({
      ...dto,
      scope: dto.scope || PermissionScope.RESOURCE,
    });
    
    return this.permissionRepository.save(permission);
  }

  async deactivate(id: string): Promise<void> {
    await this.permissionRepository.update(id, { isActive: false });
  }

  async getPermissionsByModule(moduleName: string): Promise<Permission[]> {
    return this.permissionRepository.find({
      where: { moduleName, isActive: true },
    });
  }
}