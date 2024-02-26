#include <Arduino.h>
#include <WiFi.h>
#include <AsyncTCP.h>
#include <ESPAsyncWebServer.h>
#include "SPIFFS.h"
#include <Arduino_JSON.h>
#include <Preferences.h>

// Set Preferences Variables
#define RW_MODE false
#define RO_MODE true
Preferences preferences;

// Set Connection type
#define AP_CONNECTION true

// Wifi Connection Information
const char *ssid = "YOUR WIFI NETWORK NAME";
const char *password = "YOUR WIFI NETWORK PASSWORD";

//Access Point Configuration
const char *ssid_AP = "OrbitalCamera";
const char *password_AP = "123456789";

IPAddress local_ip(192, 168, 0, 1);
IPAddress gateway(192, 168, 0, 1);
IPAddress subnet(255, 255, 255, 0);

// Web Socket Variables
AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

//Void Loop Timer Variables
unsigned long lastTime = 0;
unsigned long timerDelay = 1000;
int blinkLEDState = LOW;

//Send Notifications Timer Variable to limit to 5-10 per second
unsigned long lastMessageTime = 0;
unsigned long messageDelay = 200;

// Single Step Timer variables
unsigned long prevStepTime = 0;
unsigned long timeBetweenSteps = 100000;

// Json Variable to Hold Settings
JSONVar settings;
JSONVar errorMessage;

//Set Program Running Variables
bool isProgramRunning = false;
bool isProgramPaused = false;
#define CW LOW
#define CCW HIGH
JSONVar programValues;
unsigned long stepCounter = 0;
int directionState = CW;
double currentRadians = 0.0;

// Set Auto Program Values
unsigned long autoStepsRequired = 0;
unsigned long autoTimeRequired = 0;
// unsigned long autoTimeStart = 0;
double autoTotalRadians = 0.0;

//Output Pins
int DIRECTION_PIN;
int STEPPER_PIN;
int LED_STATUS_PIN;
int LED_STATUS_2_PIN;
int MICROSTEP_1_PIN;
int MICROSTEP_2_PIN;
int MICROSTEP_3_PIN;

// Function to correctly select Microstep Resolution from drop down
String getMicrostepDOM(int value)
{
  int microstepRes = settings["microstep-res"];

  if (microstepRes == value)
  {
    return "selected='selected'";
  }
  else
  {
    return "";
  }
}

// Set the correct microstep pin states on the A4988
void setMicrostepPinStates()
{
  int microstepRes = settings["microstep-res"];

  if (microstepRes == 1)
  {
    digitalWrite(MICROSTEP_1_PIN, LOW);
    digitalWrite(MICROSTEP_2_PIN, LOW);
    digitalWrite(MICROSTEP_3_PIN, LOW);
  }
  else if (microstepRes == 2)
  {
    digitalWrite(MICROSTEP_1_PIN, HIGH);
    digitalWrite(MICROSTEP_2_PIN, LOW);
    digitalWrite(MICROSTEP_3_PIN, LOW);
  }
  else if (microstepRes == 4)
  {
    digitalWrite(MICROSTEP_1_PIN, LOW);
    digitalWrite(MICROSTEP_2_PIN, HIGH);
    digitalWrite(MICROSTEP_3_PIN, LOW);
  }
  else if (microstepRes == 8)
  {
    digitalWrite(MICROSTEP_1_PIN, HIGH);
    digitalWrite(MICROSTEP_2_PIN, HIGH);
    digitalWrite(MICROSTEP_3_PIN, LOW);
  }
  else if (microstepRes == 16)
  {
    digitalWrite(MICROSTEP_1_PIN, HIGH);
    digitalWrite(MICROSTEP_2_PIN, HIGH);
    digitalWrite(MICROSTEP_3_PIN, HIGH);
  }
}

