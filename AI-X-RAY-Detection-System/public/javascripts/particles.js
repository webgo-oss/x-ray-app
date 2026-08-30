import * as THREE from 'https://cdn.skypack.dev/three@0.129.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/controls/OrbitControls.js';

let particleScene, particleCamera, particleRenderer, neonParticles;
const totalParticles = 350;
const particlePositions = [];
const originalPositions = [];
const particleVelocities = [];

const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let mouse3D = null;

const aiBlock = document.getElementById('ai-block');

initParticles();
animateParticles();

function initParticles() {
  particleScene = new THREE.Scene();

  const width = aiBlock.clientWidth;
  const height = aiBlock.clientHeight;

  particleCamera = new THREE.PerspectiveCamera(70, width / height, 0.1, 1000);
  particleCamera.position.z = 50;

  particleRenderer = new THREE.WebGLRenderer({ antialias: true,alpha:true});
  particleRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  particleRenderer.setSize(width, height);
  aiBlock.appendChild(particleRenderer.domElement);

  const parcon=new OrbitControls(particleCamera, particleRenderer.domElement);
  parcon.enableZoom=false
  parcon.enableRotate=false

  const geometry = new THREE.BufferGeometry();
  const positionsArray = new Float32Array(totalParticles * 3);
  const radius = 25;

  for (let i = 0; i < totalParticles; i++) {
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    positionsArray.set([x, y, z], i * 3);

    const pos = new THREE.Vector3(x, y, z);
    particlePositions.push(pos.clone());
    originalPositions.push(pos.clone());
    particleVelocities.push(new THREE.Vector3());
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positionsArray, 3));

  const material = new THREE.PointsMaterial({
    color: 0x00ff00,
    size: 3.5,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  neonParticles = new THREE.Points(geometry, material);
  particleScene.add(neonParticles);

  window.addEventListener('resize', onWindowResize);
  aiBlock.addEventListener('mousemove', onPointerMove);
  aiBlock.addEventListener('touchmove', onTouchMove, { passive: false });
}

function onPointerMove(event) {
  const bounds = aiBlock.getBoundingClientRect();
  mouse.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  mouse.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  updateMouse3D();
}

function onTouchMove(event) {
  if (event.touches.length > 0) {
    const touch = event.touches[0];
    const bounds = aiBlock.getBoundingClientRect();
    mouse.x = ((touch.clientX - bounds.left) / bounds.width) * 2 - 1;
    mouse.y = -((touch.clientY - bounds.top) / bounds.height) * 2 + 1;
    updateMouse3D();
  }
}

function updateMouse3D() {
  raycaster.setFromCamera(mouse, particleCamera);
  mouse3D = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(50));
}

function onWindowResize() {
  const width = aiBlock.clientWidth;
  const height = aiBlock.clientHeight;
  particleCamera.aspect = width / height;
  particleCamera.updateProjectionMatrix();
  particleRenderer.setSize(width, height);
}

function animateParticles() {
  requestAnimationFrame(animateParticles);

  const positions = neonParticles.geometry.attributes.position.array;

  for (let i = 0; i < totalParticles; i++) {
    const particle = particlePositions[i];
    const original = originalPositions[i];
    const velocity = particleVelocities[i];

    if (mouse3D) {
      const distance = particle.distanceTo(mouse3D);
      if (distance < 35) {
        const force = particle.clone().sub(mouse3D).normalize().multiplyScalar(0.4);
        velocity.add(force);
      }
    }

    const toOriginal = original.clone().sub(particle).multiplyScalar(0.015);
    velocity.add(toOriginal);

    if (velocity.length() > 1.5) {
      velocity.setLength(1.5);
    }

    velocity.multiplyScalar(0.85); // friction
    particle.add(velocity);

    const idx = i * 3;
    positions[idx] = particle.x;
    positions[idx + 1] = particle.y;
    positions[idx + 2] = particle.z;
  }

  neonParticles.geometry.attributes.position.needsUpdate = true;
  particleRenderer.render(particleScene, particleCamera);
}