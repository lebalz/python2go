import * as Shell from 'node-powershell';
import { Logger } from "./logger";
import { exec, ChildProcess, ExecException, execSync } from "child_process";
import { promptRootPassword, SuccessMsg, ErrorMsg, TaskMessage } from './helpers';

export const WIN_RELOAD_ENV_CMD = "$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')";
export const WIN_RELOAD_PATH_IF_CMD_MISSING = (cmd: string) => `If (-Not (Get-Command ${cmd} -errorAction SilentlyContinue )) { ${WIN_RELOAD_ENV_CMD} }`;

export function powershell() {
  return new Shell({
    executionPolicy: 'Bypass',
    verbose: true,
    noProfile: true
  });
}

interface OsShellResult {
  stdout: string;
  stderr: string;
  error: ExecException | null;
  exitCode?: number | null;
}



const winElevatedShell = (command: string, options?: { requiredCmd?: string }): Thenable<TaskMessage> => {
  const ps = powershell();
  const cmd = `Start-Process -FilePath "powershell" -Wait -Verb RunAs -ArgumentList "-noprofile", "-command &{${command.replace(/(\r\n|\n|\r)/gm, "").replace(/"/g, '`"')}}"`;
  if (options?.requiredCmd) {
    ps.addCommand(WIN_RELOAD_PATH_IF_CMD_MISSING(options?.requiredCmd));
  }
  ps.on('output', (out) => {
    Logger.log(out);
  });
  ps.on('err', (error) => {
    Logger.warn(error);
  });
  ps.addCommand(cmd);
  return ps.invoke().then((res) => SuccessMsg(res)).catch((err: Error) => ErrorMsg(`${err.name}: ${err.message}`));
};

const winShell = (command: string, options?: { requiredCmd?: string }): Thenable<TaskMessage>  => {
  const ps = powershell();
  if (options?.requiredCmd) {
    ps.addCommand(WIN_RELOAD_PATH_IF_CMD_MISSING(options?.requiredCmd));
  }
  ps.on('output', (out) => {
    Logger.log(out);
  });
  ps.on('err', (error) => {
    Logger.warn(error);
  });
  ps.addCommand(command);
  return ps.invoke().then((res) => SuccessMsg(res)).catch((error: Error) => ErrorMsg(`${error.name}: ${error.message}`));
};

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
  if (process.platform === 'win32') {
    if (options?.sudo) {
      return winElevatedShell(cmd, options);
    }
    return winShell(cmd, options);
  }
  if (options?.sudo) {
    return promptRootPassword(options.promptMsg)
      .then((rootPw) => {
        if (!rootPw) {
          // throw new Error('No root password was provided');
          return ErrorMsg('Error: No root password provided');
        }
        return shellExec(`echo "${rootPw}" | sudo -S echo foo > /dev/zero && ${cmd}`);
      });
  }
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
