# 🚀 Complete PM2 Setup Guide for AWS (3.111.208.77)

Step-by-step guide to deploy your ChatApp backend to AWS EC2 with PM2 process manager.

## 📋 Prerequisites

- AWS EC2 instance running Ubuntu 22.04
- SSH key pair for EC2 access
- Your backend code ready for deployment

## 🔧 Step 1: Connect to Your AWS Server

```bash
# Connect to your AWS EC2 instance
ssh -i ~/.ssh/your-key.pem ubuntu@3.111.208.77

# Or if you don't have a key file, create one first:
# aws ec2 create-key-pair --key-name chatapp-key --query 'KeyMaterial' --output text > ~/.ssh/chatapp-key.pem
# chmod 400 ~/.ssh/chatapp-key.pem
# ssh -i ~/.ssh/chatapp-key.pem ubuntu@3.111.208.77
```

## 🛠️ Step 2: Server Setup

### 1. Update System
```bash
# Update package list
sudo apt update && sudo apt upgrade -y

# Install essential packages
sudo apt install -y curl wget git unzip
```

### 2. Install Node.js 18.x
```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt-get install -y nodejs

# Verify installation
node --version  # Should show v18.x.x
npm --version   # Should show 9.x.x
```

### 3. Install PM2 Globally
```bash
# Install PM2 process manager
sudo npm install -g pm2

# Verify PM2 installation
pm2 --version

# Setup PM2 startup script
pm2 startup
# Run the command that PM2 outputs (it will look like):
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ubuntu --hp /home/ubuntu
```

### 4. Install MongoDB
```bash
# Import MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Add MongoDB repository
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Update package list
sudo apt-get update

# Install MongoDB
sudo apt-get install -y mongodb-org

# Start MongoDB service
sudo systemctl start mongod
sudo systemctl enable mongod

# Verify MongoDB is running
sudo systemctl status mongod
```

### 5. Install Redis (Optional but Recommended)
```bash
# Install Redis
sudo apt-get install -y redis-server

# Start Redis service
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Test Redis
redis-cli ping  # Should return PONG
```

### 6. Configure Firewall
```bash
# Enable UFW firewall
sudo ufw enable

# Allow SSH
sudo ufw allow OpenSSH

# Allow HTTP and HTTPS
sudo ufw allow 80
sudo ufw allow 443

# Allow Node.js app port
sudo ufw allow 3000

# Check firewall status
sudo ufw status
```

## 📦 Step 3: Deploy Your Application

### 1. Create Application Directory
```bash
# Create app directory
sudo mkdir -p /var/www/chatapp
sudo chown -R ubuntu:ubuntu /var/www/chatapp
cd /var/www/chatapp
```

### 2. Upload Your Code

#### Option A: Using Git (Recommended)
```bash
# Clone your repository (replace with your actual repo)
git clone https://github.com/your-username/chatapp-backend.git .

# Or if you don't have a repo yet, create the files manually
```

#### Option B: Upload Files Manually
```bash
# From your local machine, upload the backend files
scp -i ~/.ssh/your-key.pem -r /Users/harsh/Documents/Projects/chatapp/backend/* ubuntu@3.111.208.77:/var/www/chatapp/
```

### 3. Install Dependencies
```bash
# Navigate to app directory
cd /var/www/chatapp

# Install production dependencies
npm install --production

# Create logs directory
mkdir -p logs
```

### 4. Create Environment File
```bash
# Create production environment file
nano .env
```

Add the following content (customize with your values):
```env
# Production Environment
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
MONGODB_URI=mongodb://localhost:27017/chatapp_production

# JWT Secret (generate a secure key)
JWT_SECRET=your-super-secure-jwt-secret-key-change-this-$(openssl rand -hex 32)

# Twilio (for SMS OTP)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Cloudinary (for media uploads)
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret

# Redis
REDIS_URL=redis://localhost:6379

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=/var/www/chatapp/uploads

# Logging
LOG_LEVEL=info
LOG_FILE=/var/www/chatapp/logs/app.log
```

Save and exit (Ctrl+X, then Y, then Enter)