//Processor that replaces values in HTML index.html
String processor(const String &var)
{
  String status = "";
  Serial.println(var);
  // Gear Ratios
  if (var == "DRIVER_GEAR")
  {
    int a_int = settings["driver-gear"];
    return String(a_int);
  }
  else if (var == "DRIVEN_GEAR")
  {
    int b_int = settings["driven-gear"];
    return String(b_int);
  }
  // Stepper Motor Steps
  else if (var == "STEPPER_STEPS")
  {
    int steps_int = settings["stepper-steps"];
    return String(steps_int);
  }
  //Micro Steps
  else if (var == "MICROSTEP_FULL")
  {
    return getMicrostepDOM(1);
  }
  else if (var == "MICROSTEP_HALF")
  {
    return getMicrostepDOM(2);
  }
  else if (var == "MICROSTEP_QUARTER")
  {
    return getMicrostepDOM(4);
  }
  else if (var == "MICROSTEP_EIGHTH")
  {
    return getMicrostepDOM(8);
  }
  else if (var == "MICROSTEP_SIXTEENTH")
  {
    return getMicrostepDOM(16);
  }
  // Stepper Motor Speed
  else if (var == "MANUAL_SPEED")
  {
    int speed_int = settings["manual-speed"];
    return String(speed_int);
  }
  // Stepper Motor GPIO
  else if (var == "STEPPER_GPIO")
  {
    int step_gpio_int = settings["stepper-gpio"];
    return String(step_gpio_int);
  }
  // LED 1 GPIO
  else if (var == "LED_1_GPIO")
  {
    int led_gpio_int = settings["led-1-gpio"];
    return String(led_gpio_int);
  }
  // LED 2 GPIO
  else if (var == "LED_2_GPIO")
  {
    int led_2_gpio_int = settings["led-2-gpio"];
    return String(led_2_gpio_int);
  }

  // DIRECTION GPIO
  else if (var == "DIRECTION_GPIO")
  {
    int dir_gpio_int = settings["direction-gpio"];
    return String(dir_gpio_int);
  }
  // LED 2 GPIO
  else if (var == "MS_1_GPIO")
  {
    int ms_1_gpio_int = settings["ms-1-gpio"];
    return String(ms_1_gpio_int);
  }
  // LED 2 GPIO
  else if (var == "MS_2_GPIO")
  {
    int ms_2_gpio_int = settings["ms-2-gpio"];
    return String(ms_2_gpio_int);
  }
  // LED 2 GPIO
  else if (var == "MS_3_GPIO")
  {
    int ms_3_gpio_int = settings["ms-3-gpio"];
    return String(ms_3_gpio_int);
  }
  return status;
}

//Send message to all clients through Web Socket
void notifyClients(String message)
{
  ws.textAll(message);
  Serial.println("WebSocket sent message: " + message);
}

// Calculate the time elapsed for Auto Mode by using Steps Completed / Steps Required
int calcTimeElapsed()
{
  if (strcmp(programValues["type"], "auto") == 0)
  {
    int timeElapsed = ((((double)stepCounter / (double)autoStepsRequired) * (double)autoTimeRequired) / 1000.00) + 0.5;

    return timeElapsed;
  }
  else
  {
    // otherwise skip calculation and return 0 for manual mode
    return 0;
  }
}

void updateCurrentRadians()
{
  int stepperSteps = settings["stepper-steps"];
  int microstepRes = settings["microstep-res"];
  int driverRatio = settings["driver-gear"];
  int drivenRatio = settings["driven-gear"];

  double totalSteps = ((double)stepperSteps * (double)microstepRes * (double)driverRatio) / (double)drivenRatio;
  double radiansPerStep = TWO_PI / totalSteps;

  currentRadians = radiansPerStep * stepCounter;
}

// Send Current Rotation Status of Stepper
void sendStepInfo(boolean bypassTimer = false)
{
  if (((millis() - lastMessageTime) >= messageDelay) || bypassTimer)
  {
    lastMessageTime = millis();

    char buf[10];
    dtostrf(currentRadians, 8, 6, buf);

    //Build JSON Message to send to Web Socket clients
    JSONVar stepInfoJSON;
    stepInfoJSON = programValues;

    const char *slider = programValues["type"];

    stepInfoJSON["type"] = "status";
    stepInfoJSON["data"]["type"] = slider;
    stepInfoJSON["data"]["pause_state"] = isProgramPaused;
    stepInfoJSON["data"]["program_state"] = isProgramRunning;
    stepInfoJSON["data"]["current_radians"] = buf;

    stepInfoJSON["data"]["time_elapsed"] = (strcmp(slider, "auto") == 0) ? calcTimeElapsed() : 0;

    String jsonString = JSON.stringify(stepInfoJSON);
    notifyClients(jsonString);
  }
}

// Send Signal to stepper driver to take a step
void singleStep()
{
  unsigned long currentMicros = micros();
  if ((currentMicros - prevStepTime) >= timeBetweenSteps)
  {
    prevStepTime = currentMicros;
    digitalWrite(STEPPER_PIN, HIGH);
    // Serial.println("STEP!");
    stepCounter++;
    updateCurrentRadians();
    sendStepInfo();
    digitalWrite(STEPPER_PIN, LOW);
  }
}

