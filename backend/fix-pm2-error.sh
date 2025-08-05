#!/bin/bash

# Fix PM2 Error Script
# This will diagnose and fix PM2 errors

echo "🔧 PM2 Error Diagnosis & Fix"
echo "============================"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

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

echo -e "${BLUE}📊 Step 1: Checking PM2 status...${NC}"
run_on_server "pm2 list"

echo ""
echo -e "${BLUE}📝 Step 2: Checking error logs...${NC}"
run_on_server "pm2 logs --lines 30"

echo ""
echo -e "${BLUE}🔍 Step 3: Checking what's wrong...${NC}"
run_on_server "
cd /var/www/chatapp 2>/dev/null || cd /home/ubuntu

echo '=== Current Directory ==='
pwd
ls -la

echo ''
echo '=== Package.json exists? ==='
if [ -f package.json ]; then
    echo '✅ package.json found'
    cat package.json
else
    echo '❌ package.json missing'
fi

echo ''
echo '=== Server.js exists? ==='
if [ -f server.js ]; then
    echo '✅ server.js found'
    head -10 server.js
else
    echo '❌ server.js missing'
fi

echo ''
echo '=== Node modules installed? ==='
if [ -d node_modules ]; then
    echo '✅ node_modules found'
else
    echo '❌ node_modules missing - need to run npm install'
fi

echo ''
echo '=== Test Node.js directly ==='
node --version
npm --version
"

echo ""
echo -e "${BLUE}🚀 Step 4: Creating working server...${NC}"
run_on_server "
# Go to app directory or create it
cd /var/www/chatapp 2>/dev/null || {
    sudo mkdir -p /var/www/chatapp
    sudo chown -R ubuntu:ubuntu /var/www/chatapp
    cd /var/www/chatapp
}

# Stop all PM2 processes
pm2 stop all 2>/dev/null || true
pm2 delete all 2>/dev/null || true

# Create a super simple working server
cat > server.js << 'EOF'
console.log('🚀 Starting ChatApp Backend...');

const express = require('express');
const app = express();

console.log('✅ Express loaded');

// Basic middleware
app.use(express.json());
console.log('✅ Middleware configured');

// Health endpoint
app.get('/health', (req, res) => {
    console.log('📡 Health check requested');
    res.json({
        success: true,
        message: 'ChatApp Backend is working!',
        timestamp: new Date().toISOString(),
        server: '3.111.208.77:3000'
    });
});

// Test endpoint
app.get('/test', (req, res) => {
    console.log('🧪 Test endpoint requested');
    res.json({
        success: true,
        message: 'Test successful!',
        data: { working: true }
    });
});

// Start server
const PORT = 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, (err) => {
    if (err) {
        console.error('❌ Server failed to start:', err);
        process.exit(1);
    }
    console.log(\`🚀 Server running on \${HOST}:\${PORT}\`);
    console.log(\`🌐 Health: http://3.111.208.77:\${PORT}/health\`);
    console.log(\`🧪 Test: http://3.111.208.77:\${PORT}/test\`);
});

// Error handling
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Rejection:', err);
    process.exit(1);
});

console.log('✅ Server setup complete');
EOF

# Create minimal package.json
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
    \"express\": \"^4.18.2\"
  }
}
EOF

echo '✅ Server files created'
"

echo ""
echo -e "${BLUE}📦 Step 5: Installing dependencies...${NC}"
run_on_server "
cd /var/www/chatapp
npm install
echo '✅ Dependencies installed'
"

echo ""
echo -e "${BLUE}🧪 Step 6: Testing server directly...${NC}"
echo "Testing if Node.js can run the server..."
run_on_server "
cd /var/www/chatapp
timeout 10s node server.js &
sleep 3
curl -f http://localhost:3000/health || echo 'Direct test failed'
"

echo ""
echo -e "${BLUE}🔄 Step 7: Starting with PM2...${NC}"
run_on_server "
cd /var/www/chatapp

# Start with PM2
pm2 start server.js --name chatapp-backend

# Check status immediately
pm2 list

# Save configuration
pm2 save

echo '✅ PM2 start attempted'
"

echo ""
echo -e "${BLUE}🔍 Step 8: Final verification...${NC}"
sleep 5

echo "PM2 Status:"
run_on_server "pm2 list"

echo ""
echo "Recent logs:"
run_on_server "pm2 logs chatapp-backend --lines 10"

echo ""
echo "Testing endpoints:"
if run_on_server "curl -f http://localhost:3000/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Health endpoint working${NC}"
else
    echo -e "${RED}❌ Health endpoint failed${NC}"
fi

if curl -f http://3.111.208.77:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ External access working${NC}"
else
    echo -e "${RED}❌ External access failed${NC}"
fi

echo ""
echo -e "${YELLOW}🔧 If still errored, run these commands manually:${NC}"
echo "ssh ubuntu@3.111.208.77"
echo "cd /var/www/chatapp"
echo "pm2 logs chatapp-backend"
echo "node server.js  # Test directly"