## 🚀 Step 4: Start Application with PM2

### 1. Start the Application
```bash
# Start with PM2 using ecosystem file
pm2 start ecosystem.config.js --env production

# Or start directly (if no ecosystem file)
pm2 start server.js --name "chatapp-backend" --instances max --exec-mode cluster
```

### 2. Save PM2 Configuration
```bash
# Save current PM2 processes
pm2 save

# This ensures PM2 will restart your app after server reboot
```

### 3. Verify Application is Running
```bash
# Check PM2 status
pm2 status

# Check application logs
pm2 logs chatapp-backend

# Check if app is responding
curl http://localhost:3000/health

# Check from outside (replace with your IP)
curl http://3.111.208.77:3000/health
```

## 📊 Step 5: PM2 Management Commands

### Basic Commands
```bash
# Check status of all processes
pm2 status

# Check status of specific app
pm2 show chatapp-backend

# View logs
pm2 logs                    # All apps
pm2 logs chatapp-backend    # Specific app
pm2 logs --lines 100        # Last 100 lines

# Monitor in real-time
pm2 monit
```

### Process Management
```bash
# Restart application
pm2 restart chatapp-backend

# Reload application (zero downtime)
pm2 reload chatapp-backend

# Stop application
pm2 stop chatapp-backend

# Delete application from PM2
pm2 delete chatapp-backend

# Restart all applications
pm2 restart all
```

### Scaling
```bash
# Scale to 4 instances
pm2 scale chatapp-backend 4

# Scale up by 2 instances
pm2 scale chatapp-backend +2

# Scale down by 1 instance
pm2 scale chatapp-backend -1
```

### Memory and Performance
```bash
# Check memory usage
pm2 show chatapp-backend

# Restart if memory usage exceeds 1GB
pm2 start server.js --max-memory-restart 1G

# Set CPU limit
pm2 start server.js --max-cpu 80
```

## 🔧 Step 6: Configure Nginx (Optional but Recommended)

### 1. Install Nginx
```bash
sudo apt-get install -y nginx
```

### 2. Create Nginx Configuration
```bash
sudo nano /etc/nginx/sites-available/chatapp
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name 3.111.208.77;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

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
        
        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
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

    # Static files (if any)
    location /uploads/ {
        alias /var/www/chatapp/uploads/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 3. Enable Nginx Site
```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/chatapp /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Enable Nginx to start on boot
sudo systemctl enable nginx
```

## 🔍 Step 7: Testing Your Deployment

### 1. Test API Endpoints
```bash
# Test health endpoint
curl http://3.111.208.77:3000/health

# Test with Nginx (if configured)
curl http://3.111.208.77/health

# Test API endpoint
curl -X POST http://3.111.208.77:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","countryCode":"+1"}'
```

### 2. Test Socket.IO Connection
```bash
# Install socket.io-client for testing
npm install -g socket.io-client

# Test socket connection (create a test script)
node -e "
const io = require('socket.io-client');
const socket = io('http://3.111.208.77:3000');
socket.on('connect', () => {
  console.log('✅ Socket.IO connected successfully');
  process.exit(0);
});
socket.on('connect_error', (err) => {
  console.log('❌ Socket.IO connection failed:', err);
  process.exit(1);
});
"
```

### 3. Monitor Application
```bash
# Check PM2 status
pm2 status

# Monitor real-time
pm2 monit

# Check system resources
htop

# Check memory usage
free -h

# Check disk usage
df -h
```

## 📱 Step 8: Update Your Flutter App

Update your Flutter app configuration:

```dart
// lib/config/api_config.dart
class ApiConfig {
  static const String baseUrl = 'http://3.111.208.77:3000/api';
  static const String socketUrl = 'http://3.111.208.77:3000';
  
  // With Nginx (if configured):
  // static const String baseUrl = 'http://3.111.208.77/api';
  // static const String socketUrl = 'http://3.111.208.77';
}
```

## 🔄 Step 9: Deployment Updates

### 1. Code Updates
```bash
# SSH to server
ssh -i ~/.ssh/your-key.pem ubuntu@3.111.208.77

