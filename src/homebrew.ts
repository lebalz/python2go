import * as vscode from "vscode";
import { promisify } from "util";
import { exec } from "child_process";
import { promptRootPassword, Progress } from "./helpers";

export function isBrewInstalled() {
  const shellExec = promisify(exec);
  return shellExec("brew -v")
    .then(({ stdout, stderr }) => {
      if (stdout.length > 0) {
        return true;
      }
      return false;
    })
    .catch(() => {
      return false;
    });
}

export function installBrew(extensionPath: string, rootPW?: string): Promise<boolean> {
  if (!rootPW) {
    return isBrewInstalled();
  }
  return isBrewInstalled()
    .then((isInstalled) => {
      if (isInstalled) {
        return true;
      }
      const shellExec = promisify(exec);
      return shellExec(
        `cat -s ${`${extensionPath}/bin/install_brew.sh`} | bash -s "${rootPW}" && echo "Success."`
      )
        .then(({ stdout, stderr }) => {
          if (!stdout || !stdout.endsWith("Success.\n")) {
            return false;
          }
          return true;
        });
    })
    .catch((error) => {
      return false;
    });
}

export function vscodeInstallBrew(
  context: vscode.ExtensionContext,
  progress: Progress,
  progressOnSuccess: number
): Promise<boolean | undefined> {
  return isBrewInstalled()
    .then((isInstalled) => {
      if (isInstalled) {
        progress.report({ message: 'Brew installed', increment: progressOnSuccess });
        return true;
      }
      promptRootPassword()
        .then((rootPW) => {
          if (!rootPW) {
            return { stdout: "", stderr: "ERROR: no root password" };
          }
          return installBrew(context.extensionPath, rootPW).then((success) => {
            if (success) {
              progress.report({ message: 'Brew installed', increment: progressOnSuccess });
              return true;
            }
            vscode.window.showErrorMessage(
              `Could not install install brew. Try to install it manually and try the setup process again.`
            );
            return false;
          });
        });
    }).catch((error) => {
      vscode.window.showErrorMessage(error);
      return false;
    });
}