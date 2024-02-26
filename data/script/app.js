window.addEventListener('load', onLoad);

// instantiate manual status slider, auto input slider, and program status variables
let manualStatusSlider = createSlider("#manual-slider-target", "clockwise");
let autoInputSlider = createSlider("#auto-slider-target", "clockwise", true);
let program_is_running = false;
let program_is_paused = false;
let manualDirectionState = "clockwise";
let clicked_by_code = false;

function onLoad() {
    let loader_overlay = document.getElementById("loader-overlay");

    // START Add Event Listeners for footer menu
    let footer_icons = document.querySelectorAll(".footer .icon-wrapper a");
    let tabs = document.querySelectorAll(".tab");

    footer_icons.forEach(icon => {
        icon.addEventListener("click", () => {

            //prevent use of disabled buttons
            if (icon.classList.contains("disable-btn")) {
                return;
            }

            //Hide all tabs
            tabs.forEach(el => {
                hide(el);

                //Empty sliders target div and redraw sliders / legends
                const slider_target = el.querySelector(".slider-target");
                if (slider_target) {
                    slider_target.innerHTML = "";
                }
            });
            const active_tab = document.getElementById(icon.dataset.tab);
            //Show correct tab
            show(active_tab);

            //draw correct slider
            switch (icon.dataset.tab) {
                case "manual-tab":
                    manualStatusSlider.draw();
                    break;
                case "auto-tab":
                    autoInputSlider.draw();
                    break;
                default:
                    break;
            }

            //remove selected icons
            footer_icons.forEach(el => {
                el.classList.remove("selected");
            });

            //Style Selected Tab Icon
            icon.classList.add("selected");
        });
    });
    // END Add Event Listeners for footer menu

    // draw manual status slider
    manualStatusSlider.draw();

    // draw auto input slider
    autoInputSlider.draw();

    //START Add event listeners for Manual control tab
    let manual_rotate_btns = document.querySelectorAll("#manual-tab .manual-rotate-btn a");
    let manual_button_container = document.getElementById("manual-button-container");

    manual_button_container.addEventListener("click", (el) => {
        let el_parent = el.target.parentElement;
        let el_control = el_parent.dataset.control ?? false;
        let el_action = el_parent.dataset.action ?? false;

        // Send Websocket Message?
        let send_message = false;

        switch (el_control) {
            case "counter-clockwise":
            case "clockwise":
                //Hide the button container
                hide(el_parent);

                if (el_action == "play") {
                    //Reset all rotate buttons if play is hit
                    manual_rotate_btns.forEach(btn => {
                        if (btn.dataset.action == "play" && btn.dataset.control != el_control) {
                            show(btn);
                        }
                        else if (btn.dataset.action == "pause" && btn.dataset.control == el_control) {
                            show(btn);
                        }
                        else if (btn.dataset.action == "pause" && btn.dataset.control != el_control) {
                            hide(btn);
                        }

                    });
                    // Change opacity and disable all footer menu icons
                    footer_icons.forEach(icon => {
                        icon.classList.add("disable-btn");
                    });

                    // Only redraw slider if changing directions
                    if (manualDirectionState != el_control) {
                        //Remove old slider
                        document.getElementById("manual-slider-target").innerHTML = "";

                        //instantiate and draw manual status slider with correct direction
                        manualStatusSlider = createSlider("#manual-slider-target", el_control, false);
                        manualStatusSlider.draw();

                        manualDirectionState = el_control;
                    }

                    //Change bg or fg slider color from purple to yellow depending on direction
                    let status_slider = document.querySelector('#manual-slider-target .statusSlider[data-slider="0"]');

                    if (el_control == "clockwise") {
                        status_slider.children[1].classList.remove("slider-paused-cw");
                    }
                    else {
                        status_slider.children[0].classList.remove("slider-paused-ccw");
                    }
                }
                else if (el_action == "pause") {
                    show(manual_button_container.querySelector('[data-control="' + el_control + '"][data-action="play"]'));

                    //Change bg or fg slider color from purple to yellow depending on direction
                    let status_slider = document.querySelector('#manual-slider-target .statusSlider[data-slider="0"]');

                    if (el_control == "clockwise") {
                        status_slider.children[1].classList.add("slider-paused-cw");
                    }
                    else {
                        status_slider.children[0].classList.add("slider-paused-ccw");
                    }
                }

                //set program to running
                program_is_running = true;

                // Send Web Socket Message
                send_message = true;

                break;

            case "stop":
                //check if current program is running, if so then do not recreate
                if (program_is_running) {
                    //set program to running
                    program_is_running = false;

                    // filter for programically clicking stopping button
                    if (!clicked_by_code) {
                        // Send Web Socket Message
                        send_message = true;
                    }
                    else {
                        //reset flag
                        clicked_by_code = false;
                    }
                }
                //Hide the pause button and show the stop/reset button
                manual_rotate_btns.forEach(btn => {
                    if (btn.dataset.action == "play") {
                        show(btn);
                    } else if (btn.dataset.action == "pause") {
                        hide(btn);
                    }
                });

                let defaultDir = "clockwise";

                // Only redraw slider if existing is counter-clockwise
                if (manualDirectionState == defaultDir) {
                    // If current direction is default then update existing slider
                    updateManualSliderStatus(0, true, true, defaultDir);
                }
                else {
                    //Remove old slider
                    document.getElementById("manual-slider-target").innerHTML = "";

                    //instantiate and draw manual status slider with correct direction
                    manualStatusSlider = createSlider("#manual-slider-target", defaultDir, false);
                    manualStatusSlider.draw();

                    //Set state to default
                    manualDirectionState = defaultDir;
                }


                // Change opacity and enable all footer menu icons
                footer_icons.forEach(icon => {
                    icon.classList.remove("disable-btn");
                });
                break;
            default:
                break;
        }

        if (el_control && send_message) {
            //Send message to ESP32 to manually rotate, pause or stop
            let message = {
                "type": "manual",
                "data": {
                    "action": el_action ?? false,
                    "direction": el_control
                }
            }

            sendMessage(message, true);
            console.log("Send message to ESP32: " + message);
        }
    });
    //END Add event listeners for Manual control tab

    //START Add event listeners for Auto Tab buttons
    //Get Control Buttons
    let auto_tab_container = document.getElementById("auto-tab");
    let auto_pause_btn = auto_tab_container.querySelector('#auto-tab [data-control="pause"]').parentElement;
    let auto_play_btn = auto_tab_container.querySelector('#auto-tab [data-control="play"]').parentElement;

    //Get Input fields
    let auto_input_container = document.getElementById("auto-input-container");
    let direction_toggle = document.getElementById("auto-direction-toggle");
    let duration_input = document.getElementById("auto-duration-value");
    let duration_uom = document.getElementById("auto-duration-uom");

    //Get Status Target/container
    let auto_status_container = document.getElementById("auto-status-container");

    //EVENT LISTENER
    auto_tab_container.addEventListener("click", (el) => {
        let el_parent = el.target.parentElement;
        let el_control = el_parent.dataset.control ?? false;

        //Get rotation direction
        let slider_direction = direction_toggle.checked ? "counter-clockwise" : "clockwise";

        //Get value of current degrees
        let auto_slider_input = document.querySelector(".auto-degree-form input.sliderValue");
        let auto_slider_set_value = parseFloat(auto_slider_input.value);

        // Send Websocket Message?
        let send_message = false;

        switch (el_control) {
            case "toggle-direction":

                //Empty auto slider target div and redraw sliders / legends
                document.getElementById("auto-slider-target").innerHTML = "";

                //instantiate and draw auto status slider with correct direction
                autoInputSlider = createSlider("#auto-slider-target", slider_direction, true);
                autoInputSlider.draw();

                let inverse_slider_value = (auto_slider_set_value > 0) ? auto_slider_set_value - 360 : auto_slider_set_value + 360;
                updateAutoSliderStatus(inverse_slider_value, true, true, slider_direction);

                break;

            case "pause":
                //Hide the pause button and show the play button
                hide(auto_pause_btn);
                show(auto_play_btn);

                //Change bg or fg slider color from purple to yellow depending on direction
                let status_slider = document.querySelector('#auto-slider-target .statusSlider[data-slider="1"]');

                if (slider_direction == "clockwise") {
                    status_slider.children[1].classList.add("slider-paused-cw");
                }
                else {
                    status_slider.children[0].classList.add("slider-paused-ccw");
                }


                //Update program status to paused
                program_is_paused = true;

                // Send Web Socket Message
                send_message = true;
                break;

            case "play":

                //check if current program is running, if so then do not recreate
                if (!program_is_running) {

                    //Simple client side input validation
                    let error_div = document.getElementById("error-bar");
                    let error_target = error_div.querySelector("p");
                    error_target.innerHTML = "";

                    let error_message = "";
                    let is_duration_valid = true;
                    let is_slider_valid = true;

                    if (duration_input.value < 1) {
                        error_message += "Duration must be at least 1 second. "
                        is_duration_valid = false;
                    } else if ((duration_input.value > 9999) && (duration_uom.value == "seconds")) {
                        error_message += "Max duration 9999 seconds. "
                        is_duration_valid = false;
                    } else if ((duration_input.value > 9999) && (duration_uom.value == "minutes")) {
                        error_message += "Max duration 9999 minutes. "
                        is_duration_valid = false;
                    } else if ((duration_input.value > 1000) && (duration_uom.value == "hours")) {
                        error_message += "Max duration 1000 hours. "
                        is_duration_valid = false;
                    }
                    if (auto_slider_set_value == 0) {
                        error_message += "Degrees to Rotate cannot be 0. "
                        is_slider_valid = false;
                    }

                    if (error_message !== "") {
                        if (!is_slider_valid) {
                            //highlight duration input box
                            auto_slider_input.classList.add("invalid-input");
                        }
                        if (!is_duration_valid) {
                            //highlight duration input box
                            duration_input.classList.add("invalid-input");
                        }

                        error_target.append("Error: " + error_message)
                        error_div.classList.remove("display-none");
                        break;
                    }
                    //END simple client input validation

                    //Empty auto slider target div and redraw status sliders / legends
                    document.getElementById("auto-slider-target").innerHTML = "";

                    //instantiate and draw manual status slider with correct direction
                    autoInputSlider = createDualAutoSliders(slider_direction, false);
                    autoInputSlider.draw();

                    //update sliders with correct values after initialization (inital value creates counterclockwise glitch)
                    updateAutoSliderStatus(auto_slider_set_value, true, true, slider_direction);
                    updateAutoSliderStatus(0, true, true, slider_direction, true);

                    //swap slider legend position
                    let auto_slider_legend = document.querySelector("#auto-slider-target ul.slider__legend");
                    auto_slider_legend.insertBefore(auto_slider_legend.children[1], auto_slider_legend.children[0]);

                    //hide inputs
                    hide(auto_input_container);

                    //set values and show status container
                    auto_status_container.querySelector('[data-target="set-direction"]').innerHTML = slider_direction;
                    auto_status_container.querySelector('[data-target="realtime-value"]').innerHTML = 0;
                    auto_status_container.querySelector('[data-target="set-duration"]').innerHTML = duration_input.value;
                    auto_status_container.querySelector('[data-target="set-uom"]').innerHTML = duration_uom.value;
                    show(auto_status_container);

                    //set program to running
                    program_is_running = true;

                    // Send Web Socket Message
                    send_message = true;
                }
                else {
                    // Add error handling for pause to play once program is program_is_running, bug doesn't let you play
                    // if (false) {
                    if (program_is_paused) {
                        // Send Web Socket Message
                        send_message = true;

                        //Change bg or fg slider color from purple to yellow depending on direction
                        let status_slider = document.querySelector('#auto-slider-target .statusSlider[data-slider="1"]');

                        if (slider_direction == "clockwise") {
                            status_slider.children[1].classList.remove("slider-paused-cw");
                        }
                        else {
                            status_slider.children[0].classList.remove("slider-paused-ccw");
                        }
                    }
                }

                if (program_is_running) {
                    //Hide the play button and show the pause button
                    hide(auto_play_btn);
                    show(auto_pause_btn);

                    // Change opacity and disable all footer menu icons
                    footer_icons.forEach(icon => {
                        icon.classList.add("disable-btn");
                    });
                }
                //Update pause status to false
                program_is_paused = false;
                break;

            case "stop":
                //Hide the pause button and show the play button
                hide(auto_pause_btn);
                show(auto_play_btn);

                //reset inputs
                duration_input.value = "";
                duration_uom.value = "seconds";

                //check if program is running, if so then create new slider, hide status container and show inputs
                if (program_is_running) {
                    //Empty auto slider target div and redraw sliders / legends
                    document.getElementById("auto-slider-target").innerHTML = "";

                    //instantiate and draw manual status slider with correct direction
                    autoInputSlider = createSlider("#auto-slider-target", slider_direction, true);
                    autoInputSlider.draw();

                    if (direction_toggle.checked) {
                        //update slider to get rid of counter-clockwise inital value glitch
                        updateAutoSliderStatus(0, true, true, slider_direction);
                    }

                    //show inputs
                    show(auto_input_container);

                    //hide status container
                    hide(auto_status_container);

                    //set program to not running
                    program_is_running = false;

                    // filter for programically clicking stopping button
                    if (!clicked_by_code) {
                        // Send Web Socket Message
                        send_message = true;
                    }
                    else {
                        //reset flag
                        clicked_by_code = false;
                    }

                }
                else {
                    //reset slider
                    updateAutoSliderStatus(0, true, true, slider_direction);
                }
                // Change opacity and enable all footer menu icons
                footer_icons.forEach(icon => {
                    icon.classList.remove("disable-btn");
                });

                //Update pause status to false
                program_is_paused = false;
                break;
            default:
                break;
        }

        if (el_control && send_message) {
            //Send message to ESP32 to manually rotate, pause or stop
            let message = {
                "type": "auto",
                "data": {
                    "action": el_control,
                    "direction": slider_direction,
                    "value": Math.abs(auto_slider_set_value),
                    "duration": parseInt(duration_input.value) ?? 0,
                    "uom": duration_uom.value ?? "seconds"
                }
            }

            sendMessage(message, true);
            console.log("Send message to ESP32: " + message);
        }
    });
    //END Add event listeners for Auto Tab buttons

    //START Settings tab scripts

    //Update range slider value
    let manual_stepper_speed = document.getElementById("manual-stepper-speed");
    let manual_speed_output = document.getElementById("manual-speed-output");
    // Display the default slider value
    manual_speed_output.innerHTML = manual_stepper_speed.value;

    // Update the current slider value (each time you drag the range slider handle)
    manual_stepper_speed.oninput = function () {
        manual_speed_output.innerHTML = this.value;
    }

    //Handle Settings form on Save
    let settings_form = document.getElementById("settings-form");

    //EVENT LISTENER
    settings_form.addEventListener("submit", (e) => {
        e.preventDefault();
        loader_overlay.classList.remove("display-none");

        let form_data = new FormData(settings_form);
        let msgObject = {};
        msgObject["type"] = "settings";
        msgObject["data"] = {};
        form_data.forEach(function (value, key) {
            msgObject["data"][key] = value;
        });

        // Send Message to ESP32 through Web Socket
        sendMessage(msgObject, true);
        console.log("Send message to ESP32: " + "Update Settings");

        //temporary until recieive info from ESP32
        loader_overlay.classList.add("display-none");
    });

    //END Settings tab scripts

    //START Input form field event listener
    let number_only = document.querySelectorAll("input.numbers-only");

    number_only.forEach(field => {
        field.addEventListener("keyup", (event) => {
            // console.log("Event Key: " + event.key);
            //remove any highlights
            field.classList.remove("invalid-input");

            //validate input
            if (isNaN(event.key)) {
                //check field value to rule out keys like shift or backspace
                while (isNaN(field.value)) {
                    let newValue = field.value.slice(0, field.value.length - 1);
                    field.value = newValue;
                }
            }
        });
    });
    //END Input form field event listener

    //START Display None after loading resources
    let display_none_js = document.querySelectorAll(".display-none-js");
    display_none_js.forEach(el => {
        el.classList.remove("display-none-js");
        el.classList.add("display-none");
    });
    //END Display None after loading resources

    // START Handle Close Button
    let close_button = document.querySelector("#error-bar .close-button");
    //EVENT LISTENER
    close_button.addEventListener("click", (el) => {
        let el_parent = el.target.parentElement;
        let error_target = el_parent.querySelector("p");

        error_target.innerHTML = "";
        el_parent.classList.add("display-none");
    });
    // END Handle Close Button


} //END ON LOAD FUNCTION

