import { Logger } from "./package-manager/src/logger";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { execSync } from "child_process";

import {
  Progress,
  SuccessMsg,
  TaskMessage,
  ErrorMsg,
} from "./package-manager/src/helpers";
import {
  shellExec,
  vscodeInstallPackageManager,
  inOsShell,
} from "./package-manager/src/packageManager";

export enum Py2GoSettings {
  SkipInstallationCheck = "python2go.skipInstallationCheck",
  PythonVersion = "python2go.pythonVersion",
}

const CHOCO_LOG_LOCATION_REGEXP = /Installed to: '(?<location>.*)'/i;

interface PyVersion {
  major: number;
  minor: number;
  release: number;
  version: string;
}

function addUserPathToUsersEnv(pyVersion: PyVersion): Thenable<TaskMessage> {
  if (process.platform !== "win32") {
    return new Promise<TaskMessage>((resolve) => resolve(SuccessMsg("OK")));
  }
  return inOsShell("python -m site --user-base", {
    requiredCmd: "python",
    disableChocoCheck: true,
  }).then((result) => {
    if (result.error) {
      vscode.window.showErrorMessage(
        `Trouble getting --user install path:\n${result.error}`
      );
      return result;
    }
    const userSitePath = (result.msg ?? "").trim();
    const pythonPath = `${userSitePath}\\Python${pyVersion.major}${pyVersion.minor}`;
    const pythonVersionPath = `${pythonPath}\\Scripts`;

    return inOsShell(
      "[System.Environment]::GetEnvironmentVariable('Path','User')",
      {
        disableChocoCheck: true,
      }
    ).then((result) => {
      if (result.error || !result.msg) {
        vscode.window.showErrorMessage(
          `Trouble getting environment path:\n${result.error}`
        );
        return result;
      }
      const usrPath = result.msg;
      // remove older installations!!
      const pathes = usrPath
        .split(";")
        .filter((p) => !p.trim().startsWith(userSitePath));

      if (!usrPath.includes(pythonPath)) {
        return inOsShell(
          `setx Path '${pathes.join(";")};${pythonVersionPath}'`,
          {
            disableChocoCheck: true,
          }
        ).then((result) => {
          if (result.error || !result.msg) {
            vscode.window.showErrorMessage(
              `Trouble setting users environment path: ${result.error}`
            );
            Logger.warn(
              `Could not add --user python path to windows PATH: ${pythonVersionPath}`
            );
            return result;
          }
          Logger.log("Added --user python path to windows PATH");
          vscode.window.showInformationMessage(
            `Successfully added '${pythonVersionPath}' to the users path`
          );
          return result;
        });
      }
      return new Promise<TaskMessage>((resolve) => resolve(SuccessMsg("")));
    });
  });
}

function pythonVersion(): string {
  const conf = vscode.workspace.getConfiguration();
  return conf.get(Py2GoSettings.PythonVersion, "3.8.3");
}

function osxInstallationLocation(): string {
  const homeFolder = execSync("echo $HOME").toString().trim();
  return `${homeFolder}/.pyenv/versions/${pythonVersion()}/bin/python`;
}

function winInstallationLocation(): Thenable<TaskMessage> {
  return isPythonInstalled().then((version) => {
    if (!version) {
      return ErrorMsg("no installation found");
    }

    return inOsShell(
      "[System.Environment]::GetEnvironmentVariable('Path','User')",
      { disableChocoCheck: true }
    ).then((result) => {
      if (result.error || !result.msg) {
        return ErrorMsg("could not read environment");
      }
      const usrPath = result.msg;
      const pyFolder = `Python\\Python${version.major}${version.major}\\`;
      const pythonLocation = usrPath
        .split(";")
        .find((p) => p.trim().endsWith(pyFolder));
      if (!pythonLocation) {
        return ErrorMsg("no location found");
      }
      return SuccessMsg(pythonLocation);
    });
  });
}

