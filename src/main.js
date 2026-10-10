import { GlobeScene } from './globe.js';
import { DataStore } from './store.js';
import { UIManager } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('globe-container');
  const store = new DataStore();

  let ui = null;

  // Initialize Globe
  const globe = new GlobeScene(container, (entryId) => {
    if (ui) {
      ui.showAuthorModal(entryId);
    }
  });

  // Initialize UI Manager
  ui = new UIManager(store, globe);

  // Render initial entries from store onto globe
  const entries = store.getAllEntries();
  globe.renderEntries(entries);

  // Focus Switcher: Earth vs Moon tabs at top
  const targetBtns = document.querySelectorAll('.target-btn');
  targetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      targetBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.target;
      globe.setFocusTarget(target);
    });
  });

  // Reset View to User Location button
  const resetBtn = document.getElementById('reset-view-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // Set Earth active in tabs
      targetBtns.forEach((b) => {
        if (b.dataset.target === 'earth') b.classList.add('active');
        else b.classList.remove('active');
      });
      globe.resetToUserLocation();
    });
  }

  // Filter controls (All vs Recent/Today)
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      globe.setRecencyFilter(filter);
    });
  });

  window.__globe = globe;
  window.__store = store;
  window.__ui = ui;
});
