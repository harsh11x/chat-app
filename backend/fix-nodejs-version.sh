#!/bin/bash

# Fix Node.js Version Issue
echo "🔧 Fixing Node.js Version Issue"
echo "==============================="

AWS_IP="3.111.208.77"
KEY_FILE="$HOME/.ssh/chatapp-key.pem"

# Try different key files
if [ ! -f "$KEY_FILE" ]; then
    KEY_FILE="$HOME/.ssh/id_rsa"
fi

# Function to run commands on server
run_on_server() {
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@$AWS_IP "$1"
}

echo "📊 Step 1: Check current Node.js version..."
run_on_server "
echo 'Current Node.js version:'
node --version
echo 'Current NPM version:'
npm --version
"

echo "🔄 Step 2: Upgrade Node.js to version 18..."
run_on_server "
# Remove old Node.js
sudo apt-get remove -y nodejs npm

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify new version
echo 'New Node.js version:'
node --version
echo 'New NPM version:'
npm --version
"

echo "🛑 Step 3: Stop PM2 and clean up..."
run_on_server "
# Stop all PM2 processes
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Reinstall PM2 with new Node.js
sudo npm install -g pm2

# Verify PM2
pm2 --version
"

echo "📦 Step 4: Create minimal working server..."
run_on_server "
cd /home/ubuntu/chat-app/backend/

# Remove problematic dependencies
rm -rf node_modules package-lock.json

# Create minimal package.json without sharp and other heavy dependencies
cat > package.json << 'EOF'
{
  \"name\": \"chatapp-backend\",
  \"version\": \"1.0.0\",
  \"description\": \"ChatApp Backend\",
  \"main\": \"server.js\",
  \"scripts\": {
    \"start\": \"node server.js\"
  },
  \"dependencies\": {
    \"express\": \"^4.18.2\",
    \"socket.io\": \"^4.7.2\",
    \"mongoose\": \"^7.5.0\",
    \"cors\": \"^2.8.5\",
    \"dotenv\": \"^16.3.1\",
    \"bcryptjs\": \"^2.4.3\",
    \"jsonwebtoken\": \"^9.0.2\",
    \"helmet\": \"^7.0.0\",
    \"express-rate-limit\": \"^6.10.0\",
    \"express-validator\": \"^7.0.1\",
    \"compression\": \"^1.7.4\",
    \"morgan\": \"^1.10.0\",
    \"uuid\": \"^9.0.0\"
  }
}
EOF

echo '✅ Minimal package.json created (without sharp)'
"

echo "📥 Step 5: Install dependencies with new Node.js..."
run_on_server "
cd /home/ubuntu/chat-app/backend/

# Clean npm cache
npm cache clean --force

# Install dependencies
npm install --production

# Verify key modules are installed
echo 'Checking installed modules:'
ls node_modules/ | grep -E 'express|socket|mongoose' || echo 'Some modules missing'
"

echo "🧪 Step 6: Test server directly..."
run_on_server "
cd /home/ubuntu/chat-app/backend/

# Test Node.js directly
echo 'Testing server with new Node.js version:'
timeout 10s node server.js &
sleep 3
curl -f http://localhost:3000/health 2>/dev/null && echo '✅ Direct test passed' || echo '❌ Direct test failed'
"

echo "🔄 Step 7: Start with PM2..."
run_on_server "
cd /home/ubuntu/chat-app/backend/

# Start with PM2
pm2 start server.js --name chatapp-backend

# Check status
pm2 list

# Save config
pm2 save

# Setup startup
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true
"

echo "🔍 Step 8: Final verification..."
sleep 5

echo "Node.js version:"
run_on_server "node --version"

echo ""
echo "PM2 Status:"
run_on_server "pm2 list"

echo ""
echo "Recent logs:"
run_on_server "pm2 logs chatapp-backend --lines 5 --nostream"

echo ""
echo "Testing endpoints:"
if run_on_server "curl -f http://localhost:3000/health" > /dev/null 2>&1; then
    echo "✅ Local health check working"
else
    echo "❌ Local health check failed"
fi

if curl -f http://3.111.208.77:3000/health > /dev/null 2>&1; then
    echo "✅ External access working"
else
    echo "❌ External access failed"
fi

echo ""
echo "✅ Node.js upgrade completed!"
echo "Your server should now be running with Node.js 18.x"
