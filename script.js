// DOM elements
const connectButton = document.getElementById('connect-button');
const statusText = document.getElementById('status-text');
const positionSlider = document.getElementById('position-slider');
const positionValue = document.getElementById('position-value');
const homingStatus = document.getElementById('homing-status');
const heightPercentage = document.getElementById('height-percentage');
const heightFill = document.getElementById('height-fill');
const setPositionButton = document.getElementById('set-position-button');
const motorSwitch = document.getElementById('motor-switch');
const pInput = document.getElementById('p-input');
const sInput = document.getElementById('s-input');
const dInput = document.getElementById('d-input');
const sendPidButton = document.getElementById('send-pid-button');
const exportCsvButton = document.getElementById('export-csv');
const angleDataPointsCount = document.getElementById('angle-data-points-count');
const regulatorDataPointsCount = document.getElementById('regulator-data-points-count');
const viewSlider = document.getElementById('view-slider');
const viewValue = document.getElementById('view-value');
const regulatorViewSlider = document.getElementById('regulator-view-slider');
const regulatorViewValue = document.getElementById('regulator-view-value');

// Storage keys for localStorage
const STORAGE_KEY_P = 'regulator_p_value';
const STORAGE_KEY_S = 'regulator_s_value';
const STORAGE_KEY_D = 'regulator_d_value';
const STORAGE_KEY_VIEW = 'regulator_view_window';
const STORAGE_KEY_REG_VIEW = 'regulator_reg_view_window';

// Serial port variables
let port;
let reader;
let writer;
let readLoopRunning = false;
let handshakeCompleted = false;
let handshakeTimeout = null;

// Connection monitoring variables
let lastDataReceived = 0;
let connectionTimeoutMs = 10000; // Consider connection stale after 10 seconds without data

// Add event listener for the connect button
connectButton.addEventListener('click', async function() {
    // If already connected, disconnect
    if (port) {
        closeConnection();
        return;
    }
    
    try {
        // Request a serial port
        port = await navigator.serial.requestPort();
        
        // Open the port with standard baud rate for Arduino
        await port.open({ baudRate: 9600 });
        
        // Create reader and writer
        reader = port.readable.getReader();
        writer = port.writable.getWriter();
        
        // Update UI
        connectButton.textContent = 'Disconnect';
        statusText.textContent = 'Connecting...';
        statusText.className = 'connecting';
        
        // Start reading from the port
        startReadLoop();
        
        // Send handshake to the device
        await sendHandshake();
        
    } catch (error) {
        console.error('Failed to open serial port:', error);
        statusText.textContent = 'Connection failed';
        statusText.className = 'disconnected';
        closeConnection();
    }
});

// Function to close the connection
async function closeConnection() {
    // Update connection status
    handshakeCompleted = false;
    
    // Clear any pending handshake timeout
    if (handshakeTimeout) {
        clearTimeout(handshakeTimeout);
        handshakeTimeout = null;
    }
    
    // Signal the read loop to stop
    readLoopRunning = false;
    
    try {
        // Release reader and writer
        if (reader) {
            await reader.cancel();
            reader.releaseLock();
            reader = null;
        }
        
        if (writer) {
            writer.releaseLock();
            writer = null;
        }
        
        // Close the port
        if (port) {
            await port.close();
            port = null;
        }
    } catch (error) {
        console.error('Error closing connection:', error);
    }
    
    // Update UI
    connectButton.textContent = 'Connect';
    statusText.textContent = 'Disconnected';
    statusText.className = 'disconnected';
    
    // Disable motor switch when disconnected
    motorSwitch.checked = false;
    motorSwitch.disabled = true;
}

// Function to start the read loop
async function startReadLoop() {
    const decoder = new TextDecoder();
    let buffer = '';
    readLoopRunning = true;
    
    try {
        while (readLoopRunning && reader) {
            const { value, done } = await reader.read();
            
            if (done) {
                break;
            }
            
            // Decode and buffer the received data
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the last incomplete line in the buffer
            
            // Process each complete line
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    processSerialData(trimmedLine);
                }
            }
        }
    } catch (error) {
        console.error('Error in read loop:', error);
    } finally {
        // If we're still running, it means we had an error, so try to clean up
        if (readLoopRunning) {
            closeConnection();
        }
    }
}

