#!/usr/bin/env bash
# install.sh


if [ -z $1 ]; then
  PYTHON_VERSION="3.8.3"
else
  PYTHON_VERSION=$1
fi

echo "installing pyenv"
brew install pyenv

if ! pyenv versions | grep $PYTHON_VERSION; then
  # make sure tcl-tk is installed s.t. it can be configured for python
  echo "installing tkinter©"
  brew install tcl-tk


  echo "installing python $PYTHON_VERSION"
  # install python with the current version of tcl-tk
  env \
    PATH="$(brew --prefix tcl-tk)/bin:$PATH" \
    LDFLAGS="-L$(brew --prefix tcl-tk)/lib" \
    CPPFLAGS="-I$(brew --prefix tcl-tk)/include" \
    PKG_CONFIG_PATH="$(brew --prefix tcl-tk)/lib/pkgconfig" \
    CFLAGS="-I$(brew --prefix tcl-tk)/include" \
    PYTHON_CONFIGURE_OPTS="--with-tcltk-includes='-I$(brew --prefix tcl-tk)/include' --with-tcltk-libs='-L$(brew --prefix tcl-tk)/lib -ltcl8.6 -ltk8.6'" \
    pyenv install $PYTHON_VERSION
else
  echo "python $PYTHON_VERSION already installed"
fi

echo "setting $PYTHON_VERSION as global python interpreter"
pyenv global $PYTHON_VERSION

touch ~/.zshrc
if ! grep -q 'if command -v pyenv 1>/dev/null 2>&1; then' ~/.zshrc; then
  echo -e 'if command -v pyenv 1>/dev/null 2>&1; then\n  eval "$(pyenv init -)"\nfi' >> ~/.zshrc
fi

touch ~/.bash_profile
if ! grep -q 'if command -v pyenv 1>/dev/null 2>&1; then' ~/.bash_profile; then
  echo -e 'if command -v pyenv 1>/dev/null 2>&1; then\n  eval "$(pyenv init -)"\nfi' >> ~/.bash_profile
fi