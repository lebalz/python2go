// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { execSync } from "child_process";

import * as fs from "fs";
import {
  inElevatedShell,
  logSummary,
  uninstall as chocoUninstall,
  inShell,
} from "./package-manager/src/chocolatey";
import { Progress, SuccessMsg, TaskMessage, ErrorMsg } from "./package-manager/src/helpers";
import { shellExec, vscodeInstallPackageManager } from "./package-manager/src/packageManager";

const PYTHON_VERSION = "3.8.3";
const CHOCO_LOG_VERSION_REGEXP = new RegExp(
  `Successfully installed 'python3 ${PYTHON_VERSION}'\.\r?\n(.*\r?\n)+?.*Installed to: '(?<location>.*)'`,
  "gi"
);
const CHOCO_LOG_LOCATION_REGEXP = /Installed to: '(?<location>.*)'/i;

function installPythonWindows(
  context: vscode.ExtensionContext
): Thenable<TaskMessage> {
  if (!fs.existsSync(context.logPath)) {
    fs.mkdirSync(context.logPath);
  }

  const logPath = `${context.logPath}\\chocolog_${Date.now()}.log`;

  return inElevatedShell(
    `choco install -y python3 --side-by-side --version=${PYTHON_VERSION} | Tee-Object -FilePath ${logPath} | Write-Output`
  )
    .then((result) => {
      if (result.error) {
        vscode.window.showErrorMessage(`Trouble installing python:\n${result.error}`);
        return result;
      }
      return winInstallationLocation();
    });
}

function winInstallationLocation(): Thenable<TaskMessage> {
  return logSummary().then((summary) => {
    const installations = summary.match(CHOCO_LOG_VERSION_REGEXP);

    const locations = installations?.map((install) => {
      const locationMatch = install.match(CHOCO_LOG_LOCATION_REGEXP);
      return locationMatch!.groups!.location;
    });
    if (!locations || locations.length === 0) {
      return ErrorMsg(`Python ${PYTHON_VERSION} not installed`);
    }
    return SuccessMsg(locations[locations.length - 1]);
  });
}

function osxInstallationLocation(): string {
  return `~/.pyenv/versions/${PYTHON_VERSION}/bin/python`;
}

function isPythonInstalled(): Thenable<boolean> {
  if (process.platform === "darwin") {
    return shellExec(`pyenv versions | grep ${PYTHON_VERSION}`)
      .then((result) => {
        if (result.success && result.msg.length > 0) {
          return true;
        }
        return false;
      });
  } else if (process.platform === "win32") {
    return inShell(`choco list -lo python3 --version ${PYTHON_VERSION}`)
      .then((result) => {
        if (result.success) {
          return /1 packages installed\./i.test(result.msg);
        }
        return false;
      });
  }
  return new Promise((resolve) => resolve(false));
}

function installationLocation(): Thenable<TaskMessage> {
  if (process.platform === "darwin") {
    return new Promise((resolve) => resolve(SuccessMsg(osxInstallationLocation())));
  } else if (process.platform === "win32") {
    return winInstallationLocation();
  }
  return new Promise((resolve) => resolve(ErrorMsg('Plattform not supported')));
}

function installPythonWithPyEnv(
  context: vscode.ExtensionContext
): Thenable<TaskMessage> {

  return shellExec(
    `cat -s ${`${context.extensionPath}/bin/install_pyenv_python.sh`} | bash -s "${PYTHON_VERSION}" && echo "Success."`
  )
    .then((result) => {
      if (!(result.msg ?? result.error ?? '').endsWith("Success.")) {
        vscode.window.showErrorMessage(
          `Could not install install python.\n${result.error ?? result.msg}`
        );
        return ErrorMsg(result.error ?? result.msg ?? '');
      }
      return SuccessMsg(osxInstallationLocation());
    });
}

/**
 * @return [Promise<string | undefined>]
 *    on success:         returns the location of the python executable
 *    error:              undefined
 */
