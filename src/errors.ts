export class ScratchValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly evidence: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ScratchValidationError';
  }
}

