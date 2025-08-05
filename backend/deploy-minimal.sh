#!/bin/bash

# Minimal ChatApp Backend Deployment
# This deploys a basic working server first

set -e

echo "🚀 ChatApp Backend - Minimal Deployment"
echo "======================================="
echo "Target: 3.111.208.77"
echo ""

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

if [ ! -f "$KEY_FILE" ]; then
    echo -e "${RED}❌ SSH key not found${NC}"
    echo "Please ensure you can connect: ssh ubuntu@3.111.208.77"
    exit 1
fi

# Function to run commands on server
run_on_server() {
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@$AWS_IP "$1"
}

echo -e "${BLUE}🔧 Step 1: Basic server setup...${NC}"
run_on_server "
    # Update system
    sudo apt update
    
    # Install Node.js if not installed
    if ! command -v node &> /dev/null; then
        echo 'Installing Node.js...'
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    # Install PM2 if not installed
    if ! command -v pm2 &> /dev/null; then
        echo 'Installing PM2...'
        sudo npm install -g pm2
    fi
    
    # Create app directory
    sudo mkdir -p /var/www/chatapp
    sudo chown -R ubuntu:ubuntu /var/www/chatapp
    
    # Open firewall
    sudo ufw allow 3000 2>/dev/null || true
    
    echo '✅ Basic setup completed'
"

echo -e "${BLUE}📦 Step 2: Creating minimal server files...${NC}"

# Create minimal files on server
run_on_server "
cd /var/www/chatapp

# Create minimal package.json
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
    \"cors\": \"^2.8.5\",
    \"dotenv\": \"^16.3.1\"
  }
}
EOF

# Create minimal server.js
cat > server.js << 'EOF'
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'ChatApp Backend is running!',
    timestamp: new Date().toISOString(),
    server: '3.111.208.77:3000'
  });
});

// Test API
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    server: '3.111.208.77:3000'
  });
});

// OTP endpoint (demo)
app.post('/api/auth/send-otp', (req, res) => {
  const { phoneNumber, countryCode } = req.body;
  res.json({
    success: true,
    message: 'OTP sent successfully (demo)',
    data: {
      phoneNumber: (countryCode || '') + (phoneNumber || ''),
      expiresIn: 300
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    availableRoutes: ['/health', '/api/test', '/api/auth/send-otp']
  });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(\`🚀 Server running on \${HOST}:\${PORT}\`);
  console.log(\`🌐 Health: http://3.111.208.77:\${PORT}/health\`);
  console.log(\`📱 API: http://3.111.208.77:\${PORT}/api/test\`);
});
EOF

# Create .env file
cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
EOF

echo '✅ Minimal server files created'
"

echo -e "${BLUE}📥 Step 3: Installing dependencies...${NC}"
run_on_server "
cd /var/www/chatapp
npm install --production
echo '✅ Dependencies installed'
"

echo -e "${BLUE}🔄 Step 4: Starting with PM2...${NC}"
run_on_server "
cd /var/www/chatapp

# Stop any existing processes
pm2 stop chatapp-backend 2>/dev/null || true
pm2 delete chatapp-backend 2>/dev/null || true

# Start the server
pm2 start server.js --name chatapp-backend

# Save PM2 config
pm2 save

# Setup startup
pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true

echo '✅ Server started with PM2'
"

echo -e "${BLUE}🔍 Step 5: Testing deployment...${NC}"
sleep 5

# Test local connection
if run_on_server "curl -f http://localhost:3000/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Local connection working${NC}"
else
    echo -e "${RED}❌ Local connection failed${NC}"
    echo "Checking PM2 logs..."
    run_on_server "pm2 logs chatapp-backend --lines 10"
    exit 1
fi

# Test external connection
if curl -f http://3.111.208.77:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ External connection working${NC}"
else
    echo -e "${YELLOW}⚠️  External connection failed - checking firewall...${NC}"
    run_on_server "sudo ufw status"
fi

echo ""
echo -e "${GREEN}🎉 Minimal Deployment Completed!${NC}"
echo ""
echo -e "${YELLOW}📊 Server Status:${NC}"
run_on_server "pm2 status"

echo ""
echo -e "${YELLOW}🌐 Test Your Server:${NC}"
echo "Health Check: curl http://3.111.208.77:3000/health"
echo "API Test: curl http://3.111.208.77:3000/api/test"
echo "OTP Test: curl -X POST http://3.111.208.77:3000/api/auth/send-otp -H 'Content-Type: application/json' -d '{\"phoneNumber\":\"1234567890\",\"countryCode\":\"+1\"}'"

echo ""
echo -e "${YELLOW}📱 Flutter Configuration:${NC}"
echo "static const String baseUrl = 'http://3.111.208.77:3000/api';"

echo ""
echo -e "${YELLOW}🔧 Management Commands:${NC}"
echo "Connect: ssh -i $KEY_FILE ubuntu@3.111.208.77"
echo "PM2 Status: pm2 status"
echo "View Logs: pm2 logs chatapp-backend"
echo "Restart: pm2 restart chatapp-backend"

echo ""
echo -e "${GREEN}✨ Your minimal ChatApp backend is now running! 🚀${NC}"
