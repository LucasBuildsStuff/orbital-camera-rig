# orbital-camera-rig
Web App to control a Stepper Motor with ESP32, built with C++, JS, HTML, CSS

## Warning: Bugs
This software is still in a very prototype stage. There are lots of things I learnt while building it and my skills are far from **"ThePrimeagen"**.  
  
Known Bugs:
- The degrees displayed is off by 5-10 degrees per complete rotation. It is worse the faster you rotate.
- Some microstepping fractions had mixed results
- Sometime you have to hit *Stop* twice as the incoming WebSocket message seems to block the event
- *-360* degrees instead of *0* degrees in counter clockwise

## Tested Hardware and Environment
This Software was created for an ESP32 purchased off amazon: *"KeeYees ESP32 Development Board 2.4 GHz Dual Core WLAN WiFi + Bluetooth 2-in-1 Microcontroller ESP-WROOM-32 Chip for Arduino"*

This Software was built to be used with VS Code and [PlatformIO](https://platformio.org/)

This repo includes 3 other repositories:
1. [ESPAsyncWebServer](https://github.com/me-no-dev/ESPAsyncWebServer) *un-modified code*
2. [AsyncTCP](https://github.com/me-no-dev/AsyncTCP) *un-modified code*
3. [js-range-slider](https://github.com/tadejf84/js-range-slider) *modified code*

## Getting started

### 1. Clone the project repo:

```bash
git clone https://github.com/LucasBuildsStuff/orbital-camera-rig.git
```
### 2. Open orbital-camera-rig project folder on your local machine from VS Code with PlatformIO extension installed

VS Code: File > Open Folder > orbital-camera-rig

### 3. Create Access Point or Connect to Local Wifi

By default the ESP32 will create an Access Point you can connect to with the following credentials:
```cpp
//Access Point Configuration
const char *ssid_AP = "OrbitalCamera";
const char *password_AP = "123456789";

IPAddress local_ip(192, 168, 0, 1);
IPAddress gateway(192, 168, 0, 1);
IPAddress subnet(255, 255, 255, 0);
```
  
If you would rather the ESP32 connects to your local wifi network, modify the following:

1. Open **main.cpp** file
2. Enter your Wi-Fi network credentials here:
```cpp
// Wifi Connection Information
const char *ssid = "YOUR WIFI NETWORK NAME";
const char *password = "YOUR WIFI NETWORK PASSWORD";
```
3. Change AP_CONNECTION to false:
```cpp
// Set Connection type
#define AP_CONNECTION false
```

### 4. Upload code to your board

[PlatformIO Tutorial](https://randomnerdtutorials.com/vs-code-platformio-ide-esp32-esp8266-arduino/#5)

### 5. Open WebApp

**Access Point:**  
1. Connect Computer or Phone to ESP32's Wifi Network, default:
```cpp
//Access Point Configuration
const char *ssid_AP = "OrbitalCamera";
const char *password_AP = "123456789";
```
2. Navigate on Internet Browser to IP address, default:
```cpp
IPAddress local_ip(192, 168, 0, 1);
```
**Local Wifi Connection:**  
1. Connect Computer or Phone to your local wifi, same as below:
```cpp
// Wifi Connection Information
const char *ssid = "YOUR WIFI NETWORK NAME";
const char *password = "YOUR WIFI NETWORK PASSWORD";
```
2. Navigate on Internet Browser to IP address, default:
```cpp
IPAddress local_ip(192, 168, 0, 1);
```
