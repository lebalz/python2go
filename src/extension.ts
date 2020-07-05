// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Progress } from "vscode";
import { promisify } from "util";
import { exec, execSync } from "child_process";

const PYTHON_VERSION = "3.8.3";

function promptRootPassword(
  context: vscode.ExtensionContext
): Thenable<string | undefined> {
  return vscode.window.showInputBox({
    password: true,
    prompt: "Root Password (used to login to your computer)",
  });
}

function isBrewInstalled() {
  const shellExec = promisify(exec);
  return shellExec("brew -v")
    .then(({ stdout, stderr }) => {
      if (stdout.length > 0) {
        vscode.window.showInformationMessage("Brew already installed...");
        return true;
      }
      vscode.window.showErrorMessage(stderr);
      return false;
    })
    .catch(() => {
      return false;
    });
}

function installBrew(
  context: vscode.ExtensionContext
): Promise<boolean | undefined> {
  return isBrewInstalled()
    .then((isInstalled) => {
      if (isInstalled) {
        return true;
      }
      promptRootPassword(context)
        .then((rootPW) => {
          if (!rootPW) {
            return { stdout: "", stderr: "ERROR: no root password" };
          }
          const shellExec = promisify(exec);
          return shellExec(
            `cat -s ${`${context.extensionPath}/bin/install_brew.sh`} | bash -s "${rootPW}" && echo "Success."`
          );
        })
        .then(({ stdout, stderr }) => {
          if (!stdout || !stdout.endsWith("Success.\n")) {
            vscode.window.showErrorMessage(
              `Could not install install brew. Try to install it manually and try the setup process again.\n${stderr}`
            );
            return false;
          }
          return true;
        });
    })
    .catch((error) => {
      vscode.window.showErrorMessage(error);
      return false;
    });
}

function installPythonWithPyEnv(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const shellExec = promisify(exec);
  return shellExec(
    `cat -s ${`${context.extensionPath}/bin/install_pyenv_python.sh`} | bash -s "${PYTHON_VERSION}" && echo "Success."`
  )
    .then(({ stdout, stderr }) => {
      if (!stdout || !stdout.endsWith("Success.\n")) {
        vscode.window.showErrorMessage(
          `Could not install install python.\n${stderr}`
        );
        return false;
      }
      return true;
    })
    .catch((error) => {
      vscode.window.showErrorMessage(error);
      return false;
    });
}

function installPython(
  context: vscode.ExtensionContext
): Promise<boolean | undefined> {
  if (process.platform === "darwin") {
    return installBrew(context).then((success) => {
      if (!success) {
        return false;
      }
      return installPythonWithPyEnv(context);
    });
  } else if (process.platform === "win32") {
    return new Promise(() => false);
  }
  return new Promise(() => false);
}

function configure(context: vscode.ExtensionContext, force: boolean = false) {
  const configuration = vscode.workspace.getConfiguration();
  if (process.platform === "darwin") {
    return configuration
      .update(
        "python.pythonPath",
        `~/.pyenv/versions/${PYTHON_VERSION}/bin/python`,
        vscode.ConfigurationTarget.Global
      )
      .then(() => {
        configuration.update(
          "python.defaultInterpreterPath",
          `~/.pyenv/versions/${PYTHON_VERSION}/bin/python`,
          vscode.ConfigurationTarget.Global
        );
      });
  } else if (process.platform === "win32") {
  };
  return new Promise(() => {});
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
  let disposable = vscode.commands.registerCommand("python2go.install", () => {
    installPython(context).then((success) => {
      if (success) {
        return configure(context, true);
      }
    }).then(() => {
      vscode.window.showInformationMessage("Python installed and configured. Ready to go");
    });
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
