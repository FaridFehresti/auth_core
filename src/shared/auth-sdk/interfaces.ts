export interface TokenPayload {
  sub: string;
  email: string;
  roles: string[];
  permissions: string[];
  type: string;
  jti: string;
}

export interface TokenIntrospectionResult {
  active: boolean;
  payload: TokenPayload;
}