# Navigate to app directory
cd /var/www/chatapp

# Pull latest changes (if using Git)
git pull origin main

# Install new dependencies (if any)
npm install --production

# Reload application with zero downtime
pm2 reload chatapp-backend

# Or restart if needed
pm2 restart chatapp-backend
```

### 2. Environment Updates
```bash
# Edit environment variables
nano .env

# Restart application to apply changes
pm2 restart chatapp-backend
```

## 📊 Step 10: Monitoring and Maintenance

### 1. Log Management
```bash
# View PM2 logs
pm2 logs --lines 50

# Clear PM2 logs
pm2 flush

# Setup log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

### 2. Performance Monitoring
```bash
# Real-time monitoring
pm2 monit

# Memory usage
pm2 show chatapp-backend

# System resources
htop
iostat
```

### 3. Backup Strategy
```bash
# Create backup script
nano /home/ubuntu/backup.sh
```

Add backup script:
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/home/ubuntu/backups"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup application
tar -czf $BACKUP_DIR/chatapp_$DATE.tar.gz /var/www/chatapp

# Backup MongoDB
mongodump --out $BACKUP_DIR/mongodb_$DATE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
find $BACKUP_DIR -name "mongodb_*" -mtime +7 -exec rm -rf {} \;

echo "Backup completed: $DATE"
```

Make it executable and add to cron:
```bash
chmod +x /home/ubuntu/backup.sh

# Add to crontab (daily backup at 2 AM)
crontab -e
# Add: 0 2 * * * /home/ubuntu/backup.sh
```

## 🚨 Troubleshooting

### Common Issues

#### 1. App Won't Start
```bash
# Check PM2 logs
pm2 logs chatapp-backend

# Check if port is in use
sudo netstat -tulpn | grep :3000

# Check environment variables
cat .env

# Restart with verbose logging
pm2 restart chatapp-backend --log-date-format="YYYY-MM-DD HH:mm:ss Z"
```

#### 2. Can't Connect from Flutter
```bash
# Check if app is running
curl http://localhost:3000/health

# Check firewall
sudo ufw status

# Check if port is accessible externally
telnet 3.111.208.77 3000
```

#### 3. High Memory Usage
```bash
# Check memory usage
pm2 show chatapp-backend

# Restart app
pm2 restart chatapp-backend

# Set memory limit
pm2 restart chatapp-backend --max-memory-restart 512M
```

#### 4. Database Connection Issues
```bash
# Check MongoDB status
sudo systemctl status mongod

# Check MongoDB logs
sudo tail -f /var/log/mongodb/mongod.log

# Restart MongoDB
sudo systemctl restart mongod
```

## 🎯 Your Server URLs

Your ChatApp backend is now running at:

- **API Base URL**: `http://3.111.208.77:3000/api`
- **Socket.IO URL**: `http://3.111.208.77:3000`
- **Health Check**: `http://3.111.208.77:3000/health`

With Nginx (if configured):
- **API Base URL**: `http://3.111.208.77/api`
- **Socket.IO URL**: `http://3.111.208.77`
- **Health Check**: `http://3.111.208.77/health`

## ✅ Final Checklist

- [ ] Server setup completed
- [ ] Node.js and PM2 installed
- [ ] MongoDB running
- [ ] Application deployed
- [ ] PM2 startup configured
- [ ] Firewall configured
- [ ] Environment variables set
- [ ] Application running and accessible
- [ ] Flutter app updated with server IP
- [ ] Nginx configured (optional)
- [ ] Monitoring setup
- [ ] Backup strategy implemented

Your ChatApp backend is now live on AWS with PM2! 🚀

## 📞 Quick Commands Reference

```bash
# Connect to server
ssh -i ~/.ssh/your-key.pem ubuntu@3.111.208.77

# Check app status
pm2 status

# View logs
pm2 logs chatapp-backend

# Restart app
pm2 restart chatapp-backend

# Monitor app
pm2 monit

# Test health
curl http://3.111.208.77:3000/health
```

Your real-time ChatApp backend is now ready for production! 🎉
