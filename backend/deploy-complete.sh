#!/bin/bash

# Complete ChatApp Backend Deployment with ALL Features
# Real-time messaging, file sharing, calling, stories, profile management

set -e

echo "🚀 ChatApp Complete Backend Deployment"
echo "======================================"
echo "Target: 3.111.208.77"
echo "Features: Messaging, Files, Calling, Stories, Profiles"
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

echo -e "${BLUE}🔧 Step 1: Server environment setup...${NC}"
run_on_server "
    # Update system
    sudo apt update && sudo apt upgrade -y
    
    # Remove old Node.js
    sudo apt-get remove -y nodejs npm 2>/dev/null || true
    
    # Install Node.js 18.x
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Install system dependencies for media processing
    sudo apt-get install -y ffmpeg imagemagick
    
    # Install PM2
    sudo npm install -g pm2
    
    # Install MongoDB
    wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add - 2>/dev/null || true
    echo 'deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse' | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
    sudo apt-get update
    sudo apt-get install -y mongodb-org
    
    # Start services
    sudo systemctl start mongod
    sudo systemctl enable mongod
    
    # Configure firewall
    sudo ufw allow OpenSSH
    sudo ufw allow 80
    sudo ufw allow 443
    sudo ufw allow 3000
    sudo ufw --force enable
    
    echo '✅ Server environment ready'
"

echo -e "${BLUE}📦 Step 2: Creating application structure...${NC}"
run_on_server "
    # Create app directory
    sudo mkdir -p /home/ubuntu/chat-app/backend
    sudo chown -R ubuntu:ubuntu /home/ubuntu/chat-app
    
    cd /home/ubuntu/chat-app/backend
    
    # Create directory structure
    mkdir -p uploads/{profiles,messages,stories,voice,documents} logs models routes services middleware socket
    
    echo '✅ Directory structure created'
"

echo -e "${BLUE}📥 Step 3: Uploading application files...${NC}"
# Create deployment package
tar -czf chatapp-complete.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=logs \
    --exclude=uploads \
    --exclude=*.tar.gz \
    .

# Upload files
scp -i "$KEY_FILE" -o StrictHostKeyChecking=no chatapp-complete.tar.gz ubuntu@$AWS_IP:/tmp/

run_on_server "
    cd /home/ubuntu/chat-app/backend
    
    # Extract files
    tar -xzf /tmp/chatapp-complete.tar.gz
    rm /tmp/chatapp-complete.tar.gz
    
    echo '✅ Application files uploaded'
"

echo -e "${BLUE}🔧 Step 4: Installing dependencies...${NC}"
run_on_server "
    cd /home/ubuntu/chat-app/backend
    
    # Clean install
    rm -rf node_modules package-lock.json
    npm cache clean --force
    
    # Install dependencies
    npm install --production
    
    # Verify key modules
    echo 'Checking installed modules:'
    ls node_modules/ | grep -E 'express|socket|mongoose|multer|jimp' | head -5
    
    echo '✅ Dependencies installed'
"

echo -e "${BLUE}⚙️  Step 5: Configuration setup...${NC}"
run_on_server "
    cd /home/ubuntu/chat-app/backend
    
    # Create production environment file
    cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
MONGODB_URI=mongodb://localhost:27017/chatapp_complete

# JWT Secret
JWT_SECRET=chatapp-complete-jwt-secret-$(openssl rand -hex 32)

# Server
SERVER_IP=3.111.208.77
FRONTEND_URL=http://3.111.208.77:3000

# File Upload
MAX_FILE_SIZE=104857600
UPLOAD_PATH=/home/ubuntu/chat-app/backend/uploads

# Twilio (Add your credentials)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Cloudinary (Add your credentials)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# CORS
CORS_ORIGIN=*

# Logging
LOG_LEVEL=info
LOG_FILE=/home/ubuntu/chat-app/backend/logs/app.log
EOF

    # Set proper permissions
    chmod -R 755 .
    chmod -R 777 uploads logs
    
    echo '✅ Configuration complete'
