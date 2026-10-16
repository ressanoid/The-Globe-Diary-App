import { GlobeScene } from './globe.js';
import { DataStore } from './store.js';
import { UIManager } from './ui.js';
import { onAuthChange } from './auth.js';

document.addEventListener('DOMContentLoaded', async () => {
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

  // Render initial entries from the cache (seeds are available immediately)
  globe.renderEntries(store.getAllEntries());

  // Re-render live whenever entries change (Firestore realtime or local fallback)
  store.subscribe((entries) => {
    globe.renderEntries(entries);
  });

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

  // Connect to the backend (Firestore + anonymous auth), falling back to local.
  const mode = await store.init();
  console.log(`🌍 Globe Diary data mode: ${mode}`);

  // Re-establish the realtime stream whenever the signed-in identity changes
  // (sign-in / sign-out invalidate the session the listener was attached under).
  // After a sign-out we must wait for the follow-up anonymous sign-in to land,
  // so retry briefly until the store reports it re-attached.
  onAuthChange(() => {
    let attempts = 0;
    const tryReconnect = () => {
      if (store.reconnect() || ++attempts > 20) return;
      setTimeout(tryReconnect, 250);
    };
    setTimeout(tryReconnect, 150);
  });
});
