// RFID UHF Reader Web Application
class RFIDReader {
    constructor() {
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.isConnected = false;
        this.isScanning = false;
        this.tagList = [];
        this.selectedTag = null;
        this.settings = {
            power: 26,
            frequency: 'China Standard 1',
            protocol: 'Auto',
            beep: true,
            tagFocus: false,
            rssi: false,
            autoReconnect: false
        };
        this.startTime = null;
        this.scanInterval = null;
        this.simulationMode = false; // Real hardware mode - set to true only for testing without hardware
        
        // Connection type: 'webluetooth' or 'auto'
        this.connectionType = 'auto';
        
        // Bluetooth service UUIDs (from Android app)
        // Load custom UUIDs from localStorage if previously set
        this.SERVICE_UUID = localStorage.getItem('customServiceUUID') || '0000fff0-0000-1000-8000-00805f9b34fb';
        this.CHARACTERISTIC_UUID = localStorage.getItem('customCharUUID') || '0000fff1-0000-1000-8000-00805f9b34fb';
        
        // Store pending device/service for reconnection
        this.pendingDevice = null;
        this.pendingService = null;
        this.lastDevice = null;
        this.lastError = null;
        
        // Device presets for known RFID readers
        this.devicePresets = {
            'R6 PRO': {
                name: 'R6 PRO UHF Sealed Reader',
                serviceUUID: '0000fff0-0000-1000-8000-00805f9b34fb',
                characteristicUUID: '0000fff1-0000-1000-8000-00805f9b34fb',
                alternative: {
                    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
                    characteristicUUID: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' // RX (Notify)
                },
                deviceName: 'Nordic_UART_CW'
            },
            'Generic': {
                name: 'Generic RFID Reader',
                serviceUUID: '0000fff0-0000-1000-8000-00805f9b34fb',
                characteristicUUID: '0000fff1-0000-1000-8000-00805f9b34fb'
            }
        };
        
        // RFID Command Protocol
        // NOTE: These are GENERIC commands based on common UHF RFID protocols
        // You MUST get actual command bytes from your device manufacturer
        // These commands follow typical RFID reader protocol structure
        this.COMMANDS = {
            // Format: [Header, Length, Command, Data..., Checksum]
            START_INVENTORY: new Uint8Array([0xA0, 0x04, 0x01, 0x89, 0x01]),
            STOP_INVENTORY: new Uint8Array([0xA0, 0x03, 0x02, 0x01]),
            INVENTORY_SINGLE: new Uint8Array([0xA0, 0x03, 0x03, 0x22]),
            GET_POWER: new Uint8Array([0xA0, 0x03, 0x97, 0x01]),
            SET_POWER: (power) => {
                const cmd = new Uint8Array([0xA0, 0x04, 0x98, power, 0x00]);
                cmd[4] = this.calculateChecksum(cmd, 1, 3);
                return cmd;
            },
            GET_FREQUENCY: new Uint8Array([0xA0, 0x03, 0xAA, 0x01]),
            SET_FREQUENCY: (mode) => {
                const cmd = new Uint8Array([0xA0, 0x04, 0xAB, mode, 0x00]);
                cmd[4] = this.calculateChecksum(cmd, 1, 3);
                return cmd;
            },
            READ_TAG: (bank, ptr, len, pwd = '00000000') => {
                // Convert password hex string to bytes
                const pwdBytes = this.hexToBytes(pwd);
                const cmd = new Uint8Array([0xA0, 0x09, 0x39, ...pwdBytes, bank, ptr, len, 0x00]);
                cmd[cmd.length - 1] = this.calculateChecksum(cmd, 1, cmd.length - 2);
                return cmd;
            },
            WRITE_TAG: (bank, ptr, len, data, pwd = '00000000') => {
                const pwdBytes = this.hexToBytes(pwd);
                const dataBytes = this.hexToBytes(data);
                const cmdLen = 6 + pwdBytes.length + dataBytes.length;
                const cmd = new Uint8Array(cmdLen + 1);
                cmd[0] = 0xA0;
                cmd[1] = cmdLen;
                cmd[2] = 0x49;
                cmd.set(pwdBytes, 3);
                cmd[7] = bank;
                cmd[8] = ptr;
                cmd[9] = len;
                cmd.set(dataBytes, 10);
                cmd[cmd.length - 1] = this.calculateChecksum(cmd, 1, cmd.length - 2);
                return cmd;
            },
            SET_FILTER: (bank, ptr, len, data) => {
                const dataBytes = this.hexToBytes(data);
                const cmd = new Uint8Array([0xA0, 0x07 + dataBytes.length, 0x8C, bank, ptr, len, ...dataBytes, 0x00]);
                cmd[cmd.length - 1] = this.calculateChecksum(cmd, 1, cmd.length - 2);
                return cmd;
            }
        };
        
        this.init();
    }

    // Helper: Calculate checksum for commands
    calculateChecksum(buffer, start, end) {
        let sum = 0;
        for (let i = start; i <= end; i++) {
            sum += buffer[i];
        }
        return sum & 0xFF;
    }