// Calculate required Step delay for manual Control steps
void setManualStepDelay()
{
  long stepperSteps = settings["stepper-steps"];
  long microstepRes = settings["microstep-res"];
  long driverRatio = settings["driver-gear"];
  long drivenRatio = settings["driven-gear"];
  long manualSpeedRPH = settings["manual-speed"];

  unsigned long stepsPerHour = (((double)stepperSteps * (double)microstepRes * (double)manualSpeedRPH * (double)driverRatio) / (double)drivenRatio) + 0.5;

  //3,600,000 milliseconds per hour, divide that by steps required, does truncate integer and create small deficit 0-8sec per 360 rotation
  //3,600,000,000 microseconds per hour, divide that by steps required, does truncate integer and create small deficit 0-8sec per 360 rotation
  double delayBetweenSteps = (3600000000.00 / (double)stepsPerHour);
  timeBetweenSteps = (unsigned long)delayBetweenSteps;

  Serial.print("Step Delay Microseconds: ");
  Serial.println(delayBetweenSteps);
}

// Calculate required Step delay for Automatic Control steps
void setAutoParam()
{
  long stepperSteps = settings["stepper-steps"];
  long microstepRes = settings["microstep-res"];
  long driverRatio = settings["driver-gear"];
  long drivenRatio = settings["driven-gear"];
  double degreesToRotate = programValues["data"]["value"];
  int duration = programValues["data"]["duration"];
  const char *uom = programValues["data"]["uom"];

  //ERROR / INVALID INPUT CHECKS
  // check for 0 degrees
  if (degreesToRotate == 0)
  {
    errorMessage["data"] = "Degrees to Rotate cannot be 0";
    errorMessage["status"] = true;
  }

  // check for 0 duration
  if (duration < 1)
  {
    errorMessage["data"] = "Duration must be at least 1 second";
    errorMessage["status"] = true;
  }

  //Calculate the duration in milliseconds
  unsigned long durationInMillis = 0UL;
  if (strcmp(uom, "seconds") == 0)
  {
    if (duration > 9999)
    {
      //Too large of a number
      errorMessage["data"] = "Max duration 9999 seconds";
      errorMessage["status"] = true;
    }
    else
    {
      durationInMillis = duration * 1000UL;
    }
  }
  else if (strcmp(uom, "minutes") == 0)
  {
    if (duration > 9999)
    {
      //Too large of a number
      errorMessage["data"] = "Max duration 9999 minutes";
      errorMessage["status"] = true;
    }
    else
    {
      durationInMillis = duration * 60UL * 1000UL;
    }
  }
  else if (strcmp(uom, "hours") == 0)
  {
    if (duration > 1000)
    {
      //Too large of a number
      errorMessage["data"] = "Max duration 1000 hours";
      errorMessage["status"] = true;
    }
    else
    {
      durationInMillis = duration * 60UL * 60UL * 1000UL;
    }
  }

  if (errorMessage["status"])
  {
    String jsonString = JSON.stringify(errorMessage);
    notifyClients(jsonString);
    errorMessage["status"] = false;
    return;
  }
  autoTimeRequired = durationInMillis;

  // Set autoTotalRadians to degreesToRotate in Radians
  autoTotalRadians = degreesToRotate * (PI / 180);

  //Calculate partial degrees to rotate
  double rotationDEC = degreesToRotate / 360.00;

  // Calculate the required steps to complete the partial rotation, add 0.5 for truncate rounding
  unsigned long totalSteps = (((double)stepperSteps * (double)microstepRes * rotationDEC * (double)driverRatio) / (double)drivenRatio) + 0.5;

  Serial.print("Stepper Steps: ");
  Serial.println(stepperSteps);
  Serial.print("MicroStep Resolution: ");
  Serial.println(microstepRes);
  Serial.print("Rotation as decimal: ");
  char buf[10];
  dtostrf(rotationDEC, 8, 6, buf);
  Serial.println(buf);
  Serial.print("Driver Ratio: ");
  Serial.println(driverRatio);
  Serial.print("Driven Ratio: ");
  Serial.println(drivenRatio);
  Serial.print("Steps Required: ");
  Serial.println(totalSteps);

  autoStepsRequired = totalSteps;

  //Total milliseconds divided by steps required, does truncate integer so added 0.5 to round to closest delay
  double delayBetweenSteps = ((double)durationInMillis / (double)totalSteps) * 1000.00;
  timeBetweenSteps = (unsigned long)delayBetweenSteps;

  Serial.print("Step Delay (double): ");
  Serial.println(delayBetweenSteps);
  Serial.print("Step Delay (long): ");
  Serial.println(timeBetweenSteps);
}

