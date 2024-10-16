// DOM Elements
const videoElement = document.getElementById('video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const scoreElement = document.getElementById('score');
const pausePlayButton = document.getElementById('pause-play');
const muteUnmuteButton = document.getElementById('mute-unmute');
const modeSelector = document.getElementById('mode');
const toggleButton = document.getElementById('toggle-dashboard');
const dashboard = document.getElementById('dashboard');
const mainContent = document.getElementById('main-content');
const pauseOverlay = document.getElementById('pause-overlay'); // Pause overlay element
const gameModeDescription = document.getElementById('game-mode-description'); // Game mode description element

// State Variables
let isDashboardOpen = false;
let isMuted = false;  // Mute state
let isPaused = false;  // Pause state
let score = 0;
let currentMode = 'game';
let currentVolume = 1;
let lastNote = null;
let isPlayingNote = false;
let noteDebounce = false;  // Prevent rapid note changes

// Initialize Enemy Position
function initializeEnemyPosition() {
    x_enemy = getRandomInt(25, canvasElement.width - 25);
    y_enemy = getRandomInt(25, canvasElement.height - 25);
}
let x_enemy, y_enemy;
initializeEnemyPosition();

// Variables for active hand selection in hand tracking mode
let activeHandLabel = null;
let needToSelectActiveHand = true;

// Variables for active limb selection in full body tracking mode
let activeLimbIndex = null;
let needToSelectActiveLimb = true;

// Web Audio API setup for game mode (used for hand tracking game mode)
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let oscillator = null;
let gainNode = null;  // To control volume in game mode
let hitSound = null;

// Tone.js setup for keyboard mode
const synth = new Tone.Synth().toDestination();

// Load Hit Sound
function loadHitSound() {
    const sound = new Audio('hit.wav');
    sound.volume = currentVolume;
    return sound;
}

hitSound = loadHitSound();

// Function to start the pitch sound in game mode
function startPitchSound() {
    if (!oscillator) {
        oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(200, audioContext.currentTime);

        gainNode = audioContext.createGain();  // Create gainNode to control volume
        gainNode.gain.value = currentVolume;  // Set initial volume based on mute state

        oscillator.connect(gainNode).connect(audioContext.destination);
        oscillator.start();
    }
}

// Function to stop the pitch sound in game mode
function stopPitchSound() {
    if (oscillator) {
        oscillator.stop();
        oscillator.disconnect(); // Disconnect the oscillator
        oscillator = null;
        gainNode = null;  // Reset gainNode when oscillator stops
    }
}

// Mute/Unmute functionality for both game mode and keyboard mode
muteUnmuteButton.addEventListener('click', () => {
    isMuted = !isMuted;  // Toggle mute state
    muteUnmuteButton.innerText = isMuted ? 'Unmute' : 'Mute';

    // Mute/unmute for keyboard mode (Tone.js synth)
    if (currentMode === 'keyboard') {
        synth.volume.value = isMuted ? -Infinity : 0;  // Mute or unmute Tone.js synth
    }

    // Mute/unmute for hand tracking game mode and full body mode (Web Audio API oscillator)
    if (currentMode === 'game' || currentMode === 'fullbody') {
        currentVolume = isMuted ? 0 : 1;  // Update currentVolume based on mute state
        hitSound.volume = currentVolume;  // Apply mute/unmute to the hit sound
    }
});

// Hand Game Mode Logic (with Web Audio API)
function handleGameMode(results) {
    drawEnemy();
    scoreElement.innerText = score;

    // Variables to track active hand presence
    let activeHandFound = false;

    // Select active hand if needed
    if (needToSelectActiveHand && results.multiHandedness && results.multiHandedness.length > 0) {
        // Collect the labels of detected hands
        const handLabels = results.multiHandedness.map(hand => hand.label);
        // Randomly select one of the labels
        const randomIndex = getRandomInt(0, handLabels.length);
        activeHandLabel = handLabels[randomIndex];
        needToSelectActiveHand = false;
    }

    if (results.multiHandLandmarks && results.multiHandedness) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i];

            // Determine if this is the active hand
            const isActiveHand = handedness.label === activeHandLabel;

            // Determine the color for the hand
            let handColor = '#FFFFFF'; // Default color for non-active hand
            if (isActiveHand) {
                handColor = 'rgb(255, 0, 0)'; // Red color for active hand
                activeHandFound = true;
            }

            // Draw the hand landmarks and connections
            drawLandmarks(canvasCtx, landmarks, { color: '#6A0DAD', lineWidth: 2 });
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: handColor, lineWidth: 2 });

            // Only process the active hand for interaction
            if (isActiveHand) {
                const indexTip = landmarks[8];
                const x = indexTip.x * canvasElement.width;
                const y = indexTip.y * canvasElement.height;

                const dx = x - x_enemy;
                const dy = y - y_enemy;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Update pitch and volume based on distance
                updatePitchAndVolume(distance);

                // Check for collision with the enemy
                if (distance < 35) {
                    score += 1;
                    initializeEnemyPosition();
                    hitSound.volume = currentVolume;
                    hitSound.play();
                    // Restart the pitch sound
                    stopPitchSound();
                    startPitchSound();
                    needToSelectActiveHand = true; // Need to select a new active hand
                    activeHandLabel = null;
                    break; // Exit the loop since we've handled the collision
                }
            }
        }
    }

    // If active hand is not found among detected hands, set needToSelectActiveHand to true
    if (!activeHandFound && !needToSelectActiveHand) {
        needToSelectActiveHand = true;
        activeHandLabel = null;
    }
}

