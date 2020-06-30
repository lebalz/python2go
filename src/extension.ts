// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { Progress } from "vscode";
import { promisify } from "util";
import { exec, execSync } from "child_process";

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
        return true;
      }
      return false;
    })
    .catch(() => {
      return false;
    });
}

function installBrew(context: vscode.ExtensionContext, rootPW: string) {
  return isBrewInstalled()
    .then(async (isInstalled) => {
      if (isInstalled) {
        return true;
      }
      const shellExec = promisify(exec);
      return shellExec(
        `cat -s ${`${context.extensionPath}/bin/install_brew.sh`} | bash -s "${rootPW}" && echo "Success."`
      )
        .then(({ stdout, stderr }) => {
          if (!stdout || !stdout.endsWith("Success.\n")) {
            vscode.window.showErrorMessage(
              `Could not install install brew. Try to install it manually and try the setup process again.\n${stderr}`
            );
            return;
          }

          return true;
        })
        .catch(() => {
          return false;
        });
    })
    .catch(() => {
      return false;
    });
}

function installPython(context: vscode.ExtensionContext) {
  if (process.platform === "darwin") {
    promptRootPassword(context).then((rootPW) => {
      if (!rootPW) {
        return new Promise(() => false);
      }
      installBrew(context, rootPW);
    });
  } else if (process.platform === "win32") {
  }
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
    // The code you place here will be executed every time your command is executed

    // Display a message box to the user
    vscode.window.showInformationMessage("Hello World from python2go!");
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
