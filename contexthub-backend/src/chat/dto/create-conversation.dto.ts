import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  /** Restrict retrieval to a single collection. Omit to search the whole workspace. */
  @IsOptional()
  @IsString()
  collectionId?: string;
}
