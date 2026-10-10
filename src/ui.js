// --- The Globe Diary UI Manager & Modals ---

export class UIManager {
  constructor(store, globe) {
    this.store = store;
    this.globe = globe;
    this.mountRoot = document.getElementById('modals-root');
    this.currentAuthor = null;
    this.currentEntryId = null;

    this.initCheckInButton();
    this.initComposeButton();
  }

  // --- 1. Author Journey Timeline Modal ---
  showAuthorModal(entryId) {
    const entry = this.store.getEntryById(entryId);
    if (!entry) return;

    this.currentEntryId = entry.id;
    this.currentAuthor = entry.author;

    // Fetch all entries by this author, newest first
    const authorEntries = this.store.getAuthorEntries(entry.author);
    const isSingleEntry = authorEntries.length <= 1;

    // Format destination badge
    let locationBadge = `📍 ${entry.locationName}`;
    if (entry.destination === 'moon') locationBadge = '🌕 Lunar Surface Beacon';
    if (entry.destination === 'shooting-star') locationBadge = '💫 Shooting Star Wish';

    // Mascot state for first-time / single-entry authors per PRD
    const mascotSvg = `
      <div class="mascot-badge">
        <svg viewBox="0 0 120 120" class="mascot-svg">
          <!-- Friendly little journal mascot -->
          <rect x="25" y="20" width="70" height="80" rx="14" fill="#38bdf8" />
          <rect x="35" y="26" width="50" height="68" rx="8" fill="#f8fafc" />
          <!-- Page lines -->
          <line x1="42" y1="38" x2="78" y2="38" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" />
          <line x1="42" y1="48" x2="78" y2="48" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" />
          <line x1="42" y1="58" x2="68" y2="58" stroke="#cbd5e1" stroke-width="2.5" stroke-linecap="round" />
          <!-- Cute smiling eyes -->
          <circle cx="50" cy="72" r="3" fill="#0f172a" />
          <circle cx="70" cy="72" r="3" fill="#0f172a" />
          <!-- Smile -->
          <path d="M 54 78 Q 60 84 66 78" fill="transparent" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" />
          <!-- Feather pen -->
          <path d="M 85 35 Q 98 25 105 15 Q 96 35 88 45 Z" fill="#fbbf24" />
        </svg>
        <p class="mascot-caption">🌱 Their journey starts here.</p>
      </div>
    `;

    // Timeline items list
    const timelineHtml = authorEntries.map((item, index) => {
      const isCurrent = item.id === entry.id;
      const formattedDate = new Date(item.timestamp).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div class="timeline-card ${isCurrent ? 'current-active' : ''}">
          <div class="timeline-card-header">
            <span class="timeline-badge-feeling ${item.feeling ? 'feeling-' + item.feeling.toLowerCase() : ''}">
              ${item.feeling || 'Reflection'}
            </span>
            <span class="timeline-date">${formattedDate}</span>
          </div>
          <p class="timeline-body">${this.escapeHtml(item.text)}</p>
        </div>
      `;
    }).join('');

    this.mountRoot.innerHTML = `
      <div class="modal-backdrop" id="author-modal-backdrop">
        <div class="modal-card">
          <button class="modal-close" id="modal-close-btn" aria-label="Close">&times;</button>
          
          <div class="modal-header">
            <div class="author-meta">
              <div class="author-avatar">${entry.author.charAt(0).toUpperCase()}</div>
              <div>
                <h2 class="author-name">${this.escapeHtml(entry.author)}</h2>
                <div class="author-location">${locationBadge}</div>
              </div>
            </div>
          </div>

          <div class="modal-content-scroll">
            <!-- Active Entry Display -->
            <div class="active-entry-hero">
              <p class="active-entry-text">"${this.escapeHtml(entry.text)}"</p>
            </div>

            <!-- Empathetic Reaction Buttons -->
            <div class="reactions-container" id="reactions-bar">
              <button class="reaction-btn" data-reaction="notAlone">
                <span class="rx-icon">💙</span>
                <span class="rx-label">You're Not Alone</span>
                <span class="rx-count" id="count-notAlone">${entry.reactions?.notAlone || 0}</span>
              </button>
              <button class="reaction-btn" data-reaction="warmth">
                <span class="rx-icon">🫂</span>
                <span class="rx-label">Sending Warmth</span>
                <span class="rx-count" id="count-warmth">${entry.reactions?.warmth || 0}</span>
              </button>
              <button class="reaction-btn" data-reaction="strength">
                <span class="rx-icon">✨</span>
                <span class="rx-label">Strength</span>
                <span class="rx-count" id="count-strength">${entry.reactions?.strength || 0}</span>
              </button>
            </div>

            <!-- Author's Personal Journey Timeline Section -->
            <div class="author-timeline-section">
              <h3 class="section-title">
                <span>Personal Journey Timeline</span>
                <span class="entry-count-pill">${authorEntries.length} ${authorEntries.length === 1 ? 'entry' : 'entries'}</span>
              </h3>

              ${isSingleEntry ? mascotSvg : ''}

              <div class="timeline-feed">
                ${timelineHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Event handlers for modal
    const backdrop = document.getElementById('author-modal-backdrop');
    const closeBtn = document.getElementById('modal-close-btn');

    const closeModal = () => {
      this.mountRoot.innerHTML = '';
      if (this.globe.resetCameraFocus) {
        this.globe.resetCameraFocus();
      }
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Wire up reactions
    const reactionBtns = backdrop.querySelectorAll('.reaction-btn');
    reactionBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.reaction;
        const updated = this.store.addReaction(entry.id, type);
        if (updated) {
          const countSpan = document.getElementById(`count-${type}`);
          if (countSpan) countSpan.textContent = updated.reactions[type];
          btn.classList.add('reacted-pulse');
          setTimeout(() => btn.classList.remove('reacted-pulse'), 450);
        }
      });
    });
  }

