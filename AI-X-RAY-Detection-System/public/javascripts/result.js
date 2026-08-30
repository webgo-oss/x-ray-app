
  // Get confidence from the DOM instead of EJS
  const confidence = parseFloat(document.getElementById('confidence-value').textContent) || 0;

  const ctx = document.getElementById('confidenceChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Confidence'],
      datasets: [{
        label: 'Confidence (%)',
        data: [confidence],
        backgroundColor: ['#4dd0e1'],
        borderRadius: 8
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { min: 0, max: 100, ticks: { color: '#cfd8dc' }, grid: { color: '#2a2f36' } },
        y: { ticks: { color: '#cfd8dc' }, grid: { display: false } }
      }
    }
  });