#!/bin/bash

# Debug ChatApp Backend on AWS
# Server IP: 3.111.208.77

echo "🔍 ChatApp Backend Debug Script"
echo "==============================="

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
    echo -e "${RED}❌ No SSH key found. Please ensure you have SSH access to AWS.${NC}"
    echo "Try: ssh ubuntu@3.111.208.77"
    exit 1
fi

echo -e "${BLUE}🔌 Connecting to AWS server...${NC}"

# Function to run commands on server
run_on_server() {
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@$AWS_IP "$1"
}

echo -e "${BLUE}📊 System Information:${NC}"
run_on_server "
echo '=== System Info ==='
uname -a
echo ''
echo '=== Node.js Version ==='
node --version 2>/dev/null || echo 'Node.js not installed'
echo ''
echo '=== NPM Version ==='
npm --version 2>/dev/null || echo 'NPM not installed'
echo ''
echo '=== PM2 Version ==='
pm2 --version 2>/dev/null || echo 'PM2 not installed'
echo ''
echo '=== MongoDB Status ==='
sudo systemctl status mongod --no-pager -l 2>/dev/null || echo 'MongoDB not installed'
echo ''
"

echo -e "${BLUE}📁 Application Directory:${NC}"
run_on_server "
echo '=== App Directory ==='
ls -la /var/www/chatapp/ 2>/dev/null || echo 'App directory does not exist'
echo ''
echo '=== Package.json ==='
cat /var/www/chatapp/package.json 2>/dev/null || echo 'package.json not found'
echo ''
echo '=== Environment File ==='
ls -la /var/www/chatapp/.env* 2>/dev/null || echo 'No .env files found'
echo ''
"

echo -e "${BLUE}🔄 PM2 Status:${NC}"
run_on_server "
echo '=== PM2 Status ==='
pm2 status 2>/dev/null || echo 'PM2 not running or not installed'
echo ''
echo '=== PM2 Logs (last 20 lines) ==='
pm2 logs --lines 20 --nostream 2>/dev/null || echo 'No PM2 logs available'
echo ''
"

echo -e "${BLUE}🌐 Network & Ports:${NC}"
run_on_server "
echo '=== Port 3000 Usage ==='
sudo netstat -tulpn | grep :3000 2>/dev/null || echo 'Port 3000 is free'
echo ''
echo '=== Firewall Status ==='
sudo ufw status 2>/dev/null || echo 'UFW not configured'
echo ''
"

echo -e "${BLUE}🧠 System Resources:${NC}"
run_on_server "
echo '=== Memory Usage ==='
free -h
echo ''
echo '=== Disk Usage ==='
df -h
echo ''
echo '=== System Load ==='
uptime
echo ''
"

echo -e "${BLUE}🔍 Testing Connectivity:${NC}"
echo "Testing local connection..."
if run_on_server "curl -f http://localhost:3000/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Local connection working${NC}"
else
    echo -e "${RED}❌ Local connection failed${NC}"
fi

echo "Testing external connection..."
if curl -f http://3.111.208.77:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ External connection working${NC}"
else
    echo -e "${RED}❌ External connection failed${NC}"
fi

echo ""
echo -e "${YELLOW}🔧 Quick Fixes:${NC}"
echo "1. Install Node.js: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
echo "2. Install PM2: sudo npm install -g pm2"
echo "3. Create app directory: sudo mkdir -p /var/www/chatapp && sudo chown -R ubuntu:ubuntu /var/www/chatapp"
echo "4. Open firewall: sudo ufw allow 3000"
echo ""
echo -e "${YELLOW}📞 Manual Connection:${NC}"
echo "ssh -i $KEY_FILE ubuntu@3.111.208.77"