// Set direction, clockwise or counter clockwise is subjective depending on the orientation of the stepper
void setDirection()
{
  int direction = (strcmp(programValues["data"]["direction"], "clockwise") == 0) ? CW : CCW;

  //Check to see if direction has changed
  if (directionState != direction)
  {
    directionState = direction;
    stepCounter = 0;
  }

  digitalWrite(DIRECTION_PIN, directionState);
}

void stopProgram()
{
  //Make sure radians rotated closes out
  if ((strcmp(programValues["type"], "auto") == 0))
  {
    currentRadians = autoTotalRadians;
  }

  const char *tab = programValues["type"];

  // update program status to not running
  isProgramRunning = false;
  sendStepInfo(true);

  // turn off any program paused
  isProgramPaused = false;

  Serial.print("Steps Taken: ");
  Serial.println(stepCounter);

  //Reset step counter
  stepCounter = 0;

  //Build JSON Message to send to Web Socket clients
  JSONVar stopInfoJSON;
  stopInfoJSON["type"] = "status";
  stopInfoJSON["data"]["type"] = "stop";
  stopInfoJSON["data"]["tab"] = tab;
  String jsonString = JSON.stringify(stopInfoJSON);
  notifyClients(jsonString);
  // programValues = undefined;
}

void startProgram()
{
  // update program status to running
  isProgramRunning = true;
}

void manualMode(JSONVar msgObject)
{

  const char *action = msgObject["data"]["action"];

  //Set Action Program Values to msgObject Action
  programValues["data"]["action"] = action;

  // Set Program Values to msgObject

  if (strcmp(action, "stop") == 0)
  {
    Serial.println("Stop Manual Mode");
    stopProgram();
  }
  else if (strcmp(action, "play") == 0)
  {
    Serial.println("Play Manual Mode");
    //Set Program Values to msgObject
    programValues = msgObject;
    setManualStepDelay();
    setDirection();
    startProgram();
  }
  else if (strcmp(action, "pause") == 0)
  {
    Serial.println("Pause Manual Mode");
    isProgramPaused = true;
    sendStepInfo(true);
  }
}

void autoMode(JSONVar msgObject)
{
  const char *action = msgObject["data"]["action"];

  //Set Action Program Values to msgObject Action
  programValues["data"]["action"] = action;

  if (strcmp(action, "stop") == 0)
  {
    Serial.println("Stop Auto Mode");
    stopProgram();
  }
  else if (strcmp(action, "play") == 0)
  {
    if (!isProgramPaused)
    {
      //Set Program Values to msgObject
      programValues = msgObject;

      Serial.println("Play Auto Mode");
      setAutoParam();
      setDirection();
      startProgram();
    }
    else
    {
      //If program is paused then just remove paused state but do not set any new values
      isProgramPaused = false;
    }
  }
  else if (strcmp(action, "pause") == 0)
  {
    Serial.println("Pause Auto Mode");

    isProgramPaused = true;
    sendStepInfo(true);
  }
}

