import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// --- CONFIGURATION ---
const CONFIG = {
    ballRadius: 0.5,
    ballMass: 5,
    moveForce: 20,
    brakeForce: 2,
    cameraOffset: new THREE.Vector3(0, 4, -8), // Behind and above
    cameraLerp: 0.1,
    respawnY: -10, // Y level to trigger reset
    colors: {
        ball: 0x00ffff,
        ground: 0x222222,
        obstacle: 0xff4444,
        credit: 0xffd700
    }
};

// --- GLOBALS ---
let scene, camera, renderer;
let world; // Physics world
let ballMesh, ballBody;
let physicsObjects = []; // To sync mesh/body
let collectibles = [];
let movingObstacles = [];
let score = 0;
let isReseting = false;

const inputs = { w: false, a: false, s: false, d: false, space: false };

// --- INITIALIZATION ---
function init() {
    // 1. Setup Three.js Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101015);
    scene.fog = new THREE.Fog(0x101015, 10, 50);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    scene.add(dirLight);

    // 2. Setup Cannon-es Physics
    world = new CANNON.World();
    world.gravity.set(0, -9.82, 0);
    
    // Materials
    const defaultMaterial = new CANNON.Material('default');
    const defaultContactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
        friction: 0.4,
        restitution: 0.2, // Bounciness
    });
    world.addContactMaterial(defaultContactMaterial);

    // 3. Create Player (Ball)
    createPlayer();

    // 4. Generate Level
    generateLevel();

    // 5. Input Listeners
    setupInputs();

    // 6. Start Loop
    animate();
}

// --- PLAYER CREATION ---
function createPlayer() {
    // Three.js Mesh
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

    // Cannon.js Body
    const shape = new CANNON.Sphere(CONFIG.ballRadius);
    ballBody = new CANNON.Body({
        mass: CONFIG.ballMass,
        shape: shape,
        position: new CANNON.Vec3(0, 2, 0),
        linearDamping: 0.3, // Simulates air resistance / rolling friction
        angularDamping: 0.3
    });
    world.addBody(ballBody);
}

