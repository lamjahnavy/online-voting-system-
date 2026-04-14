#!/bin/bash

echo "================================================"
echo "  VOTING APP - Starting Local Server"
echo "================================================"
echo ""

# Try Python 3
if command -v python3 &>/dev/null; then
    echo "[OK] Python3 found - starting server..."
    echo ""
    echo "Server running at: http://localhost:8000/voter.html"
    echo "Admin panel at:    http://localhost:8000/admin.html"
    echo ""
    echo "Press Ctrl+C to stop the server."
    echo "================================================"
    # Open browser (works on Mac and most Linux)
    sleep 1 && (open "http://localhost:8000/voter.html" 2>/dev/null || xdg-open "http://localhost:8000/voter.html" 2>/dev/null) &
    python3 -m http.server 8000
    exit 0
fi

# Try Python 2
if command -v python &>/dev/null; then
    echo "[OK] Python found - starting server..."
    echo ""
    echo "Server running at: http://localhost:8000/voter.html"
    echo "Admin panel at:    http://localhost:8000/admin.html"
    echo ""
    echo "Press Ctrl+C to stop the server."
    echo "================================================"
    sleep 1 && (open "http://localhost:8000/voter.html" 2>/dev/null || xdg-open "http://localhost:8000/voter.html" 2>/dev/null) &
    python -m SimpleHTTPServer 8000
    exit 0
fi

# Try Node.js
if command -v node &>/dev/null; then
    echo "[OK] Node.js found - starting server..."
    echo ""
    echo "Server running at: http://localhost:3000/voter.html"
    echo "Admin panel at:    http://localhost:3000/admin.html"
    echo ""
    echo "Press Ctrl+C to stop the server."
    echo "================================================"
    sleep 1 && (open "http://localhost:3000/voter.html" 2>/dev/null || xdg-open "http://localhost:3000/voter.html" 2>/dev/null) &
    npx serve . -p 3000
    exit 0
fi

echo "[ERROR] Neither Python nor Node.js found."
echo ""
echo "Install Python (free): https://www.python.org/downloads/"
echo "Then run this script again."
echo ""
read -p "Press Enter to exit..."
