import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

import { TokenPayload } from '../dto/token-payload.dto';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.access.secret'),
      issuer: configService.get('jwt.issuer'),
      audience: configService.get('jwt.audience'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: TokenPayload): Promise<any> {
    // Check if token is blacklisted
    const isBlacklisted = await this.redis.get(`blacklist:${payload.jti}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // ✅ Load user WITH roles and permissions
    const user = await this.usersService.findByIdWithRolesAndPermissions(payload.sub);
    
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // ✅ Build permissions array from roles
    const permissions = this.extractPermissionsFromRoles(user.roles);

    // Check cached permissions (optional security feature)
    const cachedPermissions = await this.redis.get(`permissions:${user.id}`);
    if (cachedPermissions) {
      const currentPerms = JSON.parse(cachedPermissions);
      if (JSON.stringify(currentPerms) !== JSON.stringify(permissions)) {
        throw new UnauthorizedException('Permissions updated, please login again');
      }
    }

    // ✅ Return user object with roles for PermissionsGuard
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles: user.roles, // ✅ Include roles with permissions
      permissions: permissions, // ✅ Include flat permissions array
    };
  }

  /**
   * Extract all permission codes from user's roles
   */
  private extractPermissionsFromRoles(roles: any[]): string[] {
    if (!roles || !Array.isArray(roles)) {
      return [];
    }

    const permissionCodes = new Set<string>();

    for (const role of roles) {
      if (role.permissions && Array.isArray(role.permissions)) {
        for (const permission of role.permissions) {
          if (permission && permission.code) {
            permissionCodes.add(permission.code);
          }
        }
      }
    }

    return Array.from(permissionCodes);
  }
}