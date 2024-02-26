var targetUrl = `ws://${window.location.hostname}/ws`;
var websocket;
window.addEventListener('load', onLoad);

function onLoad() {
  initializeSocket();
}
window.onbeforeunload = function() {
  websocket.onclose = function () {}; // disable onclose handler first
  websocket.close();
};

function initializeSocket() {
  console.log('Trying to open WebSocket connection to ESP32...');
  websocket = new WebSocket(targetUrl);
  websocket.onopen = onOpen;
  websocket.onclose = onClose;
  websocket.onmessage = onMessage;
}
function onOpen(event) {
  console.log('Connection opened');
  //getReadings();
}
function onClose(event) {
  console.log('Connection closed');
  setTimeout(initializeSocket, 2000);
}
function onMessage(event) {
  console.log("WebSocket message received:", event);
  // console.log(event.data);

  let msgObject = JSON.parse(event.data);

  //Verify Object has  correct properties
  if ( ! Object.hasOwn(msgObject, 'type') || ! Object.hasOwn(msgObject, 'data')) {
    return;
  }

  if (msgObject.type == "status") {
    websocketUpdateStatusSlider(msgObject.data);
  } else if (msgObject.type == "error") {
    alertErrorMessage(msgObject.data);
  }
  else if (msgObject.type == "load") {
    loadProgramStatus(msgObject.data);
  }

}

/**
 * Send Message through Web Socket to ESP32
 * 
 * @param {*} message to send
 * @param {boolean} [req_stringify=false] if message is a JS Object that requires JSON.stringify()
 */
function sendMessage(message, req_stringify=false) {
  if (req_stringify) {
    message = JSON.stringify(message); 
  }
  websocket.send(message);
}