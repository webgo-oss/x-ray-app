const boneSections = [
  {
    titleBig: "Hand",
    description:
      "The human hand consists of 27 small bones — making it one of the most intricate areas to scan and diagnose. Our AI is trained on thousands of hand X-rays to accurately identify fractures, dislocations, and bone deformities, ensuring you never miss a critical diagnosis.",
    bones: [
      { name: "Phalanges", shortDesc: "Finger bones → Finds fine cracks" },
      { name: "Carpals", shortDesc: "Wrist bones → Detects hidden damage" }
    ],
    rightParagraph:
      "From fingertip to wrist, our AI performs a full sweep of the hand, using intelligent segmentation and fracture detection. Each scan includes a detailed map, confidence level, and suggested diagnosis support.",
    quote: "--ai detect",
    buttonText: "Upload Hand X-Ray →"
  },
  {
    titleBig: "Elbow",
    description:
      "The elbow is a hinge joint involving three bones — a complex region often misdiagnosed due to overlapping structures. Our AI ensures accurate detection of fractures, joint issues, and misalignments for quicker treatment decisions.",
    bones: [
      { name: "Humerus", shortDesc: "Upper arm bone → Detects joint-end fractures" },
      { name: "Ulna", shortDesc: "Inner forearm bone → Spots dislocations" }
    ],
    rightParagraph: "",
    quote: "",
    buttonText: ""
  },
  {
    titleBig: "Knee",
    description:
      "The knee joint supports body weight and movement, but is vulnerable to fractures and ligament injuries. Our AI focuses on key bones to detect trauma efficiently and guide orthopedic decisions.",
    bones: [
      { name: "Femur", shortDesc: "Thigh bone → Detects distal femur cracks" },
      { name: "Tibia", shortDesc: "Shin bone → Spots plateau fractures" }
    ],
    rightParagraph:
      "The AI analyzes the knee for bone alignment, fracture visibility, and signs of joint trauma, helping radiologists evaluate injuries faster and more accurately.",
    quote: "--knee scan intelligence",
    buttonText: "Upload Knee X-Ray →"
  }
];

let activeSectionIndex = 0;

function renderSection(index) {
  const section = boneSections[index];

  // LEFT content
  const leftPanel = document.querySelector(".con-for-info-left");
  if (leftPanel) {
    leftPanel.innerHTML = `
    <div class="fade-in">
      <h4>Fracture Detection</h4>
      <h1>${section.titleBig}</h1>
      <p>${section.description}</p>
      <table>
        <tr>${section.bones.map(b => `<td><h4>${b.name}</h4></td>`).join("")}</tr>
        <tr>${section.bones.map(b => `<td><p>${b.shortDesc}</p></td>`).join("")}</tr>
      </table>
    </div>
  `;
  }

  // RIGHT text (not touching image) — only present on pages with the bone
  // carousel; guard each lookup so this script doesn't crash on other pages.
  const rightParagraph = document.getElementById("rightParagraph");
  const quoteText = document.getElementById("quoteText");
  const xrayBtn = document.getElementById("xrayBtn");
  if (rightParagraph) rightParagraph.innerText = section.rightParagraph;
  if (quoteText) quoteText.innerText = section.quote;
  if (xrayBtn) xrayBtn.innerText = section.buttonText;
}

// Controls both image + content together
function slideRight() {
  const slider = document.getElementById("slider");
  const total = slider.children.length;

  if (activeSectionIndex < total - 1) {
    activeSectionIndex++;
    slider.style.transform = `translateX(-${activeSectionIndex * 103}%)`;
    renderSection(activeSectionIndex);
  }
}

function slideLeft() {
  if (activeSectionIndex > 0) {
    activeSectionIndex--;
    const slider = document.getElementById("slider");
    slider.style.transform = `translateX(-${activeSectionIndex * 100}%)`;
    renderSection(activeSectionIndex);
  }
}
renderSection(activeSectionIndex);

  function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("show");
  }