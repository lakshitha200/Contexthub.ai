import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class MagicLinkRequestDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}

export class MagicLinkVerifyDto {
  @IsString()
  token!: string;
}
