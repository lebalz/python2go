// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { promisify } from "util";
import { exec, execSync } from "child_process";

import * as fs from "fs";
import {
  installChocolatey,
  powershell,
  inElevatedShell,
  logSummary,
  uninstall as chocoUninstall,
  inShell,
} from "./chocolatey";
import { vscodeInstallBrew } from "./homebrew";
import { Progress } from "./helpers";

const PYTHON_VERSION = "3.8.3";
const CHOCO_LOG_VERSION_REGEXP = new RegExp(
  `Successfully installed 'python3 ${PYTHON_VERSION}'\.\r?\n(.*\r?\n)+?.*Installed to: '(?<location>.*)'`,
  "gi"
);
const CHOCO_LOG_LOCATION_REGEXP = /Installed to: '(?<location>.*)'/i;
const CHOCO_LOG_ALREADY_INSTALLED = /python .* already installed/i;

function installPythonWindows(
  context: vscode.ExtensionContext,
  progress: Progress
) {
  progress.report({ message: "Install Chocolatey", increment: 15 });
  return installChocolatey().then((version) => {
    if (!version) {
      vscode.window.showErrorMessage(
        "Could not install the package manager 'chocolatey'. Make sure to install it manually."
      );
      return undefined;
    }

    progress.report({
      message: `Chocolatey '${version}' Installed`,
      increment: 40,
    });

    if (!fs.existsSync(`${context.extensionPath}\\logs`)) {
      fs.mkdirSync(`${context.extensionPath}\\logs`);
    }

    const logPath = `${
      context.extensionPath
    }\\logs\\chocolog_${Date.now()}.log`;

    progress.report({
      message: `Install Python ${PYTHON_VERSION}`,
      increment: 45,
    });
    return inElevatedShell(
      `choco install -y python3 --side-by-side --version=${PYTHON_VERSION} | Tee-Object -FilePath ${logPath} | Write-Output`
    )
      .then((out) => {
        progress.report({
          message: `Python installed:\n${out}`,
          increment: 80,
        });
        const ps = powershell();
        ps.addCommand(`Get-Content -Path ${logPath}`);
        return ps.invoke().then((log) => {
          const alreadyInstalled = CHOCO_LOG_ALREADY_INSTALLED.test(log);
          if (alreadyInstalled) {
            return winInstallationLocation();
          }

          console.log(log);
          const match = log.match(CHOCO_LOG_LOCATION_REGEXP);
          const installLocation = match?.groups?.location;
          return installLocation;
        });
      })
      .catch((error) => {
        vscode.window.showErrorMessage(`Trouble installing python:\n${error}`);
        return undefined;
      });
  });
}

function winInstallationLocation(): Promise<string> {
  return logSummary().then((summary) => {
    const installations = summary.match(CHOCO_LOG_VERSION_REGEXP);
    const locations =
      installations?.map((install) => {
        const locationMatch = install.match(CHOCO_LOG_LOCATION_REGEXP);
        return locationMatch!.groups!.location;
      }) ?? [];
    return locations[locations.length - 1];
  });
}

function osxInstallationLocation(): string {
  return `~/.pyenv/versions/${PYTHON_VERSION}/bin/python`;
}

function isPythonInstalled(): Promise<boolean> {
  if (process.platform === "darwin") {
    const shellExec = promisify(exec);
    return shellExec(`pyenv versions | grep ${PYTHON_VERSION}`)
      .then(({ stdout, stderr }) => {
        if (stderr.length > 0) {
          return false;
        }
        if (stdout.length === 0) {
          return false;
        }
        return true;
      })
      .catch((err) => {
        console.log(err);
        return false;
      });
  } else if (process.platform === "win32") {
    return inShell(`choco list -lo python3 --version ${PYTHON_VERSION}`)
      .then((result) => {
        return /1 packages installed\./i.test(result);
      })
      .catch(() => false);
  }
  return new Promise((resolve) => resolve(false));
}

function installationLocation(): Promise<string> {
  if (process.platform === "darwin") {
    return new Promise((resolve) => resolve(osxInstallationLocation()));
  } else if (process.platform === "win32") {
    return winInstallationLocation();
  }
  return new Promise((resolve) => resolve(""));
}

function installPythonWithPyEnv(
  context: vscode.ExtensionContext,
  progress: Progress
): Promise<string | undefined> {
  const shellExec = promisify(exec);
  progress.report({
    message: `Install PyEnv and Python ${PYTHON_VERSION}`,
    increment: 30,
  });

  return shellExec(
    `cat -s ${`${context.extensionPath}/bin/install_pyenv_python.sh`} | bash -s "${PYTHON_VERSION}" && echo "Success."`
  )
    .then(({ stdout, stderr }) => {
      if (!stdout || !stdout.endsWith("Success.\n")) {
        vscode.window.showErrorMessage(
          `Could not install install python.\n${stderr}`
        );
        return undefined;
      }
      progress.report({ message: "PyEnv Installed", increment: 70 });
      return osxInstallationLocation();
    })
    .catch((error) => {
      vscode.window.showErrorMessage(error);
      return undefined;
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
): Thenable<string | undefined> {
  return isPythonInstalled()
    .then((isInstalled) => {
      if (isInstalled) {
        return installationLocation();
      }
      if (process.platform === "darwin") {
        return vscodeInstallBrew(context, progress, 30).then((success) => {
          if (!success) {
            return undefined;
          }
          return vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `[Python2go]: Installing Python ${PYTHON_VERSION}`,
              cancellable: false,
            },
            () => {
              return installPythonWithPyEnv(context, progress);
            }
          );
        });
      } else if (process.platform === "win32") {
        return vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `[Python2go]: Installing Python ${PYTHON_VERSION}`,
            cancellable: false,
          },
          () => {
            return installPythonWindows(context, progress);
          }
        );
      }
    })
    .catch(() => undefined);
}

function uninstallPython(context: vscode.ExtensionContext) {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "[Python2go]: Uninstalling Python",
      cancellable: false,
    },
    (progress, _token) => {
      return isPythonInstalled().then((isInstalled) => {
        if (!isInstalled) {
          throw new Error(`Python ${PYTHON_VERSION} was not installed.`);
        }
        if (process.platform === "darwin") {
          const shellExec = promisify(exec);
          return shellExec(
            `cat -s ${`${context.extensionPath}/bin/uninstall_python.sh`} | bash -s "${PYTHON_VERSION}"`
          ).then(({ stdout, stderr }) => {
            if (stderr.length > 0) {
              throw new Error(stderr);
            }
            return stdout;
          });
        } else if (process.platform === "win32") {
          return chocoUninstall("python3", PYTHON_VERSION);
        }
        throw new Error("Platform not supported");
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
            .then((location) => {
              if (!location) {
                throw new Error("Installation failed.");
              }
              progress.report({ message: "Configure...", increment: 95 });
              return configure(location);
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
        .then((location) => {
          return configure(location);
        })
        .catch((error) => {
          vscode.window.showInformationMessage(
            `Could not update configuration: ${error}`
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
export function deactivate() {}
