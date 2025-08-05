#!/bin/bash

# Complete ChatApp Backend Deployment to AWS
# Server IP: 3.111.208.77

set -e

echo "🚀 ChatApp Backend - Complete AWS Deployment"
echo "============================================="
echo "Target Server: 3.111.208.77"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Configuration
AWS_IP="3.111.208.77"
KEY_FILE="$HOME/.ssh/chatapp-key.pem"
APP_DIR="/var/www/chatapp"

# Check if key file exists
if [ ! -f "$KEY_FILE" ]; then
    echo -e "${RED}❌ SSH key not found at $KEY_FILE${NC}"
    echo "Creating a temporary key file path..."
    KEY_FILE="$HOME/.ssh/id_rsa"
    if [ ! -f "$KEY_FILE" ]; then
        echo "Please ensure you have an SSH key to connect to AWS"
        echo "You can create one with: ssh-keygen -t rsa -b 4096"
        exit 1
    fi
fi

# Function to run commands on server
run_on_server() {
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@$AWS_IP "$1"
}

# Function to copy files to server
copy_to_server() {
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -r "$1" ubuntu@$AWS_IP:"$2"
}

echo -e "${BLUE}🔧 Step 1: Setting up server environment...${NC}"
run_on_server "
    # Update system
    sudo apt update && sudo apt upgrade -y
    
    # Install Node.js 18.x
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
    
    # Install PM2 globally
    sudo npm install -g pm2
    
    # Install MongoDB
    wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add - || true
    echo 'deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse' | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
    sudo apt-get update
    sudo apt-get install -y mongodb-org
    
    # Start MongoDB
    sudo systemctl start mongod
    sudo systemctl enable mongod
    
    # Install Redis (optional)
    sudo apt-get install -y redis-server
    sudo systemctl start redis-server
    sudo systemctl enable redis-server
    
    # Configure firewall
    sudo ufw allow OpenSSH
    sudo ufw allow 80
    sudo ufw allow 443
    sudo ufw allow 3000
    sudo ufw --force enable
    
    # Create app directory
    sudo mkdir -p $APP_DIR
    sudo chown -R ubuntu:ubuntu $APP_DIR
    
    echo '✅ Server environment setup completed'
"

echo -e "${BLUE}📦 Step 2: Preparing deployment package...${NC}"
# Create deployment package
tar -czf chatapp-backend.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=logs \
    --exclude=*.tar.gz \
    --exclude=.DS_Store \
    .

echo -e "${BLUE}📤 Step 3: Uploading application files...${NC}"
# Upload files
copy_to_server "chatapp-backend.tar.gz" "/tmp/"

echo -e "${BLUE}⚙️  Step 4: Installing application...${NC}"
run_on_server "
    cd $APP_DIR
    
    # Extract files
    tar -xzf /tmp/chatapp-backend.tar.gz
    rm /tmp/chatapp-backend.tar.gz
    
    # Install dependencies
    npm install --production
    
    # Create necessary directories
    mkdir -p logs uploads
    
    # Set proper permissions
    chmod -R 755 .
    
    echo '✅ Application files installed'
"

echo -e "${BLUE}🔄 Step 5: Starting application with PM2...${NC}"
run_on_server "
    cd $APP_DIR
    
    # Stop existing processes
    pm2 stop chatapp-backend 2>/dev/null || true
    pm2 delete chatapp-backend 2>/dev/null || true
    
    # Start application
    if [ -f ecosystem.config.js ]; then
        pm2 start ecosystem.config.js --env production
    else
        pm2 start server.js --name chatapp-backend --instances max --exec-mode cluster
    fi
    
    # Save PM2 configuration
    pm2 save
    
    # Setup startup script
    pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true
    
    echo '✅ Application started with PM2'
"

echo -e "${BLUE}🔍 Step 6: Verifying deployment...${NC}"
sleep 10

# Test health endpoint
if run_on_server "curl -f http://localhost:3000/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Application is running successfully!${NC}"
    
    # Test external access
    if curl -f http://3.111.208.77:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ External access working!${NC}"
    else
        echo -e "${YELLOW}⚠️  External access may need firewall configuration${NC}"
    fi
else
    echo -e "${RED}❌ Application health check failed${NC}"
    echo "Checking logs..."
    run_on_server "pm2 logs chatapp-backend --lines 20"
fi

# Clean up
rm -f chatapp-backend.tar.gz

echo ""
echo -e "${GREEN}🎉 Deployment Summary${NC}"
echo "===================="
echo -e "${YELLOW}📊 Server Status:${NC}"
run_on_server "pm2 status"

echo ""
echo -e "${YELLOW}🌐 Your ChatApp Backend URLs:${NC}"
echo -e "Health Check: ${BLUE}http://3.111.208.77:3000/health${NC}"
echo -e "API Base URL: ${BLUE}http://3.111.208.77:3000/api${NC}"
echo -e "Socket.IO URL: ${BLUE}http://3.111.208.77:3000${NC}"

echo ""
echo -e "${YELLOW}📱 Flutter App Configuration:${NC}"
echo "Update your Flutter app with:"
echo "static const String baseUrl = 'http://3.111.208.77:3000/api';"
echo "static const String socketUrl = 'http://3.111.208.77:3000';"

echo ""
echo -e "${YELLOW}🔧 Useful Commands:${NC}"
echo "Connect to server: ssh -i $KEY_FILE ubuntu@3.111.208.77"
echo "Check PM2 status: pm2 status"
echo "View logs: pm2 logs chatapp-backend"
echo "Restart app: pm2 restart chatapp-backend"

echo ""
echo -e "${YELLOW}⚙️  Next Steps:${NC}"
echo "1. Update .env file with your Twilio credentials"
echo "2. Configure Cloudinary for media uploads"
echo "3. Test your Flutter app connection"
echo "4. Set up SSL certificate (optional)"

echo ""
echo -e "${GREEN}✨ Your ChatApp backend is now live on AWS! 🚀${NC}"
echo -e "${GREEN}🌍 Users can connect from anywhere in the world!${NC}"