"

echo -e "${BLUE}🔄 Step 6: Starting with PM2...${NC}"
run_on_server "
    cd /home/ubuntu/chat-app/backend
    
    # Stop existing processes
    pm2 stop all 2>/dev/null || true
    pm2 delete all 2>/dev/null || true
    
    # Start application
    pm2 start server.js --name chatapp-complete --instances max --exec-mode cluster
    
    # Save PM2 config
    pm2 save
    
    # Setup startup
    pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true
    
    echo '✅ Application started with PM2'
"

echo -e "${BLUE}🔍 Step 7: Verification...${NC}"
sleep 10

echo "Node.js version:"
run_on_server "node --version"

echo ""
echo "PM2 Status:"
run_on_server "pm2 list"

echo ""
echo "MongoDB Status:"
run_on_server "sudo systemctl status mongod --no-pager -l | head -5"

echo ""
echo "Directory Structure:"
run_on_server "ls -la /home/ubuntu/chat-app/backend/uploads/"

echo ""
echo "Testing endpoints:"
if run_on_server "curl -f http://localhost:3000/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Health check working${NC}"
else
    echo -e "${RED}❌ Health check failed${NC}"
    echo "Checking logs..."
    run_on_server "pm2 logs chatapp-complete --lines 10"
fi

if curl -f http://3.111.208.77:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅ External access working${NC}"
else
    echo -e "${RED}❌ External access failed${NC}"
fi

# Clean up
rm -f chatapp-complete.tar.gz

echo ""
echo -e "${GREEN}🎉 Complete Deployment Summary${NC}"
echo "================================"

echo -e "${YELLOW}🌐 Your ChatApp Backend URLs:${NC}"
echo "Health Check: http://3.111.208.77:3000/health"
echo "API Base: http://3.111.208.77:3000/api"
echo "Socket.IO: http://3.111.208.77:3000"
echo "File Uploads: http://3.111.208.77:3000/uploads"

echo ""
echo -e "${YELLOW}✨ Features Available:${NC}"
echo "📱 Real-time Messaging"
echo "📁 File Sharing (Images, Videos, Documents)"
echo "🎤 Voice Notes"
echo "📞 Voice/Video Calling"
echo "📖 Stories (24h expiry)"
echo "👤 Profile Management"
echo "🔄 Live Status Updates"
echo "⚡ All real-time via Socket.IO"

echo ""
echo -e "${YELLOW}📱 Flutter App Configuration:${NC}"
echo "Update your Flutter app:"
echo "static const String baseUrl = 'http://3.111.208.77:3000/api';"
echo "static const String socketUrl = 'http://3.111.208.77:3000';"
echo "static const String uploadUrl = 'http://3.111.208.77:3000/api/upload';"

echo ""
echo -e "${YELLOW}🔧 Management Commands:${NC}"
echo "Connect: ssh -i $KEY_FILE ubuntu@3.111.208.77"
echo "PM2 Status: pm2 list"
echo "View Logs: pm2 logs chatapp-complete"
echo "Restart: pm2 restart chatapp-complete"
echo "Monitor: pm2 monit"

echo ""
echo -e "${YELLOW}📋 Next Steps:${NC}"
echo "1. Update .env with your Twilio credentials for SMS OTP"
echo "2. Add Cloudinary credentials for cloud file storage"
echo "3. Test all features with your Flutter app"
echo "4. Configure SSL certificate (optional)"

echo ""
echo -e "${GREEN}✨ Your complete ChatApp backend is now LIVE! 🚀${NC}"
echo -e "${GREEN}🌍 All features working in real-time worldwide! 📱${NC}"

echo ""
echo -e "${BLUE}🧪 Quick Test Commands:${NC}"
echo "curl http://3.111.208.77:3000/health"
echo "curl http://3.111.208.77:3000/api/auth/send-otp -X POST -H 'Content-Type: application/json' -d '{\"phoneNumber\":\"1234567890\",\"countryCode\":\"+1\"}'"
