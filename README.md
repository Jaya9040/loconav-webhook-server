# LocoNav Vehicle Monitor Chrome Extension

A Chrome extension that monitors your LocoNav fleet vehicles and sends real-time alerts for speeding and stagnation issues.

## Features

- **Real-time Vehicle Monitoring**: Continuously tracks up to 4 LocoNav vehicles
- **Speed Alerts**: Notifications when vehicles exceed configured speed limits
- **Stagnation Alerts**: Alerts when vehicles remain stationary for too long
- **Daily Distance Tracking**: Shows distance traveled by each vehicle per day
- **CSV Export**: Export daily distance reports for record keeping
- **Username/Password Login**: Authenticate using your LocoNav credentials
- **Beautiful UI**: Modern, responsive interface with real-time status updates
- **Multi-region Support**: Works with LocoNav's global, KSA, OMAN, and Nepal servers
- **Persistent Storage**: Saves configuration and alert history

## Installation

1. **Download the Extension**
   - Clone or download this repository to your local machine

2. **Enable Developer Mode in Chrome**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" in the top right corner

3. **Load the Extension**
   - Click "Load unpacked" button
   - Select the `loconav-chrome-extension` folder
   - The extension should now appear in your extensions list

4. **Pin the Extension** (Optional)
   - Click the puzzle piece icon in Chrome's toolbar
   - Pin the LocoNav Vehicle Monitor for easy access

## Setup

### 1. Prepare Your LocoNav Credentials

Before using the extension, ensure you have:

- Your LocoNav username and password
- Access to your LocoNav fleet management account
- Permissions to view vehicle data and tracking information

### 2. Configure the Extension

1. Click the LocoNav Vehicle Monitor icon in your Chrome toolbar
2. Fill in the configuration form:
   - **Username**: Your LocoNav login username
   - **Password**: Your LocoNav login password
   - **Base URL**: Select your region's server:
     - Global: `app.a.loconav.com` (default)
     - KSA: `sa.loconav.com`
     - OMAN: `om.loconav.com`
     - Nepal: `np.loconav.com`
   - **Speed Limit**: Maximum allowed speed (km/h) before triggering alerts
   - **Stagnation Time**: Minutes of inactivity before triggering stagnation alerts
3. Click "Save Configuration"

The extension will authenticate with LocoNav and start monitoring your vehicles if successful.

## Usage

### Dashboard

- **Connection Status**: Shows if the extension is connected to LocoNav
- **Vehicle List**: Displays up to 4 vehicles with current status
- **Daily Distance Summary**: Shows distance traveled by each vehicle for selected date
- **Export Report**: Download CSV report of daily distances
- **Recent Alerts**: Shows the latest speed and stagnation alerts

### Vehicle Status Indicators

- **Green border**: Vehicle is operating normally
- **Red border**: Vehicle is speeding
- **Yellow border**: Vehicle is stagnant

### Notifications

The extension sends Chrome notifications for:
- **Speeding**: When a vehicle exceeds the configured speed limit
- **Stagnation**: When a vehicle remains stationary for longer than configured time

## API Integration

This extension uses LocoNav's official REST APIs:

- **Vehicle Data**: `GET /api/v1/vehicles`
- **Authentication**: User-Authentication header with your token
- **Monitoring Frequency**: Checks every 2 minutes for real-time monitoring

## Technical Details

### Files Structure

```
loconav-chrome-extension/
├── manifest.json          # Extension configuration
├── popup.html             # Main UI interface
├── popup.css              # Styling for the interface
├── popup.js               # Frontend logic and API calls
├── background.js          # Background monitoring service
├── icons/                 # Extension icons
│   └── icon.svg          # SVG icon source
└── README.md             # This documentation
```

### Permissions

The extension requires these permissions:
- `storage`: Save configuration and alert history
- `notifications`: Send desktop notifications
- `alarms`: Schedule periodic vehicle checks
- `activeTab`: Access to current tab (minimal usage)
- Host permissions for LocoNav API endpoints

### Data Storage

- **Configuration**: Stored in Chrome sync storage (syncs across devices)
- **Alerts**: Stored in local storage (device-specific)
- **Vehicle States**: Maintained in memory for stagnation tracking

## Troubleshooting

### Common Issues

1. **"Invalid API token or connection failed"**
   - Verify your API token with LocoNav support
   - Check that you selected the correct base URL for your region
   - Ensure you have internet connectivity

2. **"No vehicles found"**
   - Confirm your LocoNav account has vehicles assigned
   - Check API permissions with your LocoNav SPOC

3. **Notifications not appearing**
   - Enable Chrome notifications in your system settings
   - Check that notifications are allowed for Chrome extensions

4. **Extension not monitoring**
   - Ensure the extension is enabled in `chrome://extensions/`
   - Check the popup shows "Connected" status
   - Try refreshing the vehicle list

### Debug Information

To view debug logs:
1. Right-click the extension icon → "Inspect popup"
2. Open Chrome DevTools Console tab
3. Check for any error messages

## Privacy & Security

- Your API token is stored securely in Chrome's encrypted storage
- No data is sent to third parties
- All communication is directly with LocoNav's official APIs
- Alert data is stored locally on your device

## Support

For issues related to:
- **LocoNav API access**: Contact your LocoNav SPOC
- **Extension functionality**: Check the troubleshooting section above
- **Feature requests**: Consider contributing to the project

## Version History

- **v1.0.0**: Initial release with speed and stagnation monitoring

## License

This extension is provided as-is for LocoNav users. Please ensure compliance with LocoNav's API terms of service.
