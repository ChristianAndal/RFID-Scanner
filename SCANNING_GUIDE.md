# How to Scan for Nearby Bluetooth Devices

## Quick Start

1. **Open the app** in Chrome, Edge, or Opera
2. **Click "Search"** or "Connect" button (top right)
3. **Click "Scan for Devices"** button
4. Browser will show a dialog with **all nearby Bluetooth devices**
5. **Select your RFID reader** from the list
6. App will connect automatically

## Two Modes Available

### 🎮 Simulation Mode (Default)
- **What it does**: Shows fake devices for testing
- **How to use**: Just click "Search" → "Scan for Devices"
- **Displays**: 
  - RFID-Reader-001
  - RFID-Reader-002  
  - UHF-Reader-Pro
  - BT-RFID-A8F2
- **Signal strength**: Shows simulated signal strength
- **Great for**: Testing the UI without hardware

### 🔵 Real Bluetooth Mode
- **What it does**: Scans for actual nearby Bluetooth devices
- **How to enable**: Set `simulationMode = false` in `app.js` (line 18)
- **How to use**: Click "Scan for Devices"
- **Shows**: Browser's native Bluetooth device picker
- **Displays**: ALL nearby Bluetooth devices (RFID readers, phones, headphones, etc.)
- **You select**: Choose your RFID reader from the list

## What You'll See

### In Simulation Mode
```
┌─────────────────────────────────────┐
│  Found 4 devices - Click to connect│
├─────────────────────────────────────┤
│ RFID-Reader-001                     │
│ AA:BB:CC:DD:EE:01        📶 Strong │
├─────────────────────────────────────┤
│ RFID-Reader-002                     │
│ AA:BB:CC:DD:EE:02        📶 Weak   │
├─────────────────────────────────────┤
│ UHF-Reader-Pro                      │
│ AA:BB:CC:DD:EE:03        📶 Good   │
└─────────────────────────────────────┘
```

### In Real Bluetooth Mode

The browser shows its own dialog:
```
┌────────────────────────────────────┐
│  Bluetooth Device Pairing          │
├────────────────────────────────────┤
│  Select a device to pair with:     │
│                                     │
│  ○ UHF RFID Reader                │
│  ○ My Bluetooth Headphones         │
│  ○ Wireless Mouse                  │
│  ○ John's Phone                    │
│  ○ Smart Watch                     │
│                                     │
│       [Cancel]     [Pair]          │
└────────────────────────────────────┘
```

## Signal Strength Indicators

In simulation mode, devices show signal strength:
- 📶 **Strong** (green): RSSI > -60 dBm - Very close, excellent signal
- 📶 **Good** (orange): RSSI -60 to -70 dBm - Normal range, good signal  
- 📶 **Weak** (red): RSSI < -70 dBm - Far away, may have connection issues

## Scanning Tips

### ✅ For Best Results:

1. **Power on your RFID reader** before scanning
2. **Enable Bluetooth** on your computer
3. **Use supported browser** (Chrome, Edge, Opera)
4. **Be within range** (typically 10 meters / 30 feet)
5. **Put device in discoverable mode** if required
6. **Remove obstacles** between device and computer

### ⚠️ Common Issues:

**"No devices found"**
- Device may not be powered on
- Device may not be in pairing mode
- Device may be out of range
- Bluetooth may be off on your computer

**"Web Bluetooth not available"**
- Wrong browser (use Chrome/Edge/Opera, not Firefox/Safari)
- Page not served over HTTPS or localhost
- Bluetooth disabled in browser settings

**"Permission denied"**
- Browser blocked Bluetooth access
- Check browser permissions: chrome://settings/content/bluetooth
- Try reloading the page

## Filtering Devices

The app uses these filters to help find RFID readers:

```javascript
// Looks for devices with:
- Service UUID: 0000fff0-0000-1000-8000-00805f9b34fb
- Names starting with: "RFID", "UHF", "BT"
```

However, the browser's device picker will show **ALL nearby Bluetooth devices** so you can choose any device to connect to.

## Testing Without Hardware

Just use **simulation mode** (default):
- No real Bluetooth needed
- Works in ANY browser (even Firefox/Safari)
- Shows example RFID readers
- Perfect for UI testing and demos

## Advanced: Custom Device Filters

To only show specific devices, edit the `scanDevices()` function in `app.js`:

```javascript
const device = await navigator.bluetooth.requestDevice({
    filters: [
        { namePrefix: 'UHF' },      // Only show devices starting with "UHF"
        { namePrefix: 'RFID' },     // Or starting with "RFID"
        { services: [this.SERVICE_UUID] } // Or with this service
    ],
    optionalServices: [this.SERVICE_UUID]
});
```

Or to see ALL devices:
```javascript
const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [this.SERVICE_UUID]
});
```

## Browser Console Debugging

Open Developer Tools (F12) → Console to see:
```
Scanning for devices...
Found device: UHF-Reader-001
Connecting to GATT server...
Getting primary service...
Getting characteristic...
Starting notifications...
Connection successful
```

This helps diagnose connection issues.

