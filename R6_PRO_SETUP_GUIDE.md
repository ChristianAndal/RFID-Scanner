# R6 PRO UHF Sealed Reader Setup Guide

## Quick Setup Steps

### Step 1: Power On Your R6 PRO
1. Press and hold the power button until the device powers on
2. The device should show up in Bluetooth as **"Nordic_UART_CW"**

### Step 2: Connect via Web App

1. **Open the RFID Scanner app** in Chrome, Edge, or Opera browser
   - Make sure you're on HTTPS (Vercel provides this automatically)

2. **Click "Search" or "Connect"** button

3. **Click "Scan for Devices"**

4. **Look for your device:**
   - The R6 PRO should appear as **"Nordic_UART_CW"** or similar
   - Select it from the browser's Bluetooth device picker

5. **If you see "Service UUID Not Found":**
   - The app will automatically show you all available services
   - Look for service UUID: `0000fff0-0000-1000-8000-00805f9b34fb`
   - OR: `6e400001-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART Service)
   - Click on the correct service

6. **If you see "Characteristic UUID Not Found":**
   - The app will show all available characteristics
   - Look for characteristic UUID: `0000fff1-0000-1000-8000-00805f9b34fb`
   - OR: `6e400003-b5a3-f393-e0a9-e50e24dcca9e` (Nordic UART RX)
   - Click on the characteristic that supports "Notify" property

### Step 3: Test Connection

Once connected:
1. Go to the **"Inventory"** tab
2. Click **"Loop Read"**
3. Hold an RFID tag near the reader
4. Tag should appear in the list!

## Common UUIDs for R6 PRO

The R6 PRO typically uses one of these:

**Option 1 (Standard RFID Service):**
- Service UUID: `0000fff0-0000-1000-8000-00805f9b34fb`
- Characteristic UUID: `0000fff1-0000-1000-8000-00805f9b34fb`

**Option 2 (Nordic UART Service):**
- Service UUID: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- Characteristic UUID (RX/Notify): `6e400003-b5a3-f393-e0a9-e50e24dcca9e`
- Characteristic UUID (TX/Write): `6e400002-b5a3-f393-e0a9-e50e24dcca9e`

## Troubleshooting

### Device Not Showing Up
- Make sure the R6 PRO is powered on
- Ensure Bluetooth is enabled on your device
- The device name should be "Nordic_UART_CW"
- Try moving the device closer

### Connection Fails
- The app will show available services and characteristics
- Select the correct ones from the list
- Your selections will be saved for future connections

### Connected But No Tags Reading
- Check that you're using the correct characteristic (must support Notify)
- The command protocol might be different - check console for errors
- Make sure you're sending the right commands for R6 PRO

## Need Help?

1. Check the browser console (F12) for detailed error messages
2. The app will automatically discover and show available services/characteristics
3. Select the correct UUIDs from the lists provided
4. Your settings will be saved automatically

Good luck with your R6 PRO connection! 🎉

