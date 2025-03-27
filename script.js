// DOM elements
const connectButton = document.getElementById('connect-button');
const statusText = document.getElementById('status-text');
const positionSlider = document.getElementById('position-slider');
const positionValue = document.getElementById('position-value');
const homingStatus = document.getElementById('homing-status');
const heightPercentage = document.getElementById('height-percentage');
const heightFill = document.getElementById('height-fill');
const setMinButton = document.getElementById('set-min-button');
const setMaxButton = document.getElementById('set-max-button');
const motorSwitch = document.getElementById('motor-switch');
const pInput = document.getElementById('p-input');
const sInput = document.getElementById('s-input');
const dInput = document.getElementById('d-input');
const sendPidButton = document.getElementById('send-pid-button');
const exportCsvButton = document.getElementById('export-csv');
const dataPointsCount = document.getElementById('data-points-count');
const viewSlider = document.getElementById('view-slider');
const viewValue = document.getElementById('view-value');

// Serial port variables
let port;
let reader;
let writer;
let readLoopRunning = false;

// Connection monitoring variables
let lastDataReceived = 0;
let connectionTimeoutMs = 10000; // Consider connection stale after 10 seconds without data

// Chart variables
let angleChart;
let viewWindowSize = 100; // Default number of points to show on the graph, configurable up to 1000

// Full data storage arrays - with capacity for much larger datasets
const fullTargetData = [];
const fullActualData = [];
const fullTimeData = [];

// Display data (window of the full data)
let targetData = Array(viewWindowSize).fill(0);
let actualData = Array(viewWindowSize).fill(0);
let timeLabels = Array(viewWindowSize).fill('');

// Initialize the chart when the page loads
document.addEventListener('DOMContentLoaded', initChart);

// Add view window slider listener
viewSlider.addEventListener('input', function() {
    viewWindowSize = parseInt(this.value);
    viewValue.textContent = `${viewWindowSize} points`;
    
    // Update the arrays for the chart
    updateDisplayArrays();
    
    // Rebuild the chart with new window size
    angleChart.update();
});

// Function to update the display arrays based on window size
function updateDisplayArrays() {
    // Create new arrays with the right size
    targetData = Array(viewWindowSize).fill(0);
    actualData = Array(viewWindowSize).fill(0);
    timeLabels = Array(viewWindowSize).fill('');
    
    // If we have data, populate the arrays
    if (fullTargetData.length > 0) {
        const dataLength = Math.min(viewWindowSize, fullTargetData.length);
        const startIndex = Math.max(0, fullTargetData.length - dataLength);
        
        for (let i = 0; i < dataLength; i++) {
            const fullIndex = startIndex + i;
            targetData[i] = fullTargetData[fullIndex];
            actualData[i] = fullActualData[fullIndex];
            timeLabels[i] = i.toString();
        }
    }
    
    // Update the chart datasets
    angleChart.data.labels = timeLabels;
    angleChart.data.datasets[0].data = targetData;
    angleChart.data.datasets[1].data = actualData;
}