// Function to send handshake to the device
async function sendHandshake() {
    try {
        await sendCommand('M');
        
        // Set a timeout for handshake response
        handshakeTimeout = setTimeout(() => {
            console.error('Handshake timeout');
            statusText.textContent = 'Handshake failed';
            statusText.className = 'disconnected';
            closeConnection();
        }, 3000); // Wait 3 seconds for handshake response
        
    } catch (error) {
        console.error('Error sending handshake:', error);
        closeConnection();
    }
}

// Add event listener for motor switch
motorSwitch.addEventListener('change', function() {
    if (!port || !handshakeCompleted) return;
    // Use 'Z:1' to turn motor on and 'Z:0' to turn it off
    // This matches the format that's being received in processSerialData
    const command = this.checked ? 'Z:1' : 'Z:0';
    sendCommand(command);
});

// Add event listener for set position button
setPositionButton.addEventListener('click', function() {
    if (!port || !handshakeCompleted) return;
    
    // Send different commands based on current homing step
    if (currentHomingStep === 0) {
        // Set min position
        sendCommand('B');
    } else if (currentHomingStep === 1) {
        // Set max position
        sendCommand('D');
    }
});

// Add event listener for send PID button
sendPidButton.addEventListener('click', function() {
    if (!port || !handshakeCompleted) return;
    
    // Get PID values
    const p = parseFloat(pInput.value);
    const s = parseFloat(sInput.value);
    const d = parseFloat(dInput.value);
    
    // Validate values
    if (isNaN(p) || isNaN(s) || isNaN(d)) {
        alert('Please enter valid numbers for P, S, and D');
        return;
    }
    
    // Send PID values to the device
    sendCommand(`P:${p.toFixed(2)}`);
    sendCommand(`S:${s.toFixed(2)}`);
    sendCommand(`D:${d.toFixed(2)}`);
    
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY_P, p);
    localStorage.setItem(STORAGE_KEY_S, s);
    localStorage.setItem(STORAGE_KEY_D, d);
});

// Set up periodic connection check
setInterval(function() {
    if (port && handshakeCompleted) {
        const timeSinceLastData = Date.now() - lastDataReceived;
        if (timeSinceLastData > connectionTimeoutMs) {
            console.warn('Connection timeout - no data received in', timeSinceLastData, 'ms');
            statusText.textContent = 'Connection lost';
            statusText.className = 'disconnected';
            closeConnection();
        }
    }
}, 5000); // Check every 5 seconds

// Remove the input event listener and only use the change event
// This removes the continuous updating while dragging
// and only updates when the user releases the slider

// Add event listener for slider change to update display and send command to device
positionSlider.addEventListener('change', function() {
    const value = parseInt(this.value);
    
    // Update the position value display
    positionValue.textContent = `${value}%`;
    
    // Update the chart with the new target value while keeping the current actual value
    const currentActual = actualData[actualData.length - 1] || 0;
    updateChart(value, currentActual);
    
    // Only send command if we're connected
    if (port && handshakeCompleted) {
        // Send command to set position - format: "T:xx" (Target position)
        sendCommand(`T:${value}`);
    } else {
        console.log('Not connected - cannot send position');
    }
});

// Function to send a command to the device
async function sendCommand(command) {
    if (!port || !writer) {
        console.error('No connection available');
        return;
    }
    
    try {
        // Add newline to the command
        const commandWithNewline = command + '\n';
        // Convert to ArrayBuffer
        const encoder = new TextEncoder();
        const data = encoder.encode(commandWithNewline);
        
        // Write the data to the serial port
        await writer.write(data);
        console.log('Command sent:', command);
    } catch (error) {
        console.error('Error sending command:', error);
    }
}

// Chart variables
let angleChart;
let regulatorChart;
let viewWindowSize = 100; // Default number of points to show on the graph, configurable up to 1000
let regulatorWindowSize = 100; // Default number of points to show on the regulator graph

// Full data storage arrays - with capacity for much larger datasets
const fullTargetData = [];
const fullActualData = [];
const fullTimeData = [];

// Regulator data storage arrays
const fullPData = [];
const fullSData = [];
const fullDData = [];
const fullXData = [];
const fullRegTimeData = [];

