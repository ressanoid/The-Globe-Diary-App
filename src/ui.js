// --- The Globe Diary UI Manager & Modals ---

import {
  onAuthChange,
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signOutCompletely,
  isRegistered,
  displayNameOf,
  initialOf,
  currentUser
} from './auth.js';
import { isAiAvailable, splitDay } from './ai.js';
import { splitIntoDays, saveMoments } from './import.js';

export class UIManager {
  constructor(store, globe) {
    this.store = store;
    this.globe = globe;
    this.mountRoot = document.getElementById('modals-root');
    this.currentAuthor = null;
    this.currentEntryId = null;
    // Reviewer state: resolved role ('doctor'|'admin'|null) plus a token used to
    // discard stale role lookups when the auth state changes again mid-flight.
    this.reviewerRole = null;
    this.reviewerRenderToken = 0;

    this.initCheckInButton();
    this.initComposeButton();
    this.initImportButton();
    this.initAuthControls();
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

      // Imported journal moments are visually marked so their origin is clear.
      const importedBadge = item.source === 'import'
        ? '<span class="timeline-badge-feeling">📥 Imported</span>'
        : '';

      return `
        <div class="timeline-card ${isCurrent ? 'current-active' : ''}">
          <div class="timeline-card-header">
            <span class="timeline-badge-feeling ${item.feeling ? 'feeling-' + this.escapeHtml(String(item.feeling).toLowerCase()) : ''}">
              ${this.escapeHtml(item.feeling) || 'Reflection'}
            </span>
            <span class="timeline-date">${importedBadge}${formattedDate}</span>
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

            <!-- Private replies to this author's own review requests. Filled
                 only for the signed-in author, so no other viewer ever sees it. -->
            <div class="author-timeline-section" id="my-reviews-section"></div>
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

    // Reveal the author's own private review replies asynchronously (no-op for
    // anyone who is not the signed-in author of this entry).
    this.loadMyReviews(entry.id);
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

            <!-- Optional, private "ask for a gentle review" control.
                 Everything here is optional: leaving it untouched just vents. -->
            <div class="form-group">
              <label>Ask for a gentle review? <span class="optional-tag">(Totally optional)</span></label>
              <p class="hint-text">Some days feel heavier than words can hold. If you'd like, a kind human can read this and reply privately — or simply leave it below and vent, exactly as you are.</p>
              <div class="feeling-selector" id="review-target-selector">
                <button type="button" class="feeling-pill" data-target="doctor">🩺 A trained listener</button>
                <button type="button" class="feeling-pill" data-target="country">🌍 Someone in my region</button>
                <button type="button" class="feeling-pill" data-target="admin">🤝 A community helper</button>
              </div>
            </div>

            <div class="form-group" id="review-note-group">
              <label for="review-note">Anything you'd like them to know? <span class="optional-tag">(Optional)</span></label>
              <input type="text" id="review-note" class="form-control" maxlength="280" placeholder="A line or two, in your own words" />
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
    const feelingPills = backdrop.querySelectorAll('#feeling-selector .feeling-pill');
    let selectedFeeling = '';

    // Prefill the handle with the signed-in display name (if any)
    const authorInput = document.getElementById('author-input');
    const activeUser = currentUser();
    if (authorInput && isRegistered(activeUser)) {
      authorInput.value = displayNameOf(activeUser);
    }

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

    // Optional review-target selection — independent of the feeling pills, and
    // always toggleable back off so nobody is forced to ask for a review.
    const reviewTargetPills = backdrop.querySelectorAll('#review-target-selector .feeling-pill');
    let selectedTarget = '';
    reviewTargetPills.forEach((pill) => {
      pill.addEventListener('click', () => {
        if (pill.classList.contains('active')) {
          pill.classList.remove('active');
          selectedTarget = '';
        } else {
          reviewTargetPills.forEach((p) => p.classList.remove('active'));
          pill.classList.add('active');
          selectedTarget = pill.dataset.target;
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
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = document.getElementById('reflection-text').value.trim();
      const author = document.getElementById('author-input').value.trim() || 'Anonymous';
      const destination = form.querySelector('input[name="destination"]:checked').value;
      const city = document.getElementById('city-input').value.trim() || 'Global Earth';
      // Read the optional review note now: the modal is cleared before the
      // private request is sent, so the input no longer exists afterwards.
      const reviewNote = document.getElementById('review-note').value.trim();

      if (!text) {
        const warning = document.getElementById('text-warning');
        warning.textContent = 'Please write a reflection or feeling before releasing.';
        return;
      }

      // Sign-in is required to publish (anonymous sign-in is disabled and the
      // Firestore rules require an authenticated owner). Gate before writing.
      if (!isRegistered(currentUser())) {
        const warning = document.getElementById('text-warning');
        warning.textContent = 'Please sign in to release your reflection.';
        this.showAuthModal('signin');
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

      const created = this.store.addEntry(newEntry);

      // Re-render globe pins
      const allEntries = this.store.getAllEntries();
      this.globe.renderEntries(allEntries);

      // Focus camera on the new pin or celestial body
      if (destination === 'earth') {
        this.globe.focusOnCoordinates(lat, lng);
      } else if (destination === 'moon') {
        this.globe.setFocusTarget('moon');
      } else if (destination === 'shooting-star') {
        this.globe.setFocusTarget('stars');
      }

      // Keep the celestial focus tabs in sync with the new camera target
      const focusTarget = destination === 'moon'
        ? 'moon'
        : (destination === 'shooting-star' ? 'stars' : 'earth');
      document.querySelectorAll('.target-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.target === focusTarget);
      });

      closeModal();

      // Entirely optional: only send a private review request when a target was
      // chosen. With no target we create nothing and simply let them vent.
      if (selectedTarget) {
        try {
          await this.store.createReviewRequest({
            entryId: created.id,
            target: selectedTarget,
            note: reviewNote
          });
        } catch (error) {
          console.warn('Could not send the review request:', error);
        }
      }
    });
  }

  // --- Account: sign in / signed-in identity ---
  initAuthControls() {
    this.renderAuthControls(currentUser());
    this.evaluateReviewerAccess(currentUser());
    onAuthChange((user) => {
      this.renderAuthControls(user);
      this.evaluateReviewerAccess(user);
    });
  }

  renderAuthControls(user) {
    const container = document.getElementById('auth-controls');
    if (!container) return;

    if (isRegistered(user)) {
      const name = displayNameOf(user);
      container.innerHTML = `
        <div class="auth-user" title="${this.escapeHtml(user.email || name)}">
          <span class="auth-avatar">${this.escapeHtml(initialOf(user))}</span>
          <span class="auth-name">${this.escapeHtml(name)}</span>
        </div>
        <button class="view-btn" id="auth-signout-btn" title="Sign out of your account">
          <span>⎋</span>
          <span>Sign Out</span>
        </button>
      `;
      container.querySelector('#auth-signout-btn')?.addEventListener('click', async () => {
        await signOutCompletely();
        // Sign-in is required again: re-present the same gate shown on load.
        if (!isRegistered(currentUser())) this.showAuthModal('signin');
      });
      return;
    }

    container.innerHTML = `
      <button class="view-btn" id="auth-signin-btn">
        <span>🔐</span>
        <span>Sign In</span>
      </button>
    `;
    container.querySelector('#auth-signin-btn')
      ?.addEventListener('click', () => this.showAuthModal('signin'));
  }

  /**
   * Remove the auth gate modal if it is still mounted. Called after the
   * auth state settles, so a session restored just after load (persisted
   * Firebase user) doesn't leave the gate covering an already-signed-in app.
   */
  dismissAuthGate() {
    if (document.getElementById('auth-modal-backdrop')) {
      this.mountRoot.innerHTML = '';
    }
  }

  showAuthModal(mode = 'signin') {
    const isSignUp = mode === 'signup';

    this.mountRoot.innerHTML = `
      <div class="modal-backdrop" id="auth-modal-backdrop">
        <div class="modal-card auth-card">
          <button class="modal-close" id="auth-close-btn" aria-label="Close">&times;</button>

          <div class="modal-header">
            <div>
              <h2 class="author-name">${isSignUp ? 'Create your account' : 'Welcome back'}</h2>
              <p class="author-location">Your reflections stay yours, on every device</p>
            </div>
          </div>

          <form id="auth-form" class="modal-content-scroll">
            ${isSignUp ? `
              <div class="form-group">
                <label for="auth-name">Display name</label>
                <input type="text" id="auth-name" class="form-control" placeholder="e.g. Nasser, StarSeeker" autocomplete="name" />
              </div>` : ''}

            <div class="form-group">
              <label for="auth-email">Email</label>
              <input type="email" id="auth-email" class="form-control" required autocomplete="email" placeholder="you@example.com" />
            </div>

            <div class="form-group">
              <label for="auth-password">Password</label>
              <input type="password" id="auth-password" class="form-control" required minlength="6"
                     autocomplete="${isSignUp ? 'new-password' : 'current-password'}"
                     placeholder="${isSignUp ? 'At least 6 characters' : 'Your password'}" />
            </div>

            <div id="auth-error" class="hint-text"></div>

            <div class="composer-actions">
              <button type="submit" class="submit-entry-btn">
                <span>${isSignUp ? 'Create Account' : 'Sign In'}</span>
                <span>✨</span>
              </button>
            </div>

            <div class="auth-divider"><span>or</span></div>

            <button type="button" class="google-btn" id="google-signin-btn">
              <span class="google-mark">G</span>
              <span>Continue with Google</span>
            </button>

            <p class="auth-switch">
              ${isSignUp ? 'Already have an account?' : 'New here?'}
              <button type="button" class="link-btn" id="auth-mode-toggle">
                ${isSignUp ? 'Sign in' : 'Create one'}
              </button>
            </p>
          </form>
        </div>
      </div>
    `;

    const backdrop = document.getElementById('auth-modal-backdrop');
    const closeBtn = document.getElementById('auth-close-btn');
    const form = document.getElementById('auth-form');
    const errorEl = document.getElementById('auth-error');

    const closeModal = () => { this.mountRoot.innerHTML = ''; };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

    document.getElementById('auth-mode-toggle').addEventListener('click', () => {
      this.showAuthModal(isSignUp ? 'signin' : 'signup');
    });

    const fail = (err) => {
      errorEl.textContent = err?.message || 'Something went wrong. Please try again.';
      errorEl.classList.add('error-text');
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      errorEl.classList.remove('error-text');

      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const displayName = document.getElementById('auth-name')?.value.trim() || '';

      try {
        if (isSignUp) await signUpWithEmail({ email, password, displayName });
        else await signInWithEmail({ email, password });
        closeModal();
      } catch (err) {
        fail(err);
      }
    });

    document.getElementById('google-signin-btn').addEventListener('click', async () => {
      errorEl.textContent = '';
      errorEl.classList.remove('error-text');
      try {
        await signInWithGoogle();
        closeModal();
      } catch (err) {
        fail(err);
      }
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

  // --- 4. Journal Import Modal (paste or .txt -> split -> preview -> save) ---
  initImportButton() {
    const importBtn = document.getElementById('import-btn');
    if (!importBtn) return;

    importBtn.addEventListener('click', () => {
      this.showImportModal();
    });
  }

  showImportModal() {
    this.mountRoot.innerHTML = `
      <div class="modal-backdrop" id="import-modal-backdrop">
        <div class="modal-card">
          <button class="modal-close" id="import-close-btn" aria-label="Close">&times;</button>

          <div class="modal-header">
            <div>
              <h2 class="author-name">Import your journal</h2>
              <p class="author-location">Paste your writing or load a .txt file, then split it into moments</p>
            </div>
          </div>

          <div class="modal-content-scroll">
            <div class="form-group">
              <label for="import-text">Paste your journal text</label>
              <textarea id="import-text" class="form-control import-textarea" rows="6"
                placeholder="Paste a diary here. Add day headings like 'Jan 5' or '2026-01-05' to spread it across days."></textarea>
            </div>

            <div class="form-group">
              <label for="import-file">Or load a .txt file <span class="optional-tag">(Optional)</span></label>
              <input type="file" id="import-file" class="form-control import-file" accept=".txt,text/plain" />
            </div>

            <div class="import-actions">
              <button type="button" class="split-btn" id="import-split-btn">✨ Split with AI</button>
            </div>

            <div id="import-status" class="hint-text" role="status" aria-live="polite"></div>

            <div id="import-engine" class="engine-badge" hidden></div>

            <div class="import-preview-section">
              <h3 class="section-title">
                <span>Preview moments</span>
                <span class="entry-count-pill" id="import-count-pill">0 moments</span>
              </h3>
              <div class="import-preview" id="import-preview"></div>
              <div class="composer-actions">
                <button type="button" class="submit-entry-btn" id="import-save-btn" disabled>Save 0 moments</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const backdrop = document.getElementById('import-modal-backdrop');
    const closeBtn = document.getElementById('import-close-btn');
    const textarea = document.getElementById('import-text');
    const fileInput = document.getElementById('import-file');
    const splitBtn = document.getElementById('import-split-btn');
    const statusEl = document.getElementById('import-status');
    const engineEl = document.getElementById('import-engine');
    const previewEl = document.getElementById('import-preview');
    const countPill = document.getElementById('import-count-pill');
    const saveBtn = document.getElementById('import-save-btn');

    // The preview's single source of truth. Editable inputs are mirrored back
    // into this list before any re-render (remove) or save.
    let moments = [];

    const closeModal = () => {
      this.mountRoot.innerHTML = '';
    };

    const setStatus = (message, isError = false) => {
      statusEl.textContent = message || '';
      statusEl.classList.toggle('error-text', Boolean(isError));
    };

    // Pull the current (possibly edited) input values back into `moments`.
    const syncFromDom = () => {
      previewEl.querySelectorAll('.import-moment').forEach((row) => {
        const moment = moments[Number(row.dataset.index)];
        if (!moment) return;
        moment.text = row.querySelector('.import-moment-text').value;
        moment.feeling = row.querySelector('.import-moment-feeling').value;
      });
    };

    const renderPreview = () => {
      const label = moments.length === 1 ? 'moment' : 'moments';
      countPill.textContent = `${moments.length} ${label}`;
      saveBtn.textContent = `Save ${moments.length} ${label}`;
      saveBtn.disabled = moments.length === 0;

      if (moments.length === 0) {
        previewEl.innerHTML = '<p class="import-empty">No moments yet. Paste some text and split it.</p>';
        return;
      }

      // Every field below is user-supplied: escape before it touches innerHTML.
      previewEl.innerHTML = moments.map((moment, index) => `
        <div class="import-moment" data-index="${index}">
          <div class="import-moment-row">
            <span class="import-moment-datelabel">${this.escapeHtml(moment.dateLabel || moment.dateKey || '')}</span>
            <button type="button" class="import-remove-btn" data-remove="${index}" aria-label="Remove this moment">&times;</button>
          </div>
          <input type="text" class="form-control import-moment-text" value="${this.escapeHtml(moment.text || '')}" placeholder="Moment text" />
          <input type="text" class="form-control import-moment-feeling" value="${this.escapeHtml(moment.feeling || '')}" placeholder="Feeling (optional)" />
        </div>
      `).join('');
    };

    const splitText = async () => {
      const raw = textarea.value.trim();
      if (!raw) {
        setStatus('Paste some text, or load a .txt file, before splitting.', true);
        return;
      }

      splitBtn.disabled = true;
      saveBtn.disabled = true;
      setStatus(isAiAvailable()
        ? 'Asking the AI to split your days into moments…'
        : 'The AI is unavailable right now — using the built-in splitter…');

      try {
        const days = splitIntoDays(raw);
        let usedAi = false;
        const collected = [];

        for (const day of days) {
          // `splitDay` tries Gemini and falls back to the local heuristic itself.
          const result = await splitDay(day.text, { date: day.dateLabel });
          if (result.source === 'gemini') usedAi = true;
          result.moments.forEach((moment) => {
            collected.push({
              text: moment.text,
              feeling: moment.feeling || '',
              dateKey: day.dateKey,
              dateLabel: day.dateLabel
            });
          });
        }

        moments = collected;

        // Show the user which engine actually produced the split.
        engineEl.hidden = false;
        engineEl.textContent = usedAi
          ? '✨ Split by AI'
          : '⚙️ Split by the built-in fallback (AI unavailable)';
        engineEl.classList.toggle('engine-ai', usedAi);
        engineEl.classList.toggle('engine-fallback', !usedAi);

        if (moments.length === 0) {
          setStatus('No moments found in that text. Try adding more detail or day headings.', true);
        } else {
          const dayLabel = days.length === 1 ? 'day' : 'days';
          setStatus(`Found ${moments.length} ${moments.length === 1 ? 'moment' : 'moments'} across ${days.length} ${dayLabel}. Edit anything below before saving.`);
        }
        renderPreview();
      } catch (error) {
        console.warn('Failed to split imported text:', error);
        setStatus('Something went wrong while splitting the text. Please try again.', true);
      } finally {
        splitBtn.disabled = false;
      }
    };

    const saveAll = async () => {
      syncFromDom();
      const payload = moments
        .map((moment) => ({
          text: (moment.text || '').trim(),
          feeling: (moment.feeling || '').trim(),
          dateKey: moment.dateKey
        }))
        .filter((moment) => moment.text);

      if (payload.length === 0) {
        setStatus('Add at least one moment with text before saving.', true);
        return;
      }

      // Firestore rules require an authenticated owner, so gate like the composer.
      if (!isRegistered(currentUser())) {
        setStatus('Please sign in to import your reflections.', true);
        this.showAuthModal('signin');
        return;
      }

      saveBtn.disabled = true;
      setStatus('Saving your moments…');

      const author = displayNameOf(currentUser()) || 'Anonymous';
      const result = await saveMoments(this.store, payload, { author });

      if (!result.success) {
        setStatus(result.error || 'Could not save your moments.', true);
        saveBtn.disabled = false;
        return;
      }

      // Refresh the globe from the store's now-updated cache.
      this.globe.renderEntries(this.store.getAllEntries());
      closeModal();
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        textarea.value = text;
        setStatus(`Loaded "${file.name}". Now split it into moments.`);
      } catch (error) {
        console.warn('Failed to read the import file:', error);
        setStatus('Could not read that file. Please paste the text instead.', true);
      }
    });

    splitBtn.addEventListener('click', splitText);

    previewEl.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.import-remove-btn');
      if (!removeBtn) return;
      syncFromDom();
      const index = Number(removeBtn.dataset.remove);
      moments = moments.filter((_, i) => i !== index);
      renderPreview();
    });

    saveBtn.addEventListener('click', saveAll);

    renderPreview();
  }

  // --- 5. Reviewer-only review queue ---
  //
  // The entry point is shown ONLY to a signed-in reviewer whose
  // `reviewers/{uid}` role resolves to 'doctor' or 'admin'. Everyone else
  // never sees it, because the header button is created here and nowhere else.

  /**
   * Resolve the reviewer role and reveal/hide the header entry point.
   *
   * The store connects to Firestore slightly after auth settles, so a role
   * lookup can legitimately return null while the store is still local. In that
   * case we retry briefly; once connected, a null role is final (not a reviewer).
   */
  async evaluateReviewerAccess(user) {
    this.reviewerRenderToken += 1;
    const token = this.reviewerRenderToken;

    if (!isRegistered(user)) {
      this.reviewerRole = null;
      this.removeReviewerEntryPoint();
      return;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const role = await this.store.getReviewerRole(user.uid);
      if (token !== this.reviewerRenderToken) return; // superseded by a newer auth state
      if (role) {
        this.reviewerRole = role;
        this.renderReviewerEntryPoint(role);
        return;
      }
      if (this.store.mode === 'firestore') break; // connected, genuinely not a reviewer
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (token !== this.reviewerRenderToken) return;
    this.reviewerRole = null;
    this.removeReviewerEntryPoint();
  }

  /** Add the header entry point, once, for a confirmed reviewer. */
  renderReviewerEntryPoint(role) {
    const headerControls = document.querySelector('.header-controls');
    if (!headerControls) return;

    let btn = document.getElementById('review-queue-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'review-queue-btn';
      btn.className = 'view-btn';
      btn.innerHTML = '<span>💬</span><span>Review Queue</span>';
      const authControls = document.getElementById('auth-controls');
      if (authControls && authControls.parentNode === headerControls) {
        headerControls.insertBefore(btn, authControls);
      } else {
        headerControls.appendChild(btn);
      }
      btn.addEventListener('click', () => this.showReviewQueueModal());
    }
    btn.title = role === 'admin'
      ? 'Open the review queue (admin)'
      : 'Open the review queue (doctor)';
  }

  /** Remove the header entry point (signed out, or role revoked). */
  removeReviewerEntryPoint() {
    const btn = document.getElementById('review-queue-btn');
    if (btn) btn.remove();
  }

  /** Reviewer-only modal: lists open requests and lets a reviewer reply. */
  async showReviewQueueModal() {
    this.mountRoot.innerHTML = `
      <div class="modal-backdrop" id="review-modal-backdrop">
        <div class="modal-card">
          <button class="modal-close" id="review-close-btn" aria-label="Close">&times;</button>

          <div class="modal-header">
            <div>
              <h2 class="author-name">Review Queue</h2>
              <p class="author-location">Private, human replies to people who asked for a gentle review</p>
            </div>
          </div>

          <div class="modal-content-scroll">
            <div id="review-status" class="hint-text" role="status" aria-live="polite"></div>
            <div class="import-preview" id="review-list"></div>
          </div>
        </div>
      </div>
    `;

    const backdrop = document.getElementById('review-modal-backdrop');
    const closeBtn = document.getElementById('review-close-btn');
    const listEl = document.getElementById('review-list');
    const statusEl = document.getElementById('review-status');

    const closeModal = () => {
      this.mountRoot.innerHTML = '';
    };

    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    statusEl.textContent = 'Loading the queue…';

    let requests = [];
    try {
      requests = await this.store.getOpenReviewRequests();
    } catch (error) {
      console.warn('Could not load the review queue:', error);
    }

    // The modal may have been closed while the queue was loading.
    if (!document.getElementById('review-modal-backdrop')) return;

    if (requests.length === 0) {
      statusEl.textContent = '';
      listEl.innerHTML = '<p class="import-empty">No open reviews right now. Thank you for being here.</p>';
      return;
    }

    statusEl.textContent = `${requests.length} ${requests.length === 1 ? 'person is' : 'people are'} waiting for a kind reply.`;
    listEl.innerHTML = requests.map((request) => this.reviewRequestCard(request)).join('');

    // Delegated so re-rendered cards keep working.
    listEl.addEventListener('click', async (e) => {
      const resolveBtn = e.target.closest('.review-resolve-btn');
      if (!resolveBtn) return;
      const card = resolveBtn.closest('[data-request-id]');
      if (!card) return;

      const replyInput = card.querySelector('.review-reply-input');
      const response = (replyInput && replyInput.value ? replyInput.value : '').trim();

      resolveBtn.disabled = true;
      const ok = await this.store.respondToReviewRequest(card.dataset.requestId, {
        status: 'resolved',
        response
      });

      // The modal may have been closed while the reply was in flight.
      if (!document.getElementById('review-modal-backdrop')) return;

      if (ok) {
        card.remove();
        statusEl.textContent = 'Thank you — your kind reply was sent privately.';
        if (!listEl.querySelector('[data-request-id]')) {
          listEl.innerHTML = '<p class="import-empty">No open reviews right now. Thank you for being here.</p>';
        }
      } else {
        resolveBtn.disabled = false;
        statusEl.textContent = 'That reply could not be sent. Please try again in a moment.';
      }
    });
  }

  /** One queue card. Every user-supplied value is escaped before innerHTML. */
  reviewRequestCard(request) {
    const formattedDate = new Date(request.createdAt || Date.now()).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const targetLabel = request.target ? `@${this.escapeHtml(String(request.target))}` : 'Reviewer';

    return `
      <div class="import-moment" data-request-id="${this.escapeHtml(request.id)}">
        <div class="import-moment-row">
          <span class="import-moment-datelabel">${targetLabel} · from ${this.escapeHtml(request.author || 'Anonymous')}</span>
          <span class="import-moment-datelabel">${this.escapeHtml(formattedDate)}</span>
        </div>
        <p class="timeline-body">${this.escapeHtml(request.message || '')}</p>
        <input type="text" class="form-control review-reply-input" maxlength="500" placeholder="A caring, private reply…" />
        <div class="composer-actions">
          <button type="button" class="submit-entry-btn review-resolve-btn">Send reply &amp; resolve</button>
        </div>
      </div>
    `;
  }

  // --- 6. The author's own private review replies ---
  //
  // Shown inside the author modal, but only for the signed-in author of the
  // entry being viewed. `getMyReviewRequests` returns only the caller's own
  // requests, so no other viewer can ever see another person's replies.

  /**
   * Fill the author modal's private-reply section for `entryId`.
   * A no-op when signed out, when the modal has closed, or when this entry has
   * no review requests owned by the caller.
   */
  async loadMyReviews(entryId) {
    if (!isRegistered(currentUser())) return;

    let mine = [];
    try {
      mine = await this.store.getMyReviewRequests();
    } catch (error) {
      console.warn('Could not load your review replies:', error);
      return;
    }

    // The author modal may have been closed or swapped while awaiting.
    const section = document.getElementById('my-reviews-section');
    if (!section || this.currentEntryId !== entryId) return;

    const forEntry = mine.filter((request) => request.entryId === entryId);
    if (forEntry.length === 0) return;

    section.innerHTML = `
      <h3 class="section-title">
        <span>Replies to your review request</span>
        <span class="entry-count-pill">${forEntry.length}</span>
      </h3>
      <div class="timeline-feed">
        ${forEntry.map((request) => this.reviewReplyCard(request)).join('')}
      </div>
    `;
  }

  /** One private-reply card for the author's own review request. */
  reviewReplyCard(request) {
    const formattedDate = new Date(request.createdAt || Date.now()).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const targetLabel = request.target ? `@${this.escapeHtml(String(request.target))}` : 'Review request';
    const statusLabel = request.status === 'resolved' ? 'replied' : 'waiting for a reply';
    const hasReply = typeof request.response === 'string' && request.response.trim().length > 0;

    const replyBlock = hasReply
      ? `
        <div class="warmth-box">
          <p><strong>${this.escapeHtml(request.responderName || 'A caring person')}</strong> replied privately:</p>
          <p>${this.escapeHtml(request.response)}</p>
        </div>
      `
      : '<p class="hint-text">A kind human will reply soon. Your words are held with care.</p>';

    return `
      <div class="import-moment">
        <div class="import-moment-row">
          <span class="import-moment-datelabel">${targetLabel} · ${this.escapeHtml(statusLabel)}</span>
          <span class="import-moment-datelabel">${this.escapeHtml(formattedDate)}</span>
        </div>
        <p class="timeline-body">Your note: “${this.escapeHtml(request.message || '')}”</p>
        ${replyBlock}
      </div>
    `;
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
