import { Logger } from "./lib/logger";
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { execSync } from "child_process";

import {
  parsePythonVersion,
} from "./lib/helpers";
import { inOsShell } from "./lib/osShell";
import { installPipPackagesFromGist, clearCached } from "./pipFromGist";

export enum Py2GoSettings {
  SkipInstallationCheck = "python2go.skipInstallationCheck",
  PythonVersion = "python2go.pythonVersion",
}

const PYTHON2GO_DEBUG_NAME = "Python2Go: Current File";
const PYTHON2GO_TERMINAL_NAME = "Python2Go: IPython";

interface PyVersion {
  major: number;
  minor: number;
  release: number;
  version: string;
}

function fetchAndInstallGistPips() {
  clearCached();
  installPipPackagesFromGist().then((success) => {
    if (success) {
      vscode.window
        .showInformationMessage(
          `Python Packages updated. Reload to take effect.`,
          "Reload"
        )
        .then((selection) => {
          if (selection === "Reload") {
            return vscode.commands.executeCommand(
              "workbench.action.reloadWindow"
            );
          }
        });
    }
  });
}

function debugConfiguration(stopOnEntry: boolean) {
  const launchConfig = vscode.workspace
    .getConfiguration()
    .get("python2go.runDebugConfiguration") as any;
  launchConfig["stopOnEntry"] = stopOnEntry;
  launchConfig["name"] = PYTHON2GO_DEBUG_NAME;
  return launchConfig;
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


function getPythonPath(): Promise<string> {
  try {
      const extension = vscode.extensions.getExtension("ms-python.python");
      if (!extension) {
          return new Promise((resolve) => resolve('python'));
      }
      const usingNewInterpreterStorage = extension.packageJSON?.featureFlags?.usingNewInterpreterStorage;
      if (usingNewInterpreterStorage) {
        return new Promise((resolve) => {
          if (!extension.isActive) {
              return extension.activate();
          }
          return resolve('ok');
        }).then(() => {
          return extension.exports.settings.getExecutionDetails().execCommand[0];
        });
      } else {
        return new Promise((resolve) => resolve('python'));
      }
  } catch (error) {
    console.log('failed to load exec path', error);
    return new Promise((resolve) => resolve('python'));
  }
}

function installedPythonVersion() {
  return getPythonPath().then((interpreter) => {
    console.log('defIn', interpreter);
    let rawVersion = '';
    try {
      rawVersion = execSync(`${interpreter} --version`).toString().trim();
      console.log('rawVersion: ', rawVersion);
    } catch (exception) {
      console.log('E rawVersion: ', exception);
      return;
    }
    const version = parsePythonVersion(rawVersion);
    console.log('Version: ', version);
    return version;
  })
}


export function isPythonInstalled() {
  return installedPythonVersion().then((version) => {

    if (!version) {
      setContext(false);
      return false;
    }
    if (version.major > 3) {
      setContext(version);
      return true;
    }
    if (version.major === 3 && version.minor >= 6) {
      setContext(version);
      return true;
    }
      setContext(false);
      return false;
  });
}


function pip(cmd: string) {
  return getPythonPath().then((py) => {
    const pipCmd = `${py} -m pip`;
    return inOsShell(`${pipCmd} --disable-pip-version-check ${cmd}`, {
      requiredCmd: pipCmd
    });
  });
}

function sudoPip(cmd: string) {
  return getPythonPath().then((py) => {
    const pipCmd = `${py} -m pip`;
    return inOsShell(`${pipCmd} --disable-pip-version-check ${cmd}`, {
      requiredCmd: pipCmd,
      sudo: true,
      promptMsg: `to execute "sudo pip3 ${cmd}"`
    });
  })
}

function installedPipPackages(): Thenable<
  { package: string; version: string }[]
> {
  return pip("list").then((result) => {
    if (result.success) {
      const pkgs = result.msg.split(/\r?\n/).slice(2);
      const pipPkgs = pkgs.map((pkg) => {
        // \S --> any non whitespace character
        // \s --> any whitespace character
        const match = pkg.match(/(?<pkg>\S+)\s+(?<version>\S+)/);
        return {
          package: match?.groups?.pkg ?? "",
          version: match?.groups?.version ?? "",
        };
      });
      return pipPkgs;
    }
    return [];
  });
}

function configurePlayIcons() {
  const configuration = vscode.workspace.getConfiguration();
  vscode.commands.executeCommand(
    "setContext",
    "python2go.showYellowPlayIcon",
    configuration.get("python2go.showYellowPlayIcon")
  );
  vscode.commands.executeCommand(
    "setContext",
    "python2go.showGreenPlayIcon",
    configuration.get("python2go.showGreenPlayIcon")
  );
  vscode.commands.executeCommand(
    "setContext",
    "python2go.showIpythonIcon",
    configuration.get("python2go.showIpythonIcon")
  );
}

function disablePlayIcons() {
  vscode.commands.executeCommand(
    "setContext",
    "python2go.showYellowPlayIcon",
    false
  );
  vscode.commands.executeCommand(
    "setContext",
    "python2go.showGreenPlayIcon",
    false
  );
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  Logger.configure("python2go", "Python2Go");
  Logger.log("Welcome to Python2Go");
  configurePlayIcons();

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration("python2go.showYellowPlayIcon") ||
      e.affectsConfiguration("python2go.showGreenPlayIcon") ||
      e.affectsConfiguration("python2go.showIpythonIcon")
    ) {
      configurePlayIcons();
    }
    if (e.affectsConfiguration("python2go.gistPipUrl")) {
      fetchAndInstallGistPips();
    }
  });
  isPythonInstalled().then((hasPython) => {
    installedPythonVersion().then((pyVersion) => {
      if (!hasPython) {
          if (process.platform === "darwin") {
            vscode.window
              .showWarningMessage(
                `A Python Interpreter > 3.6 is required, found "${pyVersion?.version}"`,
              );
            vscode.commands.executeCommand('python.setInterpreter');
          } else {
            vscode.window
              .showWarningMessage(
                `A Python Interpreter > 3.6 is required, found "${pyVersion?.version}"`
              );
              vscode.commands.executeCommand('python.setInterpreter');
            }
      } else {
        fetchAndInstallGistPips(); 
      }
    });
  });
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json


  let checkInstallationDisposer = vscode.commands.registerCommand(
    "python2go.checkInstallation",
    () => {
      isPythonInstalled().then(isInstalled => {
        if (isInstalled) {
          installedPythonVersion().then((version) => {
            vscode.window.showInformationMessage(
              `Python Interpreter ${version?.version} is used`
            );
          })
        } else {
          vscode.window
            .showWarningMessage(
              `No Python Interpreter is installed`
            );
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
      const target = "--user";// process.platform === "win32" ? "--user" : "";
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
                      vscode.window
                        .showInformationMessage(
                          `Installed pip package ${pipPkg} V${updatedPkg?.version}`,
                          "Reload"
                        )
                        .then((selection) => {
                          if (selection === "Reload") {
                            return vscode.commands.executeCommand(
                              "workbench.action.reloadWindow"
                            );
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
                        vscode.window
                          .showInformationMessage(
                            `Updated pip package ${selected.label} from ${selected.description} to V${updatedPkg?.version}`,
                            "Reload"
                          )
                          .then((selection) => {
                            if (selection === "Reload") {
                              return vscode.commands.executeCommand(
                                "workbench.action.reloadWindow"
                              );
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
                      vscode.window
                        .showInformationMessage(
                          `Uninstalled pip package ${selected.label}`,
                          "Reload"
                        )
                        .then((selection) => {
                          if (selection === "Reload") {
                            return vscode.commands.executeCommand(
                              "workbench.action.reloadWindow"
                            );
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

  vscode.debug.onDidStartDebugSession((e) => {
    if (e.type === "python") {
      disablePlayIcons();
    }
  });

  vscode.debug.onDidTerminateDebugSession((e: vscode.DebugSession) => {
    if (e.type === "python") {
      configurePlayIcons();
    }
    if (e.type !== "python" || e.name !== PYTHON2GO_DEBUG_NAME) {
      return;
    }
    const config = vscode.workspace.getConfiguration();
    if (config.get("python2go.showExplorerViewOnDebugEnd")) {
      vscode.commands.executeCommand("workbench.view.explorer");
    }
  });

  let runDebugDisposer = vscode.commands.registerCommand(
    "python2go.run_debug",
    () => {
      return vscode.debug.startDebugging(undefined, debugConfiguration(false));
    }
  );

  let runDebugAndStopDisposer = vscode.commands.registerCommand(
    "python2go.run_and_stop",
    () => {
      return vscode.debug.startDebugging(undefined, debugConfiguration(true));
    }
  );

  let showIpythonTerminal = vscode.commands.registerCommand(
    "python2go.show_ipython",
    () => {
      getPythonPath().then((py) => {
          const ipyTerminal = vscode.window.terminals.find(
            (t) => t.name === PYTHON2GO_TERMINAL_NAME
          );
          const editor = vscode.window.activeTextEditor;
          const text = editor?.document
            .getText(editor.selection)
            .trim()
            .replace(/\n(\s*\n)+/g, "\n");
          if (ipyTerminal) {
            ipyTerminal.show();
            if (text) {
              ipyTerminal.sendText(text, true);
            }
            return;
          }
          const terminal = vscode.window.createTerminal({
            name: PYTHON2GO_TERMINAL_NAME,
          });
          terminal.show();
          setTimeout(() => {
            terminal.sendText(`${py} -m IPython`, true);
            if (text) {
              terminal.sendText(text, true);
            }
          }, 200);
        });
      }
  );

  context.subscriptions.push(runDebugDisposer);
  context.subscriptions.push(runDebugAndStopDisposer);
  context.subscriptions.push(showIpythonTerminal);

  context.subscriptions.push(checkInstallationDisposer);
  context.subscriptions.push(isPyInstalled);
  context.subscriptions.push(pipInstaller);
  context.subscriptions.push(sudoPipInstaller);
  context.subscriptions.push(pipPackages);
  context.subscriptions.push(pipUpgradeSelfDisposer);
  context.subscriptions.push(pipInstallDisposer);
  context.subscriptions.push(pipUpgradePackageDisposer);
  context.subscriptions.push(pipUninstallDisposer);
}

// this method is called when your extension is deactivated
export function deactivate() {}