function hide(element) {
    element.style.display = "none";
}
function show(element) {
    element.style.display = "block";
}

/**
 * Initialize sliders
 * @param {string} selector DOM Selector id
 * @param {string} direction "clockwise" or "counter clockwise"
 * @param {boolean} clickable is user able to interact with slider
 * @returns {Object} representing a new manual status slider 
 */
function createSlider(selector, direction, clickable) {
    const window_width = window.innerWidth;
    const window_height = window.innerHeight;
    let slider_width = (window_width > window_height) ? Math.floor(window_height * 0.5) : Math.floor(window_width * 0.95);

    let legend_width = Math.floor(slider_width * 0.77);
    let legend_font_size = 7;
    if (legend_width < 185) {
        legend_font_size = 3;
    }
    else if (legend_width < 230) {
        legend_font_size = 4;
    }
    else if (legend_width < 275) {
        legend_font_size = 5;
    }
    else if (legend_width < 320) {
        legend_font_size = 6;
    }

    let slider_radius = Math.floor((slider_width / 2) * 0.9);

    // Create Manual Status Slider and Options
    const opts = {
        DOMselector: selector,
        sliders: [
            {
                radius: slider_radius,
                min: (direction === "clockwise") ? 0 : -360,
                max: (direction === "clockwise") ? 360 : 0,
                step: .1,
                initialValue: 0,
                color: (direction === "clockwise") ? '#0984e3' : '#D8D8D8',
                colorSecondary: (direction === "clockwise") ? '#D8D8D8' : '#e74c3c',
                displayName: direction
            }
        ],
        clickable: clickable ?? false,
        arcFractionThickness: 30,
        sliderWidth: slider_width,
        legendWidth: legend_width,
        legendFontSize: legend_font_size
    };

    // instantiate the slider
    const slider = new Slider(opts);
    return slider;
}

