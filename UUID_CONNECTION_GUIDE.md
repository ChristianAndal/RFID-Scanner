# UUID Connection Guide - R6 PRO Reader

## Quick Fix: Auto-Discover is Now Automatic!

The app **automatically tries to find the correct UUIDs** when you connect. Here's what happens:

### ✅ Automatic Flow:

1. **You click "Scan for Devices"** and select your R6 PRO
2. **If default UUIDs don't match:**
   - App **automatically runs auto-discover** 🔍
   - It scans all services on your device
   - It finds characteristics with "Notify" capability
   - It connects automatically!

3. **If auto-discover succeeds:**
   - ✅ You're connected! No manual selection needed.

4. **If auto-discover fails:**
   - You'll see a list of available services
   - **Click on a service** from the list
   - Then **click on a characteristic** from that service
   - Done!

---

## What to Do When You See "Service UUID Not Found"

When you see this screen, **auto-discover has already tried** but couldn't find a match automatically. Here's what to do:

### Step 1: Look at the Available Services List

You'll see a list like:
- Service 1: `0000180a-0000-1000-8000-00805f9b34fb`
- Service 2: `0000fff0-0000-1000-8000-00805f9b34fb`
- Service 3: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`

### Step 2: Click on a Service

- **Try clicking on Service 2** first (the one with `fff0` in it)
- OR click on Service 3 (Nordic UART service)

### Step 3: Select a Characteristic

After clicking a service, you'll see characteristics:
- Look for one that shows **"Properties: Notify"** or **"Notify, Write"**
- **Click on that characteristic**

### Step 4: Done!

The app will connect using your selected service and characteristic. **Your selections are saved automatically** for next time!

---

## Alternative: Use the Auto-Discover Button

At the top of the error screen, there's a blue button:
- **🔍 Auto-Discover Service & Characteristic**
- Click it to try auto-discover again
- It will scan and try to connect automatically

---

## Common UUIDs for R6 PRO

Your R6 PRO might use:

**Option 1 (Most Common):**
- Service: `0000fff0-0000-1000-8000-00805f9b34fb`
- Characteristic: `0000fff1-0000-1000-8000-00805f9b34fb`

**Option 2 (Nordic UART):**
- Service: `6e400001-b5a3-f393-e0a9-e50e24dcca9e`
- Characteristic: `6e400003-b5a3-f393-e0a9-e50e24dcca9e`

**Option 3 (Device Info):**
- Service: `0000180a-0000-1000-8000-00805f9b34fb`
- Characteristic: Varies (click to see list)

---

## Tips

1. **Always look for characteristics with "Notify"** - that's what receives RFID tag data
2. **Your selections are saved** - once you connect successfully, it will remember for next time
3. **Don't worry about the error** - it's just asking you to pick from the available options
4. **Full UUIDs are shown** - no more truncated text, you can see everything

---

## Still Having Issues?

1. **Check the browser console (F12)** - it shows detailed logs
2. **Try clicking different services** - start with the ones that have "fff0" or "uart" in them
3. **Look for "Notify" in properties** - that's the characteristic you need

Good luck! 🎉

