import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permission.decorator';
import { PermissionsService } from './permissions.service';
import { PermissionScope } from '../entities/permission.entity';

export interface DiscoveredPermission {
  code: string;
  name: string;
  module: string;
  resource: string;
  action: string;
  httpMethod: string;
  routePath: string;
  handler: string;
}

@Injectable()
export class PermissionScannerService implements OnModuleInit {
  private readonly logger = new Logger(PermissionScannerService.name);

  constructor(
    private readonly modulesContainer: ModulesContainer,
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async onModuleInit() {
    this.logger.log('🔍 Scanning for permissions...');
    const permissions = this.discoverPermissions();
    
    const uniquePermissions = this.deduplicatePermissions(permissions);
    
    await this.syncPermissions(uniquePermissions);
    this.logger.log(`✅ Permission scan complete. Found ${uniquePermissions.length} unique permissions`);
  }

  private deduplicatePermissions(permissions: DiscoveredPermission[]): DiscoveredPermission[] {
    const seen = new Map<string, DiscoveredPermission>();
    
    for (const perm of permissions) {
      if (!seen.has(perm.code)) {
        seen.set(perm.code, perm);
      } else {
        this.logger.warn(`⚠️ Duplicate permission found: ${perm.code} at ${perm.routePath} (already defined at ${seen.get(perm.code)!.routePath})`);
      }
    }
    
    return Array.from(seen.values());
  }

  private discoverPermissions(): DiscoveredPermission[] {
    const permissions: DiscoveredPermission[] = [];

    this.modulesContainer.forEach((moduleRef) => {
      const moduleName = this.getModuleName(moduleRef);
      
      const controllers = moduleRef.controllers;
      controllers.forEach((wrapper: InstanceWrapper) => {
        const instance = wrapper.instance;
        if (!instance) return;

        const prototype = Object.getPrototypeOf(instance);
        const controllerPath = this.getControllerPath(instance);
        
        const methodNames = Object.getOwnPropertyNames(prototype).filter(
          (method) => method !== 'constructor' && typeof prototype[method] === 'function',
        );

        methodNames.forEach((methodName) => {
          const handler = prototype[methodName];
          const permission = this.reflector.get<{ resource: string; action: string }>(
            PERMISSIONS_KEY,
            handler,
          );

          if (permission) {
            const httpMethod = this.getHttpMethod(handler);
            const routePath = `${controllerPath}${this.getMethodPath(handler)}`;
            
            permissions.push({
              code: `${permission.resource}:${permission.action}`,
              name: this.generateName(permission.resource, permission.action),
              module: moduleName,
              resource: permission.resource,
              action: permission.action,
              httpMethod,
              routePath,
              handler: `${instance.constructor.name}.${methodName}`,
            });
          }
        });
      });
    });

    return permissions;
  }

  private async syncPermissions(discovered: DiscoveredPermission[]) {
    const existing = await this.permissionsService.findAll();
    const existingCodes = new Set(existing.map(p => p.code));

    for (const perm of discovered) {
      if (!existingCodes.has(perm.code)) {
        try {
          await this.permissionsService.create({
            code: perm.code,
            name: perm.name,
            description: `Auto-generated: ${perm.httpMethod} ${perm.routePath}`,
            moduleName: perm.module,
            resource: perm.resource,
            action: perm.action,
            httpMethod: perm.httpMethod,
            routePath: perm.routePath,
            scope: PermissionScope.RESOURCE,
            isSystem: true,
          });
          this.logger.log(`➕ Created permission: ${perm.code}`);
          
          existingCodes.add(perm.code);
        } catch (error: any) {
          if (error?.code === '23505') {
            this.logger.warn(`⚠️ Permission ${perm.code} already exists (race condition)`);
            existingCodes.add(perm.code);
          } else {
            throw error;
          }
        }
      }
    }

    const discoveredCodes = new Set(discovered.map(p => p.code));
    for (const perm of existing) {
      if (perm.isSystem && !discoveredCodes.has(perm.code)) {
        await this.permissionsService.deactivate(perm.id);
        this.logger.log(`➖ Deactivated permission: ${perm.code}`);
      }
    }
  }

  private getModuleName(moduleRef: any): string {
    const metatype = moduleRef.metatype;
    if (metatype) {
      return metatype.name.replace('Module', '').toLowerCase();
    }
    return 'unknown';
  }

  private getControllerPath(instance: any): string {
    const controllerPath = Reflect.getMetadata('path', instance.constructor) || '';
    return `/${controllerPath}`.replace(/\/+/g, '/');
  }

  private getMethodPath(handler: any): string {
    const path = Reflect.getMetadata('path', handler) || '';
    return path;
  }

  private getHttpMethod(handler: any): string {
    const methods = ['Get', 'Post', 'Put', 'Delete', 'Patch', 'Options', 'Head'];
    for (const method of methods) {
      if (Reflect.getMetadata(method.toLowerCase(), handler)) {
        return method.toUpperCase();
      }
    }
    return 'UNKNOWN';
  }

  private generateName(resource: string, action: string): string {
    return `${this.capitalize(resource)}: ${this.capitalize(action)}`;
  }

  private capitalize(str: string): string {
    return str.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}