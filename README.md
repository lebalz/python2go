# Python2Go

<a href="https://marketplace.visualstudio.com/items?itemName=lebalz.python2go">

![Python2Go](logo.png)

</a>

Install the extension from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=lebalz.python2go).


Python2go installs a recent Version of Python (inlcuding tkinter) to your windows or osx computer. Linux/WSL is currently not supported. VS Code is configured such that the newly installed versions are used.

## Windows

A recent version (3.8.3) is downloaded and installed. Tkinter and test suite are included and the exe will be added to your PATH.

The packagemanager [chocolatey]() is used to install python. Chocolatey is installed when not present on the system. Admin rights are needed to install chocolatey and python - you will be prompted to confirm admin rights to powershell. 

## OSX

A recent version (3.8.3) is downloaded and installed. Tkinter and test suite are included and the installed python will be set as the global python interpreter for bash and zsh shells.

The packagemanager [homebrew]() is used to install [pyenv]. Pyenv is used to manage different python installations and to install a recent version of python. Superuser rights are needed to install homebrew - you will be prompted for your password if homebrew is not installed yet.

# Commands

- `Python2Go: Install` installs python and configures vs code global settings to use the newly installed python. **Restart vs code** after installation.
- `Python2Go: Configure` (Re)configures vs code to use the installed version of python.
- `Python2Go: Uninstall` uninstalls python from your system.

[GitHub](https://github.com/lebalz/python2go)