// Function to update pitch and volume based on distance
function updatePitchAndVolume(distance) {
    if (oscillator && gainNode) {
        const frequency = Math.max(100, Math.min(2000, 2000 - distance * 5));
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);

        // Adjust volume: closer distance -> higher volume
        const maxDistance = 500; // Adjust as needed
        const volume = Math.max(0, Math.min(1, (maxDistance - distance) / maxDistance));

        gainNode.gain.value = currentVolume * volume; // Adjust volume based on mute state
    }
}

// Helper functions
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function drawEnemy() {
    canvasCtx.beginPath();
    canvasCtx.arc(x_enemy, y_enemy, 25, 0, 2 * Math.PI);
    canvasCtx.lineWidth = 5;
    canvasCtx.strokeStyle = 'rgb(0, 200, 0)';
    canvasCtx.stroke();
}

// Mediapipe Hands Setup
const hands = new Hands({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
});

hands.setOptions({
    selfieMode: true, // Set selfieMode to true
    maxNumHands: 2,   // Allow detection of both hands
    modelComplexity: 1,
    minDetectionConfidence: 0.7, // Lowered for better performance on mobile
    minTrackingConfidence: 0.5
});

hands.onResults(onResultsHands);

// Mediapipe Pose Setup
const pose = new Pose({
    locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }
});

pose.setOptions({
    selfieMode: true, // Set selfieMode to true
    modelComplexity: 1,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults(onResultsPose);

// Function to handle results from Hands
function onResultsHands(results) {
    if (isPaused) return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw the video frame as-is
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    if (currentMode === 'game') {
        handleGameMode(results);
    } else if (currentMode === 'keyboard') {
        handleKeyboardMode(results);
    } else if (currentMode === 'fingercount') {
        handleFingerCountMode(results);
    }

    canvasCtx.restore();
}

// Function to handle results from Pose
function onResultsPose(results) {
    if (isPaused || currentMode !== 'fullbody') return;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Draw the video frame as-is
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    handleFullBodyMode(results);

    canvasCtx.restore();
}

// Function to handle Full Body Mode
function handleFullBodyMode(results) {
    drawEnemy();
    scoreElement.innerText = score;

    if (results.poseLandmarks) {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#FFFFFF', lineWidth: 4 });
        drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#6A0DAD', lineWidth: 2 });

        const landmarksToTrack = [
            { landmark: results.poseLandmarks[15], name: 'Right Wrist' }, // Right wrist
            { landmark: results.poseLandmarks[16], name: 'Left Wrist' },  // Left wrist
            { landmark: results.poseLandmarks[27], name: 'Right Ankle' }, // Right ankle
            { landmark: results.poseLandmarks[28], name: 'Left Ankle' }   // Left ankle
        ];

        // Select active limb if needed
        if (needToSelectActiveLimb) {
            activeLimbIndex = getRandomInt(0, landmarksToTrack.length);
            needToSelectActiveLimb = false;
        }

        let activeLimbFound = false;

        for (let i = 0; i < landmarksToTrack.length; i++) {
            const limbInfo = landmarksToTrack[i];
            const landmark = limbInfo.landmark;

            // Check if the landmark is visible (visibility > threshold)
            if (landmark.visibility < 0.5) {
                continue; // Skip processing if landmark is not visible
            }

            const isActiveLimb = i === activeLimbIndex;

            // Draw a circle at the landmark position
            const x = landmark.x * canvasElement.width;
            const y = landmark.y * canvasElement.height;

            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 10, 0, 2 * Math.PI);
            canvasCtx.fillStyle = isActiveLimb ? 'rgba(255, 0, 0, 0.8)' : 'rgba(0, 255, 0, 0.8)';
            canvasCtx.fill();

            if (isActiveLimb) {
                activeLimbFound = true;

                const dx = x - x_enemy;
                const dy = y - y_enemy;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Update pitch and volume based on distance
                updatePitchAndVolume(distance);

                // Check for collision with the enemy
                if (distance < 35) {
                    score += 1;
                    initializeEnemyPosition();
                    hitSound.volume = currentVolume;
                    hitSound.play();
                    // Restart the pitch sound
                    stopPitchSound();
                    startPitchSound();
                    needToSelectActiveLimb = true; // Need to select a new active limb
                    activeLimbIndex = null;
                    break; // Exit the loop since we've handled the collision
                }
            }
        }

        // If active limb is not found, set needToSelectActiveLimb to true
        if (!activeLimbFound && !needToSelectActiveLimb) {
            needToSelectActiveLimb = true;
            activeLimbIndex = null;
        }
    }
}

// Keyboard Mode - C Major Scale on X and Pitch on Y
function handleKeyboardMode(results) {
    if (results.multiHandLandmarks && !isPaused) {
        for (const landmarks of results.multiHandLandmarks) {
            const indexTip = landmarks[8];  // The tip of the index finger
            const x = indexTip.x * canvasElement.width;
            const y = indexTip.y * canvasElement.height;

            // Visual feedback for hand tracking (optional)
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 10, 0, 2 * Math.PI);
            canvasCtx.fillStyle = 'rgba(0, 255, 0, 0.5)';
            canvasCtx.fill();

            // Get note based on the X-axis (C Major scale)
            const note = getNoteFromX(x);

            // Adjust pitch (detune) based on Y-axis
            const detuneValue = getDetuneFromY(y);

            if (!noteDebounce && (note !== lastNote || !isPlayingNote)) {
                // If the note changes or no note is playing, release the last note and play the new one
                if (isPlayingNote) {
                    synth.triggerRelease(Tone.now());
                }
                synth.triggerAttack(note, Tone.now());  // Play the note
                synth.detune.value = detuneValue;  // Apply detune based on Y-axis
                lastNote = note;
                isPlayingNote = true;

                // Set a debounce period to avoid triggering notes too rapidly
                noteDebounce = true;
                setTimeout(() => {
                    noteDebounce = false;
                }, 200);  // 200 milliseconds debounce
            }

            // Continuously adjust detune for the current note based on Y-axis movement
            synth.detune.value = detuneValue;
        }
    } else {
        stopPlayingNote();
    }
}