/**
 * Update sliders with recieved data from ESP32
 *
 * @param {number} radians rotation in radians to update slider with
 */
function updateManualSliderStatus(radians, is_status = true, is_degrees = false, direction = "clockwise") {
    manualStatusSlider.redrawActiveSlider(radians, is_status, is_degrees, direction);
    // manualStatusSlider.redrawActiveSlider(radians, true);
}

/**
 * Update sliders with recieved data from ESP32
 *
 * @param {number} radians rotation in radians to update slider with
 */
function updateAutoSliderStatus(radians, is_status = true, is_degrees = false, direction = "clockwise", dual_sliders = false) {
    autoInputSlider.redrawActiveSlider(radians, is_status, is_degrees, direction, dual_sliders);
}

/**
 * Initialize dual sliders for auto play, one showing set value and another inside of it showing realtime value
 * @param {string} selector DOM Selector id
 * @param {string} direction "clockwise" or "counter clockwise"
 * @param {boolean} clickable is user able to interact with slider
 * @returns {Object} representing a new manual status slider 
 */
function createDualAutoSliders(direction, clickable) {
    const window_width = window.innerWidth;
    const window_height = window.innerHeight;
    let slider_width = (window_width > window_height) ? Math.floor(window_height * 0.5) : Math.floor(window_width * 0.95);

    let legend_width = Math.floor(slider_width * 0.77);
    let legend_font_size = 7;
    if (legend_width < 210) {
        legend_font_size = 3;
    }
    else if (legend_width < 280) {
        legend_font_size = 4;
    }
    else if (legend_width < 320) {
        legend_font_size = 5;
    }
    else if (legend_width < 360) {
        legend_font_size = 6;
    }

    let slider_radius = Math.floor((slider_width / 2) * 0.9);
    let slider_radius_small = slider_radius - 8;


    // Create Manual Status Slider and Options
    const opts = {
        DOMselector: "#auto-slider-target",
        sliders: [
            {
                radius: slider_radius,
                min: (direction === "clockwise") ? 0 : -360,
                max: (direction === "clockwise") ? 360 : 0,
                step: .1,
                initialValue: 0,
                color: (direction === "clockwise") ? '#0984e3' : '#D8D8D8',
                colorSecondary: (direction === "clockwise") ? '#D8D8D8' : '#e74c3c',
                displayName: direction
            },
            {
                radius: slider_radius_small,
                min: (direction === "clockwise") ? 0 : -360,
                max: (direction === "clockwise") ? 360 : 0,
                step: .1,
                initialValue: 0,
                color: (direction === "clockwise") ? '#5D3FD3' : '#D8D8D8',
                colorSecondary: (direction === "clockwise") ? '#D8D8D8' : '#5D3FD3',
                displayName: direction
            }
        ],
        clickable: clickable ?? false,
        arcFractionThickness: 30,
        sliderWidth: slider_width,
        legendWidth: legend_width,
        legendFontSize: legend_font_size
    };

    // instantiate the slider
    const slider = new Slider(opts);
    return slider;
}

