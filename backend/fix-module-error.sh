#!/bin/bash

# Direct Fix for MODULE_NOT_FOUND Error
echo "🔧 Fixing MODULE_NOT_FOUND Error"
echo "================================"

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

echo "🛑 Step 1: Stop all PM2 processes..."
run_on_server "pm2 stop all && pm2 delete all"

echo "📍 Step 2: Check your app directory..."
run_on_server "
echo 'App directory contents:'
ls -la /home/ubuntu/chat-app/backend/

echo ''
echo 'Checking package.json:'
cat /home/ubuntu/chat-app/backend/package.json 2>/dev/null || echo 'package.json missing'
"

echo "📦 Step 3: Force clean install..."
run_on_server "
cd /home/ubuntu/chat-app/backend/

# Remove old node_modules and package-lock
rm -rf node_modules package-lock.json

# Create minimal package.json if missing
if [ ! -f package.json ]; then
    echo 'Creating package.json...'
    cat > package.json << 'EOF'
{
  \"name\": \"chatapp-backend\",
  \"version\": \"1.0.0\",
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
fi

# Install dependencies
echo 'Installing dependencies...'
npm install --production

# Verify express is installed
if [ -d node_modules/express ]; then
    echo '✅ Express installed successfully'
else
    echo '❌ Express installation failed'
fi
"

echo "🧪 Step 4: Test Node.js directly..."
run_on_server "
cd /home/ubuntu/chat-app/backend/

# Test if server.js can run
echo 'Testing server.js...'
timeout 5s node server.js 2>&1 | head -10
"

echo "🔄 Step 5: Start with PM2..."
run_on_server "
cd /home/ubuntu/chat-app/backend/

# Start PM2
pm2 start server.js --name chatapp-backend

# Check status
pm2 list

# Save config
pm2 save
"

echo "🔍 Step 6: Check results..."
sleep 3
run_on_server "
echo 'PM2 Status:'
pm2 list

echo ''
echo 'Recent logs:'
pm2 logs chatapp-backend --lines 5 --nostream
"

echo "✅ Fix completed!"
echo "If still errored, run: ssh ubuntu@3.111.208.77 'cd /home/ubuntu/chat-app/backend && npm install && pm2 restart chatapp-backend'"
