#!/bin/bash

echo "🔧 ChatApp Backend - Mongoose Compatibility Fix"
echo "=============================================="

echo "📋 Current Node.js version:"
node --version

echo ""
echo "⬇️ Installing compatible Mongoose version for older Node.js..."

# Install compatible versions
npm install mongoose@6.12.0 --save

echo ""
echo "✅ Mongoose downgraded to v6.12.0 (compatible with Node.js 12+)"
echo ""
echo "🚀 Now try starting the server:"
echo "npm start"