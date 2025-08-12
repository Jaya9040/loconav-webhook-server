// Simple Node.js webhook server for LocoNav Push API
// Run this on your server to receive LocoNav vehicle data

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store for recent vehicle data (in production, use a database)
let vehicleData = {};
let alerts = [];

// LocoNav webhook endpoint
app.post('/loconav-webhook', (req, res) => {
    try {
        console.log('Received LocoNav data:', req.body);
        
        // Validate the expected LocoNav data structure
        const {
            device_imei,
            vehicle_number,
            speed,
            gpstime,
            ignition_on,
            odometer_reading,
            latitude,
            longitude,
            direction
        } = req.body;

        if (!vehicle_number || speed === undefined) {
            return res.status(400).json({ error: 'Invalid data format' });
        }

        // Store vehicle data
        vehicleData[vehicle_number] = {
            device_imei,
            vehicle_number,
            speed: parseFloat(speed),
            gpstime: parseInt(gpstime),
            ignition_on: Boolean(ignition_on),
            odometer_reading: parseFloat(odometer_reading),
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            direction: parseInt(direction),
            lastUpdate: Date.now()
        };

        // Check for alerts (you can customize these thresholds)
        const SPEED_LIMIT = 80; // km/h
        const STAGNATION_TIME = 30; // minutes

        if (speed > SPEED_LIMIT) {
            alerts.push({
                type: 'speeding',
                vehicle_number,
                message: `Vehicle ${vehicle_number} speeding at ${speed} km/h`,
                timestamp: Date.now(),
                data: req.body
            });
            console.log(`🚨 SPEED ALERT: ${vehicle_number} at ${speed} km/h`);
        }

        // Check for stagnation (if speed is very low for extended time)
        const now = Math.floor(Date.now() / 1000);
        const timeDiff = (now - gpstime) / 60; // minutes
        
        if (speed < 5 && timeDiff > STAGNATION_TIME) {
            alerts.push({
                type: 'stagnation',
                vehicle_number,
                message: `Vehicle ${vehicle_number} stagnant for ${Math.round(timeDiff)} minutes`,
                timestamp: Date.now(),
                data: req.body
            });
            console.log(`⏰ STAGNATION ALERT: ${vehicle_number} for ${Math.round(timeDiff)} minutes`);
        }

        // Keep only last 100 alerts
        alerts = alerts.slice(-100);

        res.json({ 
            success: true, 
            message: 'Data received successfully',
            vehicle_count: Object.keys(vehicleData).length,
            alert_count: alerts.length
        });

    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint for Chrome extension to fetch data
app.get('/api/vehicles', (req, res) => {
    res.json({
        vehicles: Object.values(vehicleData),
        lastUpdate: Math.max(...Object.values(vehicleData).map(v => v.lastUpdate || 0))
    });
});

// API endpoint for Chrome extension to fetch alerts
app.get('/api/alerts', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
        alerts: alerts.slice(-limit),
        total: alerts.length
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        vehicles: Object.keys(vehicleData).length,
        alerts: alerts.length,
        uptime: process.uptime()
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 LocoNav Webhook Server running on port ${PORT}`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/loconav-webhook`);
    console.log(`📊 Vehicle data API: http://localhost:${PORT}/api/vehicles`);
    console.log(`🚨 Alerts API: http://localhost:${PORT}/api/alerts`);
    console.log(`💚 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Server shutting down gracefully...');
    process.exit(0);
});

module.exports = app;
