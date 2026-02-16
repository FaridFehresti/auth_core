import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { RolesService   } from './services/roles.service';
import type { CreateRoleDto, UpdateRoleDto } from './services/roles.service';
import { JwtAuthGuard } from '../auth/gaurds/jwt-auth.guard'; 
import { PermissionsGuard } from '../auth/gaurds/permissions.guard'; 
import { CanRead, CanCreate, CanUpdate, CanDelete } from '../../common/decorators/require-permission.decorator';

@ApiTags('Roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @CanRead('roles')
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @CanRead('roles')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.findById(id);
  }

  @Post()
  @CanCreate('roles')
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Put(':id')
  @CanUpdate('roles')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.rolesService.update(id, dto);
  }

  @Delete(':id')
  @CanDelete('roles')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.rolesService.delete(id);
  }
}