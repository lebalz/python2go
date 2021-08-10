# Python2Go

![Python2Go](logo.png)

Install the extension from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=lebalz.python2go).

Python2go can install pip's from a gist.

# Commands

- `Python2Go: Check Installation` checks if python is installed on your system.
- `Python2Go: Install pip package` installs a pip package (with the `--user on windows)
- `Python2Go: Uninstall pip package` uninstalls a pip package
- `Python2Go: Upgrade pip package (latest version)` upgrades a pip package
- `Python2Go: Upgrade pip` upgrades a the pip package

## commands for other plugins

These commands will not show up in the command palette:

- `python2go.isPythonInstalled: Thenable<boolean>`
- `python2go.pip: Thenable<TaskMessage>` execute pip/pip3 commands. e.g.
  ```ts
  vscode.commands.executeCommand("python2go.pip", "install pylint");
  // --> osx `pip3 install pylint`
  // --> win `pip install pylint`
  ```
- `python2go.sudoPip: Thenable<TaskMessage>` execute pip/pip3 commands in elevated/sudo shell. e.g.
  ```ts
  vscode.commands.executeCommand("python2go.sudoPip", "install pylint");
  // --> osx `sudo -H pip3 install pylint`
  // --> win in elevated powershell: `pip install pylint`
  ```
- `python2go.pipPackages: Thenable<{ package: string, version: string}[]>`
- `python2go.installationLocation: Thenable<TaskMessage>` returns the installation location of python

[GitHub](https://github.com/lebalz/python2go)

# Develop

To install the node modules, run

```sh
yarn install
```
### pack and publish

```sh
vsce package
vsce publish
```