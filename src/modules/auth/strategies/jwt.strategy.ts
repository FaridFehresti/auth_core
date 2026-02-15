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
      // Custom validation to check token blacklist
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: TokenPayload): Promise<TokenPayload> {
    // Check if token is blacklisted (logged out or revoked)
    const isBlacklisted = await this.redis.get(`blacklist:${payload.jti}`);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Verify user still exists and is active
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Check if user permissions changed (compare cached permissions)
    const cachedPermissions = await this.redis.get(`permissions:${user.id}`);
    if (cachedPermissions) {
      const currentPerms = JSON.parse(cachedPermissions);
      if (JSON.stringify(currentPerms) !== JSON.stringify(payload.permissions)) {
        // Permissions changed, force re-login
        throw new UnauthorizedException('Permissions updated, please login again');
      }
    }

    return {
      ...payload,
      permissions: payload.permissions || [],
    };
  }
}