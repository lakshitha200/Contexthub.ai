import { IsEmail, MaxLength } from 'class-validator';

export class ResendVerificationDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