function setContext(pyVersion: PyVersion | false) {
  if (pyVersion === false) {
    Logger.log(`Python installed: false`);
  } else {
    Logger.log(`Python ${pyVersion.version} installed.`);
    return vscode.commands.executeCommand(
      "setContext",
      "python2go:isPythonInstalled",
      true
    );
  }
}

function isPythonInstalled(): Thenable<false | PyVersion> {
  try {
    return shellExec("python --version").then((result) => {
      if (!result.success) {
        setContext(false);
        return false;
      }
      const res = result.msg.match(
        /Python (?<major>\d)\.(?<minor>\d)\.(?<release>\d)/
      );
      if (
        !res ||
        res.groups?.major === undefined ||
        res.groups?.minor === undefined
      ) {
        setContext(false);

        return false;
      }
      const version = {
        major: Number.parseInt(res.groups.major, 10),
        minor: Number.parseInt(res.groups.minor, 10),
        release: Number.parseInt(res.groups.release, 10),
        version: `${res.groups.major}.${res.groups.minor}.${res.groups.release}`,
      };
      setContext(version);

      return version;
    });
  } catch (exception) {
    return new Promise((resolve) => resolve(false));
  }
}

function isPyEnvInstalled(): Thenable<boolean> {
  try {
    return shellExec("pyenv --version").then((result) => {
      if (!result.success) {
        return false;
      }
      const res = result.msg.match(
        /pyenv (?<major>\d)\.(?<minor>\d)\.(?<release>\d)/
      );
      if (
        !res ||
        res.groups?.major === undefined ||
        res.groups?.minor === undefined
      ) {
        return false;
      }

      return true;
    });
  } catch (exception) {
    return new Promise((resolve) => resolve(false));
  }
}

function installationLocation(): Thenable<TaskMessage> {
  if (process.platform === "darwin") {
    return new Promise((resolve) =>
      resolve(SuccessMsg(osxInstallationLocation()))
    );
  } else if (process.platform === "win32") {
    return winInstallationLocation();
  }
  return new Promise((resolve) => resolve(ErrorMsg("Location not found")));
}

