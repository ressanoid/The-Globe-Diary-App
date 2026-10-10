import { GlobeScene } from './globe.js';
import { DataStore } from './store.js';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('globe-container');
  const store = new DataStore();

  // Initialize Globe
  const globe = new GlobeScene(container, (entryId) => {
    const entry = store.getEntryById(entryId);
    console.log('Selected entry:', entry);
  });

  // Render initial entries from store onto globe
  const entries = store.getAllEntries();
  globe.renderEntries(entries);

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
});
