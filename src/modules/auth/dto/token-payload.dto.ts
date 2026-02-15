export class TokenPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  type: string;
  jti: string;
  iat: number;
  exp: number;
}