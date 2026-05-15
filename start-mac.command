#!/bin/zsh
cd "$(dirname "$0")"
echo "PDF Hanko Reader local server starting..."
echo "Open this URL in Chrome if it does not open automatically:"
echo "http://localhost:8000"
open "http://localhost:8000"
python3 -m http.server 8000
