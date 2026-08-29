import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DocStatus, DocType } from '../../../generated/prisma/client';

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsEnum(DocStatus)
  status?: DocStatus;

  /** Narrow to one document classification, e.g. ?docType=CONTRACT. */
  @IsOptional()
  @IsEnum(DocType)
  docType?: DocType;

  /**
   * Narrow to documents carrying this topic keyword. Topics are stored
   * lowercase, so the query is lowercased to match.
   */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  topic?: string;
}
