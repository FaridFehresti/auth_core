import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permission.decorator'; 
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required permissions from decorator
    // This could be { resource, action } object OR array of strings
    const requiredPermissions = this.reflector.get<any>(PERMISSIONS_KEY, context.getHandler());
    
    // If no permissions required, allow access
    if (!requiredPermissions) {
      return true;
    }

    // Convert to array of permission code strings
    const permissionsArray = this.normalizePermissions(requiredPermissions);

    if (permissionsArray.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Safety check - user must exist
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Extract all permission codes from user's roles
    const userPermissionCodes = this.extractUserPermissions(user);

    // Check if user has all required permissions
    const hasPermission = permissionsArray.every(permission => 
      userPermissionCodes.includes(permission)
    );

    if (!hasPermission) {
      const missing = permissionsArray.filter(p => !userPermissionCodes.includes(p));
      throw new ForbiddenException(
        `Missing required permissions: ${missing.join(', ')}`
      );
    }

    return true;
  }

  /**
   * Normalize permissions to array of code strings
   * Handles: { resource, action } OR ['code1', 'code2'] OR 'code1'
   */
  private normalizePermissions(permissions: any): string[] {
    if (!permissions) return [];
    
    // If it's already an array of strings
    if (Array.isArray(permissions)) {
      return permissions.map(p => {
        if (typeof p === 'string') return p;
        if (p && typeof p === 'object' && p.resource && p.action) {
          return `${p.resource}:${p.action}`;
        }
        return String(p);
      });
    }
    
    // If it's a single { resource, action } object
    if (typeof permissions === 'object' && permissions.resource && permissions.action) {
      return [`${permissions.resource}:${permissions.action}`];
    }
    
    // If it's a single string
    if (typeof permissions === 'string') {
      return [permissions];
    }
    
    return [];
  }

  /**
   * Extract all permission codes from user's roles
   * Handles nested structure: user.roles[].permissions[].code
   */
  private extractUserPermissions(user: any): string[] {
    if (!user || !user.roles || !Array.isArray(user.roles)) {
      return [];
    }

    const permissionCodes = new Set<string>();

    for (const role of user.roles) {
      if (role.permissions && Array.isArray(role.permissions)) {
        for (const permission of role.permissions) {
          // Handle both string codes and permission objects
          if (typeof permission === 'string') {
            permissionCodes.add(permission);
          } else if (permission && typeof permission === 'object' && permission.code) {
            permissionCodes.add(permission.code);
          }
        }
      }
    }

    return Array.from(permissionCodes);
  }
}