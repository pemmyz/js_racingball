import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- CONFIGURATION ---
const CONFIG = {
    ballRadius: 0.5,
    ballMass: 5,
    moveForce: 20,
    brakeForce: 2,
    jumpVelocity: 10, // Velocity needed to jump approx 5 units high
    cameraOffset: new THREE.Vector3(0, 5, -10),
    cameraLerp: 0.1,
    respawnY: -10, 
    colors: {
        ball: 0x00ffff,
        ground: 0x222222,
        obstacle: 0xff4444,
        dynamicBox: 0x8888ff,
        credit: 0xffd700
    }
};

// --- GLOBALS ---
let scene, camera, renderer;
let world; 
let ballMesh, ballBody;
let collectibles = [];
let movingObstacles = []; // Stores Rotating, Sliding, and Dynamic objects
let score = 0;
let isReseting = false;

const inputs = { w: false, a: false, s: false, d: false, space: false };

// --- GYRO / MOUSE GLOBALS ---
let gameState = 'MENU'; // 'MENU', 'CALIBRATING', 'PLAYING'
let useGyro = false;
let isMobile = false; 
let baseBeta = 0;
let baseGamma = 0;
let tiltX = 0; 
let tiltY = 0; 
let smoothTiltX = 0; // For smooth visual camera interpolation
let smoothTiltY = 0;
const maxTilt = 30;

// --- INITIALIZATION ---
function init() {
    // 1. Setup Three.js
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101015);
    scene.fog = new THREE.Fog(0x101015, 10, 60);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.top = 50;
    dirLight.shadow.camera.bottom = -50;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    scene.add(dirLight);

    // 2. Setup Cannon-es Physics
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    
    const defaultMaterial = new CANNON.Material('default');
    const defaultContactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
        friction: 0.4,
        restitution: 0.2,
    });
    world.addContactMaterial(defaultContactMaterial);

    // 3. Create Objects
    createPlayer();
    generateLevel();
    setupInputs();

    // 4. Start Loop
    animate();
}

// --- PLAYER ---
function createPlayer() {
    // Mesh
    const geometry = new THREE.SphereGeometry(CONFIG.ballRadius, 32, 32);
    const material = new THREE.MeshStandardMaterial({ 
        color: CONFIG.colors.ball,
        emissive: 0x004444,
        roughness: 0.2,
        metalness: 0.8
    });
    ballMesh = new THREE.Mesh(geometry, material);
    ballMesh.castShadow = true;
    scene.add(ballMesh);

    // Body
    const shape = new CANNON.Sphere(CONFIG.ballRadius);
    ballBody = new CANNON.Body({
        mass: CONFIG.ballMass,
        shape: shape,
        position: new CANNON.Vec3(0, 2, 0),
        linearDamping: 0.3,
        angularDamping: 0.3
    });
    world.addBody(ballBody);
}

