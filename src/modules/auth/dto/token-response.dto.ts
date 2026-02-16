export class TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
  tokenType: string;
  message?: string;
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles?: Array<{
      id: string;
      name: string;
      type: string;
      isSystem: boolean;
    }>;
    permissions?: string[];
  };
}