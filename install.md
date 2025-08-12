# LocoNav Chrome Extension - Quick Installation Guide

## Important: LocoNav Uses Webhook System

LocoNav uses a **Push API/Webhook system** instead of traditional login APIs. You'll need to set up a webhook server first. See `WEBHOOK_SETUP.md` for complete instructions.

## Step 1: Install Chrome Extension

1. **Install Extension**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the `loconav-chrome-extension` folder
   - The extension should appear in your extensions list

2. **Icons are already created** - The PNG icons are included in the project.

## Step 2: Set Up Webhook Server (Required)

**Quick Setup for Testing:**

1. **Install Node.js** (if not installed)
2. **Run the webhook server**:
   ```bash
   cd loconav-chrome-extension
   npm install express cors
   node webhook-server.js
   ```
3. **Make it accessible**:
   - For testing: Use ngrok (`ngrok http 3000`)
   - For production: Deploy to Heroku/AWS (see WEBHOOK_SETUP.md)

## Step 3: Configure LocoNav Dashboard

1. **Login to your LocoNav dashboard**
2. **Go to Settings/Integrations/Webhooks**
3. **Add webhook endpoint**:
   - URL: `https://your-server.com/loconav-webhook`
   - Method: POST
   - Optional: Add authorization header
4. **Select your 4 vehicles** to monitor

## Step 4: Configure Chrome Extension

1. **Click the LocoNav extension icon**
2. **Enter configuration**:
   - **Webhook URL**: `https://your-server.com/loconav-webhook`
   - **Auth Header**: `Bearer your-token` (optional)
   - **Vehicle Numbers**: `VH001, VH002, VH003, VH004`
   - **Speed Limit**: `80` km/h
   - **Stagnation Time**: `30` minutes
3. **Click "Save Configuration"**

## Step 5: Test the System

1. **Check webhook server**: Visit `http://your-server.com/health`
2. **Verify data flow**: Check `http://your-server.com/api/vehicles`
3. **Test extension**: Vehicle data should appear in popup
4. **Generate alerts**: Speed over limit should trigger notifications

## Troubleshooting

### Common Issues:

1. **"Webhook server not responding"**
   - Ensure your webhook server is running
   - Check if URL is accessible from internet
   - Verify firewall/port settings

2. **"No vehicle data"**
   - Confirm LocoNav is sending data to your webhook
   - Check server logs for incoming requests
   - Verify vehicle numbers match exactly

3. **Extension shows "No data"**
   - Check webhook URL configuration
   - Ensure server API endpoints are working
   - Verify Chrome extension permissions

### Debug Steps:

1. **Test webhook manually**:
   ```bash
   curl -X POST https://your-server.com/loconav-webhook \
     -H "Content-Type: application/json" \
     -d '{"vehicle_number":"TEST","speed":85,"gpstime":1642678800}'
   ```

2. **Check extension console**:
   - Right-click extension → "Inspect popup"
   - Look for error messages in Console tab

3. **Verify server APIs**:
   - `GET /api/vehicles` should return vehicle data
   - `GET /api/alerts` should return recent alerts

## Complete Setup Guide

For detailed instructions including production deployment, security, and advanced configuration, see:
- **`WEBHOOK_SETUP.md`** - Complete webhook server setup
- **`README.md`** - Full documentation

## Architecture Overview

```
LocoNav Dashboard → Your Webhook Server → Chrome Extension
                   (receives GPS data)   (polls for data & alerts)
```

The extension now works with LocoNav's Push API system for real-time vehicle monitoring!
