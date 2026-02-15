import { registerAs } from '@nestjs/config';

export interface JwtConfig {
  access: {
    secret: string;
    expiresIn: string;
  };
  refresh: {
    secret: string;
    expiresIn: string;
  };
  issuer: string;
  audience: string;
}

export default registerAs('jwt', (): JwtConfig => ({
  access: {
    secret: process.env.JWT_ACCESS_SECRET || 'change-this-in-production',
    expiresIn: process.env.JWT_ACCESS_EXPIRATION || '15m',
  },
  refresh: {
    secret: process.env.JWT_REFRESH_SECRET || 'change-this-in-production-refresh',
    expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  issuer: process.env.JWT_ISSUER || 'core-auth-service',
  audience: process.env.JWT_AUDIENCE || 'enterprise-app',
}));