/**
 * Handle WebSocket Message to update time elapsed text
 * @param {Object} data Object.time_elapsed from Websocket message 
 */
function updateTimeElapsed(time_elapsed) {
    //Get target
    let auto_realtime_status = document.querySelector('#auto-status-container span[data-target="realtime-value"]');

    //set time elapsed value
    auto_realtime_status.innerHTML = time_elapsed;
}
/**
 * If on load or update the server-client Manual Tab paused state does not match, call function to match
 * @param {Boolean} server_paused_state Object.paused_state from Websocket message sent by server
 * @param {String} direction Object.direction from Websocket message sent by server
 */
function updateManualPausedDOM(server_paused_state, direction) {

    let manual_rotate_btns = document.querySelectorAll("#manual-tab .manual-rotate-btn a");
    let manual_button_container = document.getElementById("manual-button-container");

    let status_slider = document.querySelector('#manual-slider-target .statusSlider[data-slider="0"]');

    if (server_paused_state) {
        show(manual_button_container.querySelector('[data-control="' + direction + '"][data-action="play"]'));
        hide(manual_button_container.querySelector('[data-control="' + direction + '"][data-action="pause"]'));

        if (direction == "clockwise") {
            status_slider.children[1].classList.add("slider-paused-cw");
        }
        else {
            status_slider.children[0].classList.add("slider-paused-ccw");
        }
    }
    else {
        //Reset all rotate buttons if playing
        manual_rotate_btns.forEach(btn => {
            if (btn.dataset.action == "play" && btn.dataset.control != direction) {
                show(btn);
            }
            else if (btn.dataset.action == "play" && btn.dataset.control == direction) {
                hide(btn);
            }
            else if (btn.dataset.action == "pause" && btn.dataset.control == direction) {
                show(btn);
            }
            else if (btn.dataset.action == "pause" && btn.dataset.control != direction) {
                hide(btn);
            }

        });

        if (direction == "clockwise") {
            status_slider.children[1].classList.remove("slider-paused-cw");
        }
        else {
            status_slider.children[0].classList.remove("slider-paused-ccw");
        }
    }
    program_is_paused = server_paused_state;
}

