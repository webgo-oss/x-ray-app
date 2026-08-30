
    function updateTime() {
      const now = new Date();
      const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      const day = days[now.getDay()];
      const date = now.getDate();
      const hours = now.getHours();
      const mins = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const hour12 = (hours % 12 || 12).toString().padStart(2, '0');

      const suffix = (d => {
        if (d > 3 && d < 21) return 'th';
        switch (d % 10) {
          case 1: return "st";
          case 2: return "nd";
          case 3: return "rd";
          default: return "th";
        }
      })(date);

      document.getElementById("day").innerText = day;
      document.getElementById("date").innerHTML = `${date}<span>${suffix}</span>`;
      document.getElementById("time").innerText = `${hour12}:${mins}`;
      document.getElementById("ampm").innerText = ampm;
    }

    setInterval(updateTime, 1000);
    updateTime();

    function showProfile() {
      document.getElementById('dashboard-content').style.display = 'none';
      document.getElementById('profile-section').style.display = 'flex';
    }

    function showDashboard() {
      document.getElementById('profile-section').style.display = 'none';
      document.getElementById('dashboard-content').style.display = 'grid';
    }