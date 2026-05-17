/**
 * Minimal shape of a Multer in-memory file. Declared locally because
 * `@types/multer` is not installed (offline registry); the runtime object
 * provided by NestJS's FileInterceptor matches this contract.
 */
export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
