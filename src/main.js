import { GlobeScene } from './globe.js';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('globe-container');
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = themeToggle.querySelector('.theme-icon');
  const themeLabel = themeToggle.querySelector('.theme-label');

  // Initialize Globe
  const globe = new GlobeScene(container, (id) => {
    console.log('Pin clicked:', id);
  });

  // Handle Day / Night theme switching
  let currentTheme = 'night';
  themeToggle.addEventListener('click', () => {
    currentTheme = currentTheme === 'night' ? 'day' : 'night';
    document.body.dataset.theme = currentTheme;

    if (currentTheme === 'day') {
      themeIcon.textContent = '☀️';
      themeLabel.textContent = 'Day Earth';
    } else {
      themeIcon.textContent = '🌙';
      themeLabel.textContent = 'Night Cosmos';
    }

    globe.setTheme(currentTheme);
  });
});
