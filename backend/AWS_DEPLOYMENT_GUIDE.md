# 🚀 ChatApp Backend AWS Deployment Guide

Complete guide to deploy your Node.js ChatApp backend to AWS EC2 with PM2 for production-grade hosting.

## 📋 Prerequisites

### 1. AWS Account Setup
- AWS account with billing enabled
- AWS CLI installed and configured
- EC2 key pair created

### 2. Local Requirements
- Node.js 16+ installed
- Git repository for your code
- SSH client

## 🛠️ Quick Deployment

### Option 1: Automated Deployment (Recommended)
```bash
# Make deployment script executable
chmod +x deploy-aws.sh

# Run complete deployment
./deploy-aws.sh full
```

### Option 2: Step-by-Step Deployment
```bash
# 1. Check prerequisites
./deploy-aws.sh check

# 2. Create security group
./deploy-aws.sh security-group

# 3. Launch EC2 instance
./deploy-aws.sh launch

# 4. Setup server environment
./deploy-aws.sh setup

# 5. Deploy application
./deploy-aws.sh deploy

# 6. Configure Nginx (optional)
./deploy-aws.sh nginx
```

## 🔧 Manual Setup Instructions

### 1. AWS CLI Configuration
```bash
# Install AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# Configure AWS CLI
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Enter your default region (e.g., us-east-1)
# Enter output format (json)
```

### 2. Create EC2 Key Pair
```bash
# Create key pair
aws ec2 create-key-pair \
    --key-name chatapp-key \
    --query 'KeyMaterial' \
    --output text > ~/.ssh/chatapp-key.pem

# Set proper permissions
chmod 400 ~/.ssh/chatapp-key.pem
```

### 3. Launch EC2 Instance
```bash
# Get Ubuntu AMI ID
AMI_ID=$(aws ec2 describe-images \
    --owners 099720109477 \
    --filters "Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*" \
    --query 'Images[*].[ImageId,CreationDate]' \
    --output text | sort -k2 -r | head -n1 | cut -f1)

# Launch instance
aws ec2 run-instances \
    --image-id $AMI_ID \
    --count 1 \
    --instance-type t3.medium \
    --key-name chatapp-key \
    --security-groups chatapp-sg \
    --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=ChatApp-Backend}]'
```

## 🖥️ Server Setup

### 1. Connect to EC2 Instance
```bash
# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=ChatApp-Backend" \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

# Connect via SSH
ssh -i ~/.ssh/chatapp-key.pem ubuntu@$PUBLIC_IP
```

### 2. Install Dependencies
```bash
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

# Install Nginx
sudo apt-get install -y nginx
```

### 3. Deploy Application
```bash
# Create app directory
sudo mkdir -p /var/www/chatapp
sudo chown -R ubuntu:ubuntu /var/www/chatapp
cd /var/www/chatapp

# Clone your repository
git clone https://github.com/your-username/chatapp-backend.git .

# Install dependencies
npm install --production

# Create production environment file
cp .env.production .env
# Edit .env with your actual values
nano .env
```

### 4. Configure PM2
```bash
# Start application with PM2
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
# Run the command that PM2 outputs
```

## 🔒 Security Configuration

### 1. Firewall Setup
```bash
# Configure UFW firewall
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw allow 3000  # Node.js app port
sudo ufw --force enable
```

### 2. SSL Certificate (Optional)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

## 🌐 Nginx Configuration

### 1. Create Nginx Config
```bash
sudo nano /etc/nginx/sites-available/chatapp
```

```nginx
server {
    listen 80;
    server_name your-domain.com;  # Replace with your domain or IP

    # API routes
    location /api/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.IO
    location /socket.io/ {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 2. Enable Site
```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/

# Remove default site
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

## 📊 Monitoring & Management

### 1. PM2 Commands
```bash
# Check status
pm2 status

# View logs
pm2 logs

# Restart app
pm2 restart chatapp-backend

# Stop app
pm2 stop chatapp-backend

# Monitor in real-time
pm2 monit

# Reload with zero downtime
pm2 reload chatapp-backend
```

### 2. System Monitoring
```bash
# Check system resources
htop

# Check disk usage
df -h

# Check memory usage
free -h

# Check network connections
netstat -tulpn | grep :3000
```

