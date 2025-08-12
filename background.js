class LocoNavBackgroundMonitor {
    constructor() {
        this.config = null;
        this.monitoringInterval = null;
        this.vehicleStates = new Map(); // Track vehicle states for stagnation detection
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadConfigAndStartMonitoring();
    }

    setupEventListeners() {
        // Listen for messages from popup
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'startWebhookMonitoring':
                    this.config = message.config;
                    this.startWebhookMonitoring();
                    sendResponse({ success: true });
                    break;
                case 'stopMonitoring':
                    this.stopMonitoring();
                    sendResponse({ success: true });
                    break;
                case 'getStatus':
                    sendResponse({ 
                        isMonitoring: !!this.monitoringInterval,
                        config: this.config 
                    });
                    break;
            }
        });

        // Set up periodic alarm for monitoring
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === 'loconavWebhookMonitor') {
                this.checkWebhookData();
            }
        });

        // Load config when extension starts
        chrome.runtime.onStartup.addListener(() => {
            this.loadConfigAndStartMonitoring();
        });

        chrome.runtime.onInstalled.addListener(() => {
            this.loadConfigAndStartMonitoring();
        });
    }

    async loadConfigAndStartMonitoring() {
        try {
            const result = await chrome.storage.sync.get(['loconavConfig']);
            if (result.loconavConfig) {
                this.config = result.loconavConfig;
                this.startMonitoring();
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    startWebhookMonitoring() {
        if (!this.config) {
            console.log('No config found, webhook monitoring not started');
            return;
        }

        this.stopMonitoring(); // Clear any existing monitoring

        // Create alarm for periodic webhook data checking (every 1 minute)
        chrome.alarms.create('loconavWebhookMonitor', {
            delayInMinutes: 0.5,
            periodInMinutes: 1
        });

        console.log('LocoNav webhook monitoring started');
        console.log('Webhook URL:', this.config.webhookUrl);
        console.log('Monitoring vehicles:', this.config.vehicleNumbers);
    }

    stopMonitoring() {
        chrome.alarms.clear('loconavWebhookMonitor');
        console.log('LocoNav webhook monitoring stopped');
    }

    async checkWebhookData() {
        if (!this.config) return;

        try {
            // Get webhook server URL (replace /loconav-webhook with /api/vehicles)
            const apiUrl = this.config.webhookUrl.replace('/loconav-webhook', '/api/vehicles');
            
            console.log('Checking webhook data from:', apiUrl);
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.config.authHeader && { 'Authorization': this.config.authHeader })
                }
            });

            if (!response.ok) {
                console.log('Webhook server not responding:', response.status);
                return;
            }

            const data = await response.json();
            const vehicles = data.vehicles || [];
            
            console.log(`Received data for ${vehicles.length} vehicles`);
            
            // Filter to only monitored vehicles
            const monitoredVehicles = vehicles.filter(vehicle => 
                this.config.vehicleNumbers.includes(vehicle.vehicle_number)
            );

            if (monitoredVehicles.length > 0) {
                await this.analyzeWebhookVehicles(monitoredVehicles);
                
                // Update stored vehicle data
                const vehicleData = {};
                monitoredVehicles.forEach(vehicle => {
                    vehicleData[vehicle.vehicle_number] = {
                        vehicleNumber: vehicle.vehicle_number,
                        lastUpdate: vehicle.gpstime,
                        speed: vehicle.speed,
                        latitude: vehicle.latitude,
                        longitude: vehicle.longitude,
                        ignition: vehicle.ignition_on,
                        odometer: vehicle.odometer_reading,
                        direction: vehicle.direction
                    };
                });

                await chrome.storage.local.set({ 
                    webhookVehicleData: vehicleData,
                    lastWebhookUpdate: Date.now()
                });
            }

        } catch (error) {
            console.error('Error checking webhook data:', error);
        }
    }

    async analyzeWebhookVehicles(vehicles) {
        const currentTime = Date.now();
        const alerts = [];

        for (const vehicle of vehicles) {
            const vehicleNumber = vehicle.vehicle_number;
            const speed = vehicle.speed || 0;
            const gpsTime = vehicle.gpstime;
            
            // Check for speeding
            if (speed > this.config.speedLimit) {
                alerts.push({
                    type: 'speeding',
                    vehicleId: vehicleNumber,
                    vehicleName: vehicleNumber,
                    message: `Speeding at ${speed} km/h (limit: ${this.config.speedLimit} km/h)`,
                    timestamp: currentTime,
                    location: {
                        latitude: vehicle.latitude,
                        longitude: vehicle.longitude
                    }
                });
            }

            // Check for stagnation
            await this.checkWebhookStagnation(vehicleNumber, speed, gpsTime, currentTime, alerts);
        }

        if (alerts.length > 0) {
            await this.processAlerts(alerts);
        }
    }

    async checkWebhookStagnation(vehicleNumber, speed, gpsTime, currentTime, alerts) {
        const stagnationThreshold = this.config.stagnationTime * 60; // Convert to seconds
        const previousState = this.vehicleStates.get(vehicleNumber);

        // Consider vehicle stagnant if speed is very low (< 5 km/h)
        const isStagnant = speed < 5;
        const now = Math.floor(Date.now() / 1000);
        const timeSinceLastGPS = now - gpsTime; // seconds

        if (isStagnant && timeSinceLastGPS > stagnationThreshold) {
            if (!previousState || !previousState.alerted) {
                alerts.push({
                    type: 'stagnation',
                    vehicleId: vehicleNumber,
                    vehicleName: vehicleNumber,
                    message: `Stagnant for ${Math.round(timeSinceLastGPS / 60)} minutes`,
                    timestamp: currentTime,
                    location: null
                });

                // Mark as alerted to avoid repeated alerts
                this.vehicleStates.set(vehicleNumber, {
                    isStagnant: true,
                    stagnantSince: gpsTime,
                    alerted: true
                });
            }
        } else if (!isStagnant) {
            // Vehicle is moving, reset stagnation state
            this.vehicleStates.set(vehicleNumber, {
                isStagnant: false,
                stagnantSince: null,
                alerted: false
            });
        }
    }

    async checkVehicles() {
        if (!this.config) return;

        try {
            const vehicles = await this.fetchVehicles();
            await this.analyzeVehicles(vehicles);
        } catch (error) {
            console.error('Error checking vehicles:', error);
        }
    }

    async fetchVehicles() {
        // Check if token is expired and needs refresh
        if (this.config.tokenExpiry && Date.now() > this.config.tokenExpiry) {
            console.log('Token expired, stopping monitoring');
            this.stopMonitoring();
            return [];
        }

        const response = await fetch(`${this.config.baseUrl}/api/v1/vehicles`, {
            headers: {
                'Authorization': `Bearer ${this.config.sessionToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return (data.vehicles || data || []).slice(0, 4); // Limit to 4 vehicles
    }

    async analyzeVehicles(vehicles) {
        const currentTime = Date.now();
        const alerts = [];

        // Ensure we only process up to 4 vehicles
        const vehiclesToProcess = vehicles.slice(0, 4);

        for (const vehicle of vehiclesToProcess) {
            const vehicleId = vehicle.id || vehicle.vehicleId || vehicle.name;
            const vehicleName = vehicle.name || vehicle.vehicleName || `Vehicle ${vehicleId}`;
            const speed = vehicle.speed || 0;
            const location = vehicle.location || {};
            const lastUpdate = vehicle.lastUpdate || vehicle.timestamp;

            // Check for speeding
            if (speed > this.config.speedLimit) {
                alerts.push({
                    type: 'speeding',
                    vehicleId,
                    vehicleName,
                    message: `Speeding at ${speed} km/h (limit: ${this.config.speedLimit} km/h)`,
                    timestamp: currentTime,
                    location: location
                });
            }

            // Check for stagnation
            await this.checkStagnation(vehicleId, vehicleName, speed, location, currentTime, alerts);
        }

        if (alerts.length > 0) {
            await this.processAlerts(alerts);
        }

        // Store daily distance data at end of day (11:59 PM)
        const now = new Date();
        if (now.getHours() === 23 && now.getMinutes() === 59) {
            await this.storeDailyDistanceData(vehiclesToProcess);
        }
    }

    async checkStagnation(vehicleId, vehicleName, speed, location, currentTime, alerts) {
        const stagnationThreshold = this.config.stagnationTime * 60 * 1000; // Convert to milliseconds
        const previousState = this.vehicleStates.get(vehicleId);

        // Consider vehicle stagnant if speed is very low (< 5 km/h)
        const isStagnant = speed < 5;

        if (isStagnant) {
            if (previousState && previousState.isStagnant) {
                // Vehicle was already stagnant, check if it's been too long
                const stagnantDuration = currentTime - previousState.stagnantSince;
                
                if (stagnantDuration > stagnationThreshold && !previousState.alerted) {
                    alerts.push({
                        type: 'stagnation',
                        vehicleId,
                        vehicleName,
                        message: `Stagnant for ${Math.round(stagnantDuration / (60 * 1000))} minutes`,
                        timestamp: currentTime,
                        location: location
                    });

                    // Mark as alerted to avoid repeated alerts
                    this.vehicleStates.set(vehicleId, {
                        ...previousState,
                        alerted: true
                    });
                }
            } else {
                // Vehicle just became stagnant
                this.vehicleStates.set(vehicleId, {
                    isStagnant: true,
                    stagnantSince: currentTime,
                    alerted: false,
                    location: location
                });
            }
        } else {
            // Vehicle is moving, reset stagnation state
            if (previousState && previousState.isStagnant) {
                this.vehicleStates.set(vehicleId, {
                    isStagnant: false,
                    stagnantSince: null,
                    alerted: false,
                    location: location
                });
            }
        }
    }

    async processAlerts(alerts) {
        // Store alerts in local storage
        await this.storeAlerts(alerts);

        // Send notifications
        for (const alert of alerts) {
            await this.sendNotification(alert);
        }

        // Notify popup if it's open
        try {
            chrome.runtime.sendMessage({ action: 'newAlert', alerts });
        } catch (error) {
            // Popup might not be open, ignore error
        }
    }

    async storeAlerts(alerts) {
        try {
            const result = await chrome.storage.local.get(['loconavAlerts']);
            const existingAlerts = result.loconavAlerts || [];
            
            // Add new alerts and keep only last 50 alerts
            const allAlerts = [...existingAlerts, ...alerts].slice(-50);
            
            await chrome.storage.local.set({ loconavAlerts: allAlerts });
        } catch (error) {
            console.error('Error storing alerts:', error);
        }
    }

    async storeDailyDistanceData(vehicles) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const distanceData = [];

            for (const vehicle of vehicles) {
                const vehicleId = vehicle.id || vehicle.vehicleId;
                const vehicleName = vehicle.name || vehicle.vehicleName || `Vehicle ${vehicleId}`;
                
                try {
                    const startDate = new Date(today);
                    const endDate = new Date(today);
                    endDate.setHours(23, 59, 59, 999);

                    const response = await fetch(`${this.config.baseUrl}/api/v1/vehicles/${vehicleId}/trips?start=${startDate.toISOString()}&end=${endDate.toISOString()}`, {
                        headers: {
                            'Authorization': `Bearer ${this.config.sessionToken}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const trips = data.trips || data || [];
                        const totalDistance = trips.reduce((sum, trip) => sum + (trip.distance || 0), 0);

                        distanceData.push({
                            date: today,
                            vehicleId,
                            vehicleName,
                            distance: totalDistance,
                            trips: trips.length
                        });
                    }
                } catch (error) {
                    console.error(`Error fetching daily distance for vehicle ${vehicleId}:`, error);
                }
            }

            // Store the daily summary
            if (distanceData.length > 0) {
                const result = await chrome.storage.local.get(['dailyDistanceHistory']);
                const history = result.dailyDistanceHistory || [];
                
                // Remove existing entry for today and add new one
                const filteredHistory = history.filter(entry => entry.date !== today);
                filteredHistory.push({
                    date: today,
                    vehicles: distanceData,
                    totalDistance: distanceData.reduce((sum, v) => sum + v.distance, 0)
                });

                // Keep only last 30 days
                const recentHistory = filteredHistory.slice(-30);
                await chrome.storage.local.set({ dailyDistanceHistory: recentHistory });

                console.log(`Stored daily distance data for ${today}`);
            }
        } catch (error) {
            console.error('Error storing daily distance data:', error);
        }
    }

    async sendNotification(alert) {
        const iconUrl = chrome.runtime.getURL('icons/icon48.png');
        
        const notificationOptions = {
            type: 'basic',
            iconUrl: iconUrl,
            title: 'LocoNav Vehicle Alert',
            message: `${alert.vehicleName}: ${alert.message}`,
            priority: alert.type === 'speeding' ? 2 : 1
        };

        try {
            await chrome.notifications.create(
                `loconav-${alert.type}-${alert.vehicleId}-${Date.now()}`,
                notificationOptions
            );
        } catch (error) {
            console.error('Error sending notification:', error);
        }
    }
}

// Initialize the background monitor
const monitor = new LocoNavBackgroundMonitor();
