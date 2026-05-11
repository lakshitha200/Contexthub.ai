export class TokensResponseDto {
  accessToken!: string;
  refreshToken!: string;
}

export class UserResponseDto {
  id!: string;
  email!: string;
  name!: string | null;
  avatarUrl!: string | null;
  emailVerified!: Date | null;
  createdAt!: Date;
}

export class AuthResponseDto {
  user!: UserResponseDto;
  tokens!: TokensResponseDto;
}
