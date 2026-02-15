import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { User } from '../../modules/users/entities/user.entity';

@Injectable()
export class AuthEventsService {
  constructor(
    @Inject('AUTH_MICROSERVICE') private readonly client: ClientProxy,
  ) {}

  async publishUserCreated(user: User): Promise<void> {
    this.client.emit('user.created', {
      userId: user.id,
      email: user.email,
      timestamp: new Date().toISOString(),
    });
  }

  async publishPermissionsChanged(userId: string, permissions: string[]): Promise<void> {
    this.client.emit('permissions.changed', {
      userId,
      permissions,
      timestamp: new Date().toISOString(),
    });
  }
}