function installPython(
  context: vscode.ExtensionContext,
  progress: Progress
): Thenable<TaskMessage> {
  return isPythonInstalled()
    .then((isInstalled) => {
      if (isInstalled) {
        return installationLocation();
      }
      return vscodeInstallPackageManager(context, progress, 30).then((success) => {
        if (!success) {
          return ErrorMsg('Could not install Package Manager');
        }
        return vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Python2go]: Installing Python ${PYTHON_VERSION}`
          },
          () => {
            progress.report({ message: "Install Python", increment: 35 });
            if (process.platform === "darwin") {
              return installPythonWithPyEnv(context);
            } else if (process.platform === "win32") {
              return installPythonWindows(context);
            }
            return new Promise((resolve) => resolve(ErrorMsg(`Plattform '${process.platform}' not supported`)));
          }
        );
      });
    });
}

function uninstallPython(context: vscode.ExtensionContext): Thenable<TaskMessage> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "[Python2go]: Uninstalling Python",
      cancellable: false,
    },
    (_token) => {
      return isPythonInstalled().then((isInstalled) => {
        if (!isInstalled) {
          return ErrorMsg(`Python ${PYTHON_VERSION} was not installed.`);
        }
        if (process.platform === "darwin") {
          return shellExec(
            `cat -s ${`${context.extensionPath}/bin/uninstall_python.sh`} | bash -s "${PYTHON_VERSION}"`
          );
        } else if (process.platform === "win32") {
          return chocoUninstall("python3", PYTHON_VERSION);
        }
        return ErrorMsg(`Plattform ${process.platform} not supported.`);
      });
    }
  );
}

function configure(location?: string, showErrorMsg: boolean = true) {
  if (location?.length === 0) {
    throw new Error("No installation path provided");
  }
  vscode.window.showInformationMessage(`Configure python settings`);
  return isPythonInstalled().then((isInstalled) => {
    if (!isInstalled && showErrorMsg) {
      vscode.window.showErrorMessage(
        `Python ${PYTHON_VERSION} is not installed.`
      );
    }
    if (process.platform === "darwin") {
      execSync(`pyenv global ${PYTHON_VERSION}`);
    }
    const configuration = vscode.workspace.getConfiguration();
    configuration
      .update(
        "python.pythonPath",
        isInstalled ? location : undefined,
        vscode.ConfigurationTarget.Global
      )
      .then(() => {
        configuration.update(
          "python.defaultInterpreterPath",
          isInstalled ? location : undefined,
          vscode.ConfigurationTarget.Global
        );
      });
  });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "python2go" is now active!');

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let installDisposer = vscode.commands.registerCommand(
    "python2go.install",
    () => {
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "[Python2go]: Install",
          cancellable: true,
        },
        (progress, _token) => {
          progress.report({ message: "Start...", increment: 5 });
          return installPython(context, progress)
            .then((result) => {
              if (!result.success || result.msg.length === 0) {
                throw new Error("Installation failed.");
              }
              progress.report({ message: "Configure...", increment: 90 });
              return configure(result.msg);
            })
            .then(() => {
              progress.report({ message: "Success", increment: 100 });
              vscode.window.showInformationMessage(
                "Python installed and configured. Ready to go"
              );
            });
        }
      );
    }
  );

  let configureDisposer = vscode.commands.registerCommand(
    "python2go.configure",
    () => {
      installationLocation()
        .then((result) => {
          if (result.success && result.msg.length > 0) {
            return configure(result.msg);
          }
          vscode.window.showInformationMessage(
            `Could not update configuration: ${result.error}`
          );
        });
    }
  );

  let uninstallDisposer = vscode.commands.registerCommand(
    "python2go.uninstall",
    () => {
      try {
        uninstallPython(context).then((msg) => {
          configure(undefined, false);
          vscode.window.showInformationMessage(
            `Uninstalled Python ${PYTHON_VERSION}.\n${msg}`
          );
        });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Could not uninstall Python ${PYTHON_VERSION}:\n${error}`
        );
      }
    }
  );

  context.subscriptions.push(installDisposer);
  context.subscriptions.push(configureDisposer);
  context.subscriptions.push(uninstallDisposer);
}

// this method is called when your extension is deactivated
export function deactivate() { }
