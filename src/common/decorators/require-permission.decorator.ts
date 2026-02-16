import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Automatically creates a permission for this endpoint
 * @param resource - Resource name (e.g., 'users', 'posts')
 * @param action - Action name (e.g., 'create', 'read', 'update', 'delete', 'manage')
 */
export const RequirePermission = (resource: string, action: string) => {
  return SetMetadata(PERMISSIONS_KEY, { resource, action });
};

// Convenience decorators
export const CanCreate = (resource: string) => RequirePermission(resource, 'create');
export const CanRead = (resource: string) => RequirePermission(resource, 'read');
export const CanUpdate = (resource: string) => RequirePermission(resource, 'update');
export const CanDelete = (resource: string) => RequirePermission(resource, 'delete');
export const CanManage = (resource: string) => RequirePermission(resource, 'manage');