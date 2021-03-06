# Python2Go

![Python2Go](logo.png)

Install the extension from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=lebalz.python2go).

Python2go installs a recent Version of Python (inlcuding tkinter) to your windows or osx computer. Linux/WSL is currently not supported. VS Code is configured such that the newly installed versions are used.

VS Code checks at startup, wheter a python version is installed

![prompt to install](python_install_prompt.png)


## Windows

Install Python yourself and make sure to add python to your PATH. You can access this by checking ths "Add Python to Path" option to true.

![install python](python_install_win.jpg)

## OSX

A recent version (3.8.3) is downloaded and installed. Tkinter is included and the installed python will be set as the global python interpreter for bash and zsh shells.

The packagemanager [homebrew](https://brew.sh/index_de) is used to install [pyenv](https://github.com/pyenv/pyenv). Pyenv is used to manage different python installations and to install a recent version of python. Superuser rights are needed to install homebrew - you will be prompted for your password if homebrew is not installed yet.

# Commands

- `Python2Go: Install` installs python and configures vs code global settings to use the newly installed python. **Restart vs code** after installation.
- `Python2Go: Configure` (Re)configures vs code to use the installed version of python.
- `Python2Go: Uninstall` uninstalls python from your system.
- `Python2Go: Check Installation` checks if python is installed on your system.
- `Python2Go: Install pip package` installs a pip package (with the `--user on windows)
- `Python2Go: Uninstall pip package` uninstalls a pip package
- `Python2Go: Upgrade pip package (latest version)` upgrades a pip package
- `Python2Go: Upgrade pip` upgrades a the pip package
- `Python2Go: Set Python version` sets a different python version

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

This project contains git submodules. To get started, run

```sh
git clone git@github.com:lebalz/python2go.git
git submodule init
git submodule update
```

To install the node modules, run

```sh
yarn install
```

To fetch changes from the submodules, run

```sh
git submodule update --remote
```

### pack and publish

```sh
vsce package
vsce publish
```