  // --- 2. Reflection Composer Modal (`+` button) ---
  initComposeButton() {
    const composeFab = document.getElementById('compose-fab');
    if (!composeFab) return;

    composeFab.addEventListener('click', () => {
      this.showComposeModal();
    });
  }

  showComposeModal() {
    this.mountRoot.innerHTML = `
      <div class="modal-backdrop" id="compose-modal-backdrop">
        <div class="modal-card">
          <button class="modal-close" id="compose-close-btn" aria-label="Close">&times;</button>
          
          <div class="modal-header">
            <div>
              <h2 class="author-name">Record a Reflection</h2>
              <p class="author-location">Your words will shine on the globe or into the cosmos</p>
            </div>
          </div>

          <form id="compose-form" class="modal-content-scroll">
            <div class="form-group">
              <label for="author-input">Your Preferred Name / Handle</label>
              <input type="text" id="author-input" class="form-control" placeholder="e.g. Nasser, StarSeeker, or leave blank for Anonymous" />
            </div>

            <div class="form-group">
              <label>How are you feeling right now? <span class="optional-tag">(Optional)</span></label>
              <div class="feeling-selector" id="feeling-selector">
                <button type="button" class="feeling-pill" data-feeling="Hopeful">✨ Hopeful</button>
                <button type="button" class="feeling-pill" data-feeling="Peaceful">🌿 Peaceful</button>
                <button type="button" class="feeling-pill" data-feeling="Calm">🌊 Calm</button>
                <button type="button" class="feeling-pill" data-feeling="Struggling">💜 Struggling</button>
                <button type="button" class="feeling-pill" data-feeling="Overwhelmed">🌧️ Overwhelmed</button>
                <button type="button" class="feeling-pill" data-feeling="Grateful">💙 Grateful</button>
              </div>
            </div>

            <div class="form-group">
              <label for="reflection-text">Reflection / Diary Note</label>
              <textarea id="reflection-text" class="form-control form-textarea" rows="4" placeholder="Write whatever is on your heart today... venting is safe here." required></textarea>
              <div id="text-warning" class="hint-text"></div>
            </div>

            <div class="form-group">
              <label>Where should this reflection go?</label>
              <div class="destination-options">
                <label class="dest-radio-card">
                  <input type="radio" name="destination" value="earth" checked />
                  <div class="dest-card-content">
                    <span class="dest-icon">🌍</span>
                    <div>
                      <strong>Drop Pin on Earth</strong>
                      <span class="dest-desc">Place your reflection geographically</span>
                    </div>
                  </div>
                </label>

                <label class="dest-radio-card">
                  <input type="radio" name="destination" value="shooting-star" />
                  <div class="dest-card-content">
                    <span class="dest-icon">💫</span>
                    <div>
                      <strong>Cast a Shooting Star</strong>
                      <span class="dest-desc">Send a wish into the sky</span>
                    </div>
                  </div>
                </label>

                <label class="dest-radio-card">
                  <input type="radio" name="destination" value="moon" />
                  <div class="dest-card-content">
                    <span class="dest-icon">🌕</span>
                    <div>
                      <strong>Whisper to the Moon</strong>
                      <span class="dest-desc">Place it gently on the lunar surface</span>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <!-- Earth Location Input (visible when earth selected) -->
            <div class="form-group" id="earth-city-group">
              <label for="city-input">City / Location</label>
              <input type="text" id="city-input" class="form-control" value="Cairo, Egypt" placeholder="e.g. Cairo, Tokyo, London, Paris" />
            </div>

            <div class="composer-actions">
              <button type="submit" class="submit-entry-btn">
                <span>Release Into The World</span>
                <span>✨</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    const backdrop = document.getElementById('compose-modal-backdrop');
    const closeBtn = document.getElementById('compose-close-btn');
    const form = document.getElementById('compose-form');
    const feelingPills = backdrop.querySelectorAll('.feeling-pill');
    let selectedFeeling = '';

    // Feeling selection toggle
    feelingPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        if (pill.classList.contains('active')) {
          pill.classList.remove('active');
          selectedFeeling = '';
        } else {
          feelingPills.forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
          selectedFeeling = pill.dataset.feeling;
        }
      });
    });

    // Destination toggle
    const earthGroup = document.getElementById('earth-city-group');
    const destRadios = form.querySelectorAll('input[name="destination"]');
    destRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        if (radio.value === 'earth') {
          earthGroup.style.display = 'block';
        } else {
          earthGroup.style.display = 'none';
        }
      });
    });

    const closeModal = () => {
      this.mountRoot.innerHTML = '';
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    // Submit handler
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = document.getElementById('reflection-text').value.trim();
      const author = document.getElementById('author-input').value.trim() || 'Anonymous';
      const destination = form.querySelector('input[name="destination"]:checked').value;
      const city = document.getElementById('city-input').value.trim() || 'Global Earth';

      if (!text) {
        const warning = document.getElementById('text-warning');
        warning.textContent = 'Please write a reflection or feeling before releasing.';
        return;
      }

      // Approximate coordinates based on city or random Earth spot
      let lat = 30.0444;
      let lng = 31.2357;
      if (destination === 'earth') {
        const cityLower = city.toLowerCase();
        if (cityLower.includes('cairo') || cityLower.includes('egypt')) { lat = 30.0444; lng = 31.2357; }
        else if (cityLower.includes('tokyo') || cityLower.includes('japan')) { lat = 35.6762; lng = 139.6503; }
        else if (cityLower.includes('london') || cityLower.includes('uk')) { lat = 51.5074; lng = -0.1278; }
        else if (cityLower.includes('paris')) { lat = 48.8566; lng = 2.3522; }
        else if (cityLower.includes('york')) { lat = 40.7128; lng = -74.0060; }
        else if (cityLower.includes('sydney')) { lat = -33.8688; lng = 151.2093; }
        else if (cityLower.includes('dubai') || cityLower.includes('uae')) { lat = 25.2048; lng = 55.2708; }
        else if (cityLower.includes('riyadh') || cityLower.includes('saudi')) { lat = 24.7136; lng = 46.6753; }
        else {
          // Semi-random scatter around Mediterranean / Northern hemisphere
          lat = 20 + Math.random() * 35;
          lng = -20 + Math.random() * 80;
        }
      }

      const newEntry = {
        id: `entry_${Date.now()}`,
        author,
        text,
        feeling: selectedFeeling || '',
        destination,
        locationName: destination === 'moon' ? 'Lunar Surface' : (destination === 'shooting-star' ? 'Shooting Star Orbit' : city),
        lat: destination === 'earth' ? lat : null,
        lng: destination === 'earth' ? lng : null,
        starPosition: destination === 'shooting-star' ? {
          x: -120 + (Math.random() - 0.5) * 80,
          y: 90 + Math.random() * 40,
          z: -80 + (Math.random() - 0.5) * 60
        } : null,
        timestamp: new Date().toISOString(),
        reactions: { notAlone: 1, warmth: 1, strength: 1 }
      };

      this.store.addEntry(newEntry);

      // Re-render globe pins
      const allEntries = this.store.getAllEntries();
      this.globe.renderEntries(allEntries);

      // Focus camera on the new pin or celestial body
      if (destination === 'earth') {
        this.globe.focusOnCoordinates(lat, lng);
      } else if (destination === 'moon') {
        this.globe.zoomToMoon();
      }

      closeModal();
    });
  }

  // --- 3. Compassionate Exit / Check-In Modal ---
  initCheckInButton() {
    const checkinBtn = document.getElementById('checkin-btn');
    if (!checkinBtn) return;

    checkinBtn.addEventListener('click', () => {
      this.showCheckInModal();
    });
  }

  showCheckInModal() {
    this.mountRoot.innerHTML = `
      <div class="modal-backdrop" id="checkin-modal-backdrop">
        <div class="modal-card checkin-card">
          <button class="modal-close" id="checkin-close-btn" aria-label="Close">&times;</button>
          
          <div class="checkin-hero-icon">💙</div>
          <h2 class="checkin-title">Remember, you are not alone in this world.</h2>
          <p class="checkin-subtitle">How are you feeling right in this moment?</p>

          <div class="checkin-options" id="checkin-feelings">
            <button class="checkin-pill" data-state="Grateful">🕊️ Finding quiet peace</button>
            <button class="checkin-pill" data-state="Hopeful">✨ Holding onto hope</button>
            <button class="checkin-pill" data-state="Struggling">💜 Carrying a heavy day</button>
            <button class="checkin-pill" data-state="Overwhelmed">🌧️ Exhausted, but breathing</button>
          </div>

          <div id="checkin-response-message" class="checkin-response"></div>

          <button class="checkin-dismiss-btn" id="checkin-dismiss">Thank You for Checking In</button>
        </div>
      </div>
    `;

    const backdrop = document.getElementById('checkin-modal-backdrop');
    const closeBtn = document.getElementById('checkin-close-btn');
    const dismissBtn = document.getElementById('checkin-dismiss');
    const pills = backdrop.querySelectorAll('.checkin-pill');
    const responseBox = document.getElementById('checkin-response-message');

    const closeModal = () => {
      this.mountRoot.innerHTML = '';
    };

    closeBtn.addEventListener('click', closeModal);
    dismissBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    pills.forEach((pill) => {
      pill.addEventListener('click', () => {
        pills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        responseBox.innerHTML = `
          <div class="warmth-box">
            <p><strong>Your feelings are valid.</strong> Whatever today brings, you are walking through this world with millions of quiet souls rooting for you.</p>
          </div>
        `;
      });
    });
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
