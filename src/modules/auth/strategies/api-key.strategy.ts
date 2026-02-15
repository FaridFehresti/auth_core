import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { HeaderAPIKeyStrategy } from 'passport-headerapikey';
import { AuthRepository } from '../auth.repository';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(HeaderAPIKeyStrategy, 'api-key') {
  constructor(private readonly authRepository: AuthRepository) {
    super(
      { header: 'X-API-Key', prefix: '' },
      true,
      async (apiKey: string, done: (error: Error | null, data?: any) => void) => {
        try {
          const service = await this.authRepository.validateServiceApiKey(apiKey);
          if (!service) {
            return done(new UnauthorizedException('Invalid API Key'), false);
          }
          return done(null, service);
        } catch (error) {
          return done(error as Error, false);
        }
      },
    );
  }
}