#!/bin/bash

# Quick Deployment Script for ChatApp Backend
# AWS IP: 3.111.208.77

set -e

echo "🚀 ChatApp Backend Quick Deployment to AWS"
echo "Server IP: 3.111.208.77"
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
    echo "Please ensure your AWS key pair is saved as $KEY_FILE"
    echo "Or update the KEY_FILE variable in this script"
    exit 1
fi

# Function to run commands on server
run_on_server() {
    ssh -i "$KEY_FILE" -o StrictHostKeyChecking=no ubuntu@$AWS_IP "$1"
}

# Function to copy files to server
copy_to_server() {
    scp -i "$KEY_FILE" -o StrictHostKeyChecking=no -r "$1" ubuntu@$AWS_IP:"$2"
}

echo -e "${BLUE}📦 Step 1: Preparing deployment package...${NC}"
# Create deployment package
tar -czf chatapp-backend.tar.gz \
    --exclude=node_modules \
    --exclude=.git \
    --exclude=logs \
    --exclude=*.tar.gz \
    --exclude=.env \
    .

echo -e "${BLUE}📤 Step 2: Uploading files to server...${NC}"
# Upload files
copy_to_server "chatapp-backend.tar.gz" "/tmp/"

echo -e "${BLUE}⚙️  Step 3: Setting up application on server...${NC}"
# Setup on server
run_on_server "
    # Create app directory if it doesn't exist
    sudo mkdir -p $APP_DIR
    sudo chown -R ubuntu:ubuntu $APP_DIR
    
    # Extract files
    cd $APP_DIR
    tar -xzf /tmp/chatapp-backend.tar.gz
    rm /tmp/chatapp-backend.tar.gz
    
    # Install dependencies
    npm install --production
    
    # Create logs directory
    mkdir -p logs
    
    # Create .env file if it doesn't exist
    if [ ! -f .env ]; then
        cat > .env << 'EOF'
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
MONGODB_URI=mongodb://localhost:27017/chatapp_production
JWT_SECRET=your-super-secure-jwt-secret-$(openssl rand -hex 16)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
REDIS_URL=redis://localhost:6379
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
MAX_FILE_SIZE=10485760
LOG_LEVEL=info
EOF
        echo '✅ Created default .env file - please update with your actual values'
    fi
"

echo -e "${BLUE}🔄 Step 4: Managing PM2 process...${NC}"
# Start/restart with PM2
run_on_server "
    cd $APP_DIR
    
    # Check if PM2 is installed
    if ! command -v pm2 &> /dev/null; then
        echo 'Installing PM2...'
        sudo npm install -g pm2
    fi
    
    # Stop existing process if running
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
    
    # Setup startup script (run only once)
    pm2 startup 2>/dev/null || true
"

echo -e "${BLUE}🔍 Step 5: Verifying deployment...${NC}"
# Test deployment
sleep 5
if run_on_server "curl -f http://localhost:3000/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Application is running successfully!${NC}"
else
    echo -e "${RED}❌ Application health check failed${NC}"
    echo "Checking logs..."
    run_on_server "pm2 logs chatapp-backend --lines 10"
fi

# Clean up local files
rm -f chatapp-backend.tar.gz

echo ""
echo -e "${GREEN}🎉 Deployment completed!${NC}"
echo ""
echo -e "${YELLOW}📊 Server Status:${NC}"
run_on_server "pm2 status"

echo ""
echo -e "${YELLOW}🌐 Your ChatApp backend is available at:${NC}"
echo -e "API Base URL: ${BLUE}http://3.111.208.77:3000/api${NC}"
echo -e "Socket.IO URL: ${BLUE}http://3.111.208.77:3000${NC}"
echo -e "Health Check: ${BLUE}http://3.111.208.77:3000/health${NC}"

echo ""
echo -e "${YELLOW}📱 Update your Flutter app with:${NC}"
echo "static const String baseUrl = 'http://3.111.208.77:3000/api';"
echo "static const String socketUrl = 'http://3.111.208.77:3000';"

echo ""
echo -e "${YELLOW}🔧 Useful commands:${NC}"
echo "ssh -i $KEY_FILE ubuntu@3.111.208.77"
echo "pm2 status"
echo "pm2 logs chatapp-backend"
echo "pm2 restart chatapp-backend"

echo ""
echo -e "${GREEN}✨ Your ChatApp backend is now live on AWS! 🚀${NC}"