void saveSettings(JSONVar msgObject)
{

  //Save nested array as new JSON Var for ease of use
  JSONVar newSettings = msgObject["data"];

  //Start preference namespace connection
  preferences.begin("settings", RW_MODE);

  // Check if property exists and if it is within bounds
  if (newSettings.hasOwnProperty("driver-gear"))
  {
    int newDriverRatio = atoi(newSettings["driver-gear"]);
    if (newDriverRatio > 999)
    {
      newDriverRatio = 999;
    }
    else if (newDriverRatio < 1)
    {
      newDriverRatio = 1;
    }
    preferences.putUShort("driver-gear", newDriverRatio);
    settings["driver-gear"] = newDriverRatio;
  }

  if (newSettings.hasOwnProperty("driven-gear"))
  {
    int newDrivenRatio = atoi(newSettings["driven-gear"]);
    if (newDrivenRatio > 999)
    {
      newDrivenRatio = 999;
    }
    else if (newDrivenRatio < 1)
    {
      newDrivenRatio = 1;
    }
    preferences.putUShort("driven-gear", newDrivenRatio);
    settings["driven-gear"] = newDrivenRatio;
  }

  if (newSettings.hasOwnProperty("stepper-steps"))
  {
    int newStepperSteps = atoi(newSettings["stepper-steps"]);
    if (newStepperSteps > 3200)
    {
      newStepperSteps = 3200;
    }
    else if (newStepperSteps < 90)
    {
      newStepperSteps = 90;
    }
    preferences.putUShort("stepper-steps", newStepperSteps);
    settings["stepper-steps"] = newStepperSteps;
  }

  if (newSettings.hasOwnProperty("microstep-res"))
  {
    // Array of Allowed Microstep Resolution Values
    int allowedRes[5] = {1, 2, 4, 8, 16};

    int newMicroRes = atoi(newSettings["microstep-res"]);
    if (newMicroRes > 16)
    {
      newMicroRes = 16;
    }
    else if (newMicroRes < 1)
    {
      newMicroRes = 1;
    }

    //Only Save if valid Microstep Resolution
    for (int i = 0; i < 5; i++)
    {
      if (newMicroRes == allowedRes[i])
      {
        preferences.putUChar("microstep-res", newMicroRes);
        settings["microstep-res"] = newMicroRes;
      }
    }
  }

  if (newSettings.hasOwnProperty("manual-speed"))
  {
    int newManSpeed = atoi(newSettings["manual-speed"]);
    if (newManSpeed > 30)
    {
      newManSpeed = 30;
    }
    else if (newManSpeed < 1)
    {
      newManSpeed = 1;
    }
    preferences.putUChar("manual-speed", newManSpeed);
    settings["manual-speed"] = newManSpeed;
  }

  // Validate and Save GPIO Values
  // Array of Allowed GPIO Pins based on https://randomnerdtutorials.com/esp32-pinout-reference-gpios/
  int allowedGPIO[14] = {4, 13, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 32, 33};

  if (newSettings.hasOwnProperty("direction-gpio"))
  {
    int newDirGPIO = atoi(newSettings["direction-gpio"]);
    //Only Save if valid GPIO
    for (int i = 0; i < 14; i++)
    {
      if (newDirGPIO == allowedGPIO[i])
      {
        preferences.putUChar("direction-gpio", newDirGPIO);
        settings["direction-gpio"] = newDirGPIO;
      }
    }
  }
  if (newSettings.hasOwnProperty("stepper-gpio"))
  {
    int newStepGPIO = atoi(newSettings["stepper-gpio"]);
    //Only Save if valid GPIO
    for (int i = 0; i < 14; i++)
    {
      if (newStepGPIO == allowedGPIO[i])
      {
        preferences.putUChar("stepper-gpio", newStepGPIO);
        settings["stepper-gpio"] = newStepGPIO;
      }
    }
  }

  if (newSettings.hasOwnProperty("led-1-gpio"))
  {
    int newLED1GPIO = atoi(newSettings["led-1-gpio"]);
    //Only Save if valid GPIO
    for (int i = 0; i < 14; i++)
    {
      if (newLED1GPIO == allowedGPIO[i])
      {
        preferences.putUChar("led-1-gpio", newLED1GPIO);
        settings["led-1-gpio"] = newLED1GPIO;
      }
    }
  }

  if (newSettings.hasOwnProperty("led-2-gpio"))
  {
    int newLED2GPIO = atoi(newSettings["led-2-gpio"]);
    //Only Save if valid GPIO
    for (int i = 0; i < 14; i++)
    {
      if (newLED2GPIO == allowedGPIO[i])
      {
        preferences.putUChar("led-2-gpio", newLED2GPIO);
        settings["led-2-gpio"] = newLED2GPIO;
      }
    }
  }

  if (newSettings.hasOwnProperty("ms-1-gpio"))
  {
    int newMs1GPIO = atoi(newSettings["ms-1-gpio"]);
    //Only Save if valid GPIO
    for (int i = 0; i < 14; i++)
    {
      if (newMs1GPIO == allowedGPIO[i])
      {
        preferences.putUChar("ms-1-gpio", newMs1GPIO);
        settings["ms-1-gpio"] = newMs1GPIO;
      }
    }
  }

  if (newSettings.hasOwnProperty("ms-2-gpio"))
  {
    int newMs2GPIO = atoi(newSettings["ms-2-gpio"]);
    //Only Save if valid GPIO
    for (int i = 0; i < 14; i++)
    {
      if (newMs2GPIO == allowedGPIO[i])
      {
        preferences.putUChar("ms-2-gpio", newMs2GPIO);
        settings["ms-2-gpio"] = newMs2GPIO;
      }
    }
  }

  if (newSettings.hasOwnProperty("ms-3-gpio"))
  {
    int newMs3GPIO = atoi(newSettings["ms-3-gpio"]);
    //Only Save if valid GPIO
    for (int i = 0; i < 14; i++)
    {
      if (newMs3GPIO == allowedGPIO[i])
      {
        preferences.putUChar("ms-3-gpio", newMs3GPIO);
        settings["ms-3-gpio"] = newMs3GPIO;
      }
    }
  }
  //Set Microsteps on driver
  setMicrostepPinStates();

  //Close preference namespace connection
  preferences.end();
}

