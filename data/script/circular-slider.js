class Slider {

    /**
     * @constructor
     * 
     * @param {string} DOMselector
     * @param {array} sliders
     * @param {boolean} clickable
     */
    constructor({ DOMselector, sliders, clickable=true, arcFractionThickness=35, sliderWidth=500, legendWidth=400, legendFontSize=7 }) {
        this.DOMselector = DOMselector;
        this.container = document.querySelector(this.DOMselector);  // Slider container
        this.sliderWidth = sliderWidth;                                     // Slider width
        this.sliderHeight = sliderWidth;                                    // Slider length
        this.cx = this.sliderWidth / 2;                             // Slider center X coordinate
        this.cy = this.sliderHeight / 2;                            // Slider center Y coordinate
        this.tau = 2 * Math.PI;                                     // Tau constant
        this.sliders = sliders;                                     // Sliders array with opts for each slider
        // this.arcFractionSpacing = 0.85;                             // Spacing between arc fractions
        this.arcFractionSpacing = 0;                             // Spacing between arc fractions
        this.arcFractionLength = 10;                                // Arc fraction length
        this.arcFractionThickness = arcFractionThickness;                             // Arc fraction thickness
        this.arcBgFractionColor = '#D8D8D8';                        // Arc fraction color for background slider
        this.handleFillColor = '#fff';                              // Slider handle fill color
        this.handleStrokeColor = '#888888';                         // Slider handle stroke color
        this.handleStrokeThickness = 3;                             // Slider handle stroke thickness    
        this.mouseDown = false;                                     // Is mouse down
        this.activeSlider = null;                                   // Stores active (selected) slider
        this.clickable = clickable;                                 // Is Slider Clickable or only updatable through code
        this.legendWidth = legendWidth;                             // Legend width so it doesn't interfere with slider
        this.legendFontSize = legendFontSize;                       // Legend FontSize so it doesn't interfere with slider
    }

    /**
     * Draw sliders on init
     * 
     * @param {boolean} [clickable=TRUE] 
     */
    draw() {
        // Create legend UI
        this.createLegendUI();

        // Create and append SVG holder
        const svgContainer = document.createElement('div');
        svgContainer.classList.add('slider__data');
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('height', this.sliderWidth);
        svg.setAttribute('width', this.sliderHeight);
        svgContainer.appendChild(svg);
        this.container.appendChild(svgContainer);

        // Draw sliders
        this.sliders.forEach((slider, index) => this.drawSingleSliderOnInit(svg, slider, index));

        //check if clickable and add event listeners
        if (this.clickable) {
            // Event listeners
            svgContainer.addEventListener('mousedown', this.mouseTouchStart.bind(this), false);
            svgContainer.addEventListener('touchstart', this.mouseTouchStart.bind(this), false);
            svgContainer.addEventListener('mousemove', this.mouseTouchMove.bind(this), false);
            svgContainer.addEventListener('touchmove', this.mouseTouchMove.bind(this), false);
            window.addEventListener('mouseup', this.mouseTouchEnd.bind(this), false);
            window.addEventListener('touchend', this.mouseTouchEnd.bind(this), false);    
        }
    }

    /**
     * Draw single slider on init
     * 
     * @param {object} svg 
     * @param {object} slider 
     * @param {number} index 
     */
    drawSingleSliderOnInit(svg, slider, index) {

        // Default slider opts, if none are set
        slider.radius = slider.radius ?? 50;
        slider.min = slider.min ?? 0;
        slider.max = slider.max ?? 1000;
        slider.step = slider.step ?? 50;
        slider.initialValue = slider.initialValue ?? 0;
        slider.color = slider.color ?? '#FF5733';
        // Added in custom way to change secondary color for counter clockwise rotations
        this.arcBgFractionColor = slider.colorSecondary ?? this.arcBgFractionColor;

        // Calculate slider circumference
        const circumference = slider.radius * this.tau;

        // Calculate initial angle
        const initialAngle = Math.floor( ( slider.initialValue / (slider.max - slider.min) ) * 360 );

        // Calculate spacing between arc fractions
        const arcFractionSpacing = this.calculateSpacingBetweenArcFractions(circumference, this.arcFractionLength, this.arcFractionSpacing);

        // Create a single slider group - holds all paths and handle
        const sliderGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        sliderGroup.setAttribute('class', this.clickable ? 'sliderSingle' : 'sliderSingle statusSlider');
        sliderGroup.setAttribute('data-slider', index);
        sliderGroup.setAttribute('transform', 'rotate(-90,' + this.cx + ',' + this.cy + ')');
        sliderGroup.setAttribute('rad', slider.radius);
        svg.appendChild(sliderGroup);
        
        // Draw background arc path
        this.drawArcPath(this.arcBgFractionColor, slider.radius, 360, arcFractionSpacing, 'bg', sliderGroup);

        // Draw active arc path
        this.drawArcPath(slider.color, slider.radius, initialAngle, arcFractionSpacing, 'active', sliderGroup);

        //check if clickable and add handle
        if (this.clickable) {
            // Draw handle
            this.drawHandle(slider, initialAngle, sliderGroup);
        }

    }

    /**
     * Output arch path
     * 
     * @param {number} cx 
     * @param {number} cy 
     * @param {string} color 
     * @param {number} angle 
     * @param {number} singleSpacing 
     * @param {string} type 
     */
    drawArcPath( color, radius, angle, singleSpacing, type, group ) {

        // Slider path class
        const pathClass = (type === 'active') ? 'sliderSinglePathActive' : 'sliderSinglePath';

        //Added: If background stroke then shrink stroke width by 1px
        const adjustedStrokeWidth = (type === 'bg') ? this.arcFractionThickness - 1 : this.arcFractionThickness;
        // const adjustedStrokeWidth = this.arcFractionThickness;

        // Create svg path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add(pathClass);
        path.setAttribute('d', this.describeArc(this.cx, this.cy, radius, 0, angle));
        path.style.stroke = color;
        path.style.strokeWidth = adjustedStrokeWidth;
        path.style.fill = 'none';
        path.setAttribute('stroke-dasharray', this.arcFractionLength + ' ' + singleSpacing);
        group.appendChild(path);
    }

    /**
     * Draw handle for single slider
     * 
     * @param {object} slider 
     * @param {number} initialAngle 
     * @param {group} group 
     */
    drawHandle(slider, initialAngle, group) {

        // Calculate handle center
        const handleCenter = this.calculateHandleCenter(initialAngle * this.tau / 360, slider.radius);

        // Draw handle
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        handle.setAttribute('class', 'sliderHandle');
        handle.setAttribute('cx', handleCenter.x);
        handle.setAttribute('cy', handleCenter.y);
        handle.setAttribute('r', this.arcFractionThickness / 2);
        handle.style.stroke = this.handleStrokeColor;
        handle.style.strokeWidth = this.handleStrokeThickness;
        handle.style.fill = this.handleFillColor;
        group.appendChild(handle);
    }

    /**
     * Create legend UI on init
     * MODIFIED LEGEND TO REMOVE LABELS
     * 
     */
    createLegendUI() {

        // Create legend
        const display = document.createElement('ul');
        display.classList.add('slider__legend');

        // Legend data for all sliders
        this.sliders.forEach((slider, index) => {
            const li = document.createElement('li');
            li.setAttribute('data-slider', index);

            const form_container = document.createElement('form');

            form_container.classList.add('auto-degree-form');

            const input_field = document.createElement('input');
            input_field.type = "text";
            input_field.pattern = "\\d*";
            input_field.setAttribute("maxlength", (slider.displayName == "clockwise") ? 5 : 6);
            input_field.value = slider.initialValue.toFixed(1) ?? 0.0;

            input_field.classList.add('sliderValue');
            input_field.setAttribute('style', "width:" + this.legendWidth + "px; font-size:" + this.legendFontSize + "rem;");

            if (this.clickable)
            {
                input_field.addEventListener("keyup", (event) => {
                    console.log("Event Key: " + event.key);
                    input_field.classList.remove("invalid-input");
                    //validate input
                    if ( isNaN(event.key)) {
                        //check field value to rule out keys like shift or backspace
                        while (isNaN(input_field.value)) {
                            let newValue = input_field.value.slice(0, input_field.value.length-1);
                            input_field.value = newValue;
                        }
                    }

                    //Check if input is within 0 to 360 or -360 to 0
                    if (slider.displayName == "clockwise")
                    {
                        if (input_field.value < 0)
                        {
                            input_field.value = 0;
                        }
                        else if (input_field.value > 360)
                        {
                            input_field.value = 360;
                        }
                    }
                    else if (slider.displayName == "counter-clockwise")
                    {
                        if (input_field.value > 0)
                        {
                            input_field.value = 0;
                        }
                        else if (input_field.value < -360)
                        {
                            input_field.value = -360;
                        }
                    }

                    this.redrawActiveSlider(input_field.value, true, true, slider.displayName);
                  });
            }
            else
            {
                input_field.disabled=true;
            }

            li.appendChild(form_container);
            form_container.appendChild(input_field);
            //add hr tag if dual sliders
            if (index){
                const hr_tag = document.createElement('hr');
                li.appendChild(hr_tag);
            }

            display.appendChild(li);
        });

        // Append to DOM
        this.container.appendChild(display);
    }

    /**
     * Redraw active slider
     * 
     * @param {element} activeSlider
     * @param {obj} rmc
     * @param {boolean} [is_status=false] is the slider a status slider
     * @param {boolean} [is_degrees=false] is rmc in degrees
     */
    redrawActiveSlider(rmc, is_status = false, is_degrees = false, direction="clockwise", dual_sliders=false) {
        let currentAngle = 0;
        //convert counter clockwise degrees to correct direction
        if (is_status && direction=="counter-clockwise")
        {
            rmc = is_degrees ? -360 - rmc : -6.2831853072 - rmc; 
        }

        if (is_status && dual_sliders)
        {
            this.activeSlider = this.container.querySelector('g.sliderSingle[data-slider="1"]');
            let angle = is_degrees ? this.degreesToRadians(rmc) : rmc;
            currentAngle = Math.abs(angle);
        }
        else if (is_status)
        {
            this.activeSlider = this.container.querySelector('g.sliderSingle');
            let angle = is_degrees ? this.degreesToRadians(rmc) : rmc;
            currentAngle = Math.abs(angle);
        }
        else
        {
            currentAngle = this.calculateMouseAngle(rmc) * 0.999;
        }

        const activePath = this.activeSlider.querySelector('.sliderSinglePathActive');
        const radius = +this.activeSlider.getAttribute('rad');

        // Redraw active path
        activePath.setAttribute('d', this.describeArc(this.cx, this.cy, radius, 0, this.radiansToDegrees(currentAngle)));

        //check if clickable and add handle
        if (this.clickable) {
            // Redraw handle
            const handle = this.activeSlider.querySelector('.sliderHandle');
            const handleCenter = this.calculateHandleCenter(currentAngle, radius);
            handle.setAttribute('cx', handleCenter.x);
            handle.setAttribute('cy', handleCenter.y);
        }

        // Update legend
        this.updateLegendUI(currentAngle, direction);
    }

    /**
     * Update legend UI
     * 
     * @param {number} currentAngle 
     */
    updateLegendUI(currentAngle, direction="clockwise") {
        const targetSlider = this.activeSlider.getAttribute('data-slider');
        const targetLegend = document.querySelector(`li[data-slider="${targetSlider}"] .sliderValue`);
        const currentSlider = this.sliders[targetSlider];
        const currentSliderRange = currentSlider.max - currentSlider.min;
        let currentValue = currentAngle / this.tau * currentSliderRange;
        const numOfSteps =  Math.round(currentValue / currentSlider.step);
        currentValue = currentSlider.min + numOfSteps * currentSlider.step;
        let roundedValue = round(currentValue, 1);

        //Handle -0 input to keep (-) sign
        if (roundedValue == 0 && direction =="counter-clockwise") {
            roundedValue = -1 * roundedValue;
        }
        //to update text
        targetLegend.value = roundedValue.toFixed(1);

        targetLegend.classList.remove("invalid-input");
    }

    /**
     * Mouse down / Touch start event
     * 
     * @param {object} e 
     */
    mouseTouchStart(e) {
        if (this.mouseDown) return;
        this.mouseDown = true;
        const rmc = this.getRelativeMouseOrTouchCoordinates(e);
        this.findClosestSlider(rmc);
        this.redrawActiveSlider(rmc);
    }

    /**
     * Mouse move / touch move event
     * 
     * @param {object} e 
     */
    mouseTouchMove(e) {
        if (!this.mouseDown) return;
        e.preventDefault();
        const rmc = this.getRelativeMouseOrTouchCoordinates(e);
        this.redrawActiveSlider(rmc);
    }

    /**
     * Mouse move / touch move event
     * Deactivate slider
     * 
     */
    mouseTouchEnd() {
        if (!this.mouseDown) return;
        this.mouseDown = false;
        this.activeSlider = null;
    }

    /**
     * Calculate number of arc fractions and space between them
     * 
     * @param {number} circumference 
     * @param {number} arcBgFractionLength 
     * @param {number} arcBgFractionBetweenSpacing 
     * 
     * @returns {number} arcFractionSpacing
     */
    calculateSpacingBetweenArcFractions(circumference, arcBgFractionLength, arcBgFractionBetweenSpacing) {
        const numFractions = Math.floor((circumference / arcBgFractionLength) * arcBgFractionBetweenSpacing);
        const totalSpacing = circumference - numFractions * arcBgFractionLength;
        return totalSpacing / numFractions;
    }

    /**
     * Helper functiom - describe arc
     * 
     * @param {number} x 
     * @param {number} y 
     * @param {number} radius 
     * @param {number} startAngle 
     * @param {number} endAngle 
     * 
     * @returns {string} path
     */
    describeArc (x, y, radius, startAngle, endAngle) {
        let path,
            endAngleOriginal = endAngle, 
            start, 
            end, 
            arcSweep;

        if(endAngleOriginal - startAngle === 360)
        {
            endAngle = 359;
        }

        start = this.polarToCartesian(x, y, radius, endAngle);
        end = this.polarToCartesian(x, y, radius, startAngle);
        arcSweep = endAngle - startAngle <= 180 ? '0' : '1';

        path = [
            'M', start.x, start.y,
            'A', radius, radius, 0, arcSweep, 0, end.x, end.y
        ];

        if (endAngleOriginal - startAngle === 360) 
        {
            path.push('z');
        } 

        return path.join(' ');
    }

    /**
     * Helper function - polar to cartesian transformation
     * 
     * @param {number} centerX 
     * @param {number} centerY 
     * @param {number} radius 
     * @param {number} angleInDegrees 
     * 
     * @returns {object} coords
     */
     polarToCartesian (centerX, centerY, radius, angleInDegrees) {
        const angleInRadians = angleInDegrees * Math.PI / 180;
        const x = centerX + (radius * Math.cos(angleInRadians));
        const y = centerY + (radius * Math.sin(angleInRadians));
        return { x, y };
    }

    /**
     * Helper function - calculate handle center
     * 
     * @param {number} angle 
     * @param {number} radius
     * 
     * @returns {object} coords 
     */
    calculateHandleCenter (angle, radius) {
        const x = this.cx + Math.cos(angle) * radius;
        const y = this.cy + Math.sin(angle) * radius;
        return { x, y };
    }

    /**
     * Get mouse/touch coordinates relative to the top and left of the container
     *  
     * @param {object} e
     * 
     * @returns {object} coords
     */ 
    getRelativeMouseOrTouchCoordinates (e) {
        const containerRect = document.querySelector('.slider__data').getBoundingClientRect();
        let x, 
            y, 
            clientPosX, 
            clientPosY;
 
        // Touch Event triggered
        if (window.TouchEvent && e instanceof TouchEvent) 
        {
            clientPosX = e.touches[0].pageX;
            clientPosY = e.touches[0].pageY;
        }
        // Mouse Event Triggered
        else 
        {
            clientPosX = e.clientX;
            clientPosY = e.clientY;
        }

        // Get Relative Position
        x = clientPosX - containerRect.left;
        y = clientPosY - containerRect.top;

        return { x, y };
    }

    /**
     * Calculate mouse angle in radians
     * 
     * @param {object} rmc 
     * 
     * @returns {number} angle
     */
    calculateMouseAngle(rmc) {
        const angle = Math.atan2(rmc.y - this.cy, rmc.x - this.cx);

        if (angle > - this.tau / 2 && angle < - this.tau / 4) 
        {
            return angle + this.tau * 1.25;
        } 
        else 
        {
            return angle + this.tau * 0.25;
        }
    }

    /**
     * Helper function - transform radians to degrees
     * 
     * @param {number} angle 
     * 
     * @returns {number} angle
     */
    radiansToDegrees(angle) {
        return angle / (Math.PI / 180);
    }
    
    /**
     * Helper function - transform degrees to radians
     * 
     * @param {number} angle 
     * 
     * @returns {number} angle
     */
    degreesToRadians(angle) {
        return angle / (180 / Math.PI);
    }

    /**
     * Find closest slider to mouse pointer
     * Activate the slider
     * 
     * @param {object} rmc
     */
    findClosestSlider(rmc) {
        const mouseDistanceFromCenter = Math.hypot(rmc.x - this.cx, rmc.y - this.cy);
        const container = document.querySelector(this.DOMselector + ' .slider__data');
        const sliderGroups = Array.from(container.querySelectorAll('g'));

        // Get distances from client coordinates to each slider
        const distances = sliderGroups.map(slider => {
            const rad = parseInt(slider.getAttribute('rad'));
            return Math.min( Math.abs(mouseDistanceFromCenter - rad) );
        });

        // Find closest slider
        const closestSliderIndex = distances.indexOf(Math.min(...distances));
        this.activeSlider = sliderGroups[closestSliderIndex];
    }
}

// /**
//  * Round half away from zero ('commercial' rounding)
//  * Uses correction to offset floating-point inaccuracies.
//  * Works symmetrically for positive and negative numbers
//  * @param {number} num number to round
//  * @param {number} [decimalPlaces=2] desired decimal places
//  * @returns {number} rounded number
// */
function round(num, decimalPlaces = 2) {
    var p = Math.pow(10, decimalPlaces);
    var n = (num * p) * (1 + Number.EPSILON);
    return Math.round(n) / p;
}