// Display data (window of the full data)
let targetData = Array(viewWindowSize).fill(0);
let actualData = Array(viewWindowSize).fill(0);
let timeLabels = Array(viewWindowSize).fill('');

// Regulator display data
let pData = Array(regulatorWindowSize).fill(0);
let sData = Array(regulatorWindowSize).fill(0);
let dData = Array(regulatorWindowSize).fill(0);
let xData = Array(regulatorWindowSize).fill(0);
let regTimeLabels = Array(regulatorWindowSize).fill('');

// Homing status tracking variables
let currentHomingStep = 0; // 0: Not started, 1: Min set (waiting for max), 2: Fully homed

// Initialize the chart when the page loads
document.addEventListener('DOMContentLoaded', function() {
    initChart();
    initRegulatorChart();
    
    // Load saved values from localStorage
    loadSavedSettings();
});

// Add view window slider listener
viewSlider.addEventListener('input', function() {
    viewWindowSize = parseInt(this.value);
    viewValue.textContent = `${viewWindowSize} points`;
    
    // Update the arrays for the chart
    updateDisplayArrays();
    
    // Rebuild the chart with new window size
    angleChart.update();
    
    // Save view window size to localStorage
    localStorage.setItem(STORAGE_KEY_VIEW, viewWindowSize);
});