/**
 * If on load or update the server-client Auto Tab paused state does not match, call function to match
 * @param {Boolean} server_paused_state Object.paused_state from Websocket message sent by server
 * @param {String} direction Object.direction from Websocket message sent by server
 */
function updateAutoPausedDOM(server_paused_state, direction) {
    //Get Control Buttons
    let auto_pause_btn = document.querySelector('#auto-tab [data-control="pause"]').parentElement;
    let auto_play_btn = document.querySelector('#auto-tab [data-control="play"]').parentElement;

    let status_slider = document.querySelector('#auto-tab #auto-slider-target .statusSlider[data-slider="1"]');

    if (server_paused_state) {

        //Hide the pause button and show the play button
        hide(auto_pause_btn);
        show(auto_play_btn);

        if (direction == "clockwise") {
            status_slider.children[1].classList.add("slider-paused-cw");
        }
        else {
            status_slider.children[0].classList.add("slider-paused-ccw");
        }
    } else {
        //Hide the play button and show the pause button
        show(auto_pause_btn);
        hide(auto_play_btn);

        if (direction == "clockwise") {
            status_slider.children[1].classList.remove("slider-paused-cw");
        }
        else {
            status_slider.children[0].classList.remove("slider-paused-ccw");
        }
    }
    program_is_paused = server_paused_state;
}

