import { IsEnum, IsOptional } from 'class-validator';
import { DocStatus } from '../../../generated/prisma/client';

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsEnum(DocStatus)
  status?: DocStatus;
}
