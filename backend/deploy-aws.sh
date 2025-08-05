#!/bin/bash

# ChatApp Backend AWS Deployment Script
# This script sets up and deploys the Node.js backend to AWS EC2

set -e  # Exit on any error

echo "🚀 ChatApp Backend AWS Deployment Starting..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
AWS_REGION="us-east-1"  # Change to your preferred region
INSTANCE_TYPE="t3.medium"  # Adjust based on your needs
KEY_NAME="chatapp-key"  # Your AWS key pair name
SECURITY_GROUP="chatapp-sg"
SERVER_NAME="chatapp-backend-server"

echo -e "${BLUE}📋 Deployment Configuration:${NC}"
echo -e "Region: ${YELLOW}$AWS_REGION${NC}"
echo -e "Instance Type: ${YELLOW}$INSTANCE_TYPE${NC}"
echo -e "Key Name: ${YELLOW}$KEY_NAME${NC}"
echo ""

# Function to check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI not found. Please install it first.${NC}"
        echo "Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
        exit 1
    fi
    echo -e "${GREEN}✅ AWS CLI found${NC}"
}

# Function to create security group
create_security_group() {
    echo -e "${BLUE}🔒 Creating security group...${NC}"
    
    # Create security group
    aws ec2 create-security-group \
        --group-name $SECURITY_GROUP \
        --description "Security group for ChatApp backend server" \
        --region $AWS_REGION || true
    
    # Add inbound rules
    echo -e "${BLUE}📝 Adding security group rules...${NC}"
    
    # SSH access
    aws ec2 authorize-security-group-ingress \
        --group-name $SECURITY_GROUP \
        --protocol tcp \
        --port 22 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION || true
    
    # HTTP access
    aws ec2 authorize-security-group-ingress \
        --group-name $SECURITY_GROUP \
        --protocol tcp \
        --port 80 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION || true
    
    # HTTPS access
    aws ec2 authorize-security-group-ingress \
        --group-name $SECURITY_GROUP \
        --protocol tcp \
        --port 443 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION || true
    
    # Node.js app port
    aws ec2 authorize-security-group-ingress \
        --group-name $SECURITY_GROUP \
        --protocol tcp \
        --port 3000 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION || true
    
    # Socket.IO port (if different)
    aws ec2 authorize-security-group-ingress \
        --group-name $SECURITY_GROUP \
        --protocol tcp \
        --port 8080 \
        --cidr 0.0.0.0/0 \
        --region $AWS_REGION || true
    
    echo -e "${GREEN}✅ Security group configured${NC}"
}

# Function to launch EC2 instance
launch_instance() {
    echo -e "${BLUE}🖥️  Launching EC2 instance...${NC}"
    
    # Get latest Ubuntu AMI ID
    AMI_ID=$(aws ec2 describe-images \
        --owners 099720109477 \
        --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
        --query 'Images[*].[ImageId,CreationDate]' \
        --output text \
        --region $AWS_REGION | sort -k2 -r | head -n1 | cut -f1)
    
    echo -e "Using AMI: ${YELLOW}$AMI_ID${NC}"
    
    # Launch instance
    INSTANCE_ID=$(aws ec2 run-instances \
        --image-id $AMI_ID \
        --count 1 \
        --instance-type $INSTANCE_TYPE \
        --key-name $KEY_NAME \
        --security-groups $SECURITY_GROUP \
        --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$SERVER_NAME}]" \
        --region $AWS_REGION \
        --query 'Instances[0].InstanceId' \
        --output text)
    
    echo -e "${GREEN}✅ Instance launched: ${YELLOW}$INSTANCE_ID${NC}"
    
    # Wait for instance to be running
    echo -e "${BLUE}⏳ Waiting for instance to be running...${NC}"
    aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $AWS_REGION
    
    # Get public IP
    PUBLIC_IP=$(aws ec2 describe-instances \
        --instance-ids $INSTANCE_ID \
        --query 'Reservations[0].Instances[0].PublicIpAddress' \
        --output text \
        --region $AWS_REGION)
    
    echo -e "${GREEN}✅ Instance is running!${NC}"
    echo -e "${GREEN}🌐 Public IP: ${YELLOW}$PUBLIC_IP${NC}"
    
    # Save instance details
    echo "INSTANCE_ID=$INSTANCE_ID" > aws-instance.env
    echo "PUBLIC_IP=$PUBLIC_IP" >> aws-instance.env
    echo "AWS_REGION=$AWS_REGION" >> aws-instance.env
    
    return 0
}

