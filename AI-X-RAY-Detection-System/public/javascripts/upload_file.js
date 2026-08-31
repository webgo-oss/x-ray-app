    import * as THREE from 'https://cdn.skypack.dev/three@0.129.0/build/three.module.js';
    import { OrbitControls } from 'https://cdn.skypack.dev/three@0.129.0/examples/jsm/controls/OrbitControls.js';
    import { RoundedBoxGeometry } from 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r129/examples/jsm/geometries/RoundedBoxGeometry.js';

    let space, perspectiveCam, visualizer, interactor, photoCard;

    // --- Upload validation ---
    const MAX_XRAY_SIZE = 10 * 1024 * 1024; // 10MB, matches server-side limit
    const ALLOWED_XRAY_TYPES = ['image/jpeg', 'image/png', 'image/bmp'];
    const ALLOWED_XRAY_EXT = /\.(jpe?g|png|bmp)$/i;

    const uploadForm = document.getElementById('uploadForm');
    const fileInput = document.getElementById('file');
    const uploadMsg = document.getElementById('uploadMsg');

    function showUploadError(message) {
      if (!uploadMsg) return;
      uploadMsg.textContent = message;
      uploadMsg.classList.add('show-error');
      fileInput.classList.add('file-invalid');
    }

    function clearUploadError() {
      if (!uploadMsg) return;
      uploadMsg.textContent = '';
      uploadMsg.classList.remove('show-error');
      fileInput.classList.remove('file-invalid');
    }

    // Returns an error message string, or null if the file is valid
    function validateXrayFile(file) {
      if (!file) return 'Please upload an X-ray image first.';
      if (!ALLOWED_XRAY_EXT.test(file.name) || !ALLOWED_XRAY_TYPES.includes(file.type)) {
        return 'Only JPG, PNG, or BMP images are allowed.';
      }
      if (file.size > MAX_XRAY_SIZE) {
        return 'That file is too large. Max size is 10MB.';
      }
      return null;
    }

    function resetPreview() {
      const preview = document.getElementById('imagePreview');
      preview.src = '';
      preview.style.display = 'none';

      const fileNameBox = document.getElementById('fileName');
      const fileTimeBox = document.getElementById('fileTime');
      if (fileNameBox) fileNameBox.innerHTML = '';
      if (fileTimeBox) fileTimeBox.innerHTML = '';

      if (photoCard) {
        space.remove(photoCard);
        photoCard = null;
      }
    }

    initializeThreeWorld();

    document.getElementById('file').addEventListener('change', function (event) {
      const uploadedFile = event.target.files[0];
      const error = validateXrayFile(uploadedFile);

      if (error) {
        showUploadError(error);
        resetPreview();
        fileInput.value = '';
        return;
      }

      clearUploadError();

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

    if (uploadForm) {
      uploadForm.addEventListener('submit', function (event) {
        const error = validateXrayFile(fileInput.files[0]);
        if (error) {
          event.preventDefault();
          showUploadError(error);
        } else {
          clearUploadError();
        }
      });
    }

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