// --- LEVEL GENERATION ---
function generateLevel() {
    
    // 1. Static Platform Helper
    const createPlatform = (x, y, z, w, h, d, color = CONFIG.colors.ground) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(shape);
        body.position.set(x, y, z);
        world.addBody(body);
    };

    // 2. Rotating Obstacle Helper
    const createRotator = (x, y, z, w, h, d, speed) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.obstacle });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
        body.addShape(shape);
        body.position.set(x, y, z);
        world.addBody(body);

        movingObstacles.push({ mesh, body, speed, type: 'rotateY' });
    };

    // 3. Sliding Obstacle Helper
    const createSlider = (x, y, z, w, h, d, speed, range) => {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.obstacle });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
        body.addShape(shape);
        body.position.set(x, y, z);
        world.addBody(body);

        movingObstacles.push({ 
            mesh, body, speed, range, 
            type: 'pingpongX', 
            initialX: x 
        });
    };

    // 4. Dynamic Smash Box Helper
    const createSmashBox = (x, y, z) => {
        const size = 0.8;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.dynamicBox });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.castShadow = true;
        scene.add(mesh);

        const shape = new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2));
        const body = new CANNON.Body({ mass: 1 });
        body.addShape(shape);
        body.position.set(x, y, z);
        world.addBody(body);
        
        movingObstacles.push({ mesh, body, type: 'dynamic' });
    };

    // 5. Collectible Helper
    const createCredit = (x, y, z) => {
        const geo = new THREE.OctahedronGeometry(0.3);
        const mat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.credit, emissive: 0xffaa00, emissiveIntensity: 0.5 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        collectibles.push({ mesh, active: true });
    };

    // --- MAP LAYOUT ---

    // Part 1: Start
    createPlatform(0, 0, 0, 4, 1, 10);
    createCredit(0, 1, 0);

    // Part 2: Bridge
    createPlatform(0, 0, 10, 1.5, 1, 10);
    createCredit(0, 1, 10);

    // Part 3: Wide Area with Rotator
    createPlatform(0, 0, 25, 8, 1, 15);
    createRotator(0, 1.5, 25, 6, 0.5, 0.5, 2);
    createPlatform(-3, 1, 25, 1, 2, 1, CONFIG.colors.obstacle);
    createPlatform(3, 1, 28, 1, 2, 1, CONFIG.colors.obstacle);
    createCredit(-2, 1, 25);
    createCredit(2, 1, 25);

    // Part 4: Ramp
    const rampGeo = new THREE.BoxGeometry(4, 1, 10);
    const rampMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.ground });
    const rampMesh = new THREE.Mesh(rampGeo, rampMat);
    rampMesh.position.set(0, 2, 38);
    rampMesh.rotation.x = -Math.PI / 8;
    rampMesh.receiveShadow = true;
    scene.add(rampMesh);

    const rampShape = new CANNON.Box(new CANNON.Vec3(2, 0.5, 5));
    const rampBody = new CANNON.Body({ mass: 0 });
    rampBody.addShape(rampShape);
    rampBody.position.set(0, 2, 38);
    rampBody.quaternion.setFromEuler(-Math.PI / 8, 0, 0);
    world.addBody(rampBody);

    // Part 5: Upper Platform (Checkpoint)
    createPlatform(0, 4, 48, 6, 1, 6);
    createCredit(0, 5, 48);

    // --- EXTENSION ---

    // Part 6: The Jump Gap (Requires 'E')
    // Gap of 5 units (48 + 3 = 51 end, start next at 56)
    createPlatform(0, 4, 60, 6, 1, 10); // Landing Pad
    createCredit(0, 5, 60);

    // Part 7: Sliding Pistons
    createPlatform(0, 4, 80, 4, 1, 25); 
    createSlider(0, 5, 75, 3, 1, 1, 2.0, 3); // Moves X
    createSlider(0, 5, 80, 3, 1, 1, 2.5, -3); 
    createSlider(0, 5, 85, 3, 1, 1, 3.0, 3);
    createCredit(0, 5, 80);

    // Part 8: The Drop Curve
    // Drop down to Y=0
    createPlatform(0, 0, 100, 4, 1, 8);
    createCredit(0, 1, 100);

    // Part 9: Smash Arena
    createPlatform(10, 0, 110, 15, 1, 15);
    // Connect previous to arena
    createPlatform(5, 0, 105, 10, 1, 4); // Connector angled visually via position

    // Pyramid of Boxes
    for(let i=0; i<3; i++) {
        for(let j=0; j<3; j++) {
            createSmashBox(12 + i, 1 + j, 110);
        }
    }

    // Goal
    const goalGeo = new THREE.CylinderGeometry(0, 0.5, 2, 8);
    const goalMat = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xff0000 });
    const goalMesh = new THREE.Mesh(goalGeo, goalMat);
    goalMesh.position.set(15, 2, 110);
    scene.add(goalMesh);
    collectibles.push({ mesh: goalMesh, active: true });
}

