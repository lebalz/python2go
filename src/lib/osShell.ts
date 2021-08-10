import { Logger } from "./logger";
import { exec, ChildProcess, ExecException } from "child_process";
import { SuccessMsg, ErrorMsg, TaskMessage } from './helpers';

interface OsShellResult {
  stdout: string;
  stderr: string;
  error: ExecException | null;
  exitCode?: number | null;
}

/**
 * executes a command within the native os shell.
 * Windows: cmd, OSX: bash or zsh
 * @param cmd [string]
 * @return Promise<TaskMessage>
 */
export function shellExec(cmd: string): Thenable<TaskMessage> {
  return OsShell.exec(cmd)
    .then(({ stdout, stderr, exitCode }) => {
      if (exitCode === 0) {
        return SuccessMsg(stdout, stderr);
      }
      if (stderr.length > 0) {
        if (stdout.length === 0) {
          return ErrorMsg(stderr.trim());
        }
        return ErrorMsg(`${stderr}\n${stdout}`.trim());
      }
      return SuccessMsg(stdout);
    })
    .catch((error: Error) => {
      return ErrorMsg(`${error.name}: ${error.message}`);
    });
}

export function inOsShell(cmd: string, options?: { sudo?: boolean, requiredCmd?: string, promptMsg?: string }): Thenable<TaskMessage> {
  return shellExec(cmd);
}

export default class OsShell {
  cmd: string;
  executor?: ChildProcess;
  promise: Promise<OsShellResult>;
  constructor(cmd: string) {
    this.cmd = cmd;
    this.promise = new Promise((resolve) => {
      this.executor = exec(this.cmd, (error, stdout, stderr) => {
        Logger.log("PID [", this.executor?.pid, "] finished");
        resolve({ stdout: stdout, stderr: stderr, error: error, exitCode: this.executor?.exitCode });
      });
      Logger.log("PID [", this.executor?.pid, "] started");
      this.executor.stdout?.on("data", (message) => {
        Logger.log(message);
      });
      this.executor.stderr?.on("data", (message) => {
        Logger.error(message);
      });
    });
  }

  kill() {
    this.executor?.kill(9);
  }

  static exec(cmd: string): Promise<OsShellResult> {
    const osShell = new OsShell(cmd);
    return osShell.promise;
  }
}