/**
 * Handle WebSocket Message to update status sliders
 * @param {Object} data Object.data from Websocket message 
 */
function websocketUpdateStatusSlider(data) {

    //convert counter clockwise radians to negative value
    if (data.direction == "counter-clockwise") {
        data.current_radians = - data.current_radians;
        data.value = - data.value;
    }

    // Do not update if program is not running, this prevents async/code order issue
    if (!program_is_running) {
        console.log("program not running");
        loadProgramStatus(data)
        // return;
    }
    //update appropriate slider
    if (data.type == "manual") {
        // Only redraw slider if changing directions
        if (manualDirectionState != data.direction) {
            //Remove old slider
            document.getElementById("manual-slider-target").innerHTML = "";

            //instantiate and draw manual status slider with correct direction
            manualStatusSlider = createSlider("#manual-slider-target", data.direction, false);
            manualStatusSlider.draw();

            manualDirectionState = data.direction;
        }
        updateManualSliderStatus(data.current_radians, true, false, data.direction);

        // Update Paused state if it doesn't match the server
        if (program_is_paused != data.pause_state) {
            updateManualPausedDOM(data.pause_state, data.direction);
        }
    } else if (data.type == "auto") {
        updateAutoSliderStatus(data.current_radians, true, false, data.direction, true);
        updateTimeElapsed(data.time_elapsed);

        // Update Paused state if it doesn't match the server
        if (program_is_paused != data.pause_state) {
            updateAutoPausedDOM(data.pause_state, data.direction);
        }
    } else if (data.type == "stop") {
        // program_is_paused = false;
        clicked_by_code = true;
        document.querySelector('#' + data.tab + '-tab [data-control="stop"] i').click();
        console.log("stop clicked");
    }
}