// Add regulator view window slider listener
regulatorViewSlider.addEventListener('input', function() {
    regulatorWindowSize = parseInt(this.value);
    regulatorViewValue.textContent = `${regulatorWindowSize} points`;
    
    // Update the arrays for the regulator chart
    updateRegulatorDisplayArrays();
    
    // Rebuild the chart with new window size
    regulatorChart.update();
    
    // Save regulator view window size to localStorage
    localStorage.setItem(STORAGE_KEY_REG_VIEW, regulatorWindowSize);
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

// Function to update the regulator display arrays based on window size
function updateRegulatorDisplayArrays() {
    // Create new arrays with the right size
    pData = Array(regulatorWindowSize).fill(0);
    sData = Array(regulatorWindowSize).fill(0);
    dData = Array(regulatorWindowSize).fill(0);
    xData = Array(regulatorWindowSize).fill(0);
    regTimeLabels = Array(regulatorWindowSize).fill('');
    
    // If we have data, populate the arrays
    if (fullPData.length > 0) {
        const dataLength = Math.min(regulatorWindowSize, fullPData.length);
        const startIndex = Math.max(0, fullPData.length - dataLength);
        
        for (let i = 0; i < dataLength; i++) {
            const fullIndex = startIndex + i;
            pData[i] = fullPData[fullIndex];
            sData[i] = fullSData[fullIndex];
            dData[i] = fullDData[fullIndex];
            xData[i] = fullXData[fullIndex];
            regTimeLabels[i] = i.toString();
        }
    }
    
    // Update the chart datasets
    regulatorChart.data.labels = regTimeLabels;
    regulatorChart.data.datasets[0].data = pData;
    regulatorChart.data.datasets[1].data = sData;
    regulatorChart.data.datasets[2].data = dData;
    regulatorChart.data.datasets[3].data = xData;
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

// Initialize the regulator chart
function initRegulatorChart() {
    const ctx = document.getElementById('regulatorChart').getContext('2d');
    regulatorChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: regTimeLabels,
            datasets: [
                {
                    label: 'P Value',
                    data: pData,
                    borderColor: '#FF5722',
                    backgroundColor: 'rgba(255, 87, 34, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0 // Remove points from the line
                },
                {
                    label: 'S Value',
                    data: sData,
                    borderColor: '#9C27B0',
                    backgroundColor: 'rgba(156, 39, 176, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0 // Remove points from the line
                },
                {
                    label: 'D Value',
                    data: dData,
                    borderColor: '#FFEB3B',
                    backgroundColor: 'rgba(255, 235, 59, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: false,
                    pointRadius: 0 // Remove points from the line
                },
                {
                    label: 'X Output',
                    data: xData,
                    borderColor: '#00BCD4',
                    backgroundColor: 'rgba(0, 188, 212, 0.1)',
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
                    beginAtZero: false,
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
    // Get current system time in HH:MM:SS.mmm format
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
    const timestamp = `${hours}:${minutes}:${seconds}.${milliseconds}`;
    
    // Store in full data arrays
    fullTargetData.push(targetValue);
    fullActualData.push(actualValue);
    fullTimeData.push(timestamp);
    
    // Update data points count display
    angleDataPointsCount.textContent = `Angle data: ${fullTargetData.length} points`;
    
    // Update display arrays based on current window size
    updateDisplayArrays();
    
    // Update the chart
    angleChart.update();
}

// Function to update the regulator chart with new data
function updateRegulatorChart(pValue, sValue, dValue, xValue) {
    // Get current system time in HH:MM:SS.mmm format
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    const milliseconds = now.getMilliseconds().toString().padStart(3, '0');
    const timestamp = `${hours}:${minutes}:${seconds}.${milliseconds}`;
    
    // Store in full data arrays
    fullPData.push(pValue);
    fullSData.push(sValue);
    fullDData.push(dValue);
    fullXData.push(xValue);
    fullRegTimeData.push(timestamp);
    
    // Update regulator data points count display
    regulatorDataPointsCount.textContent = `Regulator data: ${fullPData.length} points`;
    
    // Update display arrays based on current window size
    updateRegulatorDisplayArrays();
    
    // Update the chart
    regulatorChart.update();
}

// Export data to CSV - modified to include all data points and regulator data
exportCsvButton.addEventListener('click', exportToCsv);

function exportToCsv() {
    if (fullTargetData.length === 0 && fullPData.length === 0) {
        alert('No data to export');
        return;
    }
    
    // Create CSV content
    let csvContent = 'Time,Target Angle,Actual Angle,P Value,S Value,D Value,X Output\n';
    
    // Determine the maximum length of data arrays
    const maxLength = Math.max(fullTargetData.length, fullPData.length);
    
    for (let i = 0; i < maxLength; i++) {
        const time = i < fullTimeData.length ? fullTimeData[i] : '';
        const target = i < fullTargetData.length ? fullTargetData[i] : '';
        const actual = i < fullActualData.length ? fullActualData[i] : '';
        const pVal = i < fullPData.length ? fullPData[i] : '';
        const sVal = i < fullSData.length ? fullSData[i] : '';
        const dVal = i < fullDData.length ? fullDData[i] : '';
        const xVal = i < fullXData.length ? fullXData[i] : '';
        
        csvContent += `${time},${target},${actual},${pVal},${sVal},${dVal},${xVal}\n`;
    }
    
    // Create a blob with the CSV data
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    // Create a download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // Set up the download - still include date in filename
    const currentDate = new Date().toISOString().split('T')[0];
    const currentTime = new Date().toTimeString().slice(0,8).replace(/:/g, '-');
    link.setAttribute('href', url);
    link.setAttribute('download', `regulator_data_${currentDate}_${currentTime}.csv`);
    link.style.visibility = 'hidden';
    
    // Add to document, click and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function to load saved settings from localStorage
function loadSavedSettings() {
    // Load PSD values
    const savedP = localStorage.getItem(STORAGE_KEY_P);
    const savedS = localStorage.getItem(STORAGE_KEY_S);
    const savedD = localStorage.getItem(STORAGE_KEY_D);
    
    if (savedP !== null) {
        pInput.value = savedP;
    }
    
    if (savedS !== null) {
        sInput.value = savedS;
    }
    
    if (savedD !== null) {
        dInput.value = savedD;
    }
    
    // Load view window size
    const savedView = localStorage.getItem(STORAGE_KEY_VIEW);
    if (savedView !== null) {
        viewWindowSize = parseInt(savedView);
        viewSlider.value = viewWindowSize;
        viewValue.textContent = `${viewWindowSize} points`;
        
        // Reset chart data arrays with the correct size
        targetData = Array(viewWindowSize).fill(0);
        actualData = Array(viewWindowSize).fill(0);
        timeLabels = Array(viewWindowSize).fill('');
    }
    
    // Load regulator view window size
    const savedRegView = localStorage.getItem(STORAGE_KEY_REG_VIEW);
    if (savedRegView !== null) {
        regulatorWindowSize = parseInt(savedRegView);
        regulatorViewSlider.value = regulatorWindowSize;
        regulatorViewValue.textContent = `${regulatorWindowSize} points`;
        
        // Reset chart data arrays with the correct size
        pData = Array(regulatorWindowSize).fill(0);
        sData = Array(regulatorWindowSize).fill(0);
        dData = Array(regulatorWindowSize).fill(0);
        xData = Array(regulatorWindowSize).fill(0);
        regTimeLabels = Array(regulatorWindowSize).fill('');
    }
}

// Process data received from the serial device
function processSerialData(data) {
    // Print raw data to console for debugging
    console.log('Serial received:', data);
    
    // We received some data, so update the last response time
    lastDataReceived = Date.now();
    
    // Check for handshake confirmation
    if (data.trim() === 'N') {
        console.log('Received handshake confirmation (N)');
        handshakeCompleted = true;
        
        if (handshakeTimeout) {
            clearTimeout(handshakeTimeout);
            handshakeTimeout = null;
        }
        
        // Now we can consider the connection established
        statusText.textContent = 'Connected';
        statusText.className = 'connected';
        
        // Enable motor switch when connected
        motorSwitch.disabled = false;
        
        // Reset homing status on new connection
        currentHomingStep = 0;
        setPositionButton.textContent = "Set Min Position";
        setPositionButton.disabled = false;
        homingStatus.textContent = "System Not Homed";
        homingStatus.classList.remove("homed");
        homingStatus.classList.add("not-homed");
        
        return; // Skip other processing for the handshake confirmation
    }
    
    // Only process other data if handshake is completed
    if (!handshakeCompleted) return;
    
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

    // Look for regulator P value data in format "P:XX.X"
    const pRegex = /P:(-?\d+(\.\d+)?)/;
    const pMatch = data.match(pRegex);
    
    if (pMatch) {
        const pValue = parseFloat(pMatch[1]);
        console.log('Received P value:', pValue);
        
        // Store the last P value for the next regulator chart update
        lastPValue = pValue;
    }
    
    // Look for regulator S value data in format "S:XX.X"
    const sRegex = /S:(-?\d+(\.\d+)?)/;
    const sMatch = data.match(sRegex);
    
    if (sMatch) {
        const sValue = parseFloat(sMatch[1]);
        console.log('Received S value:', sValue);
        
        // Store the last S value for the next regulator chart update
        lastSValue = sValue;
    }
    
    // Look for regulator D value data in format "D:XX.X"
    const dRegex = /D:(-?\d+(\.\d+)?)/;
    const dMatch = data.match(dRegex);
    
    if (dMatch) {
        const dValue = parseFloat(dMatch[1]);
        console.log('Received D value:', dValue);
        
        // Store the last D value for the next regulator chart update
        lastDValue = dValue;
    }
    
    // Look for regulator X value data in format "X:XX.X"
    const xRegex = /X:(-?\d+(\.\d+)?)/;
    const xMatch = data.match(xRegex);
    
    if (xMatch) {
        const xValue = parseFloat(xMatch[1]);
        console.log('Received X value:', xValue);
        
        // Update the regulator chart with all values
        // We assume we have received all PSDX values when we get the X value
        updateRegulatorChart(
            typeof lastPValue !== 'undefined' ? lastPValue : 0,
            typeof lastSValue !== 'undefined' ? lastSValue : 0,
            typeof lastDValue !== 'undefined' ? lastDValue : 0,
            xValue
        );
    }

    // Check for "C" (min position confirmed)
    if (data.trim() === "C") {
        currentHomingStep = 1;
        setPositionButton.textContent = "Set Max Position";
        console.log('Min position confirmed (C received)');
    }

    // Check for "E" (max position confirmed, system fully homed)
    if (data.trim() === "E") {
        currentHomingStep = 2;
        setPositionButton.disabled = true;
        setSystemHomed();
        console.log('Max position confirmed (E received), system fully homed');
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

// Initialize variables to store the last received values
let lastPValue, lastSValue, lastDValue;

// Function to set the system as homed
function setSystemHomed() {
    homingStatus.textContent = "System is homed";
    homingStatus.classList.remove("not-homed");
    homingStatus.classList.add("homed");
    setPositionButton.classList.add("disabled");
}