function initChart() {
    const ctx = document.getElementById('angleChart').getContext('2d');
    angleChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: timeLabels,
            datasets: [
                {
                    label: 'Target Angle',
                    data: targetData,
                    borderColor: '#2196F3',
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0 // Remove points from the line
                },
                {
                    label: 'Actual Angle',
                    data: actualData,
                    borderColor: '#4caf50',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0 // Remove points from the line
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 0 // Disable animation for better performance
            },
            scales: {
                x: {
                    display: false // Hide x-axis labels for cleaner look
                },
                y: {
                    beginAtZero: true,
                    max: 130, // Increase maximum to 130%
                    ticks: {
                        color: '#bbb'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false // Hide default legend, we'll use our custom one
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

// Function to update the chart with new data
function updateChart(targetValue, actualValue) {
    // Add timestamp
    const timestamp = new Date().toISOString();
    
    // Store in full data arrays
    fullTargetData.push(targetValue);
    fullActualData.push(actualValue);
    fullTimeData.push(timestamp);
    
    // Update data points count display
    dataPointsCount.textContent = `Data points: ${fullTargetData.length}`;
    
    // Update display arrays based on current window size
    updateDisplayArrays();
    
    // Update the chart
    angleChart.update();
}

// Export data to CSV - modified to include all data points
exportCsvButton.addEventListener('click', exportToCsv);

function exportToCsv() {
    if (fullTargetData.length === 0) {
        alert('No data to export');
        return;
    }
    
    // Create CSV content
    let csvContent = 'Timestamp,Target Angle,Actual Angle\n';
    
    for (let i = 0; i < fullTargetData.length; i++) {
        csvContent += `${fullTimeData[i]},${fullTargetData[i]},${fullActualData[i]}\n`;
    }
    
    // Create a blob with the CSV data
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Create a download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // Set up the download
    link.setAttribute('href', url);
    link.setAttribute('download', `angle_data_${new Date().toISOString().replace(/:/g, '-')}.csv`);
    link.style.visibility = 'hidden';
    
    // Add to document, click and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Update slider value display during dragging (but don't send value)
positionSlider.addEventListener('input', () => {
    positionValue.textContent = positionSlider.value + '%';
});

// Send the position value when the user releases the slider
positionSlider.addEventListener('change', () => {
    sendPositionValue();
    // Update target value in the chart
    updateChart(parseInt(positionSlider.value), actualData[actualData.length - 1]);
});

// Add input validation for PSD values
pInput.addEventListener('input', () => validateInput(pInput, 0, 200));
sInput.addEventListener('input', () => validateInput(sInput, 0, 200));
dInput.addEventListener('input', () => validateInput(dInput, 0, 200));

// Validate input to stay within min-max range
function validateInput(inputElement, min, max) {
    let value = parseInt(inputElement.value);
    
    // Handle empty input
    if (inputElement.value === '') {
        return;
    }
    
    // Enforce min/max constraints
    if (isNaN(value)) {
        inputElement.value = min;
    } else if (value < min) {
        inputElement.value = min;
    } else if (value > max) {
        inputElement.value = max;
    }
}

// Send PSD values button
sendPidButton.addEventListener('click', () => {
    sendPsdValues();
});

// Set min position
setMinButton.addEventListener('click', () => {
    sendMinPosition();
});

// Set max position
setMaxButton.addEventListener('click', () => {
    sendMaxPosition();
});

// Connect to serial port - updated for better disconnection detection
connectButton.addEventListener('click', async () => {
    if (port) {
        // Disconnect if already connected
        try {
            await disconnectFromDevice();
        } catch (error) {
            console.error('Error disconnecting:', error);
        }
        return;
    }

    // Check if Web Serial API is supported
    if (!('serial' in navigator)) {
        alert('Web Serial API is not supported in this browser. Try using Chrome or Edge.');
        return;
    }

    try {
        // Request a port from the user
        port = await navigator.serial.requestPort();
        
        // Open the port
        await port.open({ baudRate: 115200 }); //! baudrate settings ----------------------------------
        
        statusText.textContent = 'Connected';
        statusText.className = 'connected';
        connectButton.textContent = 'Disconnect';
        
        // Enable motor switch when connected
        motorSwitch.disabled = false;
        
        // Set up the reader and writer
        setupCommunication();
    } catch (error) {
        console.error('Error connecting to serial port:', error);
        if (error.name === 'NotFoundError') {
            alert('No compatible serial device was found.');
        } else {
            alert('Error connecting to serial device: ' + error.message);
        }
    }
});

// Proper disconnection from device
async function disconnectFromDevice() {
    if (!port) return;
    
    try {
        console.log('Disconnecting from device');
        
        readLoopRunning = false;
        
        if (reader) {
            await reader.cancel().catch(e => console.error('Error canceling reader:', e));
            reader = null;
        }
        
        if (writer) {
            await writer.close().catch(e => console.error('Error closing writer:', e));
            writer = null;
        }
        
        await port.close().catch(e => console.error('Error closing port:', e));
        port = null;
        
        // Update UI
        statusText.textContent = 'Disconnected';
        statusText.className = 'disconnected';
        connectButton.textContent = 'Connect to Device';
        
        // Disable and reset motor switch
        motorSwitch.disabled = true;
        motorSwitch.checked = false;
        
        // Reset homing status
        homingStatus.textContent = "System Not Homed";
        homingStatus.classList.remove("homed");
        homingStatus.classList.add("not-homed");
        
        console.log('Successfully disconnected from device');
    } catch (error) {
        console.error('Error during disconnect process:', error);
        // Force UI update even if disconnect had errors
        statusText.textContent = 'Disconnected';
        statusText.className = 'disconnected';
        connectButton.textContent = 'Connect to Device';
        port = null;
        reader = null;
        writer = null;
    }
}

// Set up communication with the serial device
async function setupCommunication() {
    try {
        // Create reader and writer
        writer = port.writable.getWriter();
        reader = port.readable.getReader();
        
        // Record that we received a response (setup counts as a response)
        lastDataReceived = Date.now();
        
        // Start the read loop
        readLoopRunning = true;
        readLoop();
    } catch (error) {
        console.error('Error setting up communication:', error);
        statusText.textContent = 'Error: ' + error.message;
        statusText.className = 'disconnected';
    }
}

// Send position value to the serial device
async function sendPositionValue() {
    if (!writer) return;
    
    try {
        const position = positionSlider.value;
        
        // Format: "A:" followed by the position value (e.g., "A:50")
        // Always ensure a newline at the end
        const command = `A:${position}\n`;
        const encoder = new TextEncoder();
        const data = encoder.encode(command);
        await writer.write(data);
        
        console.log('Sent position value:', position);
    } catch (error) {
        console.error('Error sending position value:', error);
    }
}

// Send min position command to the serial device
async function sendMinPosition() {
    if (!writer) return;
    try {
        // Ensure newline at the end
        const command = 'H:0\n';
        const encoder = new TextEncoder();
        const data = encoder.encode(command);
        await writer.write(data);
        console.log('Sent min position command');
    } catch (error) {
        console.error('Error sending min position command:', error);
    }
}

// Send max position command to the serial device
async function sendMaxPosition() {
    if (!writer) return;
    try {
        // Ensure newline at the end
        const command = 'H:1\n';
        const encoder = new TextEncoder();
        const data = encoder.encode(command);
        await writer.write(data);
        console.log('Sent max position command');
    } catch (error) {
        console.error('Error sending max position command:', error);
    }
}

// Send PSD values to the serial device
async function sendPsdValues() {
    if (!writer) return;
    try {
        const p = pInput.value;
        const s = sInput.value;
        const d = dInput.value;
        
        const encoder = new TextEncoder();
        
        // Send each value separately with its own prefix, ensuring newline at the end
        const pCommand = `P:${p}\n`;
        await writer.write(encoder.encode(pCommand));
        console.log('Sent P value:', p);
        
        // Small delay between commands
        await new Promise(r => setTimeout(r, 50));
        
        const sCommand = `S:${s}\n`;
        await writer.write(encoder.encode(sCommand));
        console.log('Sent S value:', s);
        
        // Small delay between commands
        await new Promise(r => setTimeout(r, 50));
        
        const dCommand = `D:${d}\n`;
        await writer.write(encoder.encode(dCommand));
        console.log('Sent D value:', d);
        
        console.log('All PSD values sent separately');
    } catch (error) {
        console.error('Error sending PSD values:', error);
    }
}

// Add motor switch event listener
motorSwitch.addEventListener('change', function() {
    toggleMotor(this.checked);
});

// Toggle motor on/off - improved version
async function toggleMotor(isOn) {
    if (!writer) return;
    
    try {
        // Send Z:1 for on, Z:0 for off, ensuring newline at the end
        const command = `Z:${isOn ? '1' : '0'}\n`;
        const encoder = new TextEncoder();
        const data = encoder.encode(command);
        await writer.write(data);
        
        // Ensure the UI reflects the attempted state
        motorSwitch.checked = isOn;
        
        console.log(`Motor turned ${isOn ? 'ON' : 'OFF'}`);
    } catch (error) {
        console.error('Error toggling motor:', error);
        // Revert switch state if there was an error
        motorSwitch.checked = !isOn;
    }
}

// Read data buffer for serial communication
let dataBuffer = '';

// Read data from the serial device - improved error handling
async function readLoop() {
    while (port && readLoopRunning) {
        try {
            const { value, done } = await reader.read();
            
            if (done) {
                // Reader has been canceled
                console.log('Reader signaled done, exiting read loop');
                await disconnectFromDevice();
                break;
            }
            
            // Update last data received timestamp
            lastDataReceived = Date.now();
            
            // Decode the received data
            const text = new TextDecoder().decode(value);
            
            // Add to buffer
            dataBuffer += text;
            
            // Process complete lines in the buffer
            processSerialBuffer();
        } catch (error) {
            console.error('Error reading from serial port:', error);
            
            // Check for specific disconnection error patterns
            if (
                error.name === 'NetworkError' || 
                error.message.includes('device has been lost') ||
                error.message.includes('device is no longer accessible') ||
                error.message.includes('port is closed') ||
                error.message.includes('connection was closed')
            ) {
                console.error('Detected device disconnection');
                await disconnectFromDevice();
                break;
            }
            
            if (readLoopRunning && port) {
                // For other errors, wait a bit and try again if we're still supposed to be reading
                console.log('Waiting before retry...');
                await new Promise(r => setTimeout(r, 1000));
            } else {
                break;
            }
        }
    }
    
    console.log('Exited read loop');
}

// Process complete lines from the data buffer
function processSerialBuffer() {
    // Split the buffer by newline characters
    const lines = dataBuffer.split('\n');
    
    // Process all complete lines (all except the last one)
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (line.length > 0) {
            processSerialData(line);
        }
    }
    
    // Keep the last incomplete line in the buffer
    dataBuffer = lines[lines.length - 1];
}

// Process data received from the serial device - handle ping response
function processSerialData(data) {
    // We received some data, so update the last response time
    lastDataReceived = Date.now();
    
    // Look for height percentage data in format "HEIGHT:XX.X"
    const heightRegex = /HEIGHT:(\d+(\.\d+)?)/;
    const heightMatch = data.match(heightRegex);
    
    if (heightMatch) {
        const height = parseFloat(heightMatch[1]);
        
        // Update the height percentage display
        heightPercentage.textContent = `${height.toFixed(1)}%`;
        
        // Update the visual indicator - now horizontal
        heightFill.style.width = `${height}%`;
        
        // Update the chart with actual value
        updateChart(targetData[targetData.length - 1] || fullTargetData[fullTargetData.length - 1] || 0, height);
        
        console.log('Received angle percentage:', height);
    }

    // Look for angle data in format "A:XX.X" (A followed by colon and then a number)
    const angleRegex = /A:(\d+(\.\d+)?)/;
    const angleMatch = data.match(angleRegex);
    
    if (angleMatch) {
        const angle = parseFloat(angleMatch[1]);
        
        // Update the height percentage display with the angle
        heightPercentage.textContent = `${angle.toFixed(1)}%`;
        
        // Update the visual indicator
        heightFill.style.width = `${angle}%`;
        
        // Update the chart with actual value
        updateChart(targetData[targetData.length - 1] || fullTargetData[fullTargetData.length - 1] || 0, angle);
        
        console.log('Received current angle:', angle);
    }

    // Check for "H:0" (min position set)
    if (data.includes("H:0")) {
        homingStatus.textContent = "Min Position Set";
        homingStatus.classList.remove("not-homed");
        homingStatus.classList.add("homed");
        console.log('Min position set');
    }

    // Check for "H:1" (max position set => system homed)
    if (data.includes("H:1")) {
        homingStatus.textContent = "System is homed";
        homingStatus.classList.remove("not-homed");
        homingStatus.classList.add("homed");
        console.log('Max position set, system homed');
    }

    // Check for motor status updates (Z:0 or Z:1)
    if (data.includes("Z:0")) {
        motorSwitch.checked = false;
        console.log('Motor status: OFF');
    }
    
    if (data.includes("Z:1")) {
        motorSwitch.checked = true;
        console.log('Motor status: ON');
    }
}
