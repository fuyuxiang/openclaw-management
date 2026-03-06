import { spawn } from 'node:child_process';
import { CommandError } from './errors';

export interface CommandOptions {
  timeoutMs?: number;
  allowNonZeroExit?: boolean;
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function runCommand(command: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
  const { timeoutMs = 20000, allowNonZeroExit = false } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      env: process.env
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(new CommandError(`命令执行失败: ${err.message}`, -1, stdout, stderr));
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      const exitCode = code ?? -1;

      if (timedOut) {
        reject(new CommandError('命令执行超时', exitCode, stdout.trim(), stderr.trim()));
        return;
      }

      const result: CommandResult = {
        code: exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

      if (exitCode !== 0 && !allowNonZeroExit) {
        reject(new CommandError('命令执行返回非零状态码', exitCode, result.stdout, result.stderr));
        return;
      }

      resolve(result);
    });
  });
}