// Function to handle Finger Count Mode
function handleFingerCountMode(results) {
    if (results.multiHandLandmarks && results.multiHandedness && !isPaused) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i];

            // Do not draw the skeleton in this mode

            const fingerCount = countFingers(landmarks, handedness);
            // Display the number of raised fingers
            canvasCtx.font = 'bold 60px Arial';
            canvasCtx.fillStyle = 'rgba(87, 82, 196, 1)'; // Purple color
            // Position the text near the hand
            const x = landmarks[0].x * canvasElement.width;
            const y = landmarks[0].y * canvasElement.height;
            canvasCtx.fillText(fingerCount.toString(), x - 30, y - 30);
        }
    }
}

// Function to count fingers
function countFingers(landmarks, handedness) {
    const isRightHand = handedness.label === 'Right';

    // Thumb: Compare tip and base x-coordinates
    let thumbIsOpen;
    if (isRightHand) {
        thumbIsOpen = landmarks[4].x < landmarks[3].x;
    } else {
        thumbIsOpen = landmarks[4].x > landmarks[3].x;
    }

    // Other fingers: Compare tip and PIP y-coordinates
    const fingers = [
        landmarks[8].y < landmarks[6].y,   // Index finger
        landmarks[12].y < landmarks[10].y, // Middle finger
        landmarks[16].y < landmarks[14].y, // Ring finger
        landmarks[20].y < landmarks[18].y  // Pinky finger
    ];

    const numOpenFingers = fingers.filter(isOpen => isOpen).length;
    return (thumbIsOpen ? 1 : 0) + numOpenFingers;
}

function getNoteFromX(x) {
    // Divide the X-axis into 8 regions for the C Major scale: C4, D4, E4, F4, G4, A4, B4, C5
    const notes = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
    const index = Math.floor((x / canvasElement.width) * notes.length);
    return notes[index] || "C4";  // Default to "C4" if no valid index
}

function getDetuneFromY(y) {
    // The detune value will range from -1200 cents (one octave lower) to +1200 cents (one octave higher)
    const maxDetune = 1200;  // 1200 cents is one octave
    const normalizedY = y / canvasElement.height;  // Normalize Y position (0 at top, 1 at bottom)
    const detuneValue = (1 - normalizedY) * maxDetune * 2 - maxDetune;  // Calculate detune in cents
    return detuneValue;  // Return detune in cents (-1200 to +1200)
}

