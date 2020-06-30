#!/usr/bin/env bash
# install.sh


if [ -z $1 ]; then
  PW=""
else
  PW=$1
fi

URL_BREW='https://raw.githubusercontent.com/Homebrew/install/master/install.sh'

echo '- install brew using root privileges'
echo $PW | sudo -S echo " *****"

echo | /bin/bash -c "$(curl -fsSL $URL_BREW)" > /dev/null
if [ $? -eq 0 ]; then echo 'OK'; else echo 'NG'; fi