// Function to breakdown websocket message and assign to appropriate functions
void handleWebSocketMessage(void *arg, uint8_t *data, size_t len)
{
  AwsFrameInfo *info = (AwsFrameInfo *)arg;
  if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT)
  {
    data[len] = 0;
    char *message = (char *)data;

    // Decode JSON
    JSONVar msgObject = JSON.parse(message);

    // JSON.typeof(jsonVar) check to make sure it is of object type
    if (JSON.typeof(msgObject) != "object")
    {
      Serial.println("Parsing input failed!");
      return;
    }
    // myObject.hasOwnProperty(key) checks for required keys
    if (!msgObject.hasOwnProperty("type") || !msgObject.hasOwnProperty("data"))
    {
      Serial.println("Property missing!");
      return;
    }
    Serial.println(" ");
    Serial.print("Message Recieved: ");
    Serial.println(msgObject);
    Serial.println(" ");

    // Check the value of "type" for handling data of message
    if (strcmp(msgObject["type"], "manual") == 0)
    {
      manualMode(msgObject);
    }
    else if (strcmp(msgObject["type"], "auto") == 0)
    {
      autoMode(msgObject);
    }
    else if (strcmp(msgObject["type"], "settings") == 0)
    {
      saveSettings(msgObject);
    }
  }
}

void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client, AwsEventType type, void *arg, uint8_t *data, size_t len)
{
  switch (type)
  {
  case WS_EVT_CONNECT:
  {
    Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());

    //Build JSON Message to send to New Web Socket clients
    const char *mode = programValues["type"];
    //Get radians to string using dtostrf()
    char buf[10];
    dtostrf(currentRadians, 8, 6, buf);

    JSONVar loadStateJSON;
    loadStateJSON = programValues;
    loadStateJSON["type"] = "load";
    loadStateJSON["data"]["type"] = mode;
    loadStateJSON["data"]["program_state"] = isProgramRunning;
    loadStateJSON["data"]["pause_state"] = isProgramPaused;
    loadStateJSON["data"]["current_radians"] = buf;

    //Check if program is running before trying to get time elapsed
    if (isProgramRunning)
    {
      //Get time elapsed in seconds for auto mode
      int timeElapsed = calcTimeElapsed();
      loadStateJSON["data"]["time_elapsed"] = timeElapsed;
    }

    String jsonString = JSON.stringify(loadStateJSON);
    notifyClients(jsonString);

    break;
  }
  case WS_EVT_DISCONNECT:
    Serial.printf("WebSocket client #%u disconnected\n", client->id());
    break;
  case WS_EVT_DATA:
    handleWebSocketMessage(arg, data, len);
    break;
  case WS_EVT_PONG:
  case WS_EVT_ERROR:
    break;
  }
}

//Web Asset Route not found
void notFound(AsyncWebServerRequest *request)
{
  request->send(404, "text/plain", "Not found");
}