function installPythonWithPyEnv(
  context: vscode.ExtensionContext
): Thenable<TaskMessage> {
  return shellExec(
    `cat -s ${`${context.extensionPath}/bin/install_pyenv_python.sh`} | bash -s "${pythonVersion()}" && echo "Success."`
  ).then((result) => {
    if ((result.msg ?? result.error ?? "").endsWith("Success.")) {
      if (!result.success) {
        vscode.window.showWarningMessage(
          `Warnings occured during installation:\n${result.error}`
        );
      }
      return SuccessMsg(osxInstallationLocation());
    }
    vscode.window.showErrorMessage(
      `Could not install install python.\n${result.error ?? result.msg}`
    );
    return ErrorMsg(result.error ?? result.msg ?? "");
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
  return isPythonInstalled().then((isInstalled) => {
    if (isInstalled && process.platform === "darwin") {
      return installationLocation();
    }
    return vscodeInstallPackageManager(context, progress, 30).then(
      (success) => {
        if (!success) {
          return ErrorMsg("Could not install Package Manager");
        }
        return vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Python2go]: Installing Python ${pythonVersion()}`,
          },
          () => {
            progress.report({ message: "Install Python", increment: 35 });
            if (process.platform === "darwin") {
              return installPythonWithPyEnv(context);
            }
            return new Promise((resolve) =>
              resolve(ErrorMsg(`Plattform '${process.platform}' not supported`))
            );
          }
        );
      }
    );
  });
}

function uninstallPython(
  context: vscode.ExtensionContext
): Thenable<TaskMessage> {
  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "[Python2go]: Uninstalling Python",
      cancellable: false,
    },
    (_token) => {
      return isPythonInstalled().then((isInstalled) => {
        if (!isInstalled) {
          return ErrorMsg(`Python ${pythonVersion()} was not installed.`);
        }
        if (process.platform === "darwin") {
          return shellExec(
            `cat -s ${`${context.extensionPath}/bin/uninstall_python.sh`} | bash -s "${pythonVersion()}"`
          );
        }
        return ErrorMsg(
          `Unsupported Plattform, uninstall python manually from your system.`
        );
      });
    }
  );
}

function configure(location?: string, showErrorMsg: boolean = true) {
  if (location?.length === 0) {
    throw new Error("No installation path provided");
  }
  vscode.window.showInformationMessage(`Configure python settings`);
  return isPythonInstalled().then((pyVersion) => {
    if (!pyVersion && showErrorMsg) {
      vscode.window.showErrorMessage(`Python is not installed.`);
      return;
    }
    if (pyVersion === false) {
      return;
    }

    if (process.platform === "darwin") {
      execSync(`pyenv global ${pythonVersion()}`);
    }
    const configuration = vscode.workspace.getConfiguration();
    configuration
      .update(
        "python.pythonPath",
        pyVersion ? location : undefined,
        vscode.ConfigurationTarget.Global
      )
      .then(() => {
        configuration.update(
          "python.defaultInterpreterPath",
          pyVersion ? location : undefined,
          vscode.ConfigurationTarget.Global
        );
      });

    if (process.platform === "darwin") {
      configuration.update(
        "python.venvPath",
        "~/.pyenv",
        vscode.ConfigurationTarget.Global
      );
    }
  });
}

function pip(cmd: string) {
  const pipCmd = process.platform === "win32" ? "pip" : "pip3";
  return inOsShell(`${pipCmd} --disable-pip-version-check ${cmd}`, {
    requiredCmd: pipCmd,
    disableChocoCheck: true,
  });
}

function sudoPip(cmd: string) {
  const pipCmd = process.platform === "win32" ? "pip" : "sudo -H pip3";
  return inOsShell(`${pipCmd} --disable-pip-version-check ${cmd}`, {
    requiredCmd: pipCmd,
    sudo: true,
    promptMsg: `to execute "sudo pip3 ${cmd}"`,
    disableChocoCheck: true,
  });
}

function installedPipPackages(): Thenable<
  { package: string; version: string }[]
> {
  return pip("list").then((result) => {
    if (result.success) {
      const pkgs = result.msg.split(/\r?\n/).slice(2);
      Logger.log("Installed pip packages:");
      return pkgs.map((pkg) => {
        Logger.log(pkg);
        // \S --> any non whitespace character
        // \s --> any whitespace character
        const match = pkg.match(/(?<pkg>\S+)\s+(?<version>\S+)/);
        return {
          package: match?.groups?.pkg ?? "",
          version: match?.groups?.version ?? "",
        };
      });
    }
    return [];
  });
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  Logger.configure("python2go", "Python2Go");
  Logger.log("Welcome to Python2Go");
  const configuration = vscode.workspace.getConfiguration();

  vscode.commands.executeCommand(
    "setContext",
    "python2go.showGreenPlayIcon",
    configuration.get("python2go.showGreenPlayIcon")
  );
  vscode.commands.executeCommand(
    "setContext",
    "python2go.showYellowPlayIcon",
    configuration.get("python2go.showYellowPlayIcon")
  );
  if (configuration.get("python2go.python_version")) {
    configuration.update(
      Py2GoSettings.PythonVersion,
      configuration.get("python2go.python_version"),
      vscode.ConfigurationTarget.Global
    );
    configuration.update("python2go.python_version", undefined, vscode.ConfigurationTarget.Global);
  }
  isPythonInstalled().then((pyVersion) => {
    if (!pyVersion) {
      if (!configuration.get(Py2GoSettings.SkipInstallationCheck, false)) {
        if (process.platform === "darwin") {
          vscode.window
            .showWarningMessage(
              `Python ${pythonVersion()} is not installed`,
              "Install now",
              "Disable Check"
            )
            .then((selection) => {
              if (selection === "Install now") {
                return vscode.commands.executeCommand("python2go.install");
              } else if (selection === "Disable Check") {
                const conf = vscode.workspace.getConfiguration();
                conf.update(
                  Py2GoSettings.SkipInstallationCheck,
                  true,
                  vscode.ConfigurationTarget.Global
                );
              }
            });
        } else {
          vscode.window
            .showWarningMessage(
              `Python not found. Download and install it.`,
              "Disable Check"
            )
            .then((selection) => {
              if (selection === "Disable Check") {
                const conf = vscode.workspace.getConfiguration();
                conf.update(
                  Py2GoSettings.SkipInstallationCheck,
                  true,
                  vscode.ConfigurationTarget.Global
                );
              }
            });
        }
      }
    } else {
      if (process.platform === "win32") {
        if (!context.globalState.get("pythonUpdatedPath")) {
          addUserPathToUsersEnv(pyVersion).then((result) => {
            if (result.error) {
              vscode.window.showErrorMessage(
                "Python could not be added to PATH!"
              );
            }
            if (result.success) {
              context.globalState.update("pythonUpdatedPath", true);
            }
          });
        }
        if (!context.globalState.get("pythonConfigured")) {
          installationLocation().then((result) => {
            if (result.success) {
              configure(result.msg).then(() => {
                context.globalState.update("pythonConfigured", true);
              });
            }
          });
        }
      } else if (process.platform === "darwin") {
        isPyEnvInstalled().then((hasPyenv) => {
          if (!hasPyenv) {
            vscode.window
              .showWarningMessage(
                `Python ${pythonVersion()} is not installed with pyenv`,
                "Install now",
                "Disable Check"
              )
              .then((selection) => {
                if (selection === "Install now") {
                  return vscode.commands.executeCommand("python2go.install");
                } else if (selection === "Disable Check") {
                  const conf = vscode.workspace.getConfiguration();
                  conf.update(
                    Py2GoSettings.SkipInstallationCheck,
                    true,
                    vscode.ConfigurationTarget.Global
                  );
                }
              });
          }
        });
      }
    }
  });

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let installDisposer = vscode.commands.registerCommand(
    "python2go.install",
    () => {
      Logger.show();
      return vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "[Python2go]: Install",
          cancellable: true,
        },
        (progress, _token) => {
          return isPythonInstalled().then((wasInstalled) => {
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
                if (wasInstalled) {
                  vscode.window.showInformationMessage(
                    "Python installed and configured."
                  );
                } else {
                  vscode.window.showInformationMessage(
                    "!! Restart VS Code now to finish the Python installation !!"
                  );
                }
              });
          });
        }
      );
    }
  );

  let configureDisposer = vscode.commands.registerCommand(
    "python2go.configure",
    () => {
      return installationLocation().then((result) => {
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
      Logger.show();
      try {
        uninstallPython(context).then((msg) => {
          configure(undefined, false);
          vscode.window.showInformationMessage(
            `Uninstalled Python ${pythonVersion()}.\n${msg}`
          );
        });
      } catch (error) {
        vscode.window.showErrorMessage(
          `Could not uninstall Python ${pythonVersion()}:\n${error}`
        );
      }
    }
  );

  let checkInstallationDisposer = vscode.commands.registerCommand(
    "python2go.checkInstallation",
    () => {
      return isPythonInstalled().then((isInstalled) => {
        if (isInstalled) {
          vscode.window.showInformationMessage(
            `Python ${pythonVersion()} is installed on your system`
          );
        } else {
          vscode.window
            .showWarningMessage(
              `Python ${pythonVersion()} is not installed`,
              "Install now"
            )
            .then((selection) => {
              if (selection === "Install now") {
                return vscode.commands.executeCommand("python2go.install");
              }
            });
        }
      });
    }
  );

  let isPyInstalled = vscode.commands.registerCommand(
    "python2go.isPythonInstalled",
    () => {
      return isPythonInstalled();
    }
  );

  let pipInstaller = vscode.commands.registerCommand(
    "python2go.pip",
    (command) => {
      return vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `[Python2go]: pip ${command}`,
        },
        (progress) => {
          return pip(command).then((result) => {
            if (result.success) {
              progress.report({ message: "Success", increment: 100 });
              vscode.window.showInformationMessage(
                `[Python2go]: Successfully executed "pip ${command}"`
              );
            } else {
              vscode.window.showErrorMessage(`pip ${command}: ${result.error}`);
            }
          });
        }
      );
    }
  );

  let sudoPipInstaller = vscode.commands.registerCommand(
    "python2go.sudoPip",
    (command) => {
      return vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `[Python2go]: pip ${command}`,
        },
        (progress) => {
          return sudoPip(command).then((result) => {
            if (result.success) {
              progress.report({ message: "Success", increment: 100 });
              vscode.window.showInformationMessage(
                `[Python2go]: Successfully executed "pip ${command}"`
              );
            } else {
              vscode.window.showErrorMessage(`pip ${command}: ${result.error}`);
            }
          });
        }
      );
    }
  );

  let pipPackages = vscode.commands.registerCommand(
    "python2go.pipPackages",
    () => {
      return installedPipPackages();
    }
  );

  let pipUpgradeSelfDisposer = vscode.commands.registerCommand(
    "python2go.pipUpgradeSelf",
    () => {
      Logger.show();
      const target = process.platform === "win32" ? "--user" : "";
      const cmd = `install ${target} --upgrade pip`;
      return vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `[Python2go]: pip ${cmd}`,
        },
        (progress) => {
          return pip(cmd).then((result) => {
            if (result.success) {
              vscode.window.showInformationMessage(
                `Upgraded pip to the latest version`
              );
            } else {
              vscode.window.showErrorMessage(
                `Error upgrading pip: ${result.error}`
              );
            }
            Logger.hide();
          });
        }
      );
    }
  );

  let pipInstallDisposer = vscode.commands.registerCommand(
    "python2go.pipInstall",
    () => {
      return vscode.window
        .showInputBox({
          prompt: "Pip package to install",
        })
        .then((pipPkg) => {
          if (pipPkg) {
            const target = process.platform === "win32" ? "--user" : "";
            const cmd = `install ${target} ${pipPkg}`;
            Logger.show();
            return vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: `[Python2go]: pip ${cmd}`,
              },
              (progress) => {
                return pip(cmd).then((result) => {
                  if (result.success) {
                    return installedPipPackages().then((pkgs) => {
                      const updatedPkg = pkgs.find(
                        (pkg) => pkg.package === pipPkg
                      );
                      Logger.hide();
                      vscode.window.showInformationMessage(
                        `Installed pip package ${pipPkg} V${updatedPkg?.version}`,
                        'Reload'
                      ).then((selection) => {
                        if (selection === "Reload") {
                          return vscode.commands.executeCommand("workbench.action.reloadWindow");
                        }
                      });
                    });
                  }
                });
              }
            );
          }
        });
    }
  );

  let pipUpgradePackageDisposer = vscode.commands.registerCommand(
    "python2go.pipUpgradePackage",
    () => {
      return installedPipPackages().then((pkgs) => {
        return vscode.window
          .showQuickPick(
            pkgs.map((pkg) => ({
              label: pkg.package,
              description: `V${pkg.version}`,
            }))
          )
          .then((selected) => {
            if (selected) {
              const target = process.platform === "win32" ? "--user" : "";
              const cmd = `install ${target} --upgrade ${selected.label}`;
              Logger.show();
              return vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: `[Python2go]: pip ${cmd}`,
                },
                (progress) => {
                  return pip(cmd).then((result) => {
                    if (result.success) {
                      return installedPipPackages().then((pkgs) => {
                        const updatedPkg = pkgs.find(
                          (pkg) => pkg.package === selected.label
                        );
                        vscode.window.showInformationMessage(
                          `Updated pip package ${selected.label} from ${selected.description} to V${updatedPkg?.version}`,
                          'Reload'
                        ).then((selection) => {
                          if (selection === "Reload") {
                            return vscode.commands.executeCommand("workbench.action.reloadWindow");
                          }
                        });
                        Logger.hide();
                      });
                    } else {
                      vscode.window.showErrorMessage(
                        `Error updating ${selected.label}: ${result.error}`
                      );
                      Logger.hide();
                    }
                  });
                }
              );
            }
          });
      });
    }
  );

  let pipUninstallDisposer = vscode.commands.registerCommand(
    "python2go.pipUninstall",
    () => {
      return installedPipPackages().then((pkgs) => {
        return vscode.window
          .showQuickPick(
            pkgs.map((pkg) => ({
              label: pkg.package,
              description: `V${pkg.version}`,
            }))
          )
          .then((selected) => {
            if (selected) {
              const target = process.platform === "win32" ? "--user" : "";
              const cmd = `uninstall -y ${selected.label}`;
              Logger.show();
              return vscode.window.withProgress(
                {
                  location: vscode.ProgressLocation.Notification,
                  title: `[Python2go]: pip ${cmd}`,
                },
                (progress) => {
                  return pip(cmd).then((result) => {
                    if (result.success) {
                      vscode.window.showInformationMessage(
                        `Uninstalled pip package ${selected.label}`,
                        'Reload'
                      ).then((selection) => {
                        if (selection === "Reload") {
                          return vscode.commands.executeCommand("workbench.action.reloadWindow");
                        }
                      });
                    } else {
                      vscode.window.showErrorMessage(
                        `Error uninstalling ${selected.label}: ${result.error}`
                      );
                    }
                    Logger.hide();
                  });
                }
              );
            }
          });
      });
    }
  );

  let addPipUserPathToEnvDisposer = vscode.commands.registerCommand(
    "python2go.addPipUserPathToEnv",
    () => {
      if (process.platform !== "win32") {
        vscode.window.showInformationMessage("Only available on windows");
        return;
      }
      isPythonInstalled().then((version) => {
        if (!version) {
          vscode.window.showInformationMessage("Python not installed yet");
          return;
        }
        addUserPathToUsersEnv(version).then((result) => {
          if (result.error) {
            vscode.window.showErrorMessage(
              `Error adding user site to path: ${result.msg}: ${result.error}`
            );
          }
          if (result.success) {
            context.globalState.update("pythonUpdatedPath", true);
            vscode.window.showInformationMessage(
              "Successfully added to path. Restart vs code to take effect."
            );
          }
        });
      });
    }
  );

  let runDebugDisposer = vscode.commands.registerCommand(
    "python2go.run_debug",
    () => {
      const launchConfig = vscode.workspace
        .getConfiguration()
        .get("python2go.runDebugConfiguration") as any;
      launchConfig["stopOnEntry"] = false;
      return vscode.debug.startDebugging(undefined, launchConfig);
    }
  );

  let runDebugAndStopDisposer = vscode.commands.registerCommand(
    "python2go.run_and_stop",
    () => {
      const launchConfig = vscode.workspace
        .getConfiguration()
        .get("python2go.runDebugConfiguration") as any;
      launchConfig["stopOnEntry"] = true;
      return vscode.debug.startDebugging(undefined, launchConfig);
    }
  );

  context.subscriptions.push(runDebugDisposer);
  context.subscriptions.push(runDebugAndStopDisposer);

  context.subscriptions.push(installDisposer);
  context.subscriptions.push(configureDisposer);
  context.subscriptions.push(uninstallDisposer);
  context.subscriptions.push(checkInstallationDisposer);
  context.subscriptions.push(isPyInstalled);
  context.subscriptions.push(pipInstaller);
  context.subscriptions.push(sudoPipInstaller);
  context.subscriptions.push(pipPackages);
  context.subscriptions.push(pipUpgradeSelfDisposer);
  context.subscriptions.push(pipInstallDisposer);
  context.subscriptions.push(pipUpgradePackageDisposer);
  context.subscriptions.push(pipUninstallDisposer);
  context.subscriptions.push(addPipUserPathToEnvDisposer);
}

// this method is called when your extension is deactivated
export function deactivate() {}
