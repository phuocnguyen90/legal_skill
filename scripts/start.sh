#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting Legal AI Assistant (WSL/Linux)..."

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "📦 Node.js not found. Installing via NVM..."
    # Attempt to load nvm if installed but not in path
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

    if ! command -v node &> /dev/null; then
        echo "   Installing NVM and Node.js LTS..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
        nvm install --lts
    fi
fi

echo "✅ Node.js $(node -v) is ready."

# 2. Check for Ollama (Linux side - optional if using Windows Ollama via host)
# If Ollama is running on Windows handle, it's accessible via localhost:11434 from WSL usually.
# However, we should check connectivity.

echo "🔍 Checking Ollama connection..."
if curl -s http://localhost:11434/api/tags >/dev/null; then
    echo "✅ Ollama is running and accessible at localhost."
else
    echo "⚠️  Cannot connect to Ollama at localhost."
    
    # Try to find Windows host IP from WSL default gateway
    HOST_IP=$(ip route show | grep default | awk '{print $3}')
    echo "   Trying Windows Host IP: $HOST_IP..."
    
    if [ -n "$HOST_IP" ] && curl -s "http://$HOST_IP:11434/api/tags" >/dev/null; then
        echo "✅ Found Ollama on Windows host ($HOST_IP)."
        export OLLAMA_BASE_URL="http://$HOST_IP:11434"
        echo "   Set OLLAMA_BASE_URL=$OLLAMA_BASE_URL"
    else
        echo "❌ Cannot connect to Ollama at http://localhost:11434 or http://$HOST_IP:11434"
        echo "   Ensure Ollama is running on Windows."
        echo "   In PowerShell: ollama serve"
    fi
fi

# 3. Setup Project
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )/.."
cd "$DIR"

echo "📦 Installing dependencies..."
npm install --silent

echo "hammer_and_wrench Building project..."
npm run build

# 4. Start Server
echo "🌐 Starting Web Server..."
echo "   Open your browser at: http://localhost:3000"

# Use 'explorer.exe' to open browser from WSL if available
if command -v explorer.exe &> /dev/null; then
    explorer.exe "http://localhost:3000" || true
fi

npm run start -- serve