//Main Setup() runs once at start
void setup()
{
  Serial.begin(115200);

  errorMessage["status"] = false;
  errorMessage["type"] = "error";

  //Start or Open settings namespace
  preferences.begin("settings", RO_MODE);

  //Check if any Keys Exist exist, Only need to check 1 key to know if it has been initialized before
  bool prefInit = preferences.isKey("driver-gear");

  if (prefInit == false)
  {
    // This is the first time the ESP32 has been initialized, close Read Only Mode and open Read Write Mode
    preferences.end();
    preferences.begin("settings", RW_MODE);

    // Create Keys and store default values
    preferences.putUShort("driver-gear", 1);
    preferences.putUShort("driven-gear", 1);
    preferences.putUShort("stepper-steps", 200);
    preferences.putUChar("microstep-res", 4);
    preferences.putUChar("manual-speed", 30);
    preferences.putUChar("direction-gpio", 16);
    preferences.putUChar("stepper-gpio", 17);
    preferences.putUChar("led-1-gpio", 18);
    preferences.putUChar("led-2-gpio", 19);
    preferences.putUChar("ms-1-gpio", 21);
    preferences.putUChar("ms-2-gpio", 22);
    preferences.putUChar("ms-3-gpio", 23);
    // First time defaults created and stored, Close Read Write Mode and Open Read Only Mode
    preferences.end();
    preferences.begin("settings", RO_MODE);
  }

  //Assign settings values to JSON variable
  settings["driver-gear"] = preferences.getUShort("driver-gear");
  settings["driven-gear"] = preferences.getUShort("driven-gear");
  settings["stepper-steps"] = preferences.getUShort("stepper-steps");
  settings["microstep-res"] = preferences.getUChar("microstep-res");
  settings["manual-speed"] = preferences.getUChar("manual-speed");
  settings["direction-gpio"] = preferences.getUChar("direction-gpio");
  settings["stepper-gpio"] = preferences.getUChar("stepper-gpio");
  settings["led-1-gpio"] = preferences.getUChar("led-1-gpio");
  settings["led-2-gpio"] = preferences.getUChar("led-2-gpio");
  settings["ms-1-gpio"] = preferences.getUChar("ms-1-gpio");
  settings["ms-2-gpio"] = preferences.getUChar("ms-2-gpio");
  settings["ms-3-gpio"] = preferences.getUChar("ms-3-gpio");

  // Close Read Only Mode
  preferences.end();

  // Assign GPIO Pins
  DIRECTION_PIN = settings["direction-gpio"];
  STEPPER_PIN = settings["stepper-gpio"];
  LED_STATUS_PIN = settings["led-1-gpio"];
  LED_STATUS_2_PIN = settings["led-2-gpio"];
  MICROSTEP_1_PIN = settings["ms-1-gpio"];
  MICROSTEP_2_PIN = settings["ms-2-gpio"];
  MICROSTEP_3_PIN = settings["ms-3-gpio"];

  pinMode(DIRECTION_PIN, OUTPUT);
  pinMode(STEPPER_PIN, OUTPUT);
  pinMode(LED_STATUS_PIN, OUTPUT);
  pinMode(LED_STATUS_2_PIN, OUTPUT);
  pinMode(MICROSTEP_1_PIN, OUTPUT);
  pinMode(MICROSTEP_2_PIN, OUTPUT);
  pinMode(MICROSTEP_3_PIN, OUTPUT);

  //Set Microsteps on driver
  setMicrostepPinStates();

  //Initialize SPIFFS before trying to start server
  if (!SPIFFS.begin(true))
  {
    Serial.println("An Error has occurred while mounting SPIFFS");
    return;
  }

  // ***
  // *** Using AP_CONNECTION to toggle between access points and local wifi has not yet been tested 
  // ***
  // if Access Point Connection is set to false then use Local Wifi Connection Parameters
  if (AP_CONNECTION == false)
  {
    // Configures static IP address, NOT YET TESTED
    if (!WiFi.config(local_ip, gateway, subnet)) {
      Serial.println("STA Failed to configure");
    }

    //Connect to Local Wifi
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);
    Serial.println("Connecting to network...");
    int result = WiFi.waitForConnectResult();

    //if connection fails restart and exit esp32
    if (result != WL_CONNECTED)
    {

      Serial.println("Connection failed");

      WiFi.disconnect();
      int n = WiFi.scanNetworks();
      if (n == 0)
      {
        Serial.println("No networks found");
      }
      else
      {
        Serial.println("Networks found:");
        for (int i = 0; i < n; ++i)
        {
          // Print SSID and RSSI for each network found
          Serial.println(String(i + 1) + ": " + WiFi.SSID(i) + " (Strength: " + WiFi.RSSI(i) + ")");
          // Serial.println((WiFi.encryptionType(i) == WIFI_AUTH_OPEN)?" ":"*");
          delay(10000);
        }
      }
      ESP.restart();
      return;
    }
    else
    {
      // Print ESP Local IP Address
      Serial.println("IP Address: " + WiFi.localIP().toString());
      Serial.println("Connected successfully");
    }
  }
  else
  {
    //Create Access Point
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(local_ip, gateway, subnet);
    WiFi.softAP(ssid_AP, password_AP);

    Serial.print("[+] AP Created with IP Gateway ");
    Serial.println(WiFi.softAPIP());
  }

  //Initialize Websocket
  ws.onEvent(onWsEvent);
  server.addHandler(&ws);

  // Map Requests
  // Request Index
  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting index page...");
    request->send(SPIFFS, "/index.html", "text/html", false, processor);
  });

  // Request Style Sheets
  server.on("/css/style.css", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting style css...");
    request->send(SPIFFS, "/css/style.css", "text/css");
  });

  // Request JavaScript
  server.on("/script/socket.js", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting socket js...");
    request->send(SPIFFS, "/script/socket.js", "text/javascript");
  });

  server.on("/script/app.js", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting App js...");
    request->send(SPIFFS, "/script/app.js", "text/javascript");
  });

  server.on("/script/circular-slider.js", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting circular slider js...");
    request->send(SPIFFS, "/script/circular-slider.js", "text/javascript");
  });

  // Request Icons
  server.on("/favicon.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting favicon...");
    // request->send(SPIFFS, "/favicon.png", "image/x-icon", false, processor);
    request->send(SPIFFS, "/favicon.png", "image/png");
  });

  server.on("/img/manual.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting manual icon...");
    request->send(SPIFFS, "/img/manual.png", "image/png");
  });

  server.on("/img/timer.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting timer icon...");
    request->send(SPIFFS, "/img/timer.png", "image/png");
  });

  server.on("/img/settings.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting settings icon...");
    request->send(SPIFFS, "/img/settings.png", "image/png");
  });

  server.on("/img/info.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting info icon...");
    request->send(SPIFFS, "/img/info.png", "image/png");
  });

  server.on("/img/rotate-cw-play.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting rotate clockwise play icon...");
    request->send(SPIFFS, "/img/rotate-cw-play.png", "image/png");
  });

  server.on("/img/rotate-ccw-play.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting rotate counter clockwise play icon...");
    request->send(SPIFFS, "/img/rotate-ccw-play.png", "image/png");
  });

  server.on("/img/rotate-cw-pause.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting rotate clockwise pause icon...");
    request->send(SPIFFS, "/img/rotate-cw-pause.png", "image/png");
  });

  server.on("/img/rotate-ccw-pause.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting rotate counter clockwise pause icon...");
    request->send(SPIFFS, "/img/rotate-ccw-pause.png", "image/png");
  });

  server.on("/img/play.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting play icon...");
    request->send(SPIFFS, "/img/play.png", "image/png");
  });

  server.on("/img/pause.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting pause icon...");
    request->send(SPIFFS, "/img/pause.png", "image/png");
  });

  server.on("/img/stop.png", HTTP_GET, [](AsyncWebServerRequest *request) {
    Serial.println("Requesting stop icon...");
    request->send(SPIFFS, "/img/stop.png", "image/png");
  });

  server.onNotFound(notFound);
  server.begin();

  // Debugging Memory
  // Serial.print("getHeapSize: ");
  // Serial.println(ESP.getHeapSize());
  // Serial.print("getFreeHeap: ");
  // Serial.println(ESP.getFreeHeap());
  // Serial.print("getMinFreeHeap: ");
  // Serial.println(ESP.getMinFreeHeap());
  // Serial.print("getMaxAllocHeap: ");
  // Serial.println(ESP.getMaxAllocHeap());
}

