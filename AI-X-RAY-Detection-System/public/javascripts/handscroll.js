window.addEventListener("scroll", () => {
  const scrollVal = window.scrollY;

  let start, end, moveDistance;

  // Adjust start, end, and movement manually per screen size
    if(window.innerWidth==1024){
       start = 5720;
    end = 6500;
    moveDistance = 1700; 
    }else if (window.innerWidth > 1024) {
    start = 5350;
    end = 6500;
    moveDistance = 1700; 
  } else if (window.innerWidth > 768) {
    start = 5100;
    end = 4000;
    moveDistance = 1200;
  }  else {
    // fallback for very small screens
    start = 1800;
    end = 2200;
    moveDistance = 500;
  }
  const range = end - start;

  if (scrollVal >= start && scrollVal <= end) {
    const progress = (scrollVal - start) / range; // 0 → 1

    const moveX = -moveDistance + (moveDistance * 2) * progress;
    const scale = 1 + progress * 0.2;

    document.getElementById("leftHand").style.transform =
      `translateY(-50%) translateX(${moveX}px) scale(${scale})`;

    document.getElementById("rightHand").style.transform =
      `translateY(-50%) translateX(${-moveX}px) scale(${scale})`;
  } 
  else if (scrollVal < start) {
    // Before animation starts
    document.getElementById("leftHand").style.transform =
      `translateY(-50%) translateX(-${moveDistance}px) scale(1)`;

    document.getElementById("rightHand").style.transform =
      `translateY(-50%) translateX(${moveDistance}px) scale(1)`;
  } 
  else {
    // After animation ends
    document.getElementById("leftHand").style.transform =
      `translateY(-50%) translateX(0px) scale(1.2)`;

    document.getElementById("rightHand").style.transform =
      `translateY(-50%) translateX(0px) scale(1.2)`;
  }
});
