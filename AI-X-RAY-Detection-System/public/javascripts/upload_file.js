    import * as THREE from 'https://cdn.skypack.dev/three@0.129.0/build/three.module.js';
    import { OrbitControls } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/controls/OrbitControls.js';
    import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r129/examples/jsm/geometries/RoundedBoxGeometry.js';

    let space, perspectiveCam, visualizer, interactor, photoCard;

    initializeThreeWorld();

    document.getElementById('file').addEventListener('change', function (event) {
      const uploadedFile = event.target.files[0];
      if (!uploadedFile) return;

      // Show file name and time
      const fileNameBox = document.getElementById('fileName');
      const fileTimeBox=document.getElementById('fileTime');
      const uploadTime = new Date().toLocaleTimeString();
      fileNameBox.innerHTML = `
        <strong>File:</strong> ${uploadedFile.name}<br>
      `;
      fileNameBox.style='border-width: 2px 0 0 0 ;border-color: whitesmoke; border-style: solid;';
       fileTimeBox.innerHTML = `
        <strong>Time:</strong> ${uploadTime}
      `;
      fileTimeBox.style='border-width: 2px 0 2px 0 ;border-color: whitesmoke; border-style: solid;';

      // Show 2D preview
      const preview = document.getElementById('imagePreview');
      preview.src = URL.createObjectURL(uploadedFile);
      preview.style.display = 'block';

      handleImageInput(event);
    });

    function initializeThreeWorld() {
      space = new THREE.Scene();

      const container = document.getElementById('threeContainer');
      const width = container.clientWidth;
      const height = container.clientHeight;

      perspectiveCam = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      perspectiveCam.position.z = 4;

      visualizer = new THREE.WebGLRenderer({ antialias: true });
      visualizer.setSize(width, height);
      visualizer.setPixelRatio(window.devicePixelRatio);
      container.appendChild(visualizer.domElement);

      interactor = new OrbitControls(perspectiveCam, visualizer.domElement);
      interactor.enableDamping = true;
      interactor.enableRotate = false;
      interactor.enableZoom = false;

      const spotlight = new THREE.PointLight(0xffffff, 1.2);
      spotlight.position.set(5, 5, 5);
      space.add(spotlight);

      const softLight = new THREE.AmbientLight(0xffffff, 0.4);
      space.add(softLight);

      renderLoop();
    }

    function handleImageInput(event) {
      const uploadedFile = event.target.files[0];
      if (!uploadedFile) return;

      const imageReader = new FileReader();
      imageReader.onload = function (e) {
        const loader = new THREE.TextureLoader();
        loader.load(e.target.result, (photoTexture) => {
          if (photoCard) {
            space.remove(photoCard);
          }

          const aspect = photoTexture.image.width / photoTexture.image.height;
          const thickness = 0.1;
          const width = 2 * aspect;
          const height = 2;

          const boxGeo = new RoundedBoxGeometry(width, height, thickness, 5, 0.2);

          const texturedMaterial = new THREE.MeshStandardMaterial({
            map: photoTexture,
            roughness: 0.2,
            metalness: 0.3,
            transparent: true,
            opacity: 0.98
          });

          photoCard = new THREE.Mesh(boxGeo, [
            texturedMaterial,                                 // front
            new THREE.MeshStandardMaterial({ color: 0x111111 }), // back
            new THREE.MeshStandardMaterial({ color: 0x222222 }), // top
            new THREE.MeshStandardMaterial({ color: 0x222222 }), // bottom
            texturedMaterial,                                 // left
            texturedMaterial                                  // right
          ]);

          space.add(photoCard);
        });
      };
      imageReader.readAsDataURL(uploadedFile);
    }

    function renderLoop() {
      requestAnimationFrame(renderLoop);

      if (photoCard) {
        photoCard.rotation.y += 0.002;
        photoCard.rotation.x = Math.sin(Date.now() * 0.0015) * 0.015;
      }

      interactor.update();
      visualizer.render(space, perspectiveCam);
    }

    window.addEventListener('resize', () => {
      const container = document.getElementById('threeContainer');
      const width = container.clientWidth;
      const height = container.clientHeight;

      perspectiveCam.aspect = width / height;
      perspectiveCam.updateProjectionMatrix();
      visualizer.setSize(width, height);
    });