function stopPlayingNote() {
    if (isPlayingNote) {
        synth.triggerRelease(Tone.now());
        isPlayingNote = false;
    }
}

// Pause/Play button functionality
pausePlayButton.addEventListener('click', () => {
    isPaused = !isPaused;  // Toggle paused state
    if (isPaused) {
        stopPlayingNote();  // Stop any currently playing notes
        stopPitchSound();   // Stop the oscillator in game mode
        pausePlayButton.innerText = 'Play';  // Update button text to "Play"
        pauseOverlay.style.visibility = 'visible';  // Show the purple pause overlay
    } else {
        pausePlayButton.innerText = 'Pause';  // Update button text to "Pause"
        pauseOverlay.style.visibility = 'hidden';  // Hide the purple pause overlay
        if (currentMode === 'game' || currentMode === 'fullbody') {
            startPitchSound(); // Start the oscillator if resuming game mode or full body mode
        }
    }
});

// Overlay click to resume
pauseOverlay.addEventListener('click', () => {
    if (isPaused) {
        isPaused = false;  // Unpause the game
        pausePlayButton.innerText = 'Pause';  // Update button text
        pauseOverlay.style.visibility = 'hidden';  // Hide the purple overlay
        if (currentMode === 'game' || currentMode === 'fullbody') {
            startPitchSound(); // Start the oscillator if resuming game mode or full body mode
        }
    }
});

// Handle mode switching
modeSelector.addEventListener('change', (event) => {
    // Stop the oscillator when switching modes
    stopPitchSound();
    currentMode = event.target.value;
    resetMode();
    updateGameModeDescription(); // Update the description when mode changes
});

function resetMode() {
    stopPlayingNote(); // Stop any ongoing sounds from keyboard mode
    stopPitchSound();  // Stop any oscillator from game mode

    if (currentMode === 'fullbody') {
        pose.onResults(onResultsPose);
        hands.onResults(null);
        startPitchSound(); // Start the oscillator when entering full body mode
    } else {
        hands.onResults(onResultsHands);
        pose.onResults(null);
        if (currentMode === 'game') {
            startPitchSound(); // Start the oscillator when entering game mode
        }
    }
}

// Camera setup with responsive resolution
const camera = new Camera(videoElement, {
    onFrame: async () => {
        if (!isPaused) {
            if (currentMode === 'fullbody') {
                await pose.send({ image: videoElement });
            } else {
                await hands.send({ image: videoElement });
            }
        }
    },
    width: window.innerWidth < 768 ? 320 : 640, // Lower resolution for mobile
    height: window.innerWidth < 768 ? 240 : 480
});

// Start the camera after the page has fully loaded
window.addEventListener('load', () => {
    camera.start();
});

// Handle orientation changes
window.addEventListener('resize', () => {
    adjustCanvasSize();
});

// Dashboard toggle functionality
toggleButton.addEventListener('click', () => {
    if (isDashboardOpen) {
        dashboard.classList.remove('open');
        mainContent.classList.remove('open');
        toggleButton.classList.remove('open');
    } else {
        dashboard.classList.add('open');
        mainContent.classList.add('open');
        toggleButton.classList.add('open');
    }
    isDashboardOpen = !isDashboardOpen;
});

// Adjust canvas size to match video size
function adjustCanvasSize() {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    initializeEnemyPosition(); // Re-initialize enemy position after canvas size changes
}

// Adjust canvas size once the video metadata is loaded
videoElement.addEventListener('loadedmetadata', adjustCanvasSize);

// Game Mode Descriptions
const gameModeDescriptions = {
    'game': 'In Hand Tracking Game mode, only one randomly selected hand can interact with the target. The active hand is highlighted. Try to reach the target and increase your score!',
    'keyboard': 'In Keyboard Mode, play musical notes using your hand movements. Move your hand across the screen to play different notes.',
    'fullbody': 'In Full Body Tracking mode, only one randomly selected limb (hand or foot) can interact with the target. The active limb is highlighted. Get closer to the target to increase the sound volume!',
    'fingercount': 'In Finger Count Mode, hold up fingers to see how many are detected. This mode counts the number of fingers you are holding up.'
};

// Function to update the game mode description
function updateGameModeDescription() {
    const description = gameModeDescriptions[currentMode] || '';
    gameModeDescription.textContent = description;
}

// Call the function initially to set the default description
updateGameModeDescription();

// Audio Context Resume on User Interaction (for browsers that require it)
document.body.addEventListener('click', () => {
    if (audioContext.state !== 'running') {
        audioContext.resume();
    }
    // Also resume Tone.js context
    if (Tone.context.state !== 'running') {
        Tone.context.resume();
    }
}, { once: true });