// --- LEVEL GENERATION SYSTEM ---
function generateLevel() {
    // Helper to create static box platforms
    const createPlatform = (x, y, z, w, h, d, color = CONFIG.colors.ground) => {
        // Visuals
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color: color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.receiveShadow = true;
        scene.add(mesh);

        // Physics
        const shape = new CANNON.Box(new CANNON.Vec3(w/2, h/2, d/2));
        const body = new CANNON.Body({ mass: 0 }); // Mass 0 = Static
        body.addShape(shape);
        body.position.set(x, y, z);
        world.addBody(body);
    };

    // Helper to create rotating obstacle
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

    // Helper to create Collectibles
    const createCredit = (x, y, z) => {
        const geo = new THREE.OctahedronGeometry(0.3);
        const mat = new THREE.MeshStandardMaterial({ 
            color: CONFIG.colors.credit, 
            emissive: 0xffaa00,
            emissiveIntensity: 0.5
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        
        // No physics body for credits, we do distance check for optimization
        collectibles.push({ mesh, active: true });
    };

    // --- MAP DESIGN ---
    
    // 1. Start Platform
    createPlatform(0, 0, 0, 4, 1, 10);
    createCredit(0, 1, 0);

    // 2. Narrow Bridge
    createPlatform(0, 0, 10, 1.5, 1, 10);
    createCredit(0, 1, 10);

    // 3. Wide Area
    createPlatform(0, 0, 25, 8, 1, 15);
    
    // 4. Obstacles in Wide Area
    createRotator(0, 1.5, 25, 6, 0.5, 0.5, 2); // Spinning bar
    createPlatform(-3, 1, 25, 1, 2, 1, CONFIG.colors.obstacle); // Static pillar
    createPlatform(3, 1, 28, 1, 2, 1, CONFIG.colors.obstacle); // Static pillar

    createCredit(-2, 1, 25);
    createCredit(2, 1, 25);

    // 5. Ramp Up (Slope)
    // Cannon supports rotations, so we rotate a box to make a ramp
    const rampGeo = new THREE.BoxGeometry(4, 1, 10);
    const rampMat = new THREE.MeshStandardMaterial({ color: CONFIG.colors.ground });
    const rampMesh = new THREE.Mesh(rampGeo, rampMat);
    rampMesh.position.set(0, 2, 38);
    rampMesh.rotation.x = -Math.PI / 8; // Tilt up
    rampMesh.receiveShadow = true;
    scene.add(rampMesh);

    const rampShape = new CANNON.Box(new CANNON.Vec3(2, 0.5, 5));
    const rampBody = new CANNON.Body({ mass: 0 });
    rampBody.addShape(rampShape);
    rampBody.position.set(0, 2, 38);
    rampBody.quaternion.setFromEuler(-Math.PI / 8, 0, 0);
    world.addBody(rampBody);

    // 6. Upper Platform
    createPlatform(0, 4, 48, 6, 1, 6);
    createCredit(0, 5, 48); // Goal credit
}

// --- INPUT HANDLING ---
function setupInputs() {
    window.addEventListener('keydown', (e) => {
        switch(e.key.toLowerCase()) {
            case 'w': inputs.w = true; break;
            case 'a': inputs.a = true; break;
            case 's': inputs.s = true; break;
            case 'd': inputs.d = true; break;
            case ' ': inputs.space = true; break;
            case 'r': resetGame(); break;
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

// --- GAME LOGIC ---

function updatePhysics() {
    if (isReseting) return;

    // 1. Calculate Forces based on Camera Direction
    // We want "Forward" (W) to be away from camera, not just +Z
    
    // Get camera direction projected on XZ plane
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    const force = new CANNON.Vec3(0, 0, 0);

    if (inputs.w) {
        force.x += forward.x * CONFIG.moveForce;
        force.z += forward.z * CONFIG.moveForce;
    }
    if (inputs.s) {
        force.x -= forward.x * CONFIG.moveForce;
        force.z -= forward.z * CONFIG.moveForce;
    }
    if (inputs.a) {
        force.x -= right.x * CONFIG.moveForce;
        force.z -= right.z * CONFIG.moveForce;
    }
    if (inputs.d) {
        force.x += right.x * CONFIG.moveForce;
        force.z += right.z * CONFIG.moveForce;
    }

    // Apply Force
    ballBody.applyForce(force, ballBody.position);

    // Brake (Linear Damping increase)
    if (inputs.space) {
        ballBody.linearDamping = 0.9;
    } else {
        ballBody.linearDamping = 0.3;
    }

    // 2. Step Physics World
    world.step(1 / 60);

    // 3. Sync Ball Mesh
    ballMesh.position.copy(ballBody.position);
    ballMesh.quaternion.copy(ballBody.quaternion);

    // 4. Moving Obstacles Logic
    const time = Date.now() * 0.001;
    movingObstacles.forEach(obs => {
        if(obs.type === 'rotateY') {
            const angle = time * obs.speed;
            obs.body.quaternion.setFromEuler(0, angle, 0);
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

    // Target position: Ball position + Offset
    const targetPos = ballMesh.position.clone().add(CONFIG.cameraOffset);
    
    // Smoothly interpolate current camera position to target
    camera.position.lerp(targetPos, CONFIG.cameraLerp);
    
    // Always look at the ball
    camera.lookAt(ballMesh.position);
}

function checkCollectibles() {
    const ballPos = ballMesh.position;
    
    collectibles.forEach(item => {
        if (item.active) {
            // Simple distance check
            const dist = ballPos.distanceTo(item.mesh.position);
            
            // Floating animation
            item.mesh.rotation.y += 0.05;
            item.mesh.position.y = item.mesh.position.y + Math.sin(Date.now() * 0.005) * 0.005;

            if (dist < CONFIG.ballRadius + 0.5) {
                // Collected
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
    // Reset Physics Position and Velocity
    ballBody.position.set(0, 2, 0);
    ballBody.velocity.set(0, 0, 0);
    ballBody.angularVelocity.set(0, 0, 0);
    
    // Reset Mesh
    ballMesh.position.copy(ballBody.position);
    ballMesh.rotation.set(0,0,0);

    // Reset Camera slightly
    camera.position.set(0, 5, -10);
}

function animate() {
    requestAnimationFrame(animate);

    updatePhysics();
    updateCamera();
    checkCollectibles();

    renderer.render(scene, camera);
}

// Start Game
init();
