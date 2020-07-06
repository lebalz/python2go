// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import { promisify } from "util";
import { exec, execSync } from "child_process";

// import * as http from 'http';
import { DownloaderHelper } from 'node-downloader-helper';
import * as fs from 'fs';
import * as path from 'path';
import { resolve } from "path";

const PYTHON_VERSION = "3.8.3";


type Progress = vscode.Progress<{
  message?: string | undefined;
  increment?: number | undefined;
}>;

/**
 * Remove directory recursively
 * @param {string} dir_path
 * @see https://stackoverflow.com/a/42505874/3027390
 */
function rimraf(dir_path: string) {
  if (fs.existsSync(dir_path)) {
    fs.readdirSync(dir_path).forEach(function (entry) {
      var entry_path = path.join(dir_path, entry);
      if (fs.lstatSync(entry_path).isDirectory()) {
        rimraf(entry_path);
      } else {
        fs.unlinkSync(entry_path);
      }
    });
    fs.rmdirSync(dir_path);
  }
}

function installPythonWindows(context: vscode.ExtensionContext, progress: Progress) {
  if (fs.existsSync(winInstallationLocation())) {
    progress.report({message: `Python ${PYTHON_VERSION} already installed (${winInstallationLocation()})`, increment: 70});
    vscode.window.showInformationMessage("Python already installed");
    return new Promise<boolean>((resolve) => resolve(true));
  }

  const pythonSrcFolder = `${context.extensionPath.split('\\').slice(0, -1).join('\\')}\\python`;
  const downloadUri = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-amd64.exe`;

  if (!fs.existsSync(pythonSrcFolder)) {
    fs.mkdirSync(pythonSrcFolder, { recursive: true });
  }

  const tempFileName = `python_${PYTHON_VERSION}_${Date.now()}.exe`;
  var tmpFilePath = `${pythonSrcFolder}\\${tempFileName}`;

  const dl = new DownloaderHelper(
    downloadUri,
    pythonSrcFolder,
    {
      fileName: tempFileName,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Safari/537.36 Edg/80.0.361.66',
        'Sec-Fetch-Dest': 'document',
        'Upgrade-Insecure-Requests': 1
      }
    }
  );

  dl.on('end', () => {
    vscode.window.showInformationMessage(`Start installing python ${PYTHON_VERSION}`);
    const shellExec = promisify(exec);
    progress.report({message: `Install Python ${PYTHON_VERSION}`, increment: 40});
    return shellExec(
      `start ${tmpFilePath} /quiet PrependPath=1 TargetDir="${winInstallationLocation()}"`
    ).then(() => {
      vscode.window.showInformationMessage("Done");
      progress.report({message: `Python ${PYTHON_VERSION} installed (${winInstallationLocation()})`, increment: 70});
      return true;
    }).finally(() => {
      rimraf(pythonSrcFolder);
    });
  });
  vscode.window.showInformationMessage(`Start downloading python ${PYTHON_VERSION}`);
  return dl.start();
}

function winInstallationLocation(): string {
  const localDataPath = execSync('echo %LocalAppData%').toString().trim();
  return `${localDataPath}\\Programs\\Python\\Python${PYTHON_VERSION.replace(/\./g, '')}`;
}

function osxInstallationLocation(): string {
  return `~/.pyenv/versions/${PYTHON_VERSION}/bin/python`;
}

function installationLocation(): string {
  if (process.platform === "darwin") {
    return osxInstallationLocation();
  } else if (process.platform === "win32") {
    return winInstallationLocation();
  }
  return '';
}

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
  context: vscode.ExtensionContext,
  progress: Progress
): Promise<boolean | undefined> {
  return isBrewInstalled()
    .then((isInstalled) => {
      if (isInstalled) {
        progress.report({ message: 'Brew installed', increment: 30 });
        return true;
      }
      promptRootPassword(context)
        .then((rootPW) => {
          if (!rootPW) {
            return { stdout: "", stderr: "ERROR: no root password" };
          }
          const shellExec = promisify(exec);
          progress.report({ message: 'Install brew...', increment: 10 });
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
          progress.report({ message: 'Brew installed', increment: 30 });
          return true;
        });
    })
    .catch((error) => {
      vscode.window.showErrorMessage(error);
      return false;
    });
}

function installPythonWithPyEnv(
  context: vscode.ExtensionContext,
  progress: Progress
): Promise<boolean> {
  const shellExec = promisify(exec);
  progress.report({message: `Install PyEnv and Python ${PYTHON_VERSION}`, increment: 35});
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
      progress.report({message: 'PyEnv Installed', increment: 70});
      return true;
    })
    .catch((error) => {
      vscode.window.showErrorMessage(error);
      return false;
    });
}

function installPython(
  context: vscode.ExtensionContext,
  progress: Progress
): Promise<boolean> {
  if (process.platform === "darwin") {
    return installBrew(context, progress).then((success) => {
      if (!success) {
        return false;
      }
      return installPythonWithPyEnv(context, progress);
    });
  } else if (process.platform === "win32") {
    return installPythonWindows(context, progress);
  }
  return new Promise((resolve) => resolve(false));;
}

function configure(context: vscode.ExtensionContext, force: boolean = false) {
  vscode.window.showInformationMessage(`Configure python settings`);
  const configuration = vscode.workspace.getConfiguration();
  return configuration
    .update(
      "python.pythonPath",
      installationLocation(),
      vscode.ConfigurationTarget.Global
    )
    .then(() => {
      configuration.update(
        "python.defaultInterpreterPath",
        installationLocation(),
        vscode.ConfigurationTarget.Global
      );
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
  let installDisposer = vscode.commands.registerCommand("python2go.install", () => {
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '[Python2go]: Install',
      cancellable: false
    }, (progress, _token) => {
      progress.report({ message: 'Start...', increment: 5 });
      return installPython(context, progress)
        .then((success) => {
          if (success) {
            progress.report({ message: "Configure...", increment: 95 });
            return configure(context, true);
          }
        }).then(() => {
          progress.report({ message: "Success", increment: 100 });
          vscode.window.showInformationMessage("Python installed and configured. Ready to go");
        });
    });
  });

  let configureDisposer = vscode.commands.registerCommand("python2go.configure", () => {
    configure(context, true).then(() => {
      vscode.window.showInformationMessage("Python configured. Ready to go");
    });
  });

  context.subscriptions.push(installDisposer);
  context.subscriptions.push(configureDisposer);
}

// this method is called when your extension is deactivated
export function deactivate() { }