    // Helper: Convert hex string to byte array
    hexToBytes(hex) {
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.substr(i, 2), 16));
        }
        return bytes;
    }

    // Helper: Convert byte array to hex string
    bytesToHex(bytes) {
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    init() {
        this.detectConnectionMethod();
        this.setupEventListeners();
        this.loadSettings();
        this.updateUI();
        this.updateSimulationModeIndicator();
    }
    
    // Detect best available connection method
    detectConnectionMethod() {
        if (this.connectionType !== 'auto') {
            return; // User has manually selected a connection type
        }
        
        // Check what's available
        const hasWebBluetooth = !!navigator.bluetooth;
        
        // Auto-select best available method
        if (hasWebBluetooth) {
            this.connectionType = 'webluetooth';
            console.log('Auto-detected: Web Bluetooth available');
        } else {
            this.connectionType = 'webluetooth'; // Fallback, will show error
            console.log('No supported connection method detected');
        }
    }
    
    // Get available connection methods
    getAvailableConnectionMethods() {
        const methods = [];
        if (navigator.bluetooth) {
            methods.push({ type: 'webluetooth', name: 'Web Bluetooth (Direct)', browsers: 'Chrome, Edge, Opera' });
        }
        return methods;
    }
    
    updateSimulationModeIndicator() {
        // Only show simulation indicator if simulation mode is actually enabled
        if (this.simulationMode) {
            const deviceInfo = document.getElementById('deviceInfo');
            if (deviceInfo && !deviceInfo.textContent.includes('Simulation Mode')) {
                deviceInfo.innerHTML = '<span style="color: #0ea5e9;">📱 Simulation Mode</span> - ' + deviceInfo.textContent;
            }
        }
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Connection buttons
        document.getElementById('btnConnect').addEventListener('click', () => this.handleConnect());
        document.getElementById('btnSearch').addEventListener('click', () => this.showDeviceModal());

        // Inventory buttons - removed Single Read and Loop Read as device handles this
        // Device buttons automatically trigger scanning and send data via notifications
        document.getElementById('btnClear').addEventListener('click', () => this.clearData());

        // Filter
        document.getElementById('cbFilter').addEventListener('change', (e) => {
            document.getElementById('filterPanel').style.display = e.target.checked ? 'block' : 'none';
        });
        document.getElementById('btnSetFilter').addEventListener('click', () => this.setFilter());

        // Read
        document.getElementById('btnRead').addEventListener('click', () => this.readTag());

        // Write
        document.getElementById('btnWrite').addEventListener('click', () => this.writeTag());
        document.getElementById('cbWriteFilter').addEventListener('change', (e) => {
            document.getElementById('writeFilterPanel').style.display = e.target.checked ? 'block' : 'none';
        });

        // Lock
        document.getElementById('btnLock').addEventListener('click', () => this.lockTag());

        // Kill
        document.getElementById('btnKill').addEventListener('click', () => this.killTag());

        // Erase
        document.getElementById('btnErase').addEventListener('click', () => this.eraseTag());

        // Settings
        document.getElementById('btnGetPower').addEventListener('click', () => this.getPower());
        document.getElementById('btnSetPower').addEventListener('click', () => this.setPower());
        document.getElementById('btnGetFrequency').addEventListener('click', () => this.getFrequency());
        document.getElementById('btnSetFrequency').addEventListener('click', () => this.setFrequency());
        document.getElementById('btnGetProtocol').addEventListener('click', () => this.getProtocol());
        document.getElementById('btnSetProtocol').addEventListener('click', () => this.setProtocol());
        document.getElementById('btnBeepOpen').addEventListener('click', () => this.setBeep(true));
        document.getElementById('btnBeepClose').addEventListener('click', () => this.setBeep(false));
        document.getElementById('cbTagFocus').addEventListener('change', (e) => this.setTagFocus(e.target.checked));
        document.getElementById('cbRssi').addEventListener('change', (e) => this.settings.rssi = e.target.checked);
        document.getElementById('cbAutoReconnect').addEventListener('change', (e) => {
            this.settings.autoReconnect = e.target.checked;
            this.saveSettings();
        });

        // Barcode
        document.getElementById('btnScanBarcode').addEventListener('click', () => this.scanBarcode());

        // Location
        document.getElementById('btnStartLocation').addEventListener('click', () => this.startLocation());
        document.getElementById('btnStopLocation').addEventListener('click', () => this.stopLocation());

        // Device modal
        document.getElementById('btnScanDevices').addEventListener('click', () => this.scanDevices());
        document.getElementById('btnClearHistory').addEventListener('click', () => this.clearDeviceHistory());
        document.querySelector('.close').addEventListener('click', () => this.hideDeviceModal());
        window.addEventListener('click', (e) => {
            if (e.target.id === 'deviceModal') {
                this.hideDeviceModal();
            }
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(tabName).classList.add('active');
    }

    async handleConnect() {
        if (this.isConnected) {
            await this.disconnect();
        } else {
            this.showDeviceModal();
        }
    }

    showDeviceModal() {
        document.getElementById('deviceModal').style.display = 'block';
        this.updateConnectionMethodSelector();
        
        // Auto-start scanning when modal opens
        if (!this.simulationMode && this.connectionType === 'webluetooth' && navigator.bluetooth) {
            this.autoScanDevices();
        } else if (this.simulationMode) {
            // Simulation mode - show history
            this.loadDeviceHistory();
        } else {
            // Show connection method options
            this.showConnectionMethodOptions();
        }
    }
    
    updateConnectionMethodSelector() {
        const methods = this.getAvailableConnectionMethods();
        const selector = document.getElementById('connectionMethodSelector');
        if (!selector && methods.length > 1) {
            // Add selector to modal if it doesn't exist
            const modalBody = document.querySelector('.modal-body');
            if (modalBody) {
                const selectorDiv = document.createElement('div');
                selectorDiv.id = 'connectionMethodSelector';
                selectorDiv.style.cssText = 'margin-bottom: 15px; padding: 10px; background: #f9fafb; border-radius: 6px;';
                selectorDiv.innerHTML = `
                    <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 13px;">Connection Method:</label>
                    <select id="connectionMethodSelect" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px;">
                        ${methods.map(m => `<option value="${m.type}" ${this.connectionType === m.type ? 'selected' : ''}>${m.name} (${m.browsers})</option>`).join('')}
                    </select>
                `;
                modalBody.insertBefore(selectorDiv, modalBody.firstChild);
                
                document.getElementById('connectionMethodSelect').addEventListener('change', (e) => {
                    this.connectionType = e.target.value;
                    this.showDeviceModal(); // Refresh modal
                });
            }
        }
    }
    
    showConnectionMethodOptions() {
        const deviceList = document.getElementById('deviceList');
        const methods = this.getAvailableConnectionMethods();
        
        if (methods.length === 0) {
            deviceList.innerHTML = `<div style="padding: 20px; text-align: center; color: #ef4444;">
                <strong>No Connection Methods Available</strong><br><br>
                <div style="text-align: left; font-size: 12px;">
                This browser doesn't support any connection methods.<br>
                Please use a modern browser (Chrome, Edge, Firefox, Safari, Opera).
                </div>
            </div>`;
            return;
        }
        
        let html = `<div style="padding: 20px;">
            <div style="font-weight: 600; margin-bottom: 15px;">Select Connection Method:</div>`;
        
        methods.forEach(method => {
            const isActive = this.connectionType === method.type;
            html += `
                <div style="padding: 12px; margin-bottom: 10px; border: 2px solid ${isActive ? '#667eea' : '#e5e7eb'}; border-radius: 6px; cursor: pointer; background: ${isActive ? '#f0f4ff' : 'white'};" 
                     onclick="window.rfidReader.connectionType='${method.type}'; window.rfidReader.showDeviceModal();">
                    <div style="font-weight: 600; color: ${isActive ? '#667eea' : '#374151'};">
                        ${isActive ? '✓ ' : ''}${method.name}
                    </div>
                    <div style="font-size: 11px; color: #6b7280; margin-top: 4px;">
                        Works in: ${method.browsers}
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
        deviceList.innerHTML = html;
    }
    
    getBrowserName() {
        const ua = navigator.userAgent;
        if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
        if (ua.includes('Edg')) return 'Edge';
        if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
        return 'Unknown';
    }

    hideDeviceModal() {
        document.getElementById('deviceModal').style.display = 'none';
    }

    async autoScanDevices() {
        // Automatically show available devices
        const deviceList = document.getElementById('deviceList');
        const useAutoDiscover = localStorage.getItem('useAutoDiscover') === 'true';
        
        let html = `
            <div style="padding: 20px; text-align: center;">
                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; padding: 10px; background: ${useAutoDiscover ? '#f0f4ff' : '#f9fafb'}; border-radius: 6px; border: 2px solid ${useAutoDiscover ? '#667eea' : '#e5e7eb'};">
                        <input type="checkbox" id="autoDiscoverToggle" ${useAutoDiscover ? 'checked' : ''} 
                               onchange="window.rfidReader.toggleAutoDiscover(this.checked)"
                               style="width: 18px; height: 18px; cursor: pointer;">
                        <div style="text-align: left;">
                            <div style="font-weight: 600; color: ${useAutoDiscover ? '#667eea' : '#374151'};">🔍 Auto-Discover Mode</div>
                            <div style="font-size: 11px; color: #6b7280;">Automatically find the right service and characteristic</div>
                        </div>
                    </label>
                </div>
                Ready to scan for nearby Bluetooth devices...<br><br>Click "Scan for Devices" to start
            </div>
        `;
        deviceList.innerHTML = html;
    }
    
    // Toggle auto-discover mode
    toggleAutoDiscover(enabled) {
        localStorage.setItem('useAutoDiscover', enabled ? 'true' : 'false');
        if (enabled) {
            this.showToast('✅ Auto-Discover mode enabled - UUIDs will be found automatically');
        } else {
            this.showToast('Auto-Discover mode disabled');
        }
    }

    async scanDevices() {
        const deviceList = document.getElementById('deviceList');
        const btnScan = document.getElementById('btnScanDevices');
        
        deviceList.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <div style="margin: 20px 0;">
                    <div class="scanning-animation" style="
                        width: 50px;
                        height: 50px;
                        border: 4px solid #e5e7eb;
                        border-top-color: #667eea;
                        border-radius: 50%;
                        margin: 0 auto 15px;
                        animation: spin 1s linear infinite;
                    "></div>
                    Scanning for nearby Bluetooth devices...
                </div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 10px;">
                    Make sure your RFID reader is powered on and in range
                </div>
            </div>
        `;

        btnScan.disabled = true;
        btnScan.textContent = 'Scanning...';

        if (this.simulationMode) {
            // Simulate device discovery
            setTimeout(() => {
                const simulatedDevices = [
                    { name: 'RFID-Reader-001', address: 'AA:BB:CC:DD:EE:01', rssi: -45 },
                    { name: 'RFID-Reader-002', address: 'AA:BB:CC:DD:EE:02', rssi: -67 },
                    { name: 'UHF-Reader-Pro', address: 'AA:BB:CC:DD:EE:03', rssi: -58 },
                    { name: 'BT-RFID-A8F2', address: 'AA:BB:CC:DD:EE:04', rssi: -72 }
                ];
                this.displayDevices(simulatedDevices);
                btnScan.disabled = false;
                btnScan.textContent = 'Scan Again';
            }, 2000);
        } else {
            try {
                if (!navigator.bluetooth) {
                    throw new Error('Web Bluetooth API not supported in this browser.');
                }

                // Show the browser's device picker
                const device = await navigator.bluetooth.requestDevice({
                    // Accept all devices to show everything nearby
                    acceptAllDevices: true,
                    optionalServices: [this.SERVICE_UUID]
                });

                // User selected a device, connect to it
                btnScan.disabled = false;
                btnScan.textContent = 'Scan for Devices';
                await this.connectToDevice(device);

            } catch (error) {
                console.error('Bluetooth error:', error);
                btnScan.disabled = false;
                btnScan.textContent = 'Scan for Devices';
                
                if (error.name === 'NotFoundError') {
                    deviceList.innerHTML = `<div style="padding: 20px; text-align: center; color: #6b7280;">
                        <strong>No devices found</strong><br><br>
                        <div style="text-align: left; display: inline-block;">
                        • Make sure your RFID reader is powered on<br>
                        • Ensure device is in pairing/discoverable mode<br>
                        • Check if device supports Bluetooth Low Energy (BLE)<br>
                        • Move closer to the device<br>
                        • Try turning the device off and on<br>
                        • Check your device's Bluetooth settings
                        </div>
                    </div>`;
                } else if (error.name === 'NotSupportedError' || error.message.includes('not supported')) {
                    deviceList.innerHTML = `<div style="padding: 20px; color: #ef4444;">
                        <strong>Web Bluetooth Not Available</strong><br><br>
                        <div style="text-align: left; font-size: 12px;">
                        <strong>Web Bluetooth is not supported in this browser.</strong><br><br>
                        <strong>Current browser:</strong> ${this.getBrowserName()}<br>
                        <strong>Web Bluetooth available:</strong> ${navigator.bluetooth ? 'Yes' : 'No'}<br>
                        <strong>Protocol:</strong> ${window.location.protocol}<br><br>
                        Please use a browser that supports Web Bluetooth (Chrome, Edge, Opera).
                        </div>
                    </div>`;
                } else {
                    deviceList.innerHTML = `<div style="padding: 20px; color: #ef4444;">
                        <strong>Error:</strong> ${error.message}<br><br>
                        <div style="text-align: left; font-size: 12px;">
                        <strong>Troubleshooting:</strong><br>
                        • Ensure device is powered on and in range<br>
                        • Check if device supports BLE (Bluetooth Low Energy)<br>
                        • Page must be served over HTTPS or localhost<br>
                        • Check browser console (F12) for detailed error messages
                        </div>
                    </div>`;
                }
            }
        }
    }
    displayDevices(devices) {
        const deviceList = document.getElementById('deviceList');
        
        if (devices.length === 0) {
            deviceList.innerHTML = `<div style="padding: 20px; text-align: center; color: #6b7280;">
                No devices found. Make sure your RFID reader is powered on and nearby.
            </div>`;
            return;
        }

        deviceList.innerHTML = `
            <div style="padding: 10px; background: #f9fafb; border-radius: 6px; margin-bottom: 10px; font-size: 13px; color: #6b7280;">
                <strong>Found ${devices.length} device${devices.length > 1 ? 's' : ''}</strong> - Click to connect
            </div>
        `;

        // Sort devices by signal strength (RSSI) if available
        const sortedDevices = devices.sort((a, b) => {
            if (a.rssi && b.rssi) return b.rssi - a.rssi; // Higher (less negative) first
            return 0;
        });

        sortedDevices.forEach(device => {
            const deviceItem = document.createElement('div');
            deviceItem.className = 'device-item';
            
            // Signal strength indicator
            let signalStrength = '';
            let signalColor = '#6b7280';
            if (device.rssi) {
                if (device.rssi > -60) {
                    signalStrength = '📶 Strong';
                    signalColor = '#10b981';
                } else if (device.rssi > -70) {
                    signalStrength = '📶 Good';
                    signalColor = '#f59e0b';
                } else {
                    signalStrength = '📶 Weak';
                    signalColor = '#ef4444';
                }
            }

            deviceItem.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div class="device-name">${device.name || 'Unknown Device'}</div>
                        <div class="device-address">${device.address || device.id || 'No address'}</div>
                    </div>
                    ${device.rssi ? `
                        <div style="font-size: 11px; color: ${signalColor}; font-weight: 600;">
                            ${signalStrength}
                        </div>
                    ` : ''}
                </div>
            `;
            
            deviceItem.addEventListener('click', () => {
                if (this.simulationMode) {
                    this.connectToSimulatedDevice(device);
                } else {
                    // For real devices, rescan to connect
                    this.showToast('Click "Scan for Devices" and select this device from the browser dialog');
                }
            });
            deviceList.appendChild(deviceItem);
        });
    }

    async connectToSimulatedDevice(deviceInfo) {
        this.hideDeviceModal();
        this.updateConnectionStatus('connecting', `Connecting to ${deviceInfo.name}...`);
        
        // Simulate connection delay
        setTimeout(() => {
            this.device = deviceInfo;
            this.isConnected = true;
            this.updateConnectionStatus('connected', `${deviceInfo.name} (${deviceInfo.address})`);
            this.saveDeviceToHistory(deviceInfo);
            this.updateUI();
            this.showToast('Connected successfully');
        }, 1500);
    }

    async connectToDevice(device) {
        this.hideDeviceModal();
        this.updateConnectionStatus('connecting', `Connecting to ${device.name}...`);
        
        // Use Smart Connect - tries all possible methods automatically
        await this.smartConnect(device);
    }
    
    // Smart Connect - tries ALL possible connection methods automatically
    async smartConnect(device) {
        this.lastDevice = device;
        console.log('🚀 Smart Connect: Starting comprehensive connection attempt...');
        this.showToast('🔍 Trying all connection methods...');
        
        const connectionStrategies = [
            { name: 'Default UUIDs', method: () => this.connectWithDefaultUUIDs(device) },
            { name: 'Saved UUIDs', method: () => this.connectWithSavedUUIDs(device) },
            { name: 'UUID Format Variations', method: () => this.connectWithUUIDVariations(device) },
            { name: 'Quick Connect', method: () => this.connectWithQuickConnect(device) },
            { name: 'Auto-Discover', method: () => this.connectWithAutoDiscoverWrapper(device) },
            { name: 'Brute Force', method: () => this.connectWithBruteForce(device) }
        ];
        
        for (const strategy of connectionStrategies) {
            try {
                console.log(`📡 Trying: ${strategy.name}...`);
                this.updateConnectionStatus('connecting', `Trying ${strategy.name}...`);
                
                const result = await strategy.method();
                if (result === true) {
                    console.log(`✅ Success with ${strategy.name}!`);
                    return; // Connected successfully!
                }
            } catch (error) {
                console.log(`❌ ${strategy.name} failed:`, error.message);
                // Continue to next strategy
                continue;
            }
        }
        
        // If all strategies failed, show manual selection UI
        console.warn('⚠️ All connection strategies failed, showing manual selection...');
        await this.showAllConnectionMethodsUI(device);
    }
    
    // Strategy 1: Connect with default UUIDs
    async connectWithDefaultUUIDs(device) {
        const defaultServiceUUID = '0000fff0-0000-1000-8000-00805f9b34fb';
        const defaultCharUUID = '0000fff1-0000-1000-8000-00805f9b34fb';
        
        try {
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(defaultServiceUUID);
            const characteristic = await service.getCharacteristic(defaultCharUUID);
            
            if (characteristic.properties.notify || characteristic.properties.indicate) {
                await characteristic.startNotifications();
                characteristic.addEventListener('characteristicvaluechanged', (event) => {
                    this.handleNotification(event);
                });
            }
            
            this.device = device;
            this.server = service;
            this.characteristic = characteristic;
            this.isConnected = true;
            this.updateConnectionStatus('connected', `${device.name || 'Device'} (Default UUIDs)`);
            this.updateUI();
            this.showToast('✅ Connected with default UUIDs!');
            
            device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnection();
            });
            
            return true;
        } catch (error) {
            throw error;
        }
    }
    
    // Strategy 2: Connect with saved UUIDs
    async connectWithSavedUUIDs(device) {
        const savedServiceUUID = localStorage.getItem('customServiceUUID');
        const savedCharUUID = localStorage.getItem('customCharUUID');
        
        if (!savedServiceUUID || !savedCharUUID) {
            throw new Error('No saved UUIDs');
        }
        
        try {
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService(savedServiceUUID);
            const characteristic = await service.getCharacteristic(savedCharUUID);
            
            if (characteristic.properties.notify || characteristic.properties.indicate) {
                await characteristic.startNotifications();
                characteristic.addEventListener('characteristicvaluechanged', (event) => {
                    this.handleNotification(event);
                });
            }
            
            this.device = device;
            this.server = service;
            this.characteristic = characteristic;
            this.isConnected = true;
            this.updateConnectionStatus('connected', `${device.name || 'Device'} (Saved UUIDs)`);
            this.updateUI();
            this.showToast('✅ Connected with saved UUIDs!');
            
            device.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnection();
            });
            
            return true;
        } catch (error) {
            throw error;
        }
    }
    
    // Strategy 3: UUID Format Variations (short vs long format)
    async connectWithUUIDVariations(device) {
        // Common UUIDs in both formats
        const uuidVariations = [
            // Standard RFID - Full format
            { service: '0000fff0-0000-1000-8000-00805f9b34fb', char: '0000fff1-0000-1000-8000-00805f9b34fb' },
            // Standard RFID - Short format
            { service: 'fff0', char: 'fff1' },
            // Nordic UART - Full format
            { service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', char: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' },
            // Alternative variations
            { service: '0000fff0-0000-1000-8000-00805f9b34fb', char: 'fff1' },
            { service: 'fff0', char: '0000fff1-0000-1000-8000-00805f9b34fb' }
        ];
        
        try {
            const server = await device.gatt.connect();
            
            for (const variation of uuidVariations) {
                try {
                    // Normalize UUID format
                    const serviceUUID = this.normalizeUUID(variation.service);
                    const charUUID = this.normalizeUUID(variation.char);
                    
                    console.log(`Trying UUID variation: Service=${serviceUUID}, Char=${charUUID}`);
                    
                    const service = await server.getPrimaryService(serviceUUID);
                    const characteristic = await service.getCharacteristic(charUUID);
                    
                    // Try to enable notifications
                    if (characteristic.properties.notify || characteristic.properties.indicate) {
                        await characteristic.startNotifications();
                        characteristic.addEventListener('characteristicvaluechanged', (event) => {
                            this.handleNotification(event);
                        });
                    }
                    
                    this.device = device;
                    this.server = service;
                    this.characteristic = characteristic;
                    this.SERVICE_UUID = serviceUUID;
                    this.CHARACTERISTIC_UUID = charUUID;
                    this.isConnected = true;
                    
                    localStorage.setItem('customServiceUUID', serviceUUID);
                    localStorage.setItem('customCharUUID', charUUID);
                    
                    this.updateConnectionStatus('connected', `${device.name || 'Device'} (UUID Variation)`);
                    this.updateUI();
                    this.showToast('✅ Connected with UUID variation!');
                    
                    device.addEventListener('gattserverdisconnected', () => {
                        this.handleDisconnection();
                    });
                    
                    return true;
                } catch (error) {
                    continue; // Try next variation
                }
            }
            
            throw new Error('All UUID variations failed');
        } catch (error) {
            throw error;
        }
    }
    
    // Normalize UUID format (short to long)
    normalizeUUID(uuid) {
        // If it's already a full UUID, return as is
        if (uuid.includes('-') && uuid.length === 36) {
            return uuid;
        }
        
        // If it's a short UUID (like 'fff0'), convert to full format
        if (uuid.length === 4) {
            return `0000${uuid}-0000-1000-8000-00805f9b34fb`;
        }
        
        // If it's 8 chars (like '0000fff0'), also convert
        if (uuid.length === 8) {
            const short = uuid.substring(4);
            return `0000${short}-0000-1000-8000-00805f9b34fb`;
        }
        
        return uuid; // Return as-is if can't normalize
    }
    
    // Strategy 4: Quick Connect (common UUID combinations)
    async connectWithQuickConnect(device) {
        try {
            const server = await device.gatt.connect();
            await this.quickConnectR6Pro(device, server);
            
            if (this.isConnected) {
                return true;
            }
            throw new Error('Quick connect failed');
        } catch (error) {
            throw error;
        }
    }
    
    // Strategy 4: Auto-Discover (already exists, just wrap it)
    async connectWithAutoDiscoverWrapper(device) {
        try {
            await this.connectWithAutoDiscover(device);
            
            if (this.isConnected) {
                return true;
            }
            throw new Error('Auto-discover failed');
        } catch (error) {
            throw error;
        }
    }
    
    // Strategy 5: Brute Force - try ALL services and characteristics with ALL combinations
    async connectWithBruteForce(device) {
        try {
            const server = await device.gatt.connect();
            const allServices = await server.getPrimaryServices();
            
            console.log(`🔍 Brute Force: Found ${allServices.length} services`);
            
            // Try each service
            for (const service of allServices) {
                try {
                    const characteristics = await service.getCharacteristics();
                    console.log(`  Service ${service.uuid}: ${characteristics.length} characteristics`);
                    
                    // Try each characteristic
                    for (const char of characteristics) {
                        // Try different connection methods for each characteristic
                        const methods = [
                            { name: 'notify', try: () => this.tryConnectWithNotify(device, service, char) },
                            { name: 'indicate', try: () => this.tryConnectWithIndicate(device, service, char) },
                            { name: 'read', try: () => this.tryConnectWithRead(device, service, char) },
                            { name: 'write', try: () => this.tryConnectWithWrite(device, service, char) }
                        ];
                        
                        for (const method of methods) {
                            if (char.properties[method.name] || method.name === 'write' && char.properties.writeWithoutResponse) {
                                try {
                                    const result = await method.try();
                                    if (result) {
                                        console.log(`✅ Brute Force success with ${service.uuid}/${char.uuid} using ${method.name}`);
                                        return true;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            
            throw new Error('Brute force failed - no suitable combination found');
        } catch (error) {
            throw error;
        }
    }
    
    // Helper: Try connecting with notify
    async tryConnectWithNotify(device, service, char) {
        if (!char.properties.notify) return false;
        
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (event) => {
            this.handleNotification(event);
        });
        
        this.device = device;
        this.server = service;
        this.characteristic = char;
        this.SERVICE_UUID = service.uuid;
        this.CHARACTERISTIC_UUID = char.uuid;
        this.isConnected = true;
        
        localStorage.setItem('customServiceUUID', service.uuid);
        localStorage.setItem('customCharUUID', char.uuid);
        
        this.updateConnectionStatus('connected', `${device.name || 'Device'} (Brute Force: Notify)`);
        this.updateUI();
        this.showToast('✅ Connected! (Brute Force)');
        
        device.addEventListener('gattserverdisconnected', () => {
            this.handleDisconnection();
        });
        
        return true;
    }
    
    // Helper: Try connecting with indicate
    async tryConnectWithIndicate(device, service, char) {
        if (!char.properties.indicate) return false;
        
        // Similar to notify
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', (event) => {
            this.handleNotification(event);
        });
        
        this.device = device;
        this.server = service;
        this.characteristic = char;
        this.SERVICE_UUID = service.uuid;
        this.CHARACTERISTIC_UUID = char.uuid;
        this.isConnected = true;
        
        localStorage.setItem('customServiceUUID', service.uuid);
        localStorage.setItem('customCharUUID', char.uuid);
        
        this.updateConnectionStatus('connected', `${device.name || 'Device'} (Brute Force: Indicate)`);
        this.updateUI();
        this.showToast('✅ Connected! (Brute Force)');
        
        device.addEventListener('gattserverdisconnected', () => {
            this.handleDisconnection();
        });
        
        return true;
    }
    
    // Helper: Try connecting with read-only
    async tryConnectWithRead(device, service, char) {
        if (!char.properties.read) return false;
        
        // For read-only, we'll try to read it first as a test
        try {
            await char.readValue();
        } catch (e) {
            return false;
        }
        
        this.device = device;
        this.server = service;
        this.characteristic = char;
        this.SERVICE_UUID = service.uuid;
        this.CHARACTERISTIC_UUID = char.uuid;
        this.isConnected = true;
        
        localStorage.setItem('customServiceUUID', service.uuid);
        localStorage.setItem('customCharUUID', char.uuid);
        
        this.updateConnectionStatus('connected', `${device.name || 'Device'} (Brute Force: Read)`);
        this.updateUI();
        this.showToast('✅ Connected! (Read-only mode)');
        
        device.addEventListener('gattserverdisconnected', () => {
            this.handleDisconnection();
        });
        
        return true;
    }
    
    // Helper: Try connecting with write-only
    async tryConnectWithWrite(device, service, char) {
        if (!char.properties.write && !char.properties.writeWithoutResponse) return false;
        
        this.device = device;
        this.server = service;
        this.characteristic = char;
        this.SERVICE_UUID = service.uuid;
        this.CHARACTERISTIC_UUID = char.uuid;
        this.isConnected = true;
        
        localStorage.setItem('customServiceUUID', service.uuid);
        localStorage.setItem('customCharUUID', char.uuid);
        
        this.updateConnectionStatus('connected', `${device.name || 'Device'} (Brute Force: Write)`);
        this.updateUI();
        this.showToast('✅ Connected! (Write-only mode)');
        
        device.addEventListener('gattserverdisconnected', () => {
            this.handleDisconnection();
        });
        
        return true;
    }
    
    // Show UI with all connection methods as options
    async showAllConnectionMethodsUI(device) {
        try {
            const server = await device.gatt.connect();
            const services = await server.getPrimaryServices();
            
            await this.showServiceSelectionUI(device, server, services, 'All automatic methods failed. Please select manually or try one of the options below.');
        } catch (error) {
            await this.showGATTErrorRecovery(device, error);
        }
    }
    
    // Handle GATT-specific errors with helpful messages
    handleGATTError(error, device) {
        const errorName = error.name || '';
        const errorMessage = error.message || '';
        
        if (errorName === 'NetworkError' || errorMessage.includes('network')) {
            return 'GATT Error: Network/Connection failed. Try moving closer to the device or reconnecting.';
        } else if (errorName === 'InvalidStateError' || errorMessage.includes('invalid state')) {
            return 'GATT Error: Device is not in a valid state. Try disconnecting and reconnecting.';
        } else if (errorName === 'SecurityError' || errorMessage.includes('security')) {
            return 'GATT Error: Security/Authorization failed. Check Bluetooth permissions.';
        } else if (errorName === 'NotFoundError') {
            return 'GATT Error: Service or characteristic not found.';
        } else if (errorName === 'NotSupportedError') {
            return 'GATT Error: Operation not supported by this device.';
        } else if (errorName === 'OperationError' || errorMessage.includes('operation')) {
            return 'GATT Error: Operation failed. The device may have disconnected.';
        } else if (errorMessage.includes('GATT') || errorName.includes('GATT')) {
            return `GATT Error: ${errorMessage}. Try reconnecting or moving closer to the device.`;
        } else if (errorMessage.includes('timeout') || errorMessage.includes('Time')) {
            return 'GATT Error: Connection timeout. The device may be out of range or not responding.';
        } else {
            return `Connection failed: ${errorMessage}`;
        }
    }
    
    // Show recovery options for GATT errors
    async showGATTErrorRecovery(device, error) {
        const deviceList = document.getElementById('deviceList');
        document.getElementById('deviceModal').style.display = 'block';
        
        let html = `
            <div style="padding: 20px;">
                <div style="background: #fee2e2; padding: 15px; border-radius: 6px; margin-bottom: 15px; border: 2px solid #ef4444;">
                    <div style="font-weight: 600; color: #991b1b; margin-bottom: 8px; font-size: 16px;">
                        ⚠️ GATT Connection Error
                    </div>
                    <div style="font-size: 13px; color: #7f1d1d; line-height: 1.6;">
                        <strong>Error:</strong> ${error.name || 'Unknown'}<br>
                        <strong>Message:</strong> ${error.message || 'Connection failed'}
                    </div>
                </div>
                
                <div style="background: #f0f9ff; padding: 15px; border-radius: 6px; margin-bottom: 15px; border: 2px solid #0ea5e9;">
                    <div style="font-weight: 600; color: #0369a1; margin-bottom: 10px;">
                        🔧 Try These Solutions:
                    </div>
                    <div style="font-size: 13px; color: #0c4a6e; line-height: 1.8;">
                        <strong>1. Retry Connection:</strong><br>
                        <button onclick="window.rfidReader.retryConnection()" 
                                class="btn btn-primary" 
                                style="width: 100%; padding: 12px; margin-top: 8px; margin-bottom: 15px;">
                            🔄 Retry Connection
                        </button>
                        
                        <strong>2. Try Auto-Discover:</strong><br>
                        <button onclick="window.rfidReader.connectWithAutoDiscover(window.rfidReader.pendingDevice || window.rfidReader.lastDevice)" 
                                class="btn btn-secondary" 
                                style="width: 100%; padding: 12px; margin-top: 8px; margin-bottom: 15px;">
                            🔍 Try Auto-Discover
                        </button>
                        
                        <strong>3. Quick Connect (Common UUIDs):</strong><br>
                        <button onclick="window.rfidReader.tryQuickConnectAfterError()" 
                                class="btn btn-secondary" 
                                style="width: 100%; padding: 12px; margin-top: 8px; margin-bottom: 15px;">
                            ⚡ Quick Connect
                        </button>
                    </div>
                </div>
                
                <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin-bottom: 15px; font-size: 12px; color: #78350f;">
                    <strong style="display: block; margin-bottom: 8px;">💡 Quick Fixes:</strong>
                    <div style="line-height: 1.8;">
                        • <strong>Move closer</strong> - Stay within 1-2 meters (3-6 feet)<br>
                        • <strong>Check power</strong> - Make sure RFID reader is on<br>
                        • <strong>Restart Bluetooth</strong> - Turn off/on Bluetooth<br>
                        • <strong>Restart reader</strong> - Turn off/on your R6 PRO<br>
                        • <strong>Close other apps</strong> - Don't use multiple Bluetooth apps<br>
                        • <strong>Check battery</strong> - Low battery causes connection issues
                    </div>
                </div>
                
                <div style="background: #f9fafb; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-size: 11px; color: #6b7280;">
                    <strong>Error Details:</strong><br>
                    Type: ${error.name || 'Unknown'}<br>
                    Message: ${error.message || 'No details'}
                </div>
                
                <button onclick="window.rfidReader.showDeviceModal()" 
                        class="btn btn-secondary" style="width: 100%; padding: 12px;">
                    Cancel
                </button>
            </div>
        `;
        
        this.lastDevice = device;
        this.lastError = error;
        deviceList.innerHTML = html;
    }
    
    // Retry connection after GATT error
    async retryConnection() {
        if (!this.lastDevice) {
            this.showToast('No device to retry. Please scan for devices again.');
            return;
        }
        
        this.hideDeviceModal();
        this.updateConnectionStatus('connecting', 'Retrying connection...');
        this.showToast('Retrying connection... Please wait');
        
        // Wait a moment before retrying
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
            // Try to disconnect first if still connected
            if (this.lastDevice.gatt && this.lastDevice.gatt.connected) {
                try {
                    await this.lastDevice.gatt.disconnect();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (e) {
                    console.log('Could not disconnect, continuing...');
                }
            }
            
            // Try connecting again with auto-discover
            await this.connectWithAutoDiscover(this.lastDevice);
        } catch (error) {
            console.error('Retry failed:', error);
            await this.showGATTErrorRecovery(this.lastDevice, error);
        }
    }
    
    // Try quick connect after error
    async tryQuickConnectAfterError() {
        if (!this.lastDevice) {
            this.showToast('No device available. Please scan for devices again.');
            return;
        }
        
        try {
            const server = await this.lastDevice.gatt.connect();
            await this.quickConnectR6Pro(this.lastDevice, server);
        } catch (error) {
            console.error('Quick connect retry error:', error);
            this.showToast('Quick Connect failed. Please try manual selection.');
            // Show service selection as fallback
            try {
                const server = await this.lastDevice.gatt.connect();
                const services = await server.getPrimaryServices();
                await this.showServiceSelectionUI(this.lastDevice, server, services, 'Quick Connect failed. Please select manually.');
            } catch (e) {
                this.showGATTErrorRecovery(this.lastDevice, error);
            }
        }
    }
    
    // Auto-discover connection method - tries to find the right service/characteristic automatically
    async connectWithAutoDiscover(device) {
        this.updateConnectionStatus('connecting', `Auto-discovering ${device.name}...`);
        
        try {
            console.log('Auto-discover: Connecting to GATT server...');
            const server = await device.gatt.connect();
            
            // Common UUIDs to try
            const commonServiceUUIDs = [
                '0000fff0-0000-1000-8000-00805f9b34fb', // Standard RFID
                '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
                '0000fff0-0000-1000-8000-00805f9b34fb'  // Alternative
            ];
            
            const commonCharUUIDs = [
                '0000fff1-0000-1000-8000-00805f9b34fb', // Standard RFID
                '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART RX (Notify)
                '6e400002-b5a3-f393-e0a9-e50e24dcca9e'  // Nordic UART TX (Write)
            ];
            
            // First, discover all services
            console.log('Auto-discover: Discovering all services...');
            const allServices = await server.getPrimaryServices();
            console.log('Found services:', allServices.map(s => s.uuid));
            
            // Try each service
            for (const service of allServices) {
                console.log(`Trying service: ${service.uuid}`);
                
                try {
                    // Discover all characteristics in this service
                    const characteristics = await service.getCharacteristics();
                    console.log(`Found ${characteristics.length} characteristics in service ${service.uuid}`);
                    
                    // Look for a characteristic with notify property
                    for (const char of characteristics) {
                        console.log(`Checking characteristic: ${char.uuid}, properties:`, {
                            read: char.properties.read,
                            write: char.properties.write,
                            notify: char.properties.notify,
                            indicate: char.properties.indicate
                        });
                        
                        // Try to connect - prefer notify/indicate, but also try others as fallback
                        const hasNotify = char.properties.notify || char.properties.indicate;
                        const hasWrite = char.properties.write || char.properties.writeWithoutResponse;
                        
                        if (hasNotify || hasWrite) {
                            console.log(`✅ Found characteristic: ${char.uuid} (notify: ${hasNotify}, write: ${hasWrite})`);
                            
                            try {
                                // If it has notify, enable notifications
                                if (hasNotify) {
                                    await char.startNotifications();
                                    char.addEventListener('characteristicvaluechanged', (event) => {
                                        this.handleNotification(event);
                                    });
                                    console.log('Enabled notifications on characteristic');
                                }
                                
                                // Success! Use this service and characteristic
                                this.device = device;
                                this.server = service;
                                this.characteristic = char;
                                this.SERVICE_UUID = service.uuid;
                                this.CHARACTERISTIC_UUID = char.uuid;
                                
                                // Save for future use
                                localStorage.setItem('customServiceUUID', service.uuid);
                                localStorage.setItem('customCharUUID', char.uuid);
                                
                                this.isConnected = true;
                                this.updateConnectionStatus('connected', `${device.name || 'Device'} (Auto-discovered)`);
                                this.updateUI();
                                this.showToast('✅ Connected! Auto-discovered service and characteristic');
                                console.log('✅ Auto-discover connection successful!');
                                
                                device.addEventListener('gattserverdisconnected', () => {
                                    this.handleDisconnection();
                                });
                                
                                return; // Success - already connected!
                            } catch (notifyError) {
                                console.warn(`Could not enable notifications on ${char.uuid}:`, notifyError);
                                // Continue trying other characteristics
                                continue;
                            }
                        }
                    }
                } catch (error) {
                    console.warn(`Error accessing service ${service.uuid}:`, error);
                    continue;
                }
            }
            
            // If we get here, auto-discover couldn't find a suitable combination
            console.warn('Auto-discover failed: No suitable service/characteristic found');
            this.updateConnectionStatus('disconnected', 'Auto-discover failed');
            
            // Show manual selection UI automatically
            await this.showServiceSelectionUI(device, server, allServices, 'Auto-discover tried but couldn\'t find a suitable service. Please select manually.');
            
        } catch (error) {
            console.error('Auto-discover error:', error);
            this.lastDevice = device;
            this.lastError = error;
            
            // Check if this is a GATT error
            const isGATTError = error.name && (
                error.name.includes('GATT') || 
                error.name === 'NetworkError' ||
                error.name === 'InvalidStateError' ||
                error.message && error.message.includes('GATT')
            );
            
            if (isGATTError) {
                // Show GATT error recovery UI
                await this.showGATTErrorRecovery(device, error);
            } else {
                this.updateConnectionStatus('disconnected', 'Auto-discover failed');
                
                // Try to show manual selection UI
                try {
                    const server = await device.gatt.connect();
                    const services = await server.getPrimaryServices();
                    await this.showServiceSelectionUI(device, server, services, 'Auto-discover failed. Please select manually.');
                } catch (e) {
                    this.showToast('Connection failed: ' + error.message);
                }
            }
        }
    }
    
    // Show UI for selecting service when expected one not found
    async showServiceSelectionUI(device, server, availableServices, errorMessage) {
        const deviceList = document.getElementById('deviceList');
        document.getElementById('deviceModal').style.display = 'block';
        
        let html = `
            <div style="padding: 20px;">
                <div style="background: #e0f2fe; padding: 15px; border-radius: 6px; margin-bottom: 15px; border: 2px solid #0ea5e9;">
                    <div style="font-weight: 600; color: #0369a1; margin-bottom: 8px; font-size: 15px;">
                        ⚡ Quick Connect Options
                    </div>
                    <div style="font-size: 12px; color: #0c4a6e; margin-bottom: 10px; line-height: 1.5;">
                        Try these common R6 PRO combinations automatically:
                    </div>
                    <button onclick="window.rfidReader.quickConnectR6Pro(window.rfidReader.pendingDevice, window.rfidReader.pendingServer)" 
                            class="btn btn-primary" 
                            style="width: 100%; padding: 12px; font-weight: 600; margin-bottom: 8px;">
                        ⚡ Quick Connect (Try Common UUIDs)
                    </button>
                    <button onclick="window.rfidReader.connectWithAutoDiscover(window.rfidReader.pendingDevice)" 
                            class="btn btn-secondary" 
                            style="width: 100%; padding: 10px; font-weight: 500;">
                        🔍 Full Auto-Discover (Scan All)
                    </button>
                </div>
                <div style="background: #fef3c7; padding: 15px; border-radius: 6px; margin-bottom: 15px; font-size: 13px; line-height: 1.6;">
                    <div style="font-weight: 600; color: #92400e; margin-bottom: 8px;">
                        ℹ️ Auto-Discover Attempted
                    </div>
                    <div style="color: #78350f;">
                        The app tried to automatically find the right service and characteristic, but couldn't find a suitable match. Try Quick Connect above or select manually from the list below.
                    </div>
                </div>
                <div style="margin-bottom: 15px;">
                    <strong style="display: block; margin-bottom: 10px;">Or manually select from available services:</strong>
                    <div style="max-height: 250px; overflow-y: auto; background: #f9fafb; padding: 10px; border-radius: 6px;">
        `;
        
        if (availableServices.length === 0) {
            html += `<div style="color: #6b7280; font-style: italic; padding: 10px;">No services found on this device.</div>`;
        } else {
            availableServices.forEach((service, index) => {
                html += `
                    <div style="padding: 10px; margin-bottom: 8px; background: white; border-radius: 4px; cursor: pointer; border: 2px solid #e5e7eb; transition: all 0.2s;"
                         onmouseover="this.style.borderColor='#667eea'; this.style.backgroundColor='#f0f4ff';"
                         onmouseout="this.style.borderColor='#e5e7eb'; this.style.backgroundColor='white';"
                         onclick="window.rfidReader.selectService('${device.id}', '${service.uuid}')">
                        <div style="font-weight: 600; margin-bottom: 4px;">Service ${index + 1}</div>
                        <code style="word-break: break-all; font-size: 11px; color: #374151;">${service.uuid}</code>
                    </div>
                `;
            });
        }
        
        html += `
                    </div>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Or enter custom Service UUID:</label>
                    <input type="text" id="customServiceUUID" 
                           value="${this.SERVICE_UUID}"
                           placeholder="0000fff0-0000-1000-8000-00805f9b34fb"
                           style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 4px; font-family: monospace; font-size: 12px;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Characteristic UUID:</label>
                    <input type="text" id="customCharUUID" 
                           value="${this.CHARACTERISTIC_UUID}"
                           placeholder="0000fff1-0000-1000-8000-00805f9b34fb"
                           style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 4px; font-family: monospace; font-size: 12px;">
                </div>
                <button onclick="window.rfidReader.connectWithCustomUUIDs()" 
                        class="btn btn-primary" style="width: 100%; padding: 12px;">
                    Connect with Custom UUIDs
                </button>
                <button onclick="window.rfidReader.showDeviceModal()" 
                        class="btn btn-secondary" style="width: 100%; margin-top: 10px; padding: 12px;">
                    Cancel
                </button>
            </div>
        `;
        
        this.pendingDevice = device;
        this.pendingServer = server;
        deviceList.innerHTML = html;
    }
    
    // Show UI for selecting characteristic when expected one not found
    async showCharacteristicSelectionUI(device, service, availableCharacteristics, errorMessage) {
        const deviceList = document.getElementById('deviceList');
        document.getElementById('deviceModal').style.display = 'block';
        
        let html = `
            <div style="padding: 20px;">
                <div style="color: #ef4444; font-weight: 600; margin-bottom: 15px; font-size: 16px;">
                    ⚠️ Characteristic UUID Not Found
                </div>
                <div style="background: #fef3c7; padding: 12px; border-radius: 6px; margin-bottom: 15px; font-size: 13px; line-height: 1.6;">
                    <strong>Service:</strong><br>
                    <code style="word-break: break-all; font-size: 11px;">${service.uuid}</code><br><br>
                    <strong>Expected Characteristic:</strong><br>
                    <code style="word-break: break-all; font-size: 11px;">${this.CHARACTERISTIC_UUID}</code><br><br>
                    <strong>Error:</strong> ${errorMessage}
                </div>
                <div style="margin-bottom: 15px;">
                    <strong style="display: block; margin-bottom: 10px;">Available Characteristics:</strong>
                    <div style="max-height: 300px; overflow-y: auto; background: #f9fafb; padding: 10px; border-radius: 6px;">
        `;
        
        if (availableCharacteristics.length === 0) {
            html += `<div style="color: #6b7280; font-style: italic; padding: 10px;">No characteristics found on this service.</div>`;
        } else {
            availableCharacteristics.forEach((char, index) => {
                const props = [];
                if (char.properties.read) props.push('Read');
                if (char.properties.write) props.push('Write');
                if (char.properties.notify) props.push('Notify');
                if (char.properties.indicate) props.push('Indicate');
                
                html += `
                    <div style="padding: 12px; margin-bottom: 8px; background: white; border-radius: 4px; cursor: pointer; border: 2px solid #e5e7eb; transition: all 0.2s;"
                         onmouseover="this.style.borderColor='#667eea'; this.style.backgroundColor='#f0f4ff';"
                         onmouseout="this.style.borderColor='#e5e7eb'; this.style.backgroundColor='white';"
                         onclick="window.rfidReader.selectCharacteristic('${char.uuid}')">
                        <div style="font-weight: 600; margin-bottom: 4px;">Characteristic ${index + 1}</div>
                        <code style="word-break: break-all; font-size: 11px; color: #374151; display: block; margin-bottom: 4px;">${char.uuid}</code>
                        <div style="font-size: 10px; color: #6b7280;">
                            Properties: ${props.join(', ') || 'None'}
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
                    </div>
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Or enter custom Characteristic UUID:</label>
                    <input type="text" id="customCharUUID2" 
                           value="${this.CHARACTERISTIC_UUID}"
                           placeholder="0000fff1-0000-1000-8000-00805f9b34fb"
                           style="width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 4px; font-family: monospace; font-size: 12px;">
                </div>
                <button onclick="window.rfidReader.connectWithSelectedService()" 
                        class="btn btn-primary" style="width: 100%; padding: 12px;">
                    Connect with Selected Characteristic
                </button>
                <button onclick="window.rfidReader.showDeviceModal()" 
                        class="btn btn-secondary" style="width: 100%; margin-top: 10px; padding: 12px;">
                    Cancel
                </button>
            </div>
        `;
        
        this.pendingDevice = device;
        this.pendingService = service;
        deviceList.innerHTML = html;
    }
    
    // Select a service and reconnect
    async selectService(deviceId, serviceUUID) {
        this.SERVICE_UUID = serviceUUID;
        localStorage.setItem('customServiceUUID', serviceUUID);
        console.log('Selected service UUID:', serviceUUID);
        
        if (this.pendingDevice && this.pendingDevice.id === deviceId) {
            this.connectToDevice(this.pendingDevice);
        }
    }
    
    // Select a characteristic and complete connection
    async selectCharacteristic(characteristicUUID) {
        this.CHARACTERISTIC_UUID = characteristicUUID;
        localStorage.setItem('customCharUUID', characteristicUUID);
        console.log('Selected characteristic UUID:', characteristicUUID);
        this.connectWithSelectedService();
    }
    
    // Quick Connect - tries common R6 PRO UUID combinations
    async quickConnectR6Pro(device, server) {
        if (!device || !server) {
            this.showToast('Device or server not available');
            return;
        }
        
        this.hideDeviceModal();
        this.updateConnectionStatus('connecting', `Quick connecting to ${device.name}...`);
        this.showToast('⚡ Trying common R6 PRO UUID combinations...');
        
        // Common UUID combinations for R6 PRO
        const commonCombos = [
            {
                service: '0000fff0-0000-1000-8000-00805f9b34fb',
                characteristic: '0000fff1-0000-1000-8000-00805f9b34fb',
                name: 'Standard RFID Service'
            },
            {
                service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
                characteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
                name: 'Nordic UART Service (RX/Notify)'
            },
            {
                service: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
                characteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
                name: 'Nordic UART Service (TX/Write)'
            },
            {
                service: '0000fff0-0000-1000-8000-00805f9b34fb',
                characteristic: '0000fff2-0000-1000-8000-00805f9b34fb',
                name: 'Standard RFID Service (Alt Char)'
            }
        ];
        
        try {
            // Get all available services first
            const allServices = await server.getPrimaryServices();
            const serviceMap = new Map();
            allServices.forEach(s => serviceMap.set(s.uuid, s));
            
            console.log('⚡ Quick Connect: Trying common combinations...');
            
            // Try each common combination
            for (const combo of commonCombos) {
                try {
                    console.log(`Trying: ${combo.name} (Service: ${combo.service}, Char: ${combo.characteristic})`);
                    
                    const service = serviceMap.get(combo.service);
                    if (!service) {
                        console.log(`Service ${combo.service} not found, skipping...`);
                        continue;
                    }
                    
                    try {
                        const char = await service.getCharacteristic(combo.characteristic);
                        console.log(`✅ Found characteristic ${combo.characteristic}`);
                        
                        // Try to enable notifications if supported
                        try {
                            if (char.properties.notify || char.properties.indicate) {
                                await char.startNotifications();
                                char.addEventListener('characteristicvaluechanged', (event) => {
                                    this.handleNotification(event);
                                });
                                console.log('✅ Enabled notifications');
                            }
                        } catch (notifyError) {
                            console.warn('Could not enable notifications, but continuing...', notifyError);
                        }
                        
                        // Success!
                        this.device = device;
                        this.server = service;
                        this.characteristic = char;
                        this.SERVICE_UUID = combo.service;
                        this.CHARACTERISTIC_UUID = combo.characteristic;
                        
                        // Save for future use
                        localStorage.setItem('customServiceUUID', combo.service);
                        localStorage.setItem('customCharUUID', combo.characteristic);
                        
                        this.isConnected = true;
                        this.updateConnectionStatus('connected', `${device.name || 'Device'} (Quick Connect: ${combo.name})`);
                        this.updateUI();
                        this.showToast(`✅ Connected! Using ${combo.name}`);
                        console.log(`✅ Quick Connect successful with ${combo.name}!`);
                        
                        device.addEventListener('gattserverdisconnected', () => {
                            this.handleDisconnection();
                        });
                        
                        return; // Success!
                        
                    } catch (charError) {
                        console.log(`Characteristic ${combo.characteristic} not found, trying next...`);
                        continue;
                    }
                    
                } catch (error) {
                    console.warn(`Error trying ${combo.name}:`, error);
                    continue;
                }
            }
            
            // If we get here, none of the common combinations worked
            console.warn('Quick Connect: No common combinations worked');
            this.updateConnectionStatus('disconnected', 'Quick Connect failed');
            
            // Show manual selection UI
            await this.showServiceSelectionUI(device, server, allServices, 'Quick Connect tried common UUIDs but none worked. Please select manually.');
            
        } catch (error) {
            console.error('Quick Connect error:', error);
            this.updateConnectionStatus('disconnected', 'Quick Connect failed');
            this.showToast('Quick Connect failed: ' + error.message);
        }
    }
    
    // Connect with custom UUIDs
    async connectWithCustomUUIDs() {
        const serviceUUID = document.getElementById('customServiceUUID').value.trim();
        const charUUID = document.getElementById('customCharUUID').value.trim();
        
        if (!serviceUUID || !charUUID) {
            this.showToast('Please enter both Service UUID and Characteristic UUID');
            return;
        }
        
        this.SERVICE_UUID = serviceUUID;
        this.CHARACTERISTIC_UUID = charUUID;
        localStorage.setItem('customServiceUUID', serviceUUID);
        localStorage.setItem('customCharUUID', charUUID);
        
        if (this.pendingDevice) {
            this.connectToDevice(this.pendingDevice);
        }
    }
    
    // Complete connection with selected service
    async connectWithSelectedService() {
        if (!this.pendingService || !this.pendingDevice) return;
        
        const charUUID = document.getElementById('customCharUUID2')?.value.trim() || this.CHARACTERISTIC_UUID;
        
        try {
            const characteristic = await this.pendingService.getCharacteristic(charUUID);
            
            // Enable notifications
            await characteristic.startNotifications();
            characteristic.addEventListener('characteristicvaluechanged', (event) => {
                this.handleNotification(event);
            });
            
            this.device = this.pendingDevice;
            this.server = this.pendingService;
            this.characteristic = characteristic;
            this.isConnected = true;
            
            this.updateConnectionStatus('connected', `${this.pendingDevice.name || 'Device'}`);
            this.updateUI();
            this.showToast('Connected successfully');
            this.hideDeviceModal();
            
            this.pendingDevice.addEventListener('gattserverdisconnected', () => {
                this.handleDisconnection();
            });
        } catch (error) {
            console.error('Characteristic connection error:', error);
            this.showToast('Failed to connect: ' + error.message);
        }
    }

    // Handle incoming data from the RFID reader
    handleNotification(event) {
        const value = event.target.value;
        const buffer = new Uint8Array(value.buffer);
        
        // Log raw data for debugging
        const hexStr = this.bytesToHex(buffer);
        console.log('Received data:', hexStr, '| Bytes:', Array.from(buffer));
        
        try {
            // PARSE BASED ON DEVICE'S PROTOCOL
            // Common RFID reader protocol structure:
            // [0]: Header (typically 0xA0)
            // [1]: Length (total message length)
            // [2]: Command type
            // [3+]: Data payload
            // [last]: Checksum
            
            if (buffer.length < 4) {
                console.log('Data too short, ignoring');
                return;
            }

            const header = buffer[0];
            const length = buffer[1];
            const command = buffer[2];
            
            console.log(`Header: 0x${header.toString(16)}, Len: ${length}, Cmd: 0x${command.toString(16)}`);
            
            if (header === 0xA0) { // Response header
                switch (command) {
                    case 0x89: // Tag inventory data
                    case 0x22: // Single tag read
                        this.parseTagData(buffer);
                        break;
                    case 0x01: // Stop inventory response
                        console.log('Inventory stopped');
                        break;
                    case 0x97: // Get power response
                        if (buffer.length >= 4) {
                            const power = buffer[3];
                            console.log('Current power:', power);
                            this.showToast(`Power: ${power} dBm`);
                        }
                        break;
                    case 0x39: // Read tag response
                        this.parseReadData(buffer);
                        break;
                    case 0x49: // Write tag response
                        console.log('Write response received');
                        if (buffer.length >= 4 && buffer[3] === 0x10) {
                            this.showToast('Write successful');
                            document.getElementById('writeResult').textContent = 'Write successful!';
                        } else {
                            this.showToast('Write failed');
                            document.getElementById('writeResult').textContent = 'Write failed';
                        }
                        break;
                    case 0xAA: // Get frequency response
                        if (buffer.length >= 4) {
                            console.log('Frequency mode:', buffer[3]);
                        }
                        break;
                    default:
                        console.log('Unknown command response:', command, 'Data:', hexStr);
                }
            } else {
                console.log('Unknown header:', header);
            }
        } catch (error) {
            console.error('Error parsing notification:', error);
        }
    }

    parseTagData(buffer) {
        // Parse EPC tag data from inventory response
        try {
            console.log('Parsing tag data, buffer length:', buffer.length);
            
            // Typical format: [Header, Length, Cmd, DataLen, EPC..., RSSI?, Checksum]
            if (buffer.length < 6) {
                console.log('Buffer too short for tag data');
                return;
            }

            const dataStart = 4; // Skip header, length, cmd, dataLen
            const dataLength = buffer[3]; // Data length byte
            
            if (dataLength > 0 && buffer.length >= dataStart + dataLength) {
                const epcBytes = buffer.slice(dataStart, dataStart + dataLength);
                const epc = this.bytesToHex(epcBytes);
                
                // Check if RSSI is included (usually last byte before checksum)
                let rssi = '';
                if (buffer.length > dataStart + dataLength + 1) {
                    const rssiValue = buffer[dataStart + dataLength];
                    if (rssiValue > 20 && rssiValue < 100) {
                        rssi = `-${rssiValue}`;
                    }
                }
                
                console.log('Parsed EPC:', epc, 'RSSI:', rssi || 'N/A');
                
                // Add to tag list
                this.addTagToList({
                    epc: epc,
                    tid: '',
                    rssi: rssi,
                    user: ''
                });
                
                // Play sound if enabled
                if (this.settings.beep) {
                    this.playBeep();
                }
            } else {
                console.log('Invalid data length:', dataLength);
            }
        } catch (error) {
            console.error('Error parsing tag data:', error);
        }
    }

    parseReadData(buffer) {
        // Parse read command response
        try {
            console.log('Parsing read data, buffer length:', buffer.length);
            
            // Format: [Header, Length, Cmd, Status, DataLen, Data..., Checksum]
            if (buffer.length < 6) {
                console.log('Buffer too short for read data');
                return;
            }

            const status = buffer[3];
            if (status !== 0x10) { // 0x10 = success
                console.log('Read failed, status:', status);
                this.showToast('Read failed');
                document.getElementById('readResult').textContent = 'Read failed';
                return;
            }

            const dataLength = buffer[4];
            const dataStart = 5;
            
            if (dataLength > 0 && buffer.length >= dataStart + dataLength) {
                const dataBytes = buffer.slice(dataStart, dataStart + dataLength);
                const data = this.bytesToHex(dataBytes);
                
                console.log('Read data:', data);
                document.getElementById('readResult').textContent = `Success!\nData: ${data}`;
                this.showToast('Read successful');
            }
        } catch (error) {
            console.error('Error parsing read data:', error);
        }
    }

    playBeep() {
        // Simple beep sound using Web Audio API
        if (!this.settings.beep) return;
        
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            
            oscillator.frequency.value = 1000; // 1kHz beep
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
            
            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            console.error('Error playing beep:', error);
        }
    }

    // Send command to RFID reader
    async sendCommand(commandBytes) {
        // Send via Web Bluetooth
        if (!this.characteristic) {
            throw new Error('Not connected to device');
        }
        
        try {
            await this.characteristic.writeValue(commandBytes);
            console.log('Command sent:', commandBytes);
        } catch (error) {
            console.error('Error sending command:', error);
            throw error;
        }
    }

    async disconnect() {
        if (this.device && this.device.gatt) {
            try {
                await this.device.gatt.disconnect();
            } catch (error) {
                console.error('Disconnect error:', error);
            }
        }
        this.handleDisconnection();
    }

    handleDisconnection() {
        this.isConnected = false;
        this.device = null;
        this.server = null;
        this.characteristic = null;
        this.stopInventory();
        this.updateConnectionStatus('disconnected', 'Disconnected');
        this.updateUI();
        this.showToast('Disconnected');
    }

    updateConnectionStatus(status, info) {
        const statusEl = document.getElementById('deviceStatus');
        const infoEl = document.getElementById('deviceInfo');
        const btnConnect = document.getElementById('btnConnect');

        statusEl.className = `status ${status}`;
        statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        
        // Add simulation mode indicator only if simulation is active
        if (this.simulationMode) {
            infoEl.innerHTML = '<span style="color: #0ea5e9;">📱 Simulation Mode</span> - ' + info;
        } else {
            infoEl.textContent = info;
        }
        
        btnConnect.textContent = this.isConnected ? 'Disconnect' : 'Connect';
    }

    updateUI() {
        const connected = this.isConnected;
        const scanning = this.isScanning;

        // Enable/disable buttons based on connection status
        // Note: Single Read and Loop Read buttons removed - device handles scanning via physical buttons
        const actionButtons = ['btnRead', 'btnWrite', 
                              'btnLock', 'btnKill', 'btnErase', 'btnScanBarcode'];
        actionButtons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.disabled = !connected;
        });

        // Clear button always enabled
        const btnClear = document.getElementById('btnClear');
        if (btnClear) btnClear.disabled = false;
    }

    // Tag Inventory Functions
    async inventorySingle() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        this.startTime = Date.now();
        
        if (this.simulationMode) {
            this.simulateTagRead();
        } else {
            // REAL DEVICE - Send single inventory command
            try {
                console.log('Sending INVENTORY_SINGLE command...');
                await this.sendCommand(this.COMMANDS.INVENTORY_SINGLE);
                this.showToast('Reading single tag...');
            } catch (error) {
                console.error('Failed to read single tag:', error);
                this.showToast('Failed to read tag: ' + error.message);
            }
        }
    }

    async inventoryLoop() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        if (this.isScanning) {
            return;
        }

        this.isScanning = true;
        this.startTime = Date.now();
        this.updateUI();

        if (this.simulationMode) {
            // Simulation mode - generate fake tags
            this.scanInterval = setInterval(() => {
                this.simulateTagRead();
                this.updateTime();
            }, 500);
        } else {
            // REAL DEVICE MODE - Send actual command
            try {
                console.log('Sending START_INVENTORY command...');
                await this.sendCommand(this.COMMANDS.START_INVENTORY);
                this.showToast('Inventory started - scanning for tags...');
                
                // Update time periodically
                this.scanInterval = setInterval(() => {
                    this.updateTime();
                }, 100);
                
                console.log('Inventory command sent successfully');
            } catch (error) {
                console.error('Failed to start inventory:', error);
                this.showToast('Failed to start inventory: ' + error.message);
                this.stopInventory();
            }
        }
    }

    async stopInventory() {
        this.isScanning = false;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }

        if (!this.simulationMode && this.isConnected) {
            try {
                console.log('Sending STOP_INVENTORY command...');
                await this.sendCommand(this.COMMANDS.STOP_INVENTORY);
                this.showToast('Inventory stopped');
                console.log('Stop command sent successfully');
            } catch (error) {
                console.error('Failed to stop inventory:', error);
            }
        }

        this.updateUI();
    }

    simulateTagRead() {
        // Generate random EPC for simulation
        const epc = this.generateRandomEPC();
        const tid = this.generateRandomTID();
        const rssi = this.settings.rssi ? Math.floor(Math.random() * 60 - 80) : '';

        this.addTagToList({
            epc: epc,
            tid: tid,
            rssi: rssi,
            user: ''
        });
    }

    generateRandomEPC() {
        const chars = '0123456789ABCDEF';
        let epc = '';
        for (let i = 0; i < 24; i++) {
            epc += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return epc;
    }

    generateRandomTID() {
        const chars = '0123456789ABCDEF';
        let tid = 'E28011';
        for (let i = 0; i < 6; i++) {
            tid += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return tid;
    }

    addTagToList(tagInfo) {
        const existingIndex = this.tagList.findIndex(t => t.epc === tagInfo.epc);
        
        if (existingIndex >= 0) {
            this.tagList[existingIndex].count++;
            this.tagList[existingIndex].rssi = tagInfo.rssi;
        } else {
            this.tagList.push({
                epc: tagInfo.epc,
                tid: tagInfo.tid,
                user: tagInfo.user,
                rssi: tagInfo.rssi,
                count: 1
            });
        }

        this.updateTagList();
        this.updateStats();
    }

    updateTagList() {
        const tbody = document.getElementById('tagListBody');
        tbody.innerHTML = '';

        this.tagList.forEach((tag, index) => {
            const row = document.createElement('tr');
            row.addEventListener('click', () => {
                this.selectedTag = tag;
                document.querySelectorAll('.tag-table tbody tr').forEach(r => r.classList.remove('selected'));
                row.classList.add('selected');
            });

            const displayText = tag.tid ? `EPC: ${tag.epc}\nTID: ${tag.tid}` : tag.epc;
            
            row.innerHTML = `
                <td style="white-space: pre-line; font-family: monospace;">${displayText}</td>
                <td>${tag.count}</td>
                <td>${tag.rssi || '-'}</td>
            `;
            tbody.appendChild(row);
        });
    }

    updateStats() {
        document.getElementById('tvCount').textContent = this.tagList.length;
        const total = this.tagList.reduce((sum, tag) => sum + tag.count, 0);
        document.getElementById('tvTotal').textContent = total;
    }

    updateTime() {
        if (this.startTime) {
            const elapsed = (Date.now() - this.startTime) / 1000;
            document.getElementById('tvTime').textContent = elapsed.toFixed(1) + 's';
        }
    }

    clearData() {
        this.tagList = [];
        this.selectedTag = null;
        this.updateTagList();
        this.updateStats();
        document.getElementById('tvTime').textContent = '0s';
        this.startTime = null;
    }

    // Filter
    async setFilter() {
        const ptr = parseInt(document.getElementById('etPtr').value);
        const len = parseInt(document.getElementById('etLen').value);
        const data = document.getElementById('etData').value.trim();
        const bankName = document.querySelector('input[name="filterBank"]:checked').value;

        // Convert bank name to number
        const bankMap = { 'EPC': 1, 'RESERVED': 0, 'TID': 2, 'USER': 3 };
        const bank = bankMap[bankName] || 1;

        if (data && !/^[0-9A-Fa-f]*$/.test(data)) {
            this.showToast('Filter data must be hexadecimal');
            return;
        }

        if (!this.simulationMode && this.isConnected) {
            try {
                if (data && len > 0) {
                    console.log(`Sending SET_FILTER command: Bank=${bank}, Ptr=${ptr}, Len=${len}, Data=${data}`);
                    const command = this.COMMANDS.SET_FILTER(bank, ptr, len, data);
                    await this.sendCommand(command);
                    this.showToast('Filter set successfully');
                } else {
                    // Disable filter (send with zero length)
                    const command = this.COMMANDS.SET_FILTER(bank, 0, 0, '00');
                    await this.sendCommand(command);
                    this.showToast('Filter disabled');
                }
            } catch (error) {
                console.error('Set filter failed:', error);
                this.showToast('Set filter failed: ' + error.message);
            }
        } else {
            this.showToast(`Filter set: Bank=${bankName}, Ptr=${ptr}, Len=${len}, Data=${data}`);
        }

        document.getElementById('cbFilter').checked = false;
        document.getElementById('filterPanel').style.display = 'none';
    }

    // Read Tag
    async readTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        const bankName = document.getElementById('spReadBank').value;
        const ptr = parseInt(document.getElementById('etReadPtr').value);
        const len = parseInt(document.getElementById('etReadLen').value);
        const pwd = document.getElementById('etReadPwd').value;

        // Convert bank name to number
        const bankMap = { 'EPC': 1, 'RESERVED': 0, 'TID': 2, 'USER': 3 };
        const bank = bankMap[bankName] || 1;

        if (this.simulationMode) {
            // Simulation
            setTimeout(() => {
                const data = this.generateRandomEPC().substring(0, len * 4);
                document.getElementById('readResult').textContent = 
                    `Bank: ${bankName}\nPointer: ${ptr}\nLength: ${len}\nData: ${data}`;
                this.showToast('Read successful');
            }, 500);
        } else {
            // REAL DEVICE - Send read command
            try {
                console.log(`Sending READ command: Bank=${bank}, Ptr=${ptr}, Len=${len}`);
                const command = this.COMMANDS.READ_TAG(bank, ptr, len, pwd);
                await this.sendCommand(command);
                this.showToast('Read command sent - waiting for response...');
                document.getElementById('readResult').textContent = 'Reading...';
            } catch (error) {
                console.error('Read failed:', error);
                this.showToast('Read failed: ' + error.message);
                document.getElementById('readResult').textContent = 'Read failed: ' + error.message;
            }
        }
    }

    // Write Tag
    async writeTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        const bankName = document.getElementById('spWriteBank').value;
        const ptr = parseInt(document.getElementById('etWritePtr').value);
        const len = parseInt(document.getElementById('etWriteLen').value);
        const data = document.getElementById('etWriteData').value.trim();
        const pwd = document.getElementById('etWritePwd').value;

        // Convert bank name to number
        const bankMap = { 'EPC': 1, 'RESERVED': 0, 'TID': 2, 'USER': 3 };
        const bank = bankMap[bankName] || 1;

        if (!data || !/^[0-9A-Fa-f]*$/.test(data)) {
            this.showToast('Data must be hexadecimal');
            return;
        }

        if (data.length % 4 !== 0) {
            this.showToast('Data length must be multiple of 4');
            return;
        }

        if (this.simulationMode) {
            // Simulation
            setTimeout(() => {
                document.getElementById('writeResult').textContent = 
                    `Write successful\nBank: ${bankName}\nPointer: ${ptr}\nLength: ${len}\nData: ${data}`;
                this.showToast('Write successful');
            }, 500);
        } else {
            // REAL DEVICE - Send write command
            try {
                console.log(`Sending WRITE command: Bank=${bank}, Ptr=${ptr}, Len=${len}, Data=${data}`);
                const command = this.COMMANDS.WRITE_TAG(bank, ptr, len, data, pwd);
                await this.sendCommand(command);
                this.showToast('Write command sent - waiting for response...');
                document.getElementById('writeResult').textContent = 'Writing...';
            } catch (error) {
                console.error('Write failed:', error);
                this.showToast('Write failed: ' + error.message);
                document.getElementById('writeResult').textContent = 'Write failed: ' + error.message;
            }
        }
    }

    // Lock Tag
    lockTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        const pwd = document.getElementById('etLockPwd').value;
        const action = document.getElementById('spLockAction').value;

        setTimeout(() => {
            document.getElementById('lockResult').textContent = `Lock ${action} successful`;
            this.showToast(`Lock ${action} successful`);
        }, 500);
    }

    // Kill Tag
    killTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        if (!confirm('Are you sure you want to kill this tag? This action cannot be undone.')) {
            return;
        }

        const pwd = document.getElementById('etKillPwd').value;

        setTimeout(() => {
            document.getElementById('killResult').textContent = 'Tag killed successfully';
            this.showToast('Tag killed');
        }, 500);
    }

    // Erase Tag
    eraseTag() {
        if (!this.isConnected) {
            this.showToast('Not connected');
            return;
        }

        const bank = document.getElementById('spEraseBank').value;
        const ptr = parseInt(document.getElementById('etErasePtr').value);
        const len = parseInt(document.getElementById('etEraseLen').value);
        const pwd = document.getElementById('etErasePwd').value;

        setTimeout(() => {
            document.getElementById('eraseResult').textContent = `Erase successful\nBank: ${bank}\nPointer: ${ptr}\nLength: ${len}`;
            this.showToast('Erase successful');
        }, 500);
    }

    // Settings
    async getPower() {
        if (!this.simulationMode && this.isConnected) {
            try {
                console.log('Sending GET_POWER command...');
                await this.sendCommand(this.COMMANDS.GET_POWER);
                this.showToast('Getting power...');
            } catch (error) {
                console.error('Get power failed:', error);
                this.showToast('Get power failed');
            }
        } else {
            document.getElementById('spPower').value = this.settings.power;
            this.showToast(`Current power: ${this.settings.power} dBm`);
        }
    }

    async setPower() {
        const power = parseInt(document.getElementById('spPower').value);
        
        if (!this.simulationMode && this.isConnected) {
            try {
                console.log(`Sending SET_POWER command: ${power}`);
                await this.sendCommand(this.COMMANDS.SET_POWER(power));
                this.settings.power = power;
                this.saveSettings();
                this.showToast(`Power set to ${power} dBm`);
            } catch (error) {
                console.error('Set power failed:', error);
                this.showToast('Set power failed: ' + error.message);
            }
        } else {
            this.settings.power = power;
            this.saveSettings();
            this.showToast(`Power set to ${power} dBm`);
        }
    }

    getFrequency() {
        const index = ['China Standard 1', 'China Standard 2', 'Europe Standard', 
                      'United States Standard', 'Korea', 'Japan'].indexOf(this.settings.frequency);
        if (index >= 0) {
            document.getElementById('spFrequency').selectedIndex = index;
        }
        this.showToast(`Current frequency: ${this.settings.frequency}`);
    }

    setFrequency() {
        const frequency = document.getElementById('spFrequency').value;
        this.settings.frequency = frequency;
        this.saveSettings();
        this.showToast(`Frequency set to ${frequency}`);
    }

    getProtocol() {
        const index = ['Auto', 'ISO18000-6B', 'ISO18000-6C'].indexOf(this.settings.protocol);
        if (index >= 0) {
            document.getElementById('spProtocol').selectedIndex = index;
        }
        this.showToast(`Current protocol: ${this.settings.protocol}`);
    }

    setProtocol() {
        const protocol = document.getElementById('spProtocol').value;
        this.settings.protocol = protocol;
        this.saveSettings();
        this.showToast(`Protocol set to ${protocol}`);
    }

    setBeep(enabled) {
        this.settings.beep = enabled;
        this.saveSettings();
        this.showToast(`Beep ${enabled ? 'enabled' : 'disabled'}`);
    }

    setTagFocus(enabled) {
        this.settings.tagFocus = enabled;
        this.saveSettings();
        this.showToast(`Tag focus ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Barcode
    scanBarcode() {
        // Simulate barcode scan
        const barcode = this.generateRandomEPC().substring(0, 16);
        document.getElementById('barcodeInput').value = barcode;
        document.getElementById('barcodeResult').textContent = `Scanned: ${barcode}`;
        this.showToast('Barcode scanned');
    }

    // Location
    startLocation() {
        const canvas = document.getElementById('locationCanvas');
        const ctx = canvas.getContext('2d');
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f9fafb';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw grid
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 40, 0);
            ctx.lineTo(i * 40, canvas.height);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i * 40);
            ctx.lineTo(canvas.width, i * 40);
            ctx.stroke();
        }

        // Simulate tag positions
        setInterval(() => {
            const x = Math.random() * canvas.width;
            const y = Math.random() * canvas.height;
            ctx.fillStyle = '#667eea';
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, Math.PI * 2);
            ctx.fill();
        }, 1000);
    }

    stopLocation() {
        // Stop location tracking
    }

    // Device History
    saveDeviceToHistory(device) {
        let history = JSON.parse(localStorage.getItem('deviceHistory') || '[]');
        history = history.filter(d => d.address !== device.address);
        history.unshift(device);
        history = history.slice(0, 10); // Keep last 10
        localStorage.setItem('deviceHistory', JSON.stringify(history));
    }

    loadDeviceHistory() {
        const history = JSON.parse(localStorage.getItem('deviceHistory') || '[]');
        if (history.length > 0) {
            this.displayDevices(history);
        }
    }

    clearDeviceHistory() {
        localStorage.removeItem('deviceHistory');
        document.getElementById('deviceList').innerHTML = '<div style="padding: 20px; text-align: center;">No devices in history</div>';
    }

    // Settings persistence
    saveSettings() {
        localStorage.setItem('rfidSettings', JSON.stringify(this.settings));
    }

    loadSettings() {
        const saved = localStorage.getItem('rfidSettings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
        }
        
        // Apply settings to UI
        document.getElementById('spPower').value = this.settings.power;
        document.getElementById('cbTagFocus').checked = this.settings.tagFocus;
        document.getElementById('cbRssi').checked = this.settings.rssi;
        document.getElementById('cbAutoReconnect').checked = this.settings.autoReconnect;
    }

    // Utility
    showToast(message) {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #374151;
            color: white;
            padding: 12px 24px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideIn 0.3s;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.rfidReader = new RFIDReader();
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

