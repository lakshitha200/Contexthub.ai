import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;

  /**
   * Optional per-question scope filters. Default (omitted) = search the whole
   * workspace. Tenant isolation (workspace) is always enforced server-side and
   * cannot be widened by these.
   */
  @IsOptional()
  @IsString()
  collectionId?: string;

  @IsOptional()
  @IsString()
  documentId?: string;
}
