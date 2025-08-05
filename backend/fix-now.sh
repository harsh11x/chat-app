#!/bin/bash

# Immediate Fix for MODULE_NOT_FOUND Error
echo "🔧 Fixing MODULE_NOT_FOUND Error Now"
echo "==================================="

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

echo "🛑 Step 1: Stop PM2 and clean up..."
run_on_server "
pm2 stop all
pm2 delete all
"

echo "📦 Step 2: Fix dependencies..."
run_on_server "
cd /home/ubuntu/chat-app/backend

# Remove problematic modules
rm -rf node_modules package-lock.json

# Create working package.json
cat > package.json << 'EOF'
{
  \"name\": \"chatapp-backend\",
  \"version\": \"1.0.0\",
  \"main\": \"server.js\",
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
    \"uuid\": \"^9.0.0\",
    \"multer\": \"^1.4.5-lts.1\"
  }
}
EOF

# Install dependencies
npm install --production

echo 'Dependencies installed:'
ls node_modules/ | grep -E 'express|socket|mongoose' | head -3
"

echo "🔄 Step 3: Start with PM2..."
run_on_server "
cd /home/ubuntu/chat-app/backend

# Start PM2
pm2 start server.js --name chatapp-backend

# Check status
pm2 list

# Save config
pm2 save
"

echo "🔍 Step 4: Test..."
sleep 5

echo "PM2 Status:"
run_on_server "pm2 list"

echo ""
echo "Testing health endpoint:"
if run_on_server "curl -f http://localhost:3000/health" > /dev/null 2>&1; then
    echo "✅ Server is working!"
else
    echo "❌ Still having issues. Checking logs:"
    run_on_server "pm2 logs chatapp-backend --lines 5"
fi

echo ""
echo "✅ Fix completed!"
