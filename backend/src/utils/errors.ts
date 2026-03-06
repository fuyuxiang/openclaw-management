export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class CommandError extends Error {
  public readonly exitCode: number;
  public readonly stdout: string;
  public readonly stderr: string;

  constructor(message: string, exitCode: number, stdout: string, stderr: string) {
    super(message);
    this.name = 'CommandError';
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}
