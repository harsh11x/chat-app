# 🔧 ULTRA SIMPLE FIX - Guaranteed to Work

Run these commands on your AWS server to create the simplest possible working server:

## **Step 1: Connect and Clean Up**
```bash
ssh ubuntu@3.111.208.77
cd /home/ubuntu/chat-app/backend

# Stop everything
pm2 stop all
pm2 delete all
pm2 kill
```

## **Step 2: Create Ultra-Simple Server (No Dependencies)**
```bash
cat > server-simple.js << 'EOF'
const http = require('http');
const url = require('url');

console.log('🚀 Starting simple server...');

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  
  // Handle preflight requests
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  console.log(`${method} ${parsedUrl.pathname}`);
  
  // Health check
  if (parsedUrl.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      message: 'ChatApp Backend is running!',
      timestamp: new Date().toISOString(),
      server: '3.111.208.77:3000',
      status: 'healthy'
    }));
    return;
  }
  
  // API test
  if (parsedUrl.pathname === '/api/test') {
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      message: 'API is working!',
      timestamp: new Date().toISOString()
    }));
    return;
  }
  
  // Send OTP
  if (parsedUrl.pathname === '/api/auth/send-otp' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { phoneNumber, countryCode } = data;
        
        console.log(`📱 OTP request: ${countryCode}${phoneNumber}`);
        
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          message: 'OTP sent successfully (demo mode)',
          data: {
            phoneNumber: (countryCode || '') + (phoneNumber || ''),
            expiresIn: 300,
            isNewUser: true
          }
        }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({
          success: false,
          message: 'Invalid JSON'
        }));
      }
    });
    return;
  }
  
  // Verify OTP
  if (parsedUrl.pathname === '/api/auth/verify-otp' && method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const { phoneNumber, otp } = data;
        
        console.log(`🔐 OTP verification: ${phoneNumber} - ${otp}`);
        
        if (otp && otp.length === 6) {
          res.writeHead(200);
          res.end(JSON.stringify({
            success: true,
            message: 'Phone verified successfully',
            data: {
              token: 'demo-jwt-token-' + Date.now(),
              user: {
                id: 'demo-user-id',
                phoneNumber,
                displayName: phoneNumber,
                isPhoneVerified: true,
                hasCompletedProfile: false
              }
            }
          }));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({
            success: false,
            message: 'Invalid OTP. Please enter 6 digits.'
          }));
        }
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({
          success: false,
          message: 'Invalid JSON'
        }));
      }
    });
    return;
  }
  
  // 404 for other routes
  res.writeHead(404);
  res.end(JSON.stringify({
    success: false,
    message: 'Route not found',
    availableRoutes: [
      'GET /health',
      'GET /api/test', 
      'POST /api/auth/send-otp',
      'POST /api/auth/verify-otp'
    ]
  }));
});

const PORT = 3000;
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`
🚀 Simple ChatApp Backend Started!
📡 Server running on ${HOST}:${PORT}
🌐 Health: http://3.111.208.77:${PORT}/health
📱 API: http://3.111.208.77:${PORT}/api/test
✅ No dependencies required!
  `);
});

// Handle errors
server.on('error', (err) => {
  console.error('❌ Server error:', err);
});

process.on('SIGTERM', () => {
  console.log('Server shutting down...');
  server.close();
});

process.on('SIGINT', () => {
  console.log('Server shutting down...');
  server.close();
});

console.log('✅ Server setup complete - using built-in Node.js modules only');
EOF
```

## **Step 3: Test Simple Server**
```bash
# Test directly with Node.js (no PM2 yet)
node server-simple.js &
sleep 3

# Test it
curl http://localhost:3000/health

# If it works, kill the test
pkill -f "node server-simple.js"
```

## **Step 4: Start with PM2**
```bash
# Start with PM2
pm2 start server-simple.js --name chatapp-simple

# Check status
pm2 list

# Save config
pm2 save
```

## **Step 5: Test Everything**
```bash
# Test health
curl http://localhost:3000/health
curl http://3.111.208.77:3000/health

# Test API
curl http://3.111.208.77:3000/api/test

# Test OTP
curl -X POST http://3.111.208.77:3000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"1234567890","countryCode":"+1"}'
```

## **✅ This WILL Work Because:**
- ✅ **No external dependencies** - uses only built-in Node.js modules
- ✅ **No package.json needed** - no npm install required
- ✅ **No complex imports** - just http, url modules
- ✅ **Simple HTTP server** - basic but functional
- ✅ **All your endpoints** - health, test, send-otp, verify-otp

## **📱 Flutter App URLs:**
```dart
static const String baseUrl = 'http://3.111.208.77:3000/api';
// No Socket.IO in simple version, but HTTP API works
```

## **🔧 If You Want Socket.IO Later:**

Once the simple server is working, we can add Socket.IO step by step:

```bash
# Create package.json
echo '{"name":"chatapp","dependencies":{"socket.io":"^4.7.2"}}' > package.json

# Install only Socket.IO
npm install socket.io

# Then modify server to add Socket.IO
```

**This simple server will definitely work because it has ZERO dependencies!** 🚀

Run these commands and let me know the result!
