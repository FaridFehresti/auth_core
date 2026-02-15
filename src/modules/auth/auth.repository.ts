import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthRepository {
  private apiKeys = new Map<string, { serviceId: string; permissions: string[] }>();

  constructor() {
    // Initialize with some service API keys (in production, load from DB)
    this.apiKeys.set('service-key-1', { serviceId: 'billing-service', permissions: ['read:users'] });
  }

  async validateServiceApiKey(apiKey: string): Promise<{ serviceId: string; permissions: string[] } | null> {
    return this.apiKeys.get(apiKey) || null;
  }
}