# Function to setup server
setup_server() {
    if [ -f "aws-instance.env" ]; then
        source aws-instance.env
    else
        echo -e "${RED}❌ aws-instance.env not found. Please run launch_instance first.${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}⚙️  Setting up server on ${YELLOW}$PUBLIC_IP${NC}..."
    
    # Wait a bit more for SSH to be ready
    echo -e "${BLUE}⏳ Waiting for SSH to be ready...${NC}"
    sleep 30
    
    # Create setup script
    cat > server-setup.sh << 'EOF'
#!/bin/bash
set -e

echo "🔧 Starting server setup..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Install MongoDB
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Redis (optional)
sudo apt-get install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Install Nginx
sudo apt-get install -y nginx

# Configure firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 3000
sudo ufw --force enable

# Create app directory
sudo mkdir -p /var/www/chatapp
sudo chown -R ubuntu:ubuntu /var/www/chatapp

# Create logs directory
mkdir -p /var/www/chatapp/logs

echo "✅ Server setup completed!"
EOF

    # Copy and run setup script
    scp -i ~/.ssh/$KEY_NAME.pem -o StrictHostKeyChecking=no server-setup.sh ubuntu@$PUBLIC_IP:/tmp/
    ssh -i ~/.ssh/$KEY_NAME.pem -o StrictHostKeyChecking=no ubuntu@$PUBLIC_IP 'chmod +x /tmp/server-setup.sh && /tmp/server-setup.sh'
    
    # Clean up
    rm server-setup.sh
    
    echo -e "${GREEN}✅ Server setup completed!${NC}"
}

# Function to deploy application
deploy_app() {
    if [ -f "aws-instance.env" ]; then
        source aws-instance.env
    else
        echo -e "${RED}❌ aws-instance.env not found.${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}📦 Deploying application to ${YELLOW}$PUBLIC_IP${NC}..."
    
    # Create deployment package
    echo -e "${BLUE}📦 Creating deployment package...${NC}"
    tar -czf chatapp-backend.tar.gz \
        --exclude=node_modules \
        --exclude=.git \
        --exclude=logs \
        --exclude=*.tar.gz \
        .
    
    # Copy files to server
    echo -e "${BLUE}📤 Uploading files...${NC}"
    scp -i ~/.ssh/$KEY_NAME.pem -o StrictHostKeyChecking=no chatapp-backend.tar.gz ubuntu@$PUBLIC_IP:/var/www/chatapp/
    
    # Extract and setup on server
    ssh -i ~/.ssh/$KEY_NAME.pem -o StrictHostKeyChecking=no ubuntu@$PUBLIC_IP << 'EOF'
cd /var/www/chatapp
tar -xzf chatapp-backend.tar.gz
rm chatapp-backend.tar.gz

# Install dependencies
npm install --production

# Create .env file (you'll need to edit this)
cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb://localhost:27017/chatapp
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-$(openssl rand -hex 32)

# Add your other environment variables here
# TWILIO_ACCOUNT_SID=your-twilio-account-sid
# TWILIO_AUTH_TOKEN=your-twilio-auth-token
# TWILIO_PHONE_NUMBER=+1234567890
ENVEOF

# Start application with PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

echo "✅ Application deployed and started!"
EOF

    # Clean up local files
    rm chatapp-backend.tar.gz
    
    echo -e "${GREEN}✅ Application deployed successfully!${NC}"
    echo -e "${GREEN}🌐 Your ChatApp backend is running at: ${YELLOW}http://$PUBLIC_IP:3000${NC}"
}

