import { Injectable, Inject, Logger, UnauthorizedException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AUTH_CLIENT_OPTIONS } from './constants';
import type { AuthClientOptions } from './auth-client.module';
import { TokenPayload, TokenIntrospectionResult } from './interfaces';

/**
 * Auth Client Service for microservices to validate tokens
 * and authenticate with the core auth service
 */
@Injectable()
export class AuthClientService {
  private readonly logger = new Logger(AuthClientService.name);
  private tokenCache = new Map<string, { payload: TokenPayload; expires: number }>();

  constructor(
    @Inject(AUTH_CLIENT_OPTIONS) private readonly options: AuthClientOptions,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Validate a JWT token with the auth service
   * Uses local cache to reduce network calls
   */
  async validateToken(token: string): Promise<TokenPayload> {
    // Check cache first (tokens valid for 5 minutes in cache)
    const cached = this.tokenCache.get(token);
    if (cached && cached.expires > Date.now()) {
      return cached.payload;
    }

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<TokenIntrospectionResult>('/auth/introspect', {
          token,
        }),
      );

      if (!data.active) {
        throw new UnauthorizedException('Token is not active');
      }

      // Cache the result
      this.tokenCache.set(token, {
        payload: data.payload,
        expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      });

      return data.payload;
    } catch (error) {
      this.logger.error(`Token validation failed: ${error.message}`);
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Get service account token for service-to-service communication
   */
  async getServiceToken(): Promise<string> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ accessToken: string }>('/auth/service-token', {
          serviceId: this.options.apiKey,
        }),
      );
      return data.accessToken;
    } catch (error) {
      this.logger.error(`Failed to get service token: ${error.message}`);
      throw new Error('Service authentication failed');
    }
  }

  /**
   * Clear token cache (useful for logout scenarios)
   */
  clearCache(token?: string): void {
    if (token) {
      this.tokenCache.delete(token);
    } else {
      this.tokenCache.clear();
    }
  }
}