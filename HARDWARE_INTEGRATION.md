# Hardware Integration Guide

## Connecting Real RFID Devices

This guide explains how to connect actual Bluetooth RFID readers to the web application.

## Quick Answer: Will It Work?

**Short answer**: Maybe - it depends on your specific RFID device.

**It WILL work if**:
- Your device supports **Bluetooth Low Energy (BLE)**, not Classic Bluetooth
- The device exposes GATT services
- The service UUID is `0000fff0-0000-1000-8000-00805f9b34fb` (from the Android app)

**It WON'T work if**:
- Your device only supports Classic Bluetooth
- Your device uses proprietary Bluetooth profiles not supported by Web Bluetooth

## Step-by-Step Integration

### Step 1: Enable Real Hardware Mode

Edit `app.js` line 18:

```javascript
this.simulationMode = false; // Change from true
```

### Step 2: Test Connection

1. Open the app in **Chrome, Edge, or Opera** (not Firefox/Safari)
2. Ensure you're using **HTTPS** or **localhost**
3. Power on your RFID reader
4. Click "Search" in the app
5. Look for your device in the Bluetooth pairing dialog

### Step 3: Check Browser Console

Open Developer Tools (F12) → Console tab to see:
- Connection attempts
- Data received from device
- Any error messages

### Step 4: Implement Device Protocol

The connection framework is ready, but you need to implement your device's specific command protocol.

## Understanding the Protocol

The Android app uses the `RFIDWithUHFBLE` library which sends specific byte sequences to the RFID reader. You'll need to:

### 1. Find Command Bytes

From the Android SDK documentation or by reverse-engineering the `.aar` library, determine:
- Start inventory command
- Stop inventory command
- Read tag command
- Write tag command
- Set power command
- etc.

### 2. Implement Commands

Example structure (you need actual command bytes from your device):

```javascript
// In app.js, add command definitions
const COMMANDS = {
    START_INVENTORY: new Uint8Array([0xA0, 0x04, 0x01, 0x89, 0x01]),
    STOP_INVENTORY: new Uint8Array([0xA0, 0x03, 0x02, 0x01, 0xCC]),
    GET_POWER: new Uint8Array([0xA0, 0x03, 0x03, 0x01, 0xBB]),
    // Add more commands...
};

// Modify inventoryLoop() to send actual commands
async inventoryLoop() {
    if (!this.isConnected || this.isScanning) return;
    
    this.isScanning = true;
    this.updateUI();
    
    try {
        await this.sendCommand(COMMANDS.START_INVENTORY);
    } catch (error) {
        console.error('Failed to start inventory:', error);
        this.stopInventory();
    }
}
```

### 3. Parse Responses

Implement `handleNotification()` to parse data from your device:

```javascript
handleNotification(event) {
    const value = event.target.value;
    const buffer = new Uint8Array(value.buffer);
    
    console.log('Raw data:', Array.from(buffer).map(b => 
        b.toString(16).padStart(2, '0')).join(' '));
    
    // Parse based on your device's response format
    // Example (adjust to your device):
    if (buffer[0] === 0xA0) { // Response header
        const cmd = buffer[2];
        const dataLen = buffer[3];
        
        if (cmd === 0x89) { // Tag data response
            const epc = Array.from(buffer.slice(4, 4 + dataLen))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('')
                .toUpperCase();
            
            this.addTagToList({
                epc: epc,
                tid: '',
                rssi: '',
                user: ''
            });
        }
    }
}
```

## Testing Checklist

- [ ] Device appears in Bluetooth scan
- [ ] Connection establishes without errors
- [ ] Console shows "Connection successful"
- [ ] Console shows received data when reader scans tags
- [ ] Tag EPC appears in the tag list
- [ ] Commands trigger expected device behavior

## Troubleshooting

### "Web Bluetooth API not supported"
- Use Chrome, Edge, or Opera
- Update browser to latest version

### "No devices found"
- Device must be powered on
- Device must be in pairing/discoverable mode
- Device must support BLE (not just Classic Bluetooth)
- Try moving closer to the device

### "Connection failed"
- Check service UUID matches your device
- Some devices require pairing in OS Bluetooth settings first
- Check browser console for specific error

### "Connected but no data"
- Implement `sendCommand()` with correct command bytes
- Check `handleNotification()` is parsing data correctly
- Verify device is actually scanning tags
- Check console for received data

### "Device uses Classic Bluetooth"
❌ **Web Bluetooth only supports BLE devices**. Classic Bluetooth is not supported by Web Bluetooth API. You would need:
- Different hardware that supports BLE
- OR a native desktop application (Electron, etc.)
- OR an Android/iOS app instead

## Alternative: Hybrid Approach

If your device doesn't work with Web Bluetooth:

1. **Keep simulation mode** for UI demonstration
2. **Create a native bridge**: Small native app that connects to the device and exposes a WebSocket/HTTP API
3. **Connect web app to the bridge** instead of directly to device

Example architecture:
```
[RFID Device] <--Bluetooth--> [Native Bridge App] <--WebSocket--> [Web App]
```

## Getting Device Protocol Information

Contact your RFID device manufacturer for:
- Complete command protocol documentation
- BLE GATT service specifications
- Example code for BLE integration
- Confirm if Web Bluetooth is supported

## Need Help?

Check the Android app's library files:
- `uhf-ble-demo/app/libs/cwDeviceAPI20210929.aar`
- This contains the actual protocol implementation
- You may need to decompile it to understand command structures

