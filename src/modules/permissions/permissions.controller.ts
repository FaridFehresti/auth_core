import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PermissionsService } from './services/permissions.service';
import { JwtAuthGuard } from '../auth/gaurds/jwt-auth.guard';
import { PermissionsGuard } from '../auth/gaurds/permissions.guard'; 
import { CanRead } from '../../common/decorators/require-permission.decorator';

@ApiTags('Permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @CanRead('permissions')
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get('by-module/:module')
  @CanRead('permissions')
  findByModule(module: string) {
    return this.permissionsService.getPermissionsByModule(module);
  }
}