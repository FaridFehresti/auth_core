import { Injectable, Logger } from '@nestjs/common';

interface AuditLogEntry {
  userId: string;
  action: string;
  resource: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  async log(entry: AuditLogEntry): Promise<void> {
    this.logger.log({
      timestamp: new Date().toISOString(),
      ...entry,
    });
    // TODO: Implement database persistence
  }
}