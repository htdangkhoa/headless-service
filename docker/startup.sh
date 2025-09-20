#!/bin/bash

# Start Xvfb in the background
Xvfb $DISPLAY -screen 0 1280x1024x24 -ac +extension GLX +render -noreset &

echo -e "\n\n------------------ EXECUTE COMMAND ------------------"
echo "Executing command: '$@'"
exec "$@"