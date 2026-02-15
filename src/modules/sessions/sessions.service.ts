import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { Session } from './entities/session.entity';

interface CreateSessionDto {
  userId: string;
  refreshToken: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async create(dto: CreateSessionDto): Promise<Session> {
    const session = this.sessionRepository.create(dto);
    const saved = await this.sessionRepository.save(session);

    // Cache active session in Redis for quick validation
    await this.redis.setex(
      `session:${dto.userId}:${saved.id}`,
      7 * 24 * 60 * 60, // 7 days
      JSON.stringify({
        refreshToken: dto.refreshToken,
        ipAddress: dto.ipAddress,
        userAgent: dto.userAgent,
      }),
    );

    return saved;
  }

  async findByRefreshToken(token: string): Promise<Session | null> {
    // Try Redis first
    const keys = await this.redis.keys(`session:*`);
    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const session = JSON.parse(data);
        if (session.refreshToken === token) {
          // Found in cache, get from DB for full data
          const sessionId = key.split(':').pop();
          return this.sessionRepository.findOne({
            where: { id: sessionId },
            relations: ['user'],
          });
        }
      }
    }

    // Fallback to database
    return this.sessionRepository.findOne({
      where: { refreshToken: token },
      relations: ['user'],
    });
  }

  async enforceSessionLimit(userId: string, maxSessions: number): Promise<void> {
    const activeSessions = await this.sessionRepository.find({
      where: { userId, isRevoked: false },
      order: { createdAt: 'ASC' },
    });

    if (activeSessions.length >= maxSessions) {
      // Revoke oldest sessions
      const toRevoke = activeSessions.slice(0, activeSessions.length - maxSessions + 1);
      await Promise.all(
        toRevoke.map(session => this.revokeSession(session.id)),
      );
      
      this.logger.log(`Revoked ${toRevoke.length} old sessions for user ${userId}`);
    }
  }

  async updateRefreshToken(
    sessionId: string,
    newRefreshToken: string,
    newExpiry: Date,
  ): Promise<void> {
    await this.sessionRepository.update(sessionId, {
      refreshToken: newRefreshToken,
      expiresAt: newExpiry,
    });

    // Update Redis cache
    const keys = await this.redis.keys(`session:*:${sessionId}`);
    if (keys.length > 0) {
      const data = await this.redis.get(keys[0]);
      if (data) {
        const session = JSON.parse(data);
        session.refreshToken = newRefreshToken;
        await this.redis.setex(keys[0], 7 * 24 * 60 * 60, JSON.stringify(session));
      }
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessionRepository.update(sessionId, { isRevoked: true });
    
    // Remove from Redis
    const keys = await this.redis.keys(`session:*:${sessionId}`);
    if (keys.length > 0) {
      await this.redis.del(keys[0]);
    }
  }

  async revokeByRefreshToken(token: string): Promise<void> {
    const session = await this.findByRefreshToken(token);
    if (session) {
      await this.revokeSession(session.id);
    }
  }

  async revokeAllUserSessions(userId: string, exceptCurrent?: string): Promise<void> {
    const query = this.sessionRepository
      .createQueryBuilder()
      .update(Session)
      .set({ isRevoked: true })
      .where('user_id = :userId', { userId });

    if (exceptCurrent) {
      query.andWhere('refresh_token != :token', { token: exceptCurrent });
    }

    await query.execute();

    // Clear Redis cache for user
    const keys = await this.redis.keys(`session:${userId}:*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.sessionRepository
      .createQueryBuilder()
      .delete()
      .where('expires_at < NOW()')
      .orWhere('is_revoked = true AND updated_at < NOW() - INTERVAL \'7 days\'')
      .execute();

    return result.affected || 0;
  }
}