/**
 * Set Error Message
 * @param {Object} data Object.data from Websocket message 
 */
function alertErrorMessage(data) {
    let error_div = document.getElementById("error-bar");
    let error_target = error_div.querySelector("p");

    if (data.length > 0) {
        error_target.append("Error: " + data)
        error_div.classList.remove("display-none");
    }

}

/**
 * Set Program status in case loaded or refreshed
 * @param {Object} data Object.data from Websocket message 
 */
function loadProgramStatus(data) {
    let loader_overlay = document.getElementById("loader-overlay");

    //Check if program is running as a way to see if page newly refreshed
    if (data.program_state != program_is_running && data.program_state) {

        let footer_icons = document.querySelectorAll(".footer .icon-wrapper a");
        let tabs = document.querySelectorAll(".tab");
        //Open the Auto Tab

        // footer_icons.forEach(icon => {

        //Hide all tabs
        tabs.forEach(el => {
            hide(el);

            //Empty sliders target div and redraw sliders / legends
            const slider_target = el.querySelector(".slider-target");
            if (slider_target) {
                slider_target.innerHTML = "";
            }
        });

        //Show correct tab
        const tab_string = data.type + "-tab";
        const active_tab = document.getElementById(tab_string);
        show(active_tab);

        //draw correct slider
        switch (data.type) {
            case "manual":
                //instantiate and draw manual status slider with correct direction
                manualStatusSlider = createSlider("#manual-slider-target", data.direction, false);
                manualStatusSlider.draw();

                //Set flag state
                manualDirectionState = data.direction;

                updateManualPausedDOM(data.pause_state, data.direction);
                break;
            case "auto":
                //instantiate and draw manual status slider with correct direction
                autoInputSlider = createDualAutoSliders(data.direction, false);
                autoInputSlider.draw();

                updateAutoSliderStatus(data.value, true, true, data.direction);
                updateAutoSliderStatus(data.current_radians, true, false, data.direction, true);
                // updateAutoSliderStatus(0, true, true, data.direction, true);

                //swap slider legend position
                let auto_slider_legend = document.querySelector("#auto-slider-target ul.slider__legend");
                auto_slider_legend.insertBefore(auto_slider_legend.children[1], auto_slider_legend.children[0]);

                //Get Input fields
                let auto_input_container = document.getElementById("auto-input-container");
                //Get Status Target/container
                let auto_status_container = document.getElementById("auto-status-container");
                //hide inputs
                hide(auto_input_container);

                //set values and show status container
                auto_status_container.querySelector('[data-target="set-direction"]').innerHTML = data.direction;
                auto_status_container.querySelector('[data-target="realtime-value"]').innerHTML = data.time_elapsed;
                auto_status_container.querySelector('[data-target="set-duration"]').innerHTML = data.duration;
                auto_status_container.querySelector('[data-target="set-uom"]').innerHTML = data.uom;
                show(auto_status_container);

                console.log("client pause status: " + program_is_paused);
                console.log("server pause status: " + data.pause_state);

                // Update Paused state if it doesn't match the server
                updateAutoPausedDOM(data.pause_state, data.direction);
                break;
            default:
                break;
        }

        //remove selected icons
        footer_icons.forEach(el => {
            el.classList.remove("selected");
            if (el.dataset.tab == tab_string) {
                el.classList.add("selected");
            }
            el.classList.add("disable-btn");
        });

        program_is_running = data.program_state;
        // program_is_paused = data.pause_state;
    }
    loader_overlay.classList.add("display-none");
}