# Function to configure Nginx reverse proxy
setup_nginx() {
    if [ -f "aws-instance.env" ]; then
        source aws-instance.env
    else
        echo -e "${RED}❌ aws-instance.env not found.${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}🔧 Configuring Nginx reverse proxy...${NC}"
    
    # Create Nginx configuration
    cat > nginx-chatapp.conf << EOF
server {
    listen 80;
    server_name $PUBLIC_IP;

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

    # Copy and configure Nginx
    scp -i ~/.ssh/$KEY_NAME.pem -o StrictHostKeyChecking=no nginx-chatapp.conf ubuntu@$PUBLIC_IP:/tmp/
    ssh -i ~/.ssh/$KEY_NAME.pem -o StrictHostKeyChecking=no ubuntu@$PUBLIC_IP << 'EOF'
sudo mv /tmp/nginx-chatapp.conf /etc/nginx/sites-available/chatapp
sudo ln -sf /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
EOF

    # Clean up
    rm nginx-chatapp.conf
    
    echo -e "${GREEN}✅ Nginx configured successfully!${NC}"
    echo -e "${GREEN}🌐 Your API is now available at: ${YELLOW}http://$PUBLIC_IP/api/${NC}"
}

# Function to show server status
show_status() {
    if [ -f "aws-instance.env" ]; then
        source aws-instance.env
    else
        echo -e "${RED}❌ aws-instance.env not found.${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}📊 Server Status for ${YELLOW}$PUBLIC_IP${NC}:"
    
    ssh -i ~/.ssh/$KEY_NAME.pem -o StrictHostKeyChecking=no ubuntu@$PUBLIC_IP << 'EOF'
echo "🖥️  System Info:"
uname -a
echo ""

echo "💾 Memory Usage:"
free -h
echo ""

echo "💿 Disk Usage:"
df -h
echo ""

echo "🔧 PM2 Status:"
pm2 status
echo ""

echo "📊 PM2 Monitoring:"
pm2 monit --no-interaction || true
EOF
}

# Main menu
case "$1" in
    "check")
        check_aws_cli
        ;;
    "security-group")
        check_aws_cli
        create_security_group
        ;;
    "launch")
        check_aws_cli
        create_security_group
        launch_instance
        ;;
    "setup")
        setup_server
        ;;
    "deploy")
        deploy_app
        ;;
    "nginx")
        setup_nginx
        ;;
    "status")
        show_status
        ;;
    "full")
        check_aws_cli
        create_security_group
        launch_instance
        setup_server
        deploy_app
        setup_nginx
        echo -e "${GREEN}🎉 Full deployment completed!${NC}"
        echo -e "${GREEN}🌐 Your ChatApp backend is running at: ${YELLOW}http://$PUBLIC_IP${NC}"
        ;;
    *)
        echo -e "${BLUE}🚀 ChatApp AWS Deployment Script${NC}"
        echo ""
        echo "Usage: $0 {command}"
        echo ""
        echo "Commands:"
        echo -e "  ${YELLOW}check${NC}          - Check if AWS CLI is installed"
        echo -e "  ${YELLOW}security-group${NC} - Create security group"
        echo -e "  ${YELLOW}launch${NC}         - Launch EC2 instance"
        echo -e "  ${YELLOW}setup${NC}          - Setup server environment"
        echo -e "  ${YELLOW}deploy${NC}         - Deploy application"
        echo -e "  ${YELLOW}nginx${NC}          - Configure Nginx reverse proxy"
        echo -e "  ${YELLOW}status${NC}         - Show server status"
        echo -e "  ${YELLOW}full${NC}           - Run complete deployment"
        echo ""
        echo "Example: $0 full"
        ;;
esac
