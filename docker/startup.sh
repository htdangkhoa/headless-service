#!/bin/bash

Xvfb -ac :99 -screen 0 1280x1024x16 &

export DISPLAY=:99

echo -e "\n\n------------------ EXECUTE COMMAND ------------------"
echo "Executing command: '$@'"
exec "$@"