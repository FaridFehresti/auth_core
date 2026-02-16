import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  ChangePasswordDto,
  UserQueryDto,
} from './dto';

export interface PaginatedUsers {
  data: User[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }



  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions'],
    });
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.update(id, { lastLoginAt: new Date() });
  }

  async incrementFailedAttempts(id: string): Promise<void> {
    await this.userRepository.increment({ id }, 'failedLoginAttempts', 1);
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.userRepository.update(id, data);
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error('User not found after update');
    }
    return user;
  }
  async findByIdWithRolesAndPermissions(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: {
        roles: {
          permissions: true,
        },
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  // Also update findByEmail if used in validateUser
  async findByEmail(email: string, includeRoles = false): Promise<User | null> {
    if (includeRoles) {
      return this.userRepository.findOne({
        where: { email },
        relations: {
          roles: {
            permissions: true, // ✅ Load permissions with roles
          },
        },
      });
    }

    return this.userRepository.findOne({ where: { email } });
  }
  async findAll(query: UserQueryDto): Promise<PaginatedUsers> {
    // Fix: Provide default values
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const { search, isActive, emailVerified, sortBy, sortOrder } = query;

    const queryBuilder = this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'permissions');

    // Search filter
    if (search) {
      queryBuilder.andWhere(
        new Brackets(qb => {
          qb.where('user.email ILIKE :search', { search: `%${search}%` })
            .orWhere('user.firstName ILIKE :search', { search: `%${search}%` })
            .orWhere('user.lastName ILIKE :search', { search: `%${search}%` });
        })
      );
    }

    // Status filters
    if (isActive !== undefined) {
      queryBuilder.andWhere('user.isActive = :isActive', { isActive });
    }

    if (emailVerified !== undefined) {
      queryBuilder.andWhere('user.emailVerified = :emailVerified', { emailVerified });
    }

    // Sorting
    queryBuilder.orderBy(`user.${sortBy}`, sortOrder);

    // Pagination
    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByIdWithRoles(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found`);
    }

    return user;
  }

  async createUser(dto: CreateUserDto): Promise<User> {
    // Check email uniqueness
    const existingUser = await this.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = this.userRepository.create({
      ...dto,
      password: hashedPassword,
      roles: dto.roleIds ? dto.roleIds.map(id => ({ id } as any)) : [],
    });

    return this.userRepository.save(user);
  }

  async updateUser(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findByIdWithRoles(id);

    // Check email uniqueness if email is being changed
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.findByEmail(dto.email);
      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Hash password if provided
    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 12);
    }

    // Update roles if provided
    if (dto.roleIds) {
      user.roles = dto.roleIds.map(roleId => ({ id: roleId } as any));
    }

    Object.assign(user, dto);
    return this.userRepository.save(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<User> {
    const user = await this.findByIdWithRoles(userId);

    // Check email uniqueness if changing email
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.findByEmail(dto.email);
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
      // Reset email verification if email changes
      user.emailVerified = false;
    }

    Object.assign(user, dto);
    return this.userRepository.save(user);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    // Fix: Need to fetch user with password
    const user = await this.userRepository.createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(dto.newPassword, 12);
    await this.userRepository.update(userId, { password: hashedPassword });
  }

  async toggleUserStatus(id: string, isActive: boolean): Promise<User> {
    const user = await this.findByIdWithRoles(id);
    user.isActive = isActive;
    return this.userRepository.save(user);
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.findByIdWithRoles(id);

    // Prevent deleting the last admin (optional business logic)
    const isAdmin = user.roles.some(role => role.name === 'admin');
    if (isAdmin) {
      const adminCount = await this.userRepository
        .createQueryBuilder('user')
        .leftJoin('user.roles', 'role')
        .where('role.name = :roleName', { roleName: 'admin' })
        .getCount();

      if (adminCount <= 1) {
        throw new ForbiddenException('Cannot delete the last admin user');
      }
    }

    await this.userRepository.remove(user);
  }

  async getUserStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    verified: number;
    unverified: number;
  }> {
    const total = await this.userRepository.count();
    const active = await this.userRepository.count({ where: { isActive: true } });
    const inactive = await this.userRepository.count({ where: { isActive: false } });
    const verified = await this.userRepository.count({ where: { emailVerified: true } });
    const unverified = await this.userRepository.count({ where: { emailVerified: false } });

    return { total, active, inactive, verified, unverified };
  }
}