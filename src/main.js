import { GlobeScene } from './globe.js';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('globe-container');

  // Initialize Globe
  const globe = new GlobeScene(container, (id) => {
    console.log('Pin clicked:', id);
  });

  window.__globe = globe;
});
