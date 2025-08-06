#!/bin/bash

echo "🔧 ChatApp Backend - Node.js Update Script for Ubuntu"
echo "=================================================="

# Check current Node.js version
echo "📋 Current Node.js version:"
node --version || echo "Node.js not found"

echo ""
echo "🚀 Updating Node.js to version 20 LTS..."

# Remove old Node.js
echo "🗑️ Removing old Node.js installation..."
sudo apt-get remove -y nodejs npm

# Clean up
sudo apt-get autoremove -y

# Add NodeSource repository
echo "📦 Adding NodeSource repository..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js 20
echo "⬇️ Installing Node.js 20..."
sudo apt-get install -y nodejs

# Verify installation
echo ""
echo "✅ Installation complete!"
echo "📋 New versions:"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"

echo ""
echo "🔄 Now you can run your ChatApp backend:"
echo "cd ~/chat-app/backend"
echo "npm install"
echo "npm start"

echo ""
echo "🎉 Node.js update completed successfully!"