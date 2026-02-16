import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { UsersService } from '../users/users.service';
import { SessionsService } from '../sessions/sessions.service';
import { AuditService } from '../audit/audit.service';
import { AuthRepository } from './auth.repository';

import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  TokenResponseDto,
  TokenPayload,
} from './dto';
import { User } from '../users/entities/user.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly sessionsService: SessionsService,
    private readonly auditService: AuditService,
    private readonly authRepository: AuthRepository,
    private readonly emailService: EmailService,

  ) { }

  async register(dto: RegisterDto, ip?: string, userAgent?: string): Promise<TokenResponseDto> {
    // Check if user exists
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, 12);

    // Create user
    const user = await this.usersService.create({
      ...dto,
      password: hashedPassword,
      emailVerified: false,
    });

    // Generate verification token
    const verificationToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        type: 'email-verification'
      },
      {
        secret: this.configService.get('jwt.access.secret'),
        expiresIn: '24h',
      }
    );

    // CAPTURE EMAIL (ADD THIS BLOCK)
    try {
      await this.emailService.sendVerificationEmail(user.email, verificationToken);
      this.logger.log(`📧 Verification email captured for ${user.email}`);
    } catch (error) {
      this.logger.error('Failed to capture email:', error);
    }

    // Generate tokens
    const tokens = await this.generateTokenPair(user);

    // Create session
    await this.sessionsService.create({
      userId: user.id,
      refreshToken: tokens.refreshToken,
      ipAddress: ip,
      userAgent,
      expiresAt: this.calculateExpiryDate('refresh'),
    });

    // Audit log
    await this.auditService.log({
      userId: user.id,
      action: 'USER_REGISTERED',
      resource: 'auth',
      details: {
        email: dto.email,
        verificationEmailCaptured: true
      },
      ipAddress: ip,
      userAgent,
    });

    this.logger.log(`User registered: ${user.email}`);

    // Return with helpful message
    return {
      ...tokens,
      message: 'Registration successful! Check the email capture interface to verify your email.',
    } as any;
  }
  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get('jwt.access.secret'),
      });

      if (payload.type !== 'email-verification') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      if (user.emailVerified) {
        return { success: true, message: 'Email already verified' };
      }

      await this.usersService.update(user.id, { emailVerified: true });

      this.logger.log(`Email verified: ${user.email}`);

      return {
        success: true,
        message: 'Email verified successfully! You can now log in.'
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }
  }
  async login(dto: LoginDto, ip?: string, userAgent?: string): Promise<TokenResponseDto> {
  const user = await this.validateUser(dto.email, dto.password);

  if (!user.isActive) {
    throw new UnauthorizedException('Account is disabled');
  }

  if (!user.emailVerified) {
    throw new UnauthorizedException('Email not verified');
  }

  // ✅ Load user with roles and permissions
  const userWithRoles = await this.usersService.findByIdWithRolesAndPermissions(user.id);

  // ✅ Add null check
  if (!userWithRoles) {
    throw new UnauthorizedException('User not found');
  }

  // Check for existing sessions limit (enterprise: max 5 concurrent sessions)
  await this.sessionsService.enforceSessionLimit(user.id, 5);

  // Generate tokens
  const tokens = await this.generateTokenPair(userWithRoles);

  // Create session
  await this.sessionsService.create({
    userId: user.id,
    refreshToken: tokens.refreshToken,
    ipAddress: ip,
    userAgent,
    expiresAt: this.calculateExpiryDate('refresh'),
  });

  // Update last login
  await this.usersService.updateLastLogin(user.id);

  // Audit log
  await this.auditService.log({
    userId: user.id,
    action: 'USER_LOGIN',
    resource: 'auth',
    details: { method: 'password' },
    ipAddress: ip,
    userAgent,
  });

  this.logger.log(`User logged in: ${user.email} from ${ip}`);
  
  // ✅ Return tokens with user info including roles and permissions
  return {
    ...tokens,
    user: {
      id: userWithRoles.id,
      email: userWithRoles.email,
      firstName: userWithRoles.firstName,
      lastName: userWithRoles.lastName,
      roles: userWithRoles.roles?.map(r => ({
        id: r.id,
        name: r.name,
        type: r.type,
        isSystem: r.isSystem,
      })),
      permissions: this.extractPermissions(userWithRoles),
    },
  } as any;
}

  async refreshTokens(dto: RefreshTokenDto, ip?: string, userAgent?: string): Promise<TokenResponseDto> {
    try {
      // Verify refresh token
      const payload = await this.jwtService.verifyAsync(dto.refreshToken, {
        secret: this.configService.get('jwt.refresh.secret'),
        audience: this.configService.get('jwt.audience'),
        issuer: this.configService.get('jwt.issuer'),
      });

      // Check if session exists and is valid
      const session = await this.sessionsService.findByRefreshToken(dto.refreshToken);
      if (!session || session.isRevoked) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Get user
      const user = await this.usersService.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Rotate tokens (security best practice)
      const tokens = await this.generateTokenPair(user);

      // Update session with new refresh token
      await this.sessionsService.updateRefreshToken(
        session.id,
        tokens.refreshToken,
        this.calculateExpiryDate('refresh'),
      );

      // Audit log
      await this.auditService.log({
        userId: user.id,
        action: 'TOKEN_REFRESHED',
        resource: 'auth',
        ipAddress: ip,
        userAgent,
      });

      return tokens;
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken?: string, allSessions = false): Promise<void> {
    if (allSessions) {
      await this.sessionsService.revokeAllUserSessions(userId);
      this.logger.log(`All sessions revoked for user: ${userId}`);
    } else if (refreshToken) {
      await this.sessionsService.revokeByRefreshToken(refreshToken);
      this.logger.log(`Session revoked for user: ${userId}`);
    }

    await this.auditService.log({
      userId,
      action: allSessions ? 'LOGOUT_ALL' : 'LOGOUT',
      resource: 'auth',
      details: { allSessions },
    });
  }

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findByEmail(email, true);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Increment failed login attempts
      await this.usersService.incrementFailedAttempts(user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async validateToken(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  // Service-to-service validation
  async validateApiKey(apiKey: string): Promise<{ serviceId: string; permissions: string[] } | null> {
    return this.authRepository.validateServiceApiKey(apiKey);
  }

private async generateTokenPair(user: User): Promise<TokenResponseDto> {
    const jti = uuidv4();

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync({
        sub: user.id,
        email: user.email,
        roles: user.roles?.map(r => r.name) || [],
        permissions: this.extractPermissions(user),
        type: 'access',
        jti,
      }),
      this.jwtService.signAsync(
        {
          sub: user.id,
          type: 'refresh',
          jti: uuidv4(),
        },
        {
          secret: this.configService.get('jwt.refresh.secret'),
          expiresIn: this.configService.get('jwt.refresh.expiresIn'),
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: this.configService.get('jwt.access.expiresIn') || '15m',
      tokenType: 'Bearer',
    };
  }

  private extractPermissions(user: User): string[] {
    const permissions = new Set<string>();
    user.roles?.forEach(role => {
      role.permissions?.forEach(perm => permissions.add(perm.code));
    });
    return Array.from(permissions);
  }

  private calculateExpiryDate(type: 'access' | 'refresh'): Date {
    const now = new Date();
    if (type === 'access') {
      now.setMinutes(now.getMinutes() + 15);
    } else {
      now.setDate(now.getDate() + 7);
    }
    return now;
  }
}