void loop()
{

  // Clean up Web Socket Clients, Blink LED
  if ((millis() - lastTime) > timerDelay)
  {
    // if the LED is off turn it on and vice-versa:
    blinkLEDState = (blinkLEDState == LOW) ? HIGH : LOW;

    lastTime = millis();
    ws.cleanupClients();
  }

  //Check if program is running
  if (isProgramRunning)
  {
    if (strcmp(programValues["type"], "manual") == 0)
    {
      if (strcmp(programValues["data"]["action"], "play") == 0)
      {
        // Turn on LED status pin 1
        digitalWrite(LED_STATUS_PIN, HIGH);
        // Turn off LED status pin 2
        digitalWrite(LED_STATUS_2_PIN, LOW);

        //Stepper motor logic
        singleStep();
      }
      else if (strcmp(programValues["data"]["action"], "pause") == 0)
      {
        // Blink LED status pin 1
        digitalWrite(LED_STATUS_PIN, blinkLEDState);
      }
    }
    else if (strcmp(programValues["type"], "auto") == 0)
    {
      if (strcmp(programValues["data"]["action"], "play") == 0)
      {
        // Turn on LED status pin 1
        digitalWrite(LED_STATUS_PIN, HIGH);
        // Turn off LED status pin 2
        digitalWrite(LED_STATUS_2_PIN, LOW);

        if (stepCounter < autoStepsRequired)
        {
          //Stepper motor logic
          singleStep();
        }
        else
        {
          Serial.println("Steps Complete!");
          stopProgram();
        }
      }
      else if (strcmp(programValues["data"]["action"], "pause") == 0)
      {
        // Blink LED status pin 1
        digitalWrite(LED_STATUS_PIN, blinkLEDState);
      }
    }
  }
  else
  {
    // Turn off stepper pin and LED status pin 1
    digitalWrite(STEPPER_PIN, LOW);
    digitalWrite(LED_STATUS_PIN, LOW);

    // Turn on LED status pin 2
    digitalWrite(LED_STATUS_2_PIN, HIGH);
  }

  //Fix: https://github.com/espressif/arduino-esp32/issues/4348#issuecomment-695115885
  delay(1);
}