### 3. Application Logs
```bash
# View application logs
tail -f /var/www/chatapp/logs/combined.log

# View error logs
tail -f /var/www/chatapp/logs/error.log

# View PM2 logs
pm2 logs --lines 100
```

## 🔄 Deployment Updates

### 1. Code Updates
```bash
# Connect to server
ssh -i ~/.ssh/chatapp-key.pem ubuntu@$PUBLIC_IP

# Navigate to app directory
cd /var/www/chatapp

# Pull latest changes
git pull origin main

# Install new dependencies (if any)
npm install --production

# Reload application with zero downtime
pm2 reload chatapp-backend
```

### 2. Environment Updates
```bash
# Edit environment variables
nano .env

# Restart application
pm2 restart chatapp-backend
```

## 🌍 Flutter App Configuration

### 1. Update Flutter App
Update your Flutter app to connect to your AWS server:

```dart
// lib/config/api_config.dart
class ApiConfig {
  static const String baseUrl = 'http://YOUR_AWS_IP:3000/api';
  static const String socketUrl = 'http://YOUR_AWS_IP:3000';
  
  // Or with domain name:
  // static const String baseUrl = 'https://your-domain.com/api';
  // static const String socketUrl = 'https://your-domain.com';
}
```

### 2. Socket.IO Connection
```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class SocketService {
  static IO.Socket? _socket;
  
  static void connect() {
    _socket = IO.io('http://YOUR_AWS_IP:3000', <String, dynamic>{
      'transports': ['websocket'],
      'autoConnect': false,
    });
    
    _socket!.connect();
  }
}
```

## 💰 Cost Optimization

### 1. Instance Types
- **t3.micro**: Free tier, good for testing ($0/month for 12 months)
- **t3.small**: Light production ($15-20/month)
- **t3.medium**: Medium production ($30-40/month)
- **t3.large**: Heavy production ($60-80/month)

### 2. Storage Optimization
```bash
# Clean up logs regularly
sudo logrotate -f /etc/logrotate.conf

# Clean PM2 logs
pm2 flush

# Clean system packages
sudo apt autoremove
sudo apt autoclean
```

## 🚨 Troubleshooting

### 1. Common Issues

#### App Won't Start
```bash
# Check PM2 status
pm2 status

# Check logs
pm2 logs

# Check environment variables
cat .env

# Restart app
pm2 restart chatapp-backend
```

#### Can't Connect from Flutter
```bash
# Check if port is open
sudo netstat -tulpn | grep :3000

# Check firewall
sudo ufw status

# Check Nginx status
sudo systemctl status nginx

# Test API endpoint
curl http://localhost:3000/health
```

#### Database Issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Restart MongoDB
sudo systemctl restart mongod
```

### 2. Performance Issues
```bash
# Check system resources
htop

# Check PM2 monitoring
pm2 monit

# Increase PM2 instances
pm2 scale chatapp-backend +2

# Check memory usage
pm2 show chatapp-backend
```

## 📈 Scaling Considerations

### 1. Horizontal Scaling
- Use Application Load Balancer (ALB)
- Multiple EC2 instances
- Redis for session storage
- MongoDB Atlas for managed database

### 2. Vertical Scaling
- Upgrade instance type
- Add more CPU/RAM
- Use PM2 cluster mode

## 🎯 Production Checklist

- [ ] Environment variables configured
- [ ] SSL certificate installed
- [ ] Firewall configured
- [ ] MongoDB secured
- [ ] PM2 startup configured
- [ ] Nginx reverse proxy setup
- [ ] Log rotation configured
- [ ] Monitoring setup
- [ ] Backup strategy implemented
- [ ] Domain name configured
- [ ] Flutter app updated with server URL

## 🌐 Your Server URLs

After deployment, your ChatApp backend will be available at:

- **API Base URL**: `http://YOUR_AWS_IP:3000/api`
- **Socket.IO URL**: `http://YOUR_AWS_IP:3000`
- **Health Check**: `http://YOUR_AWS_IP:3000/health`

With Nginx (recommended):
- **API Base URL**: `http://YOUR_AWS_IP/api`
- **Socket.IO URL**: `http://YOUR_AWS_IP`
- **Health Check**: `http://YOUR_AWS_IP/health`

Your ChatApp backend is now ready for production on AWS! 🚀
