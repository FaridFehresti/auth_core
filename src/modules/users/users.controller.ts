import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Patch,
    Body,
    Param,
    Query,
    UseGuards,
    HttpCode,
    HttpStatus,
    SerializeOptions,
    ParseUUIDPipe,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';

import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/gaurds/jwt-auth.guard';
import { PermissionsGuard } from '../auth/gaurds/permissions.guard';
import { RequirePermission, CanRead, CanCreate, CanUpdate, CanDelete } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
    CreateUserDto,
    UpdateUserDto,
    UpdateProfileDto,
    ChangePasswordDto,
    UserResponseDto,
    UserQueryDto,
    FindByEmailDto,
} from './dto';
import { User } from './entities/user.entity';
import { IsArray, IsUUID } from 'class-validator';
export class UpdateUserRolesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[];
}
@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
@SerializeOptions({ strategy: 'excludeAll' })
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    // ADMIN ENDPOINTS

    @Get()
    @CanRead('users')  // Auto-creates permission "users:read"
    @ApiOperation({ summary: 'Get all users with pagination and filters' })
    async findAll(@Query() query: UserQueryDto) {
        const result = await this.usersService.findAll(query);
        return {
            ...result,
            data: result.data.map(user => plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true })),
        };
    }
    @Get('by-email')
@CanRead('users')
@ApiOperation({ summary: 'Find user by email' })
async findByEmail(@Query() query: FindByEmailDto) {
  const user = await this.usersService.findByEmail(query.email, true);
  if (!user) {
    throw new NotFoundException('User not found');
  }
  return user;
}
@Patch(':id/roles')
@CanUpdate('users')
@ApiOperation({ summary: 'Update user roles' })
async updateUserRoles(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateUserRolesDto,
) {
  const user = await this.usersService.updateUser(id, { roleIds: dto.roleIds });
  return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
}

    @Get('stats')
    @CanRead('users')
    @ApiOperation({ summary: 'Get user statistics' })
    async getStats() {
        return this.usersService.getUserStats();
    }

    @Get(':id')
    @CanRead('users')
    @ApiOperation({ summary: 'Get user by ID' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
        const user = await this.usersService.findByIdWithRoles(id);
        return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
    }

    @Post()
    @CanCreate('users')  // Auto-creates permission "users:create"
    @ApiOperation({ summary: 'Create new user' })
    async create(@Body() createUserDto: CreateUserDto) {
        const user = await this.usersService.createUser(createUserDto);
        return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
    }

    @Put(':id')
    @CanUpdate('users')  // Auto-creates permission "users:update"
    @ApiOperation({ summary: 'Update user by ID' })
    async update(
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateUserDto: UpdateUserDto,
    ) {
        const user = await this.usersService.updateUser(id, updateUserDto);
        return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
    }

    @Patch(':id/status')
    @CanUpdate('users')
    @ApiOperation({ summary: 'Activate/Deactivate user' })
    async toggleStatus(
        @Param('id', ParseUUIDPipe) id: string,
        @Body('isActive') isActive: boolean,
    ) {
        const user = await this.usersService.toggleUserStatus(id, isActive);
        return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
    }

    @Delete(':id')
    @CanDelete('users')  // Auto-creates permission "users:delete"
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete user' })
    async remove(@Param('id', ParseUUIDPipe) id: string) {
        await this.usersService.deleteUser(id);
    }

    // SELF-SERVICE ENDPOINTS (No permission decorator - just needs authentication)

    @Get('me/profile')
    @ApiOperation({ summary: 'Get current user profile' })
    async getProfile(@CurrentUser() user: User) {
        const fullUser = await this.usersService.findByIdWithRoles(user.id);
        return plainToInstance(UserResponseDto, fullUser, { excludeExtraneousValues: true });
    }

    @Put('me/profile')
    @ApiOperation({ summary: 'Update current user profile' })
    async updateProfile(
        @CurrentUser() user: User,
        @Body() updateProfileDto: UpdateProfileDto,
    ) {
        const updatedUser = await this.usersService.updateProfile(user.id, updateProfileDto);
        return plainToInstance(UserResponseDto, updatedUser, { excludeExtraneousValues: true });
    }

   
    @Post('me/change-password')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Change current user password' })
    async changePassword(
        @CurrentUser() user: User,
        @Body() changePasswordDto: ChangePasswordDto,
    ) {
        await this.usersService.changePassword(user.id, changePasswordDto);
    }
}