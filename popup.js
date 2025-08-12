class LocoNavMonitor {
    constructor() {
        this.config = null;
        this.vehicles = [];
        this.alerts = [];
        this.init();
    }

    async init() {
        await this.loadConfig();
        this.setupEventListeners();
        this.updateUI();
        
        if (this.config) {
            await this.loadVehicles();
            await this.loadAlerts();
        }
    }

    async loadConfig() {
        try {
            const result = await chrome.storage.sync.get(['loconavConfig']);
            this.config = result.loconavConfig || null;
            
            // Set today's date as default
            const today = new Date().toISOString().split('T')[0];
            const dateSelector = document.getElementById('dateSelector');
            if (dateSelector) {
                dateSelector.value = today;
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    }

    async saveConfig(config) {
        try {
            await chrome.storage.sync.set({ loconavConfig: config });
            this.config = config;
            this.updateUI();
        } catch (error) {
            console.error('Error saving config:', error);
            this.showError('Failed to save configuration');
        }
    }

    setupEventListeners() {
        const configForm = document.getElementById('configForm');
        const refreshBtn = document.getElementById('refreshBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const dateSelector = document.getElementById('dateSelector');
        const exportBtn = document.getElementById('exportBtn');

        configForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleConfigSubmit();
        });

        refreshBtn?.addEventListener('click', () => {
            this.loadVehicles();
        });

        settingsBtn?.addEventListener('click', () => {
            this.showConfigSection();
        });

        dateSelector?.addEventListener('change', () => {
            this.loadDistanceData();
        });

        exportBtn?.addEventListener('click', () => {
            this.exportDistanceReport();
        });
    }

    async handleConfigSubmit() {
        const webhookUrl = document.getElementById('webhookUrl').value.trim();
        const authHeader = document.getElementById('authHeader').value.trim();
        const speedLimit = parseInt(document.getElementById('speedLimit').value);
        const stagnationTime = parseInt(document.getElementById('stagnationTime').value);
        const vehicleNumbers = document.getElementById('vehicleNumbers').value.trim();

        if (!webhookUrl || !vehicleNumbers) {
            this.showError('Webhook URL and Vehicle Numbers are required');
            return;
        }

        // Validate webhook URL
        try {
            new URL(webhookUrl);
        } catch (error) {
            this.showError('Please enter a valid webhook URL');
            return;
        }

        // Parse vehicle numbers
        const vehicles = vehicleNumbers.split(',').map(v => v.trim()).filter(v => v.length > 0);
        if (vehicles.length === 0 || vehicles.length > 4) {
            this.showError('Please enter 1-4 vehicle numbers separated by commas');
            return;
        }

        const config = {
            webhookUrl,
            authHeader,
            speedLimit,
            stagnationTime,
            vehicleNumbers: vehicles,
            lastUpdated: Date.now()
        };

        await this.saveConfig(config);
        this.showMonitoringSection();
        await this.initializeWebhookMonitoring();
        
        // Start background monitoring
        chrome.runtime.sendMessage({
            action: 'startWebhookMonitoring',
            config: config
        });
    }

    async initializeWebhookMonitoring() {
        if (!this.config) return;

        console.log('Initializing webhook monitoring...');
        console.log('Webhook URL:', this.config.webhookUrl);
        console.log('Monitoring vehicles:', this.config.vehicleNumbers);

        // Initialize vehicle data storage
        const vehicleData = {};
        this.config.vehicleNumbers.forEach(vehicleNumber => {
            vehicleData[vehicleNumber] = {
                vehicleNumber,
                lastUpdate: null,
                speed: 0,
                latitude: null,
                longitude: null,
                ignition: false,
                odometer: 0,
                status: 'No data'
            };
        });

        // Store initial vehicle data
        await chrome.storage.local.set({ 
            webhookVehicleData: vehicleData,
            lastWebhookUpdate: Date.now()
        });

        this.renderWebhookVehicles(vehicleData);
        this.updateConnectionStatus(true);
        
        console.log('✅ Webhook monitoring initialized');
    }

    renderWebhookVehicles(vehicleData) {
        const vehicleList = document.getElementById('vehicleList');
        
        if (!vehicleData || Object.keys(vehicleData).length === 0) {
            vehicleList.innerHTML = '<div class="loading">No vehicle data available</div>';
            return;
        }

        vehicleList.innerHTML = Object.values(vehicleData).map(vehicle => {
            const status = this.getWebhookVehicleStatus(vehicle);
            const lastUpdateText = vehicle.lastUpdate ? 
                new Date(vehicle.lastUpdate * 1000).toLocaleTimeString() : 'No data';
            
            return `
                <div class="vehicle-item ${status.class}">
                    <div class="vehicle-name">${vehicle.vehicleNumber}</div>
                    <div class="vehicle-status">
                        <span>Speed: ${vehicle.speed || 0} km/h</span>
                        <span>Status: ${status.text}</span>
                    </div>
                    <div class="vehicle-details">
                        <small>Last update: ${lastUpdateText}</small>
                        <small>Ignition: ${vehicle.ignition ? 'On' : 'Off'}</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    getWebhookVehicleStatus(vehicle) {
        if (!vehicle.lastUpdate) {
            return { class: '', text: 'No data' };
        }

        const speed = vehicle.speed || 0;
        const now = Math.floor(Date.now() / 1000); // Current time in seconds
        const timeDiff = (now - vehicle.lastUpdate) / 60; // Minutes since last update

        if (speed > this.config.speedLimit) {
            return { class: 'speeding', text: 'Speeding!' };
        }
        
        if (timeDiff > this.config.stagnationTime && speed < 5) {
            return { class: 'stagnant', text: 'Stagnant' };
        }

        if (speed > 0) {
            return { class: '', text: 'Moving' };
        }

        return { class: '', text: 'Stopped' };
    }

    async loadVehicles() {
        if (!this.config) {
            this.renderVehicles();
            return;
        }

        const vehicleList = document.getElementById('vehicleList');
        vehicleList.innerHTML = '<div class="loading">Loading vehicles...</div>';

        try {
            // Get webhook server URL (replace /loconav-webhook with /api/vehicles)
            const apiUrl = this.config.webhookUrl.replace('/loconav-webhook', '/api/vehicles');
            console.log('Fetching vehicles from:', apiUrl);
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.config.authHeader && { 'Authorization': this.config.authHeader })
                }
            });

            console.log('Response status:', response?.status);
            console.log('Response ok:', response?.ok);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Response error:', errorText);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Received data:', data);
            
            const allVehicles = data.vehicles || [];
            console.log('All vehicles:', allVehicles);
            
            // Filter to only configured vehicles and limit to 4
            this.vehicles = allVehicles.filter(vehicle => 
                this.config.vehicleNumbers.includes(vehicle.vehicle_number)
            ).slice(0, 4);
            
            console.log('Filtered vehicles:', this.vehicles);
            
            this.renderVehicles();
            this.updateConnectionStatus(true);
        } catch (error) {
            console.error('Error loading vehicles:', error);
            console.error('Error details:', error.message);
            vehicleList.innerHTML = `<div class="loading">Failed to load vehicles: ${error.message}</div>`;
            this.updateConnectionStatus(false);
        }
    }

    renderVehicles() {
        const vehicleList = document.getElementById('vehicleList');
        
        if (!this.config) {
            // Show configured vehicle numbers when no webhook data yet
            const configuredVehicles = this.config?.vehicleNumbers || [];
            if (configuredVehicles.length === 0) {
                vehicleList.innerHTML = '<div class="loading">No vehicles configured</div>';
                return;
            }
            
            vehicleList.innerHTML = configuredVehicles.map(vehicleNumber => `
                <div class="vehicle-item">
                    <div class="vehicle-name">${vehicleNumber}</div>
                    <div class="vehicle-status">
                        <span>Speed: 0 km/h</span>
                        <span>Status: No data</span>
                        <span>Last update: No data</span>
                        <span>Ignition: Off</span>
                    </div>
                </div>
            `).join('');
            return;
        }

        if (this.vehicles.length === 0) {
            // Show configured vehicles even if no webhook data received yet
            const configuredVehicles = this.config.vehicleNumbers || [];
            vehicleList.innerHTML = configuredVehicles.map(vehicleNumber => `
                <div class="vehicle-item">
                    <div class="vehicle-name">${vehicleNumber}</div>
                    <div class="vehicle-status">
                        <span>Speed: 0 km/h</span>
                        <span>Status: No data</span>
                        <span>Last update: No data</span>
                        <span>Ignition: Off</span>
                    </div>
                </div>
            `).join('');
            return;
        }

        vehicleList.innerHTML = this.vehicles.map(vehicle => {
            const status = this.getVehicleStatus(vehicle);
            const vehicleName = vehicle.vehicle_number || vehicle.name || vehicle.vehicleName || 'Unknown Vehicle';
            const speed = vehicle.speed || 0;
            const ignition = vehicle.ignition_on ? 'On' : 'Off';
            const lastUpdate = vehicle.gpstime ? new Date(vehicle.gpstime * 1000).toLocaleString() : 'No data';
            
            return `
                <div class="vehicle-item ${status.class}">
                    <div class="vehicle-name">${vehicleName}</div>
                    <div class="vehicle-status">
                        <span>Speed: ${speed} km/h</span>
                        <span>Status: ${status.text}</span>
                        <span>Last update: ${lastUpdate}</span>
                        <span>Ignition: ${ignition}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    getVehicleStatus(vehicle) {
        const speed = vehicle.speed || 0;
        const lastUpdate = vehicle.lastUpdate || vehicle.timestamp;
        const now = Date.now();
        const timeDiff = lastUpdate ? (now - new Date(lastUpdate).getTime()) / (1000 * 60) : 0;

        if (speed > this.config.speedLimit) {
            return { class: 'speeding', text: 'Speeding!' };
        }
        
        if (timeDiff > this.config.stagnationTime && speed < 5) {
            return { class: 'stagnant', text: 'Stagnant' };
        }

        if (speed > 0) {
            return { class: '', text: 'Moving' };
        }

        return { class: '', text: 'Stopped' };
    }

    async loadAlerts() {
        try {
            const result = await chrome.storage.local.get(['loconavAlerts']);
            this.alerts = result.loconavAlerts || [];
            this.renderAlerts();
        } catch (error) {
            console.error('Error loading alerts:', error);
        }
    }

    renderAlerts() {
        const alertsList = document.getElementById('alertsList');
        
        if (this.alerts.length === 0) {
            alertsList.innerHTML = '<div class="no-alerts">No alerts yet</div>';
            return;
        }

        // Show only the last 5 alerts
        const recentAlerts = this.alerts.slice(-5).reverse();
        
        alertsList.innerHTML = recentAlerts.map(alert => {
            const alertClass = alert.type === 'speeding' ? 'critical' : '';
            const time = new Date(alert.timestamp).toLocaleTimeString();
            
            return `
                <div class="alert-item ${alertClass}">
                    <strong>${alert.vehicleName}</strong>: ${alert.message}
                    <span class="alert-time">${time}</span>
                </div>
            `;
        }).join('');
    }

    updateUI() {
        const configSection = document.getElementById('configSection');
        const monitoringSection = document.getElementById('monitoringSection');

        if (this.config) {
            this.showMonitoringSection();
            // Pre-fill form with saved config
            document.getElementById('webhookUrl').value = this.config.webhookUrl || '';
            document.getElementById('authHeader').value = this.config.authHeader || '';
            document.getElementById('speedLimit').value = this.config.speedLimit || 80;
            document.getElementById('stagnationTime').value = this.config.stagnationTime || 30;
            document.getElementById('vehicleNumbers').value = this.config.vehicleNumbers ? this.config.vehicleNumbers.join(', ') : '';
        } else {
            this.showConfigSection();
        }
    }

    showConfigSection() {
        document.getElementById('configSection').style.display = 'block';
        document.getElementById('monitoringSection').style.display = 'none';
    }

    showMonitoringSection() {
        document.getElementById('configSection').style.display = 'none';
        document.getElementById('monitoringSection').style.display = 'block';
    }

    updateConnectionStatus(connected) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');
        
        if (connected) {
            statusDot.classList.add('connected');
            statusText.textContent = 'Connected';
        } else {
            statusDot.classList.remove('connected');
            statusText.textContent = 'Disconnected';
        }
    }

    async loadDistanceData() {
        if (!this.config) return;

        const distanceSummary = document.getElementById('distanceSummary');
        const selectedDate = document.getElementById('dateSelector').value;
        
        distanceSummary.innerHTML = '<div class="loading">Loading distance data...</div>';

        try {
            const startDate = new Date(selectedDate);
            const endDate = new Date(selectedDate);
            endDate.setHours(23, 59, 59, 999);

            const distanceData = await this.fetchDistanceData(startDate, endDate);
            this.renderDistanceData(distanceData);
        } catch (error) {
            console.error('Error loading distance data:', error);
            distanceSummary.innerHTML = '<div class="loading">Failed to load distance data</div>';
        }
    }

    async fetchDistanceData(startDate, endDate) {
        const distancePromises = this.vehicles.map(async (vehicle) => {
            try {
                const vehicleId = vehicle.id || vehicle.vehicleId;
                const response = await fetch(`${this.config.baseUrl}/api/v1/vehicles/${vehicleId}/trips?start=${startDate.toISOString()}&end=${endDate.toISOString()}`, {
                    headers: {
                        'Authorization': `Bearer ${this.config.sessionToken}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();
                const trips = data.trips || data || [];
                const totalDistance = trips.reduce((sum, trip) => sum + (trip.distance || 0), 0);

                return {
                    vehicleId,
                    vehicleName: vehicle.name || vehicle.vehicleName || `Vehicle ${vehicleId}`,
                    distance: totalDistance,
                    trips: trips.length
                };
            } catch (error) {
                console.error(`Error fetching distance for vehicle ${vehicle.id}:`, error);
                return {
                    vehicleId: vehicle.id || vehicle.vehicleId,
                    vehicleName: vehicle.name || vehicle.vehicleName || `Vehicle ${vehicle.id}`,
                    distance: 0,
                    trips: 0,
                    error: true
                };
            }
        });

        return Promise.all(distancePromises);
    }

    renderDistanceData(distanceData) {
        const distanceSummary = document.getElementById('distanceSummary');
        const totalDistance = distanceData.reduce((sum, vehicle) => sum + vehicle.distance, 0);

        const distanceHtml = distanceData.map(vehicle => {
            const distanceKm = (vehicle.distance / 1000).toFixed(1);
            const errorClass = vehicle.error ? 'style="color: #dc3545;"' : '';
            
            return `
                <div class="distance-item">
                    <span class="vehicle-distance-name" ${errorClass}>${vehicle.vehicleName}</span>
                    <span class="distance-value" ${errorClass}>
                        ${vehicle.error ? 'Error' : `${distanceKm} km`}
                    </span>
                </div>
            `;
        }).join('');

        const totalKm = (totalDistance / 1000).toFixed(1);
        
        distanceSummary.innerHTML = `
            ${distanceHtml}
            <div class="total-distance">
                Total Fleet Distance: ${totalKm} km
            </div>
        `;
    }

    async exportDistanceReport() {
        if (!this.config || this.vehicles.length === 0) {
            this.showError('No data available to export');
            return;
        }

        const selectedDate = document.getElementById('dateSelector').value;
        const startDate = new Date(selectedDate);
        const endDate = new Date(selectedDate);
        endDate.setHours(23, 59, 59, 999);

        try {
            const distanceData = await this.fetchDistanceData(startDate, endDate);
            const csvContent = this.generateCSVReport(distanceData, selectedDate);
            this.downloadCSV(csvContent, `loconav-distance-report-${selectedDate}.csv`);
        } catch (error) {
            console.error('Error exporting report:', error);
            this.showError('Failed to export report');
        }
    }

    generateCSVReport(distanceData, date) {
        const headers = ['Date', 'Vehicle Name', 'Distance (km)', 'Number of Trips', 'Status'];
        const totalDistance = distanceData.reduce((sum, vehicle) => sum + vehicle.distance, 0);
        
        let csvContent = headers.join(',') + '\n';
        
        distanceData.forEach(vehicle => {
            const distanceKm = (vehicle.distance / 1000).toFixed(1);
            const status = vehicle.error ? 'Error' : 'OK';
            const row = [
                date,
                `"${vehicle.vehicleName}"`,
                distanceKm,
                vehicle.trips,
                status
            ];
            csvContent += row.join(',') + '\n';
        });
        
        // Add total row
        const totalKm = (totalDistance / 1000).toFixed(1);
        csvContent += `\n${date},"TOTAL FLEET",${totalKm},${distanceData.reduce((sum, v) => sum + v.trips, 0)},"Summary"\n`;
        
        return csvContent;
    }

    downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    showError(message) {
        // Simple error display - could be enhanced with a proper modal
        alert(message);
    }
}

// Initialize the monitor when the popup loads
document.addEventListener('DOMContentLoaded', () => {
    new LocoNavMonitor();
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'newAlert') {
        // Refresh alerts display
        const monitor = new LocoNavMonitor();
        monitor.loadAlerts();
    }
});
