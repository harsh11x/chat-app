#!/bin/bash

# Fix Specific PM2 Error
# The app is in /home/ubuntu/chat-app/backend/ and missing dependencies

echo "🔧 Fixing PM2 MODULE_NOT_FOUND Error"
echo "===================================="

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

echo -e "${BLUE}📍 Step 1: Locating your app...${NC}"
run_on_server "
echo 'Current PM2 processes:'
pm2 list

echo ''
echo 'App directory contents:'
ls -la /home/ubuntu/chat-app/backend/ 2>/dev/null || echo 'Directory not found'

echo ''
echo 'Checking for package.json:'
if [ -f /home/ubuntu/chat-app/backend/package.json ]; then
    echo '✅ package.json found'
else
    echo '❌ package.json missing'
fi
"

echo ""
echo -e "${BLUE}🛑 Step 2: Stopping errored processes...${NC}"
run_on_server "
pm2 stop all
pm2 delete all
echo '✅ All PM2 processes stopped'
"

echo ""
echo -e "${BLUE}📦 Step 3: Installing dependencies in correct directory...${NC}"
run_on_server "
cd /home/ubuntu/chat-app/backend/

echo 'Current directory:'
pwd

echo 'Installing dependencies...'
npm install --production

echo 'Checking if express is installed:'
ls node_modules/ | grep express || echo 'Express not found'
"

echo ""
echo -e "${BLUE}🧪 Step 4: Testing server directly...${NC}"
run_on_server "
cd /home/ubuntu/chat-app/backend/

echo 'Testing Node.js directly:'
timeout 10s node server.js &
sleep 3
curl -f http://localhost:3000/health 2>/dev/null && echo '✅ Direct test passed' || echo '❌ Direct test failed'
"

echo ""
echo -e "${BLUE}🔄 Step 5: Starting with PM2 from correct directory...${NC}"
run_on_server "
cd /home/ubuntu/chat-app/backend/

# Start PM2 from the correct directory
pm2 start server.js --name chatapp-backend

# Check status
pm2 list

# Save configuration
pm2 save

echo '✅ PM2 started from correct directory'
"

echo ""
echo -e "${BLUE}🔍 Step 6: Verification...${NC}"
sleep 5

echo "PM2 Status:"
run_on_server "pm2 list"

echo ""
echo "Recent logs:"
run_on_server "pm2 logs chatapp-backend --lines 5"

echo ""
echo "Testing endpoints:"
if run_on_server "curl -f http://localhost:3000/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Local health check working${NC}"
else
    echo -e "${RED}❌ Local health check failed${NC}"
fi

if curl -f http://3.111.208.77:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ External access working${NC}"
else
    echo -e "${RED}❌ External access failed - checking firewall${NC}"
    run_on_server "sudo ufw status | grep 3000 || echo 'Port 3000 not allowed in firewall'"
fi

echo ""
echo -e "${YELLOW}🎯 Summary:${NC}"
echo "Your app directory: /home/ubuntu/chat-app/backend/"
echo "Health check: http://3.111.208.77:3000/health"
echo "API base: http://3.111.208.77:3000/api"

echo ""
echo -e "${YELLOW}🔧 If still having issues:${NC}"
echo "ssh ubuntu@3.111.208.77"
echo "cd /home/ubuntu/chat-app/backend/"
echo "npm install"
echo "pm2 restart chatapp-backend"
