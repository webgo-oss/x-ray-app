    import * as THREE from 'https://cdn.skypack.dev/three@0.129.0/build/three.module.js';
    import { OrbitControls } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/controls/OrbitControls.js';
    import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/loaders/GLTFLoader.js';

    let scene, camera, renderer;
    let model, mixer, animationActions = [];
    let isPlaying = false;

    const clock = new THREE.Clock();

    init();
    animate();

    function init() {
      const canvas = document.getElementById('three-canvas');
      const modelDiv = document.getElementById('model');

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(
        60,
        modelDiv.clientWidth / modelDiv.clientHeight,
        0.1,
        1000
      );
      camera.position.set(0, 1.2, 5);

      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setSize(modelDiv.clientWidth, modelDiv.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);

      const ambient = new THREE.AmbientLight(0x00e5ff, 0.4);
      scene.add(ambient);

      const directional = new THREE.DirectionalLight(0x80deea, 1.2);
      directional.position.set(5, 10, 7);
      scene.add(directional);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableRotate = false;
      controls.enablePan = false;
      controls.enableZoom = false;

      const loader = new GLTFLoader();
      loader.load('./models/curious_skeleton.glb', (gltf) => {
        model = gltf.scene;
        model.position.set(0, -8.6, 0);
        model.scale.set(6, 6, 6);
        scene.add(model);

        if (gltf.animations.length) {
          mixer = new THREE.AnimationMixer(model);
          animationActions = gltf.animations.map((clip) => {
            const action = mixer.clipAction(clip);
            action.loop = THREE.LoopRepeat;
            return action;
          });
        }
      }, undefined, (err) => {
        console.error('GLB Load Error:', err);
      });

      window.addEventListener('resize', () => {
        camera.aspect = modelDiv.clientWidth / modelDiv.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(modelDiv.clientWidth, modelDiv.clientHeight);
      });

      window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;

        if (scrollY <= 720) {
          const newZ = 5 + scrollY * 0.02;
          const newY = -8.6 - scrollY * 0.01;
          camera.position.z = newZ;
          if (model) model.position.y = newY;

          if (isPlaying) {
            animationActions.forEach(action => action.stop());
            isPlaying = false;
          }

        } else {
          if (!isPlaying && animationActions.length) {
            animationActions.forEach(action => {
              action.reset();
              action.play();
            });
            isPlaying = true;
          }
        }
      });
    }

    function animate() {
      requestAnimationFrame(animate);
      if (mixer) mixer.update(clock.getDelta());
      renderer.render(scene, camera);
    }