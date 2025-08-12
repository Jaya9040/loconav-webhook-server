# LocoNav Webhook Setup Guide

## Overview

LocoNav uses a **Push API system** where they send vehicle data to your webhook endpoint in real-time. This guide explains how to set up the complete system.

## Architecture

```
LocoNav → Your Webhook Server → Chrome Extension
```

1. **LocoNav** sends GPS data to your webhook server
2. **Your Server** receives, processes, and stores the data
3. **Chrome Extension** polls your server for data and generates alerts

## Step 1: Set Up Webhook Server

### Option A: Use the Provided Node.js Server

1. **Install Dependencies**:
   ```bash
   cd loconav-chrome-extension
   npm init -y
   npm install express cors
   ```

2. **Run the Server**:
   ```bash
   node webhook-server.js
   ```
   
   The server will start on `http://localhost:3000`

3. **Make it Accessible**:
   - For testing: Use ngrok to expose localhost
   - For production: Deploy to a cloud service (Heroku, AWS, etc.)

### Option B: Deploy to Cloud

**Heroku Deployment**:
```bash
# Create Heroku app
heroku create your-loconav-webhook

# Add package.json start script
echo '{"scripts":{"start":"node webhook-server.js"}}' > package.json

# Deploy
git add .
git commit -m "Add webhook server"
git push heroku main
```

Your webhook URL will be: `https://your-loconav-webhook.herokuapp.com/loconav-webhook`

## Step 2: Configure LocoNav Dashboard

1. **Login to LocoNav Dashboard**
2. **Go to Settings/Integrations**
3. **Add Webhook Configuration**:
   - **Webhook URL**: `https://your-server.com/loconav-webhook`
   - **Method**: POST
   - **Headers** (optional): `Authorization: Bearer your-secret-token`

4. **Select Vehicles**: Choose the 4 vehicles you want to monitor

## Step 3: Configure Chrome Extension

1. **Open the Extension**
2. **Enter Configuration**:
   - **Webhook URL**: `https://your-server.com/loconav-webhook`
   - **Auth Header**: `Bearer your-secret-token` (if used)
   - **Vehicle Numbers**: `VH001, VH002, VH003, VH004`
   - **Speed Limit**: `80` km/h
   - **Stagnation Time**: `30` minutes

3. **Save Configuration**

## Data Flow

### LocoNav Sends Data (POST to your webhook):
```json
{
  "device_imei": "123456789012345",
  "vehicle_number": "VH001",
  "speed": 45.5,
  "gpstime": 1642678800,
  "ignition_on": true,
  "odometer_reading": 12345.6,
  "latitude": 28.6139,
  "longitude": 77.2090,
  "direction": 90
}
```

### Your Server Processes and Stores Data

### Extension Polls Your Server:
- `GET /api/vehicles` - Get current vehicle data
- `GET /api/alerts` - Get recent alerts

## Testing the Setup

### 1. Test Webhook Server
```bash
curl -X POST http://localhost:3000/loconav-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "device_imei": "123456789012345",
    "vehicle_number": "TEST001",
    "speed": 85,
    "gpstime": 1642678800,
    "ignition_on": true,
    "odometer_reading": 12345.6,
    "latitude": 28.6139,
    "longitude": 77.2090,
    "direction": 90
  }'
```

### 2. Check Data API
```bash
curl http://localhost:3000/api/vehicles
curl http://localhost:3000/api/alerts
```

### 3. Test Extension
- Configure extension with your webhook URL
- Check if vehicle data appears
- Verify alerts are generated for speeding

## Troubleshooting

### Common Issues

1. **"Webhook server not responding"**
   - Check if your server is running
   - Verify the webhook URL is correct
   - Ensure server is accessible from the internet

2. **"No vehicle data"**
   - Verify LocoNav is sending data to your webhook
   - Check server logs for incoming requests
   - Confirm vehicle numbers match exactly

3. **"No alerts generated"**
   - Check speed limits and stagnation time settings
   - Verify vehicle data includes speed information
   - Check browser console for errors

### Debug Commands

**Check server health**:
```bash
curl http://your-server.com/health
```

**View server logs** (if using Node.js):
```bash
# Check console output for incoming webhook data
```

**Extension debugging**:
- Right-click extension → "Inspect popup"
- Check Console tab for error messages

## Security Considerations

1. **Use HTTPS** for production webhooks
2. **Add authentication** headers to secure your endpoint
3. **Validate incoming data** to prevent malicious requests
4. **Rate limiting** to prevent abuse
5. **Store sensitive data** securely (use environment variables)

## Production Deployment

### Environment Variables
```bash
export PORT=3000
export WEBHOOK_SECRET=your-secret-key
export NODE_ENV=production
```

### PM2 Process Manager
```bash
npm install -g pm2
pm2 start webhook-server.js --name loconav-webhook
pm2 startup
pm2 save
```

### Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Support

If you encounter issues:
1. Check the server logs for error messages
2. Verify LocoNav webhook configuration
3. Test each component individually
4. Check network connectivity and firewall settings

The extension will now work with LocoNav's Push API system to provide real-time vehicle monitoring and alerts!
