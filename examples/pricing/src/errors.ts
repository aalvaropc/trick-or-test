export class ValidationError extends Error {
  readonly field: string;
  constructor(field: string, message?: string) {
    super(message ?? `Invalid value for ${field}`);
    this.name = 'ValidationError';
    this.field = field;
  }
}
