#!/usr/bin/env bash
# install.sh


if [ -z $1 ]; then
  PYTHON_VERSION="3.8.3"
else
  PYTHON_VERSION=$1
fi

echo "uninstall python"

pyenv uninstall -f $PYTHON_VERSION

echo "setting global python interpreter system version"
pyenv global system