// --- INPUTS ---
function setupInputs() {
    window.addEventListener('keydown', (e) => {
        switch(e.key.toLowerCase()) {
            case 'w': inputs.w = true; break;
            case 'a': inputs.a = true; break;
            case 's': inputs.s = true; break;
            case 'd': inputs.d = true; break;
            case ' ': inputs.space = true; break;
            case 'r': resetGame(); break;
            case 'e': 
                // JUMP
                if(Math.abs(ballBody.velocity.y) < 0.5) {
                    ballBody.velocity.y = CONFIG.jumpVelocity;
                }
                break;
        }
    });

    window.addEventListener('keyup', (e) => {
        switch(e.key.toLowerCase()) {
            case 'w': inputs.w = false; break;
            case 'a': inputs.a = false; break;
            case 's': inputs.s = false; break;
            case 'd': inputs.d = false; break;
            case ' ': inputs.space = false; break;
        }
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// --- MAIN LOOP ---
function updatePhysics() {
    // Stop if resetting or in the menu/calibration
    if (isReseting || gameState !== 'PLAYING') return;

    // Smooth tilts for physics and visuals
    smoothTiltX += (tiltX - smoothTiltX) * 0.15;
    smoothTiltY += (tiltY - smoothTiltY) * 0.15;

    // 1. Camera-relative movement
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const force = new CANNON.Vec3(0, 0, 0);
    
    let moveX = 0;
    let moveZ = 0;

    if (useGyro) {
        // Tilt Controls (Mouse or Gyro)
        // Positive Y = Pitch forward
        // Positive X = Roll right
        const normY = (smoothTiltY / maxTilt); 
        const normX = (smoothTiltX / maxTilt);  

        moveX = (forward.x * normY) + (right.x * normX);
        moveZ = (forward.z * normY) + (right.z * normX);
    } else {
        // Keyboard controls
        if (inputs.w) { moveX += forward.x; moveZ += forward.z; }
        if (inputs.s) { moveX -= forward.x; moveZ -= forward.z; }
        if (inputs.a) { moveX -= right.x; moveZ -= right.z; }
        if (inputs.d) { moveX += right.x; moveZ += right.z; }
    }

    force.x = moveX * CONFIG.moveForce;
    force.z = moveZ * CONFIG.moveForce;

    ballBody.applyForce(force, ballBody.position);

    // Brake
    if (inputs.space) ballBody.linearDamping = 0.9;
    else ballBody.linearDamping = 0.3;

    // 2. Step World
    world.step(1 / 60);

    // 3. Sync Ball
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);

    // 4. Update Obstacles
    const time = Date.now() * 0.001;
    movingObstacles.forEach(obs => {
        if(obs.type === 'rotateY') {
            const angle = time * obs.speed;
            obs.body.quaternion.setFromEuler(0, angle, 0);
            obs.mesh.quaternion.copy(obs.body.quaternion);
        } else if(obs.type === 'pingpongX') {
            const offset = Math.sin(time * obs.speed) * obs.range;
            obs.body.position.x = obs.initialX + offset;
            obs.mesh.position.copy(obs.body.position);
        } else if(obs.type === 'dynamic') {
            obs.mesh.position.copy(obs.body.position);
            obs.mesh.quaternion.copy(obs.body.quaternion);
        }
    });

    // 5. Fall Check
    if (ballBody.position.y < CONFIG.respawnY) {
        triggerReset();
    }
}

function updateCamera() {
    if(!ballMesh) return;
    
    const offset = CONFIG.cameraOffset.clone();

    if (useGyro && gameState === 'PLAYING') {
        // 1. Visually Pitch the board (tilt forwards/backwards)
        // Orbit the camera vertically based on forward/backward tilt
        const pitchMult = 0.6; // Visual intensity multiplier
        const pitchAngle = THREE.MathUtils.degToRad(smoothTiltY * pitchMult);
        
        // Apply orbit around the local X-axis
        offset.applyAxisAngle(new THREE.Vector3(1, 0, 0), pitchAngle);
    }

    const targetPos = ballMesh.position.clone().add(offset);
    camera.position.lerp(targetPos, CONFIG.cameraLerp);
    
    // Always look exactly at the ball
    camera.lookAt(ballMesh.position);

    if (useGyro && gameState === 'PLAYING') {
        // 2. Visually Roll the board (tilt left/right)
        // Roll the actual camera to create the illusion that the horizon/board is rolling
        const rollMult = 0.5; // Visual intensity multiplier
        camera.rotateZ(THREE.MathUtils.degToRad(smoothTiltX * rollMult));
    }
}

function checkCollectibles() {
    const ballPos = ballMesh.position;
    collectibles.forEach(item => {
        if (item.active) {
            const dist = ballPos.distanceTo(item.mesh.position);
            item.mesh.rotation.y += 0.05;
            item.mesh.position.y += Math.sin(Date.now() * 0.005) * 0.005;

            if (dist < CONFIG.ballRadius + 0.5) {
                item.active = false;
                scene.remove(item.mesh);
                score++;
                document.getElementById('score').innerText = score;
            }
        }
    });
}

function triggerReset() {
    if(isReseting) return;
    isReseting = true;
    
    const ui = document.getElementById('game-over');
    ui.classList.remove('hidden');

    setTimeout(() => {
        resetGame();
        ui.classList.add('hidden');
        isReseting = false;
    }, 1000);
}

function resetGame() {
    ballBody.position.set(0, 2, 0);
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
    
    ballMesh.position.copy(ballBody.position);
    ballMesh.rotation.set(0,0,0);

    camera.position.set(0, 5, -10);
}

function animate() {
    requestAnimationFrame(animate);
    updatePhysics();
    updateCamera();
    checkCollectibles();
    renderer.render(scene, camera);
}

// Start visual engine immediately
init();


// --- MENU, GYRO & MOUSE LOGIC ---

const menuLayer = document.getElementById('menu-layer');
const startMenu = document.getElementById('start-menu');
const calibrationScreen = document.getElementById('calibration-screen');
const countdownEl = document.getElementById('countdown');

document.getElementById('btn-keyboard').addEventListener('click', () => {
    useGyro = false;
    gameState = 'PLAYING';
    menuLayer.classList.remove('hidden'); // Triggers CSS fade
    setTimeout(() => menuLayer.style.display = 'none', 500);
});

document.getElementById('btn-gyro').addEventListener('click', async () => {
    if (!window.isSecureContext) {
        alert("WARNING: Your browser may block sensors because this connection is not secure (HTTPS).");
    }

    // Request permissions for iOS 13+ devices
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission !== 'granted') {
                console.warn("Sensors denied. Mouse control will be used instead.");
            }
        } catch (err) {
            console.error(err);
        }
    }

    useGyro = true;
    attachSensors();
    attachMouse();
    
    // Switch UI to calibration/get-ready screen
    startMenu.classList.add('hidden');
    calibrationScreen.classList.remove('hidden');
    startCalibration();
});

function calculateTilt(rawValue) {
    const aggressiveness = 0.15; 
    return Math.sign(rawValue) * maxTilt * (1 - Math.exp(-aggressiveness * Math.abs(rawValue)));
}

function attachSensors() {
    window.addEventListener('deviceorientation', (e) => {
        if (e.beta == null || e.gamma == null) return;
        if (e.beta === 0 && e.gamma === 0) return;

        isMobile = true; // Device has gyro, so we ignore mouse inputs

        if (gameState === 'CALIBRATING') {
            baseBeta = e.beta;
            baseGamma = e.gamma;
        } else if (gameState === 'PLAYING') {
            let rawBeta = e.beta - baseBeta;
            let rawGamma = e.gamma - baseGamma;

            // Handle phone landscape/portrait orientations
            let angle = 0;
            if (screen && screen.orientation && screen.orientation.angle !== undefined) {
                angle = screen.orientation.angle;
            } else if (typeof window.orientation !== 'undefined') {
                angle = window.orientation;
            }

            let orientedX, orientedY;

            if (angle === 90) { 
                orientedX = rawBeta;
                orientedY = -rawGamma;
            } else if (angle === -90 || angle === 270) { 
                orientedX = -rawBeta;
                orientedY = rawGamma;
            } else if (angle === 180) { 
                orientedX = -rawGamma;
                orientedY = -rawBeta;
            } else { 
                orientedX = rawGamma;
                orientedY = rawBeta;
            }

            tiltX = calculateTilt(orientedX);
            tiltY = calculateTilt(orientedY);
        }
    });
}

function attachMouse() {
    window.addEventListener('mousemove', (e) => {
        // If not playing, or on a mobile device, or gyro option isn't selected, ignore mouse
        if (gameState !== 'PLAYING' || isMobile || !useGyro) return;
        
        let centerX = window.innerWidth / 2;
        let centerY = window.innerHeight / 2;
        
        let normX = (e.clientX - centerX) / centerX;
        let normY = (e.clientY - centerY) / centerY;
        
        let rawX = normX * maxTilt;
        let rawY = normY * maxTilt;
        
        tiltX = calculateTilt(rawX);
        tiltY = calculateTilt(rawY);
    });
}

function startCalibration() {
    gameState = 'CALIBRATING';
    let count = 3;
    countdownEl.innerText = count;

    const interval = setInterval(() => {
        count--;
        countdownEl.innerText = count;
        
        if (count <= 0) {
            clearInterval(interval);
            gameState = 'PLAYING';
            menuLayer.classList.remove('hidden'); 
            setTimeout(() => menuLayer.style.display = 'none', 500);
        }
    }, 1000);
}
