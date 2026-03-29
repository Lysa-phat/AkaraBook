import { auth, db, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut, updateProfile, updatePassword, verifyBeforeUpdateEmail, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { collection, addDoc, getDocs, query, updateDoc, doc, Timestamp, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js';
// Initialize Icons
lucide.createIcons();

function syncChartsToTheme() {
  if (!genreChartInstance || !velocityChartInstance) return;
  const root = getComputedStyle(document.documentElement);
  const legend = root.getPropertyValue('--chart-legend').trim() || '#c9d1d9';
  const tick = root.getPropertyValue('--chart-tick').trim() || '#8b949e';
  const grid = root.getPropertyValue('--chart-grid').trim() || '#30363d';
  const bar = root.getPropertyValue('--chart-bar').trim() || 'rgba(88, 166, 255, 0.8)';
  const donutRaw = root.getPropertyValue('--chart-donut').trim();
  const donut = donutRaw ? donutRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

  genreChartInstance.options.plugins.legend.labels.color = legend;
  if (donut.length) genreChartInstance.data.datasets[0].backgroundColor = donut;
  velocityChartInstance.data.datasets[0].backgroundColor = bar;
  velocityChartInstance.options.scales.y.ticks.color = tick;
  velocityChartInstance.options.scales.y.grid.color = grid;
  velocityChartInstance.options.scales.x.ticks.color = tick;
  genreChartInstance.update();
  velocityChartInstance.update();
}

window.addEventListener('akarabook-theme-change', () => syncChartsToTheme());

// --- Auth Check ---
let currentUser = JSON.parse(localStorage.getItem('akarabook_user'));

// --- App State & DOM ---
const state = {
  currentView: 'dashboard',
  libraryStatus: 'Reading',
  libraryView: 'grid',
  libraryShelfFilter: '',
  librarySeriesFilter: '',
  libraryFavoritesOnly: false,
  libraryGroupBySeries: false,
  shelfRotateY: -22,
  books: {
    'Reading': [],
    'ToRead': [],
    'Read': []
  }
};

function escapeHtml(str) {
  if (str == null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function stringHash(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function miniStarSvg(isOn) {
  return `<svg class="star-dot ${isOn ? 'is-on' : ''}" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
}

function starsMarkup(rating, className = 'book-card-stars') {
  const MAX = 10;
  const r = Math.min(MAX, Math.max(0, Math.round(Number(rating) || 0)));
  let h = `<div class="${className}" title="${r} out of ${MAX} stars">`;
  for (let i = 1; i <= MAX; i++) {
    h += miniStarSvg(i <= r);
  }
  h += '</div>';
  return h;
}

function normalizeBookFields(b) {
  return {
    ...b,
    favorite: b.favorite === true,
    shelf: b.shelf != null ? String(b.shelf).trim() : '',
    series: b.series != null ? String(b.series).trim() : '',
    rating: Math.min(10, Math.max(0, Math.round(Number(b.rating) || 0)))
  };
}

function getAllBooksFlat() {
  return [...(state.books.Read || []), ...(state.books.Reading || []), ...(state.books.ToRead || [])];
}

function populateLibraryFilters() {
  const shelfSel = document.getElementById('library-filter-shelf');
  const seriesSel = document.getElementById('library-filter-series');
  if (!shelfSel || !seriesSel) return;

  const prevShelf = state.libraryShelfFilter;
  const prevSeries = state.librarySeriesFilter;

  const shelves = new Set();
  const seriesSet = new Set();
  getAllBooksFlat().forEach((b) => {
    const sh = b.shelf != null ? String(b.shelf).trim() : '';
    const se = b.series != null ? String(b.series).trim() : '';
    if (sh) shelves.add(sh);
    if (se) seriesSet.add(se);
  });

  shelfSel.innerHTML = '<option value="">All shelves</option><option value="__unshelved__">Unshelved</option>';
  [...shelves].sort().forEach((name) => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    shelfSel.appendChild(o);
  });
  if (prevShelf && [...shelfSel.options].some((o) => o.value === prevShelf)) shelfSel.value = prevShelf;
  else shelfSel.value = '';

  seriesSel.innerHTML = '<option value="">All series</option>';
  [...seriesSet].sort().forEach((name) => {
    const o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    seriesSel.appendChild(o);
  });
  if (prevSeries && [...seriesSel.options].some((o) => o.value === prevSeries)) seriesSel.value = prevSeries;
  else seriesSel.value = '';

  state.libraryShelfFilter = shelfSel.value;
  state.librarySeriesFilter = seriesSel.value;

  const favOnly = document.getElementById('library-favorites-only');
  const grp = document.getElementById('library-group-series');
  if (favOnly) favOnly.checked = state.libraryFavoritesOnly;
  if (grp) grp.checked = state.libraryGroupBySeries;
}

function getFilteredLibraryBooks() {
  let list = [...(state.books[state.libraryStatus] || [])].map(normalizeBookFields);
  if (state.libraryFavoritesOnly) list = list.filter((b) => b.favorite === true);
  if (state.libraryShelfFilter === '__unshelved__') list = list.filter((b) => !b.shelf);
  else if (state.libraryShelfFilter) list = list.filter((b) => b.shelf === state.libraryShelfFilter);
  if (state.librarySeriesFilter) list = list.filter((b) => b.series === state.librarySeriesFilter);
  return list;
}

let shelfDragInitialized = false;

function bindShelfDrag() {
  if (shelfDragInitialized) return;
  const dragpad = document.getElementById('shelf-3d-dragpad');
  const rotate = document.getElementById('shelf-3d-rotate');
  if (!dragpad || !rotate) return;
  shelfDragInitialized = true;

  let dragging = false;
  let startX = 0;
  let startRy = 0;

  function applyRy(ry) {
    state.shelfRotateY = ry;
    rotate.style.transform = `rotateX(8deg) rotateY(${ry}deg)`;
  }

  function onDown(clientX) {
    dragging = true;
    startX = clientX;
    startRy = typeof state.shelfRotateY === 'number' ? state.shelfRotateY : -22;
  }

  function onMove(clientX) {
    if (!dragging) return;
    const dx = clientX - startX;
    applyRy(startRy + dx * 0.45);
  }

  function onUp() {
    dragging = false;
  }

  dragpad.addEventListener('mousedown', (e) => {
    e.preventDefault();
    onDown(e.clientX);
  });
  window.addEventListener('mousemove', (e) => onMove(e.clientX));
  window.addEventListener('mouseup', onUp);

  dragpad.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 1) return;
      onDown(e.touches[0].clientX);
    },
    { passive: true }
  );
  window.addEventListener('touchmove', (e) => {
    if (e.touches.length !== 1) return;
    onMove(e.touches[0].clientX);
  });
  window.addEventListener('touchend', onUp);
}

function renderShelf3D(books) {
  const row = document.getElementById('shelf-3d-books');
  const rotate = document.getElementById('shelf-3d-rotate');
  if (!row || !rotate) return;

  bindShelfDrag();
  row.innerHTML = '';
  const ry = typeof state.shelfRotateY === 'number' ? state.shelfRotateY : -22;
  rotate.style.transform = `rotateX(8deg) rotateY(${ry}deg)`;

  if (books.length === 0) {
    row.innerHTML = '<p class="shelf-3d-empty">No books match these filters — try another tab or shelf.</p>';
    lucide.createIcons();
    return;
  }

  books.forEach((book) => {
    const b = normalizeBookFields(book);
    const el = document.createElement('div');
    el.className = 'shelf-book-3d' + (b.thumbnail ? ' has-thumb' : '');
    el.style.setProperty('--spine-hue', String(stringHash(b.title) % 360));
    if (b.thumbnail) {
      const safe = String(b.thumbnail).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      el.style.setProperty('--thumb', `url("${safe}")`);
    }
    el.innerHTML = `<div class="spine-face"><span class="shelf-book-title">${escapeHtml(b.title)}</span></div>`;
    el.addEventListener('click', () => openBookDetails(b));
    row.appendChild(el);
  });
  lucide.createIcons();
}

function wireLibraryBookCard(card, book) {
  const b = normalizeBookFields(book);
  card.style.cursor = 'pointer';
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openBookDetails(b);
  });

  const favBtn = card.querySelector('.btn-favorite-card');
  if (favBtn) {
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const bookRef = doc(db, 'users', currentUser.uid, 'books', b.id);
        await updateDoc(bookRef, { favorite: !b.favorite });
        await loadUserLibrary();
      } catch (err) {
        console.error(err);
      }
    });
  }

  const startReadingBtn = card.querySelector('.start-reading');
  if (startReadingBtn) {
    startReadingBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveBookToReading(b.id);
    });
  }
  const markReadBtn = card.querySelector('.mark-read');
  if (markReadBtn) {
    markReadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      markBookAsRead(b.id, parseInt(b.pageCount, 10) || 0);
    });
  }
}

function createLibraryBookCard(book) {
  const b = normalizeBookFields(book);
  const card = document.createElement('div');
  card.className = 'book-card book-card-rich';

  const cat0 = b.categories && b.categories[0] ? escapeHtml(b.categories[0]) : '';
  const pages = parseInt(b.pageCount, 10) || 0;
  const thumb = b.thumbnail ? escapeHtml(b.thumbnail) : '';

  card.innerHTML = `
    <div class="book-cover-wrap">
      <button type="button" class="btn-favorite-card ${b.favorite ? 'is-favorite' : ''}" aria-label="${b.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${b.favorite}">
        <i data-lucide="heart"></i>
      </button>
      <div class="book-cover">
        ${thumb ? `<img src="${thumb}" alt="">` : '<div class="placeholder">No Cover</div>'}
      </div>
    </div>
    <div class="book-info">
      <h3 class="book-title" title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</h3>
      <p class="book-author">${escapeHtml(b.authors)}</p>
      <div class="book-card-meta">
        ${pages ? `<span class="meta-item"><i data-lucide="file-text"></i>${pages} pp</span>` : ''}
        ${cat0 ? `<span class="meta-item meta-cat">${cat0}</span>` : ''}
      </div>
      ${starsMarkup(b.rating)}
      <div class="book-card-tags">
        ${b.shelf ? `<span class="tag-pill tag-shelf"><i data-lucide="layers"></i>${escapeHtml(b.shelf)}</span>` : ''}
        ${b.series ? `<span class="tag-pill tag-series"><i data-lucide="library"></i>${escapeHtml(b.series)}</span>` : ''}
      </div>
      <div class="book-actions">
        ${b.status === 'ToRead' ? `<button type="button" class="btn-outline start-reading" data-id="${escapeHtml(b.id)}">Start</button>` : ''}
        ${b.status !== 'Read' ? `<button type="button" class="btn-primary mark-read" data-id="${escapeHtml(b.id)}">Finish</button>` : '<span class="book-finished-badge"><span>Finished</span><i data-lucide="check-circle" class="finished-icon"></i></span>'}
      </div>
    </div>
  `;

  wireLibraryBookCard(card, b);
  return card;
}

const views = document.querySelectorAll('.view-section');
const navLinks = document.querySelectorAll('.nav-links a');
const libraryTabs = document.querySelectorAll('.tab-btn');
const libraryGrid = document.getElementById('library-grid');

const searchInput = document.getElementById('book-search-input');
const searchOverlay = document.getElementById('search-results-overlay');
const searchList = document.getElementById('search-results-list');
const closeSearch = document.getElementById('close-search');

const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
const appLayout = document.querySelector('.app-layout');
const btnSearchToggle = document.getElementById('btn-search-toggle');
const searchContainer = document.getElementById('search-container');

const btnAddManual = document.getElementById('btn-add-manual');
const modalManualAdd = document.getElementById('modal-manual-add');
const closeManualAdd = document.getElementById('close-manual-add');
const formManualAdd = document.getElementById('form-manual-add');

document.getElementById('btn-back-library').addEventListener('click', () => {
  switchView('library');
});

function refreshUserUI() {
  if (auth.currentUser) {
    currentUser = {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName,
      email: auth.currentUser.email,
      photoURL: auth.currentUser.photoURL || ''
    };
    try {
      localStorage.setItem('akarabook_user', JSON.stringify(currentUser));
    } catch (e) {}
  }

  const name = (currentUser && (currentUser.displayName || currentUser.email)) || 'Reader';
  const email = (currentUser && currentUser.email) || '';
  const photo = (currentUser && currentUser.photoURL) || '';

  const nameEl = document.getElementById('user-name');
  const welcomeEl = document.getElementById('welcome-name');
  if (nameEl) nameEl.textContent = name;
  if (welcomeEl) {
    const first = (name || '').trim().split(/\s+/)[0];
    welcomeEl.textContent =
      first && first.length ? first : email ? email.split('@')[0] : 'Reader';
  }

  const img = document.getElementById('user-avatar-img');
  const ini = document.getElementById('user-avatar-initial');
  if (img && ini) {
    if (photo) {
      img.onerror = () => {
        img.classList.add('hidden');
        ini.classList.remove('hidden');
        ini.textContent = (name[0] || email[0] || '?').toUpperCase();
      };
      img.onload = () => {
        img.classList.remove('hidden');
        ini.classList.add('hidden');
      };
      img.src = photo;
      if (img.complete && img.naturalHeight > 0) {
        img.classList.remove('hidden');
        ini.classList.add('hidden');
      }
    } else {
      img.removeAttribute('src');
      img.classList.add('hidden');
      ini.classList.remove('hidden');
      ini.textContent = (name[0] || email[0] || '?').toUpperCase();
    }
  }

  lucide.createIcons();
}

function initApp() {
  refreshUserUI();
  loadUserLibrary();
  initDashboardCharts();
  // Make site name clickable to reload the app (quick refresh)
  try {
    const siteName = document.getElementById('site-name');
    if (siteName) {
      siteName.style.cursor = 'pointer';
      siteName.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.reload();
      });
    }
  } catch (e) {
    // ignore if DOM not ready or element missing
  }
}

// --- Navigation Flow ---
navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    const viewName = link.getAttribute('data-view');
    if (!viewName) {
      if (appLayout.classList.contains('sidebar-open')) appLayout.classList.remove('sidebar-open');
      return; // Allow normal hyperlinks to work (like Settings)
    }
    
    e.preventDefault();
    switchView(viewName);
    if (viewName === 'library') renderLibraryBooks();

    // update active nav
    navLinks.forEach(n => n.classList.remove('active'));
    link.classList.add('active');
    
    // Auto-close overlay sidebar
    if (appLayout.classList.contains('sidebar-open')) {
      appLayout.classList.remove('sidebar-open');
    }
  });
});

function switchView(viewName) {
  state.currentView = viewName;
  views.forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${viewName}`).classList.remove('hidden');
}

// --- Logout ---
document.getElementById('btn-logout').addEventListener('click', async () => {
  await signOut(auth);
  localStorage.removeItem('akarabook_user');
  window.location.href = 'index.html';
});

// --- Search Google Books ---
let searchTimeout;
searchInput.addEventListener('input', (e) => {
  const queryText = e.target.value.trim();
  clearTimeout(searchTimeout);
  
  if (queryText.length > 2) {
    searchTimeout = setTimeout(() => {
      performSearch(queryText);
    }, 500);
  } else {
    searchOverlay.classList.add('hidden');
  }
});

closeSearch.addEventListener('click', () => {
  searchOverlay.classList.add('hidden');
  searchInput.value = '';
  if (searchContainer) {
    searchContainer.classList.remove('expanded');
    searchContainer.classList.add('collapsed');
  }
});

searchOverlay.addEventListener('click', (e) => {
  if (e.target === searchOverlay) {
    searchOverlay.classList.add('hidden');
    searchInput.value = '';
    if (searchContainer) {
      searchContainer.classList.remove('expanded');
      searchContainer.classList.add('collapsed');
    }
  }
});

// --- UI Toggle Events ---
if (btnToggleSidebar) {
  btnToggleSidebar.addEventListener('click', (e) => {
    e.stopPropagation();
    appLayout.classList.toggle('sidebar-open');
  });
}

if (btnSearchToggle && searchContainer) {
  btnSearchToggle.addEventListener('click', () => {
    searchContainer.classList.toggle('expanded');
    searchContainer.classList.remove('collapsed');
    if (searchContainer.classList.contains('expanded')) {
      setTimeout(() => searchInput.focus(), 100);
    }
  });
}

document.addEventListener('click', (e) => {
  if (searchContainer && searchContainer.classList.contains('expanded')) {
    if (!searchContainer.contains(e.target) && !searchOverlay.contains(e.target)) {
      searchContainer.classList.remove('expanded');
      searchContainer.classList.add('collapsed');
    }
  }
  
  if (appLayout && appLayout.classList.contains('sidebar-open')) {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && !sidebar.contains(e.target) && btnToggleSidebar && !btnToggleSidebar.contains(e.target)) {
      appLayout.classList.remove('sidebar-open');
    }
  }
});

// --- Manual Book Add ---
btnAddManual.addEventListener('click', () => {
  modalManualAdd.classList.remove('hidden');
});

closeManualAdd.addEventListener('click', () => {
  modalManualAdd.classList.add('hidden');
  formManualAdd.reset();
});

formManualAdd.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btnSubmit = document.getElementById('btn-manual-submit');
  btnSubmit.textContent = 'Saving...';
  btnSubmit.disabled = true;
  
  const title = document.getElementById('manual-title').value;
  const authors = document.getElementById('manual-author').value;
  const thumbnail = document.getElementById('manual-cover').value || '';
  const pageCount = parseInt(document.getElementById('manual-pages').value) || 0;
  const categoriesRaw = document.getElementById('manual-categories').value;
  const categories = categoriesRaw ? categoriesRaw.split(',').map(c => c.trim()) : [];
  const status = document.getElementById('manual-status').value;
  const isbn = document.getElementById('manual-isbn').value || '';
  const description = document.getElementById('manual-description').value || '';
  const shelf = document.getElementById('manual-shelf').value.trim();
  const series = document.getElementById('manual-series').value.trim();
  
  try {
    await addBookToLibrary({
      googleBookId: 'manual_' + Date.now(),
      title, authors, thumbnail, pageCount, categories, status,
      isbn, description, shelf, series
    });
    modalManualAdd.classList.add('hidden');
    formManualAdd.reset();
  } catch (err) {
    document.getElementById('manual-add-error').textContent = 'Error adding book.';
    document.getElementById('manual-add-error').classList.remove('hidden');
  } finally {
    btnSubmit.textContent = 'Save Book to Library';
    btnSubmit.disabled = false;
  }
});

async function performSearch(queryText) {
  searchOverlay.classList.remove('hidden');
  searchList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Searching...</p>';
  
  try {
    const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(queryText)}&maxResults=12`);
    const data = await res.json();
    
    if (data.items) {
      renderSearchResults(data.items);
    } else {
      searchList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No results found for your query.</p>';
    }
  } catch (err) {
    searchList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--error-color);">Error searching books. Please check network.</p>';
  }
}

function renderSearchResults(items) {
  searchList.innerHTML = '';
  searchList.className = 'search-result-list';
  items.forEach(item => {
    const info = item.volumeInfo;
    const thumbnailObj = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
    const thumbnail = thumbnailObj ? thumbnailObj.replace('http:', 'https:') : '';
    const title = info.title || 'Unknown Title';
    const authors = info.authors ? info.authors.join(', ') : 'Unknown Author';
    const pageCount = info.pageCount || 0;
    const categories = info.categories || [];
    const description = info.description || '';
    let isbn = '';
    if (info.industryIdentifiers) {
      const id13 = info.industryIdentifiers.find(id => id.type === 'ISBN_13');
      const id10 = info.industryIdentifiers.find(id => id.type === 'ISBN_10');
      isbn = id13 ? id13.identifier : (id10 ? id10.identifier : '');
    }

    const card = document.createElement('div');
    card.className = 'search-result-card';
    card.innerHTML = `
      <div class="src-cover">
        ${thumbnail ? `<img src="${thumbnail}" alt="${title}">` : '<div class="src-cover-placeholder">No Cover</div>'}
      </div>
      <div class="src-info">
        <h3 class="src-title" title="${title}">${title}</h3>
        <p class="src-author">${authors}</p>
        <div class="src-actions">
          <button class="btn-primary btn-add-to-library">+ Add to Library</button>
        </div>
        <div class="src-status-pills hidden">
          <span class="src-status-label">Mark as:</span>
          <button class="src-status-pill" data-status="ToRead">Want to Read</button>
          <button class="src-status-pill" data-status="Reading">Reading</button>
          <button class="src-status-pill" data-status="Read">Read</button>
        </div>
      </div>
    `;

    const addBtn = card.querySelector('.btn-add-to-library');
    const statusPills = card.querySelector('.src-status-pills');

    addBtn.addEventListener('click', async () => {
      addBtn.textContent = 'Adding…';
      addBtn.disabled = true;
      await addBookToLibrary({
        googleBookId: item.id,
        title, authors, thumbnail, pageCount, categories,
        status: 'ToRead', description, isbn
      });
      addBtn.textContent = '✓ Added';
      statusPills.classList.remove('hidden');
    });

    statusPills.querySelectorAll('.src-status-pill').forEach(pill => {
      pill.addEventListener('click', async () => {
        const status = pill.getAttribute('data-status');
        statusPills.querySelectorAll('.src-status-pill').forEach(p => p.classList.remove('is-active'));
        pill.classList.add('is-active');
        pill.textContent = '…';
        // Find the book and update its status
        const allBooks = [...(state.books['ToRead'] || []), ...(state.books['Reading'] || []), ...(state.books['Read'] || [])];
        const match = allBooks.find(b => b.googleBookId === item.id || b.title === title);
        if (match) {
          try {
            const bookRef = doc(db, 'users', currentUser.uid, 'books', match.id);
            await updateDoc(bookRef, { status });
            await loadUserLibrary();
            const labels = { ToRead: 'Want to Read', Reading: 'Reading', Read: 'Read' };
            pill.textContent = labels[status];
          } catch (e) {
            console.error(e);
            pill.textContent = 'Error';
          }
        }
      });
    });

    searchList.appendChild(card);
  });
}

// --- Data Enrichment ---
async function enrichBookData(bookData) {
  let enriched = { ...bookData };
  try {
    if (!enriched.googleBookId || enriched.googleBookId.startsWith('manual_')) return enriched;
    
    // 1. Fetch deep details from Google Books using ID
    const gRes = await fetch(`https://www.googleapis.com/books/v1/volumes/${enriched.googleBookId}`);
    if (gRes.ok) {
      const gData = await gRes.json();
      const vInfo = gData.volumeInfo;
      if (vInfo) {
        if (!enriched.description && vInfo.description) enriched.description = vInfo.description;
        if ((!enriched.categories || enriched.categories.length === 0) && vInfo.categories) enriched.categories = vInfo.categories;
        if (!enriched.pageCount && vInfo.pageCount) enriched.pageCount = vInfo.pageCount;
        
        if (vInfo.imageLinks) {
          const thumb = vInfo.imageLinks.thumbnail || vInfo.imageLinks.smallThumbnail || '';
          if (thumb) enriched.thumbnail = thumb.replace('http:', 'https:');
        }
      }
    }
    
    // 2. OpenLibrary Fallback for missing subjects/categories
    if ((!enriched.categories || enriched.categories.length === 0) && enriched.isbn) {
      // Split in case of comma separated ISBNs and pull first valid one
      const isbnsToTry = enriched.isbn.split(',').map(i => i.trim()); 
      for (const isbn of isbnsToTry) {
        const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`);
        if (olRes.ok) {
          const olData = await olRes.json();
          const bookObj = olData[`ISBN:${isbn}`];
          if (bookObj && bookObj.subjects) {
            enriched.categories = bookObj.subjects.map(s => s.name).slice(0, 5); // Take top 5
            break;
          }
        }
      }
    }
  } catch(e) {
    console.error('Enrichment background sync failed smoothly', e);
  }
  return enriched;
}

// --- Firestore Library Logic ---
async function addBookToLibrary(bookData, btnEl) {
  try {
    const finalBookData = await enrichBookData(bookData);
    const booksCol = collection(db, 'users', currentUser.uid, 'books');
    const newBook = {
      ...finalBookData,
      favorite: finalBookData.favorite === true,
      shelf: (finalBookData.shelf != null ? String(finalBookData.shelf) : '').trim(),
      series: (finalBookData.series != null ? String(finalBookData.series) : '').trim(),
      rating: Math.min(5, Math.max(0, Math.round(Number(finalBookData.rating) || 0))),
      addedAt: Timestamp.now()
    };
    const ref = await addDoc(booksCol, newBook);
    const withId = { ...newBook, id: ref.id };

    if (!state.books[bookData.status]) state.books[bookData.status] = [];
    state.books[bookData.status].push(withId);
    
    if (state.currentView === 'library' && state.libraryStatus === bookData.status) {
      renderLibraryBooks();
    }
    updateDashboardStats();
    
    if (btnEl) {
      btnEl.innerHTML =
        '<span>Added</span><i data-lucide="check" class="inline-icon-sm" aria-hidden="true"></i>';
      btnEl.disabled = true;
      lucide.createIcons();
    }
  } catch (error) {
    console.error("Error adding book: ", error);
    if (btnEl) btnEl.textContent = 'Error!';
    if (error.code === 'permission-denied') {
      alert('Firestore Permission Denied!\n\nYou must enable "Read and Write" rules in your Firebase Console -> Firestore Database -> Rules.');
    } else {
      alert('Failed to add book to library. Check console for details.');
    }
  }
}

async function loadUserLibrary() {
  try {
    const q = query(collection(db, 'users', currentUser.uid, 'books'));
    const querySnapshot = await getDocs(q);
    
    state.books = { 'Reading': [], 'ToRead': [], 'Read': [] };
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      data.id = doc.id;
      if (state.books[data.status]) {
        state.books[data.status].push(data);
      }
    });
    
    renderLibraryBooks();
    updateDashboardStats();
    renderReadingHub();
    // render the currently reading panel after library is loaded
    try { renderCurrentReading(); } catch (e) { /* ignore if not yet defined */ }
  } catch (err) {
    console.error("Error loading library", err);
  }
}

// --- Library UI ---
libraryTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    libraryTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    state.libraryStatus = tab.getAttribute('data-status');
    renderLibraryBooks();
  });
});

document.querySelectorAll('[data-library-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-library-view]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.libraryView = btn.getAttribute('data-library-view');
    renderLibraryBooks();
    lucide.createIcons();
  });
});

const shelfFilterEl = document.getElementById('library-filter-shelf');
const seriesFilterEl = document.getElementById('library-filter-series');
const btnFavoritesOnly = document.getElementById('btn-favorites-only');
const btnGroupSeries = document.getElementById('btn-group-series');

if (shelfFilterEl) {
  shelfFilterEl.addEventListener('change', () => {
    state.libraryShelfFilter = shelfFilterEl.value;
    renderLibraryBooks();
  });
}
if (seriesFilterEl) {
  seriesFilterEl.addEventListener('change', () => {
    state.librarySeriesFilter = seriesFilterEl.value;
    renderLibraryBooks();
  });
}
if (btnFavoritesOnly) {
  btnFavoritesOnly.addEventListener('click', () => {
    state.libraryFavoritesOnly = !state.libraryFavoritesOnly;
    btnFavoritesOnly.classList.toggle('is-active', state.libraryFavoritesOnly);
    btnFavoritesOnly.setAttribute('aria-pressed', String(state.libraryFavoritesOnly));
    renderLibraryBooks();
  });
}
if (btnGroupSeries) {
  btnGroupSeries.addEventListener('click', () => {
    state.libraryGroupBySeries = !state.libraryGroupBySeries;
    btnGroupSeries.classList.toggle('is-active', state.libraryGroupBySeries);
    btnGroupSeries.setAttribute('aria-pressed', String(state.libraryGroupBySeries));
    renderLibraryBooks();
  });
}

function renderLibraryBooks() {
  const grid = document.getElementById('library-grid');
  const groups = document.getElementById('library-groups');
  if (!grid || !groups) return;

  populateLibraryFilters();
  const filtered = getFilteredLibraryBooks();

  if (filtered.length === 0) {
    groups.innerHTML = '';
    groups.classList.add('hidden');
    grid.classList.remove('hidden');
    grid.innerHTML =
      '<p class="library-empty-msg">No books match these filters yet. Add books from search or loosen your shelf / favorites filters.</p>';
    lucide.createIcons();
    return;
  }

  if (state.libraryGroupBySeries) {
    grid.classList.add('hidden');
    groups.classList.remove('hidden');
    groups.innerHTML = '';

    const map = new Map();
    filtered.forEach((book) => {
      const b = normalizeBookFields(book);
      const key = b.series || 'Other / no series';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(b);
    });
    const keys = [...map.keys()].sort((a, b) => {
      if (a === 'Other / no series') return 1;
      if (b === 'Other / no series') return -1;
      return a.localeCompare(b);
    });

    keys.forEach((key) => {
      const block = document.createElement('div');
      block.className = 'library-series-block';
      const h = document.createElement('h3');
      h.className = 'library-series-title';
      h.textContent = key;
      block.appendChild(h);
      const subGrid = document.createElement('div');
      subGrid.className = 'book-grid';
      map.get(key).forEach((book) => subGrid.appendChild(createLibraryBookCard(book)));
      block.appendChild(subGrid);
      groups.appendChild(block);
    });
  } else {
    groups.innerHTML = '';
    groups.classList.add('hidden');
    grid.classList.remove('hidden');
    grid.innerHTML = '';
    filtered.forEach((book) => grid.appendChild(createLibraryBookCard(book)));
  }

  lucide.createIcons();
}

// --- Currently Reading UI and state (localStorage-backed)
function _crKey(id) { return `akarabook_cr_${id}`; }
function _crPointerKey() { return `akarabook_cr_current`; }

function loadCRData(bookId) {
  try {
    const raw = localStorage.getItem(_crKey(bookId));
    return raw ? JSON.parse(raw) : { currentPage: 0 };
  } catch (e) { return { currentPage: 0 }; }
}
function saveCRData(bookId, data) {
  try { localStorage.setItem(_crKey(bookId), JSON.stringify(data)); } catch (e) { console.error(e); }
}
function setCurrentCRPointer(bookId) {
  try { if (bookId) localStorage.setItem(_crPointerKey(), bookId); else localStorage.removeItem(_crPointerKey()); } catch (e) {}
}
function getCurrentCRPointer() {
  try { return localStorage.getItem(_crPointerKey()); } catch (e) { return null; }
}

function renderCurrentReading() {
  const container = document.getElementById('current-reading');
  if (!container) return;
  // Only show books that are actively in 'Reading' status on the dashboard
  const books = (state.books.Reading || []).map(normalizeBookFields);
  // Render each book currently in Reading as its own row with progress controls.
  container.innerHTML = '';
  if (!books || books.length === 0) {
    container.innerHTML = '<div class="current-reading-inner"><div class="cr-empty">You have no books in your reading list.</div></div>';
    return;
  }

  const list = document.createElement('div');
  list.className = 'current-reading-list';
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '12px';

  books.forEach((book) => {
    const bid = book.id || book.googleBookId || (book.title + '::' + (book.authors||''));

    const row = document.createElement('div');
    row.className = 'cr-row session-card';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '12px';
    row.style.padding = '10px';

    const coverWrap = document.createElement('div');
    coverWrap.className = 'session-cover';
    coverWrap.style.width = '72px';
    coverWrap.style.height = '108px';
    coverWrap.style.flexShrink = '0';
    if (book.thumbnail) coverWrap.innerHTML = `<img src="${escapeHtml(book.thumbnail)}" alt="">`; else coverWrap.innerHTML = '<div class="placeholder">No Cover</div>';

    const details = document.createElement('div');
    details.style.flex = '1';
    details.style.display = 'flex';
    details.style.flexDirection = 'column';
    details.style.gap = '8px';

    const h = document.createElement('div');
    h.style.display = 'flex';
    h.style.justifyContent = 'space-between';
    h.style.alignItems = 'flex-start';

    const title = document.createElement('div');
    title.className = 'cr-title';
    title.textContent = book.title || 'Untitled';

    const pctSpan = document.createElement('div');
    pctSpan.className = 'cr-percent';

    h.appendChild(title);
    h.appendChild(pctSpan);

    const author = document.createElement('div');
    author.className = 'cr-author';
    author.textContent = book.authors || '';

    const progressBg = document.createElement('div');
    progressBg.className = 'progress-bar-bg';
    progressBg.style.height = '10px';
    progressBg.style.borderRadius = '999px';
    progressBg.style.overflow = 'hidden';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-bar-fill';
    progressFill.style.width = '0%';
    progressBg.appendChild(progressFill);

    const controls = document.createElement('div');
    controls.className = 'cr-controls';

    const inputPage = document.createElement('input');
    inputPage.type = 'number';
    inputPage.min = 0;
    inputPage.className = 'input-current-page cr-page-pill';
    inputPage.placeholder = 'Page';

    const btnSave = document.createElement('button');
    btnSave.className = 'btn-primary cr-save-btn';
    btnSave.textContent = 'Save';
    const btnFinish = document.createElement('button');
    btnFinish.className = 'btn-outline cr-finish-btn';
    btnFinish.textContent = 'Finish';

    const ofSpan = document.createElement('div');
    ofSpan.className = 'cr-of';
    // will fill text after computing total
    controls.appendChild(inputPage);
    controls.appendChild(ofSpan);
    controls.appendChild(btnSave);
    controls.appendChild(btnFinish);

    details.appendChild(h);
    details.appendChild(author);
    details.appendChild(progressBg);
    details.appendChild(controls);

    row.appendChild(coverWrap);
    row.appendChild(details);
    list.appendChild(row);

    // initialize values
    const saved = loadCRData(bid);
    const total = parseInt(book.pageCount, 10) || 0;
    const cur = parseInt(saved.currentPage || book.currentPage || 0, 10) || 0;
    const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((cur / total) * 100))) : 0;
    progressFill.style.width = pct + '%';
    pctSpan.textContent = total > 0 ? `${pct}%` : '—';
    inputPage.value = cur || '';
    ofSpan.textContent = total > 0 ? `of ${total}` : '';

    // Helper to show/hide finish button based on pages value
    function refreshFinishVisibility(curVal) {
      const v = parseInt(curVal || 0, 10) || 0;
      const p = total > 0 ? Math.round((v / total) * 100) : 0;
      if (total > 0 && p >= 100) btnFinish.classList.remove('hidden'); else btnFinish.classList.add('hidden');
    }

    // Live update preview when user types a page number
    inputPage.addEventListener('input', () => {
      const val = parseInt(inputPage.value, 10) || 0;
      const clamped = total > 0 ? Math.max(0, Math.min(total, val)) : Math.max(0, val);
      const newPct = total > 0 ? Math.round((clamped / total) * 100) : 0;
      progressFill.style.width = newPct + '%';
      pctSpan.textContent = total > 0 ? `${newPct}%` : '—';
      refreshFinishVisibility(clamped);
    });

    btnSave.addEventListener('click', async () => {
      const val = parseInt(inputPage.value, 10) || 0;
      const s = loadCRData(bid);
      s.currentPage = val;
      saveCRData(bid, s);
      // attempt to sync to Firestore if we have an id and user
      if (book.id && currentUser && currentUser.uid) {
        try {
          const bookRef = doc(db, 'users', currentUser.uid, 'books', book.id);
          await updateDoc(bookRef, { currentPage: val });
        } catch (e) {
          console.error('CR: failed to sync currentPage to Firestore', e);
        }
      }
      const newPct = total > 0 ? Math.max(0, Math.min(100, Math.round((val / total) * 100))) : 0;
      progressFill.style.width = newPct + '%';
      pctSpan.textContent = total > 0 ? `${newPct}%` : '—';
      // update dashboard stats if necessary
      try { updateDashboardStats(); } catch (e) {}
      // ensure finish button visibility updates immediately
      refreshFinishVisibility(val);
    });

    // initial visibility for finish button
    refreshFinishVisibility(cur);

    btnFinish.addEventListener('click', () => {
      showFinishModal(book, total, async (rating, review) => {
        // Save to Firestore if possible
        try {
          // ensure we set currentPage to total and status to Read
          if (book.id && currentUser && currentUser.uid) {
            const bookRef = doc(db, 'users', currentUser.uid, 'books', book.id);
            await updateDoc(bookRef, { status: 'Read', currentPage: total, rating: rating || 0, review: review || '' });
            await loadUserLibrary();
          } else {
            // local fallback
            const bid2 = bid;
            const s = loadCRData(bid2);
            s.currentPage = total;
            s.rating = rating || 0;
            s.review = review || '';
            saveCRData(bid2, s);
            try { updateDashboardStats(); } catch (e) {}
            alert('Marked as finished locally.');
            renderCurrentReading();
          }
        } catch (e) {
          console.error('Finish save failed', e);
          alert('Failed to save finish. See console.');
        }
      });
    });
  });

  container.appendChild(list);
}

// Create and show modal to collect rating + review when finishing a book
function showFinishModal(book, totalPages, onSave) {
  // build modal elements using existing modal classes
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = 1200;

  const card = document.createElement('div');
  card.className = 'modal-card finish-modal';
  card.style.maxWidth = '520px';

  card.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title-with-icon">Finish "${escapeHtml(book.title || 'Untitled')}"</h3>
      <button class="btn-text close-finish-modal">×</button>
    </div>
    <div style="padding: 8px 0 12px; color: var(--text-muted);">You've reached the end — leave a rating and a short review.</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
      <label style="font-weight:800;color:var(--text-main)">Rating</label>
      <div id="finish-stars" class="finish-stars" role="radiogroup" aria-label="Rating">
        <button type="button" class="finish-star" data-val="1" aria-label="1 star"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
        <button type="button" class="finish-star" data-val="2" aria-label="2 stars"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
        <button type="button" class="finish-star" data-val="3" aria-label="3 stars"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
        <button type="button" class="finish-star" data-val="4" aria-label="4 stars"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
        <button type="button" class="finish-star" data-val="5" aria-label="5 stars"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
        <button type="button" class="finish-star" data-val="6" aria-label="6 stars"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
        <button type="button" class="finish-star" data-val="7" aria-label="7 stars"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
        <button type="button" class="finish-star" data-val="8" aria-label="8 stars"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
        <button type="button" class="finish-star" data-val="9" aria-label="9 stars"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
        <button type="button" class="finish-star" data-val="10" aria-label="10 stars"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg></button>
      </div>
      <label style="font-weight:800;color:var(--text-main)">Review (optional)</label>
      <textarea id="finish-review" rows="4" style="padding:10px;border-radius:10px;border:2px solid var(--surface-border);min-height:96px"></textarea>
      <div class="finish-actions" style="display:flex;gap:12px;justify-content:flex-end;margin-top:6px;">
        <button class="btn-outline btn-cancel-finish">Cancel</button>
        <button id="finish-save-btn" class="btn-primary">Save & Finish</button>
      </div>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  function close() { overlay.remove(); }

  // header close button (circular X) and footer cancel are separate elements
  const headerClose = card.querySelector('.modal-header .close-finish-modal');
  if (headerClose) headerClose.addEventListener('click', close);
  const cancelBtn = card.querySelector('.btn-cancel-finish');
  if (cancelBtn) cancelBtn.addEventListener('click', close);

  const saveBtn = card.querySelector('#finish-save-btn');
  // Interactive stars logic
  const starButtons = Array.from(card.querySelectorAll('.finish-star'));
  // default to existing book rating or max (10)
  let selectedRating = Math.min(10, Math.max(0, Math.round(Number(book.rating) || 10)));
  function paintStars(rating) {
    starButtons.forEach((btn) => {
      const v = parseInt(btn.getAttribute('data-val'), 10);
      btn.classList.toggle('is-filled', v <= rating);
    });
  }
  paintStars(selectedRating);
  starButtons.forEach((btn) => {
    btn.addEventListener('mouseover', () => {
      const v = parseInt(btn.getAttribute('data-val'), 10);
      paintStars(v);
    });
    btn.addEventListener('mouseout', () => paintStars(selectedRating));
    btn.addEventListener('click', () => {
      selectedRating = parseInt(btn.getAttribute('data-val'), 10);
      paintStars(selectedRating);
    });
  });

  saveBtn.addEventListener('click', async () => {
    const rating = Number(selectedRating) || 0;
    const review = card.querySelector('#finish-review').value.trim();
    saveBtn.textContent = 'Saving…';
    saveBtn.disabled = true;
    try {
      await onSave(rating, review);
      close();
    } catch (e) {
      console.error(e);
      saveBtn.textContent = 'Error';
      saveBtn.disabled = false;
    }
  });

  // Make the review textarea system-controlled for overflow: set maxlength and auto-trim on input/paste
  (function enforceReviewLength() {
    const ta = card.querySelector('#finish-review');
    if (!ta) return;
    const MAX_REVIEW = 800; // character limit
    ta.maxLength = MAX_REVIEW;
    ta.style.resize = 'none';
    ta.addEventListener('input', () => {
      if (ta.value.length > MAX_REVIEW) ta.value = ta.value.slice(0, MAX_REVIEW);
    });
    ta.addEventListener('paste', (ev) => {
      // let paste happen, then trim on next tick
      requestAnimationFrame(() => { if (ta.value.length > MAX_REVIEW) ta.value = ta.value.slice(0, MAX_REVIEW); });
    });
  })();
}

async function moveBookToReading(docId) {
  try {
    const bookRef = doc(db, 'users', currentUser.uid, 'books', docId);
    await updateDoc(bookRef, { status: 'Reading' });
    await loadUserLibrary();
  } catch (e) {
    console.error("Failed to start reading:", e);
  }
}

async function markBookAsRead(docId, totalPages) {
  try {
    const bookRef = doc(db, 'users', currentUser.uid, 'books', docId);
    await updateDoc(bookRef, { status: 'Read', currentPage: totalPages });
    await loadUserLibrary(); // Reload state and verify
  } catch (e) {
    console.error("Failed to mark as read:", e);
  }
}

function openBookDetails(book) {
  const b = normalizeBookFields(book);
  const container = document.getElementById('book-details-content');
  const rating = b.rating || 0;

  let tagsHtml = '';
  if (b.categories && b.categories.length > 0) {
    tagsHtml = b.categories
      .map(
        (c) =>
          `<span class="detail-tag">${escapeHtml(c)}</span>`
      )
      .join(' ');
  }

  let starsHtml = '';
  for (let i = 1; i <= 10; i++) {
    starsHtml += `<button type="button" class="star-rating-wrap ${i <= rating ? 'is-filled' : ''}" data-val="${i}" aria-label="${i} stars"><i data-lucide="star" class="star-rating-icon"></i></button>`;
  }

  const isFinished = b.status === 'Read';
  const thumbSrc = b.thumbnail ? escapeHtml(b.thumbnail) : '';

  container.innerHTML = `
    <div class="book-detail-layout">
      <div class="book-detail-cover">
        ${thumbSrc ? `<img src="${thumbSrc}" alt="">` : '<div class="book-detail-cover-placeholder">No Cover</div>'}
      </div>
      <div class="book-detail-main">
        <div class="book-detail-head">
          <div>
            <h2 class="book-detail-title">${escapeHtml(b.title)}</h2>
            <p class="book-detail-author">${escapeHtml(b.authors)}</p>
          </div>
          <button type="button" class="btn-detail-favorite ${b.favorite ? 'is-on' : ''}" id="btn-detail-favorite" aria-pressed="${b.favorite}" aria-label="Favorite">
            <i data-lucide="heart"></i>
          </button>
        </div>
        <div class="detail-tags-row">${tagsHtml}</div>

        <div class="detail-meta-grid">
          <div><p class="detail-meta-label">Pages</p><p class="detail-meta-value">${b.pageCount || '—'}</p></div>
          <div><p class="detail-meta-label">ISBN</p><p class="detail-meta-value">${escapeHtml(b.isbn || '—')}</p></div>
          <div><p class="detail-meta-label">Status</p><p class="detail-meta-value accent">${escapeHtml(b.status)}</p></div>
          <div><p class="detail-meta-label">Added</p><p class="detail-meta-value">${b.addedAt ? (b.addedAt.toDate ? b.addedAt.toDate().toLocaleDateString() : '—') : '—'}</p></div>
        </div>

        <div class="detail-organize card-like">
          <h3 class="detail-section-title">Shelves &amp; series</h3>
          <p class="detail-hint">Group books on a shelf (physical vibe) or tie volumes with the same series name.</p>
          <div class="detail-organize-grid">
            <div class="input-group-tight">
              <label for="detail-shelf">Shelf name</label>
              <input type="text" id="detail-shelf" placeholder="e.g. Bedside, Study" value="${escapeHtml(b.shelf)}">
            </div>
            <div class="input-group-tight">
              <label for="detail-series">Series</label>
              <input type="text" id="detail-series" placeholder="e.g. ACOTAR, Book 2" value="${escapeHtml(b.series)}">
            </div>
          </div>
          <p class="detail-meta-label" style="margin-top:12px;">Your rating</p>
          <div class="detail-stars-row" id="rating-stars-container">${starsHtml}</div>
          ${isFinished ? `<label class="detail-meta-label review-label" for="book-review-text">Review</label>
          <textarea id="book-review-text" class="detail-textarea" rows="4" placeholder="Thoughts, quotes, spoilers in a safe vault…"></textarea>` : ''}
          <div class="detail-save-row">
            <button type="button" id="btn-save-book-details" class="btn-primary">Save details</button>
            <span id="detail-save-status" class="detail-save-status">Saved!</span>
          </div>
        </div>

        <h3 class="detail-section-title plain">Description</h3>
        <p class="detail-description">${escapeHtml(b.description || 'No description available for this book.')}</p>
      </div>
    </div>
  `;
  lucide.createIcons();
  switchView('book-details');

  if (isFinished) {
    const ta = document.getElementById('book-review-text');
    if (ta) ta.value = b.review || '';
  }

  const starWraps = container.querySelectorAll('.star-rating-wrap');
  let currentRating = rating;
  function paintStars(val) {
    starWraps.forEach((w) => {
      const v = parseInt(w.getAttribute('data-val'), 10);
      w.classList.toggle('is-filled', v <= val);
    });
  }
  paintStars(currentRating);
  starWraps.forEach((w) => {
    w.addEventListener('click', () => {
      currentRating = parseInt(w.getAttribute('data-val'), 10);
      paintStars(currentRating);
    });
  });

  document.getElementById('btn-detail-favorite').addEventListener('click', async () => {
    const btn = document.getElementById('btn-detail-favorite');
    try {
      const next = !b.favorite;
      const bookRef = doc(db, 'users', currentUser.uid, 'books', b.id);
      await updateDoc(bookRef, { favorite: next });
      b.favorite = next;
      btn.classList.toggle('is-on', next);
      btn.setAttribute('aria-pressed', String(next));
      await loadUserLibrary();
    } catch (e) {
      console.error(e);
    }
  });

  document.getElementById('btn-save-book-details').addEventListener('click', async () => {
    const shelf = document.getElementById('detail-shelf').value.trim();
    const series = document.getElementById('detail-series').value.trim();
    const reviewText = isFinished && document.getElementById('book-review-text') ? document.getElementById('book-review-text').value : '';
    const btn = document.getElementById('btn-save-book-details');
    const statusEl = document.getElementById('detail-save-status');
    btn.textContent = 'Saving…';
    try {
      const bookRef = doc(db, 'users', currentUser.uid, 'books', b.id);
      const payload = { shelf, series, rating: currentRating };
      if (isFinished) payload.review = reviewText;
      await updateDoc(bookRef, payload);
      if (statusEl) {
        statusEl.classList.add('visible');
        setTimeout(() => statusEl.classList.remove('visible'), 2000);
      }
      await loadUserLibrary();
    } catch (e) {
      console.error('Save details error', e);
    } finally {
      btn.textContent = 'Save details';
    }
  });
}

// --- Reading Hub ---
function renderReadingHub() {
  const container = document.getElementById('active-sessions-container');
  if (!container) return;
  container.innerHTML = '';
  
  const readingBooks = state.books['Reading'] || [];
  
  if (readingBooks.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); padding: 20px;">You are not currently reading any books. Add one from Search to start tracking!</p>';
    return;
  }
  
  readingBooks.forEach(book => {
    const card = document.createElement('div');
    card.className = 'session-card';
    
    const totalPages = parseInt(book.pageCount) || 1;
    const currentPage = parseInt(book.currentPage) || 0;
    let percent = Math.round((currentPage / totalPages) * 100);
    percent = Math.max(0, Math.min(100, percent));
    
    card.innerHTML = `
      <div class="session-cover">
        ${book.thumbnail ? `<img src="${book.thumbnail}" alt="${book.title}">` : '<div class="placeholder">No Cover</div>'}
      </div>
      <div class="session-details">
        <div class="session-header">
          <div>
            <h3 style="font-size: 1.25rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${book.title}</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">${book.authors}</p>
          </div>
          <span style="font-size: 1.5rem; font-weight: 700; color: var(--primary-color); padding-left: 16px;">${percent}%</span>
        </div>
        
        <div class="progress-container">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width: ${percent}%;"></div>
          </div>
          
          <div class="progress-inputs">
            <span style="color: var(--text-muted); font-size: 0.9rem;">Page</span>
            <input type="number" class="input-current-page" value="${currentPage}" min="0" max="${totalPages}" style="width: 80px; padding: 6px; border-radius: 6px; border: 1px solid var(--surface-border); background: var(--bg-color); color: var(--text-main); font-family: var(--font-family);">
            <span style="color: var(--text-muted); font-size: 0.9rem;">of ${totalPages}</span>
            
            <button class="btn-primary btn-update-progress" style="margin-left: auto; padding: 6px 16px;">Update</button>
            <button class="btn-outline btn-finish-book" style="padding: 6px 16px; border-color: var(--success-color); color: var(--success-color); margin-top: 0;">Finish</button>
          </div>
        </div>
      </div>
    `;
    
    const inputEl = card.querySelector('.input-current-page');
    const updateBtn = card.querySelector('.btn-update-progress');
    const finishBtn = card.querySelector('.btn-finish-book');
    
    updateBtn.addEventListener('click', async () => {
      const newPage = parseInt(inputEl.value) || 0;
      updateBtn.textContent = '...';
      try {
        const bookRef = doc(db, 'users', currentUser.uid, 'books', book.id);
        await updateDoc(bookRef, { currentPage: newPage });
        await loadUserLibrary();
      } catch (e) {
        console.error(e);
        updateBtn.textContent = 'Error';
      }
    });

    finishBtn.addEventListener('click', async () => {    
      if (!confirm('Mark this book as completely read?')) return;
      finishBtn.textContent = '...';
      try {
        const bookRef = doc(db, 'users', currentUser.uid, 'books', book.id);
        await updateDoc(bookRef, { status: 'Read', currentPage: totalPages });
        await loadUserLibrary();
      } catch (e) {
        console.error(e);
        finishBtn.textContent = 'Error';
      }
    });
    
    container.appendChild(card);
  });
}

// --- Reading Goal ---
let readingGoal = 0;

function updateGoalCard() {
  const year = new Date().getFullYear();
  const booksReadThisYear = (state.books['Read'] || []).filter(b => {
    if (!b.addedAt) return false;
    const d = b.addedAt.toDate ? b.addedAt.toDate() : new Date(b.addedAt);
    return d.getFullYear() === year;
  }).length;

  const elYear = document.getElementById('goal-year');
  const elCurrent = document.getElementById('goal-current');
  const elTarget = document.getElementById('goal-target');
  const elFill = document.getElementById('goal-bar-fill');
  const elPct = document.getElementById('goal-pct');

  if (elYear) elYear.textContent = year;
  if (elCurrent) elCurrent.textContent = booksReadThisYear;

  if (!readingGoal) {
    if (elTarget) elTarget.textContent = '—';
    if (elFill) elFill.style.width = '0%';
    if (elPct) elPct.textContent = 'Set a goal in Settings';
    return;
  }

  const pct = Math.min(100, Math.round((booksReadThisYear / readingGoal) * 100));
  if (elTarget) elTarget.textContent = readingGoal;
  if (elFill) elFill.style.width = pct + '%';
  if (elPct) {
    elPct.textContent = pct >= 100
      ? '🎉 Goal complete!'
      : `${pct}% — ${readingGoal - booksReadThisYear} book${readingGoal - booksReadThisYear === 1 ? '' : 's'} to go`;
  }
}

async function loadReadingGoal(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const g = parseInt(snap.data().readingGoal, 10) || 0;
      readingGoal = g;
      const inp = document.getElementById('goal-target-input');
      if (inp && g) inp.value = g;
    }
  } catch (e) { console.error(e); }
  updateGoalCard();
}

// --- Dashboard & Charts ---
let genreChartInstance = null;
let velocityChartInstance = null;

function updateDashboardStats() {
  const allBooks = [...(state.books['Read'] || []), ...(state.books['Reading'] || []), ...(state.books['ToRead'] || [])];
  
  const totalBooksCount = allBooks.length;
  const readingBooksCount = (state.books['Reading'] || []).length;
  const readBooksCount = (state.books['Read'] || []).length;
  
  let totalPages = 0;
  allBooks.forEach(b => {
    let pages = parseInt(b.currentPage) || 0;
    if (b.status === 'Read') {
      pages = parseInt(b.pageCount) || pages || 0;
    }
    totalPages += pages;
  });

  const elTotal = document.getElementById('stat-total-books');
  const elReading = document.getElementById('stat-currently-reading');
  const elReadingSub = document.getElementById('stat-currently-reading-sub');
  const elFinished = document.getElementById('stat-finished');
  const elPages = document.getElementById('stat-pages-read');

  if (elTotal) elTotal.textContent = totalBooksCount.toLocaleString();
  if (elReading) elReading.textContent = readingBooksCount.toLocaleString();
  if (elReadingSub) elReadingSub.textContent = `${readingBooksCount} book${readingBooksCount === 1 ? '' : 's'} in progress`;
  if (elFinished) elFinished.textContent = readBooksCount.toLocaleString();
  if (elPages) elPages.textContent = totalPages.toLocaleString();

  updateGoalCard();
  updateDashboardCharts();
}

function initDashboardCharts() {
  const ctxGenre = document.getElementById('genreChart').getContext('2d');
  genreChartInstance = new Chart(ctxGenre, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [],
        borderWidth: 0,
        hoverOffset: 8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#c9d1d9', font: { family: 'Nunito', weight: '600' } } }
      }
    }
  });

  const ctxVelocity = document.getElementById('velocityChart').getContext('2d');
  velocityChartInstance = new Chart(ctxVelocity, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Books Added',
        data: [],
        backgroundColor: 'rgba(88, 166, 255, 0.8)',
        borderRadius: 10,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { ticks: { stepSize: 1, color: '#8b949e', font: { family: 'Nunito', weight: '600' } }, grid: { color: '#30363d' } },
        x: { ticks: { color: '#8b949e', font: { family: 'Nunito', weight: '600' } }, grid: { display: false } }
      }
    }
  });

  syncChartsToTheme();
  updateDashboardCharts();
}

function updateDashboardCharts() {
  if (!genreChartInstance || !velocityChartInstance) return;
  
  const allBooks = [...state.books['Read'], ...state.books['Reading'], ...state.books['ToRead']];
  
  if (allBooks.length === 0) {
    genreChartInstance.data.labels = ['No Books Yet'];
    genreChartInstance.data.datasets[0].data = [1];
    velocityChartInstance.data.labels = ['No Data'];
    velocityChartInstance.data.datasets[0].data = [0];
    genreChartInstance.update();
    velocityChartInstance.update();
    return;
  }

  // Calculate Categories
  const categoryCounts = {};
  allBooks.forEach(b => {
    if (b.categories && b.categories.length > 0) {
      const cat = b.categories[0];
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    } else {
      categoryCounts['Uncategorized'] = (categoryCounts['Uncategorized'] || 0) + 1;
    }
  });
  
  genreChartInstance.data.labels = Object.keys(categoryCounts);
  genreChartInstance.data.datasets[0].data = Object.values(categoryCounts);
  genreChartInstance.update();
  
  // Calculate Velocity By Month
  const monthsMap = {};
  allBooks.forEach(b => {
    if (b.addedAt) {
      const date = b.addedAt.toDate ? b.addedAt.toDate() : new Date();
      const month = date.toLocaleString('default', { month: 'short', year: 'numeric' });
      monthsMap[month] = (monthsMap[month] || 0) + 1;
    }
  });
  
  velocityChartInstance.data.labels = Object.keys(monthsMap);
  velocityChartInstance.data.datasets[0].data = Object.values(monthsMap);
  velocityChartInstance.update();
}

// --- Initialize Application ---
if (!currentUser) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL || ''
      };
      initApp();
    } else {
      window.location.href = 'index.html';
    }
  });
} else {
  initApp();
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      localStorage.removeItem('akarabook_user');
      window.location.href = 'index.html';
    } else {
      currentUser = {
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL || ''
      };
      localStorage.setItem('akarabook_user', JSON.stringify(currentUser));
      refreshUserUI();
      if (typeof bindForms === "function") bindForms();
    }
  });
}

// --- Modals for Privacy and Terms ---
const linkTermsSettings = document.getElementById('link-terms-settings');
const linkPrivacySettings = document.getElementById('link-privacy-settings');
const modalTerms = document.getElementById('modal-terms');
const modalPrivacy = document.getElementById('modal-privacy');

if (linkTermsSettings && modalTerms) {
  linkTermsSettings.addEventListener('click', (e) => {
    e.preventDefault();
    modalTerms.classList.remove('hidden');
  });
  document.getElementById('close-terms')?.addEventListener('click', () => modalTerms.classList.add('hidden'));
}

if (linkPrivacySettings && modalPrivacy) {
  linkPrivacySettings.addEventListener('click', (e) => {
    e.preventDefault();
    modalPrivacy.classList.remove('hidden');
  });
  document.getElementById('close-privacy')?.addEventListener('click', () => modalPrivacy.classList.add('hidden'));
}

// --- Settings Features ---
const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
let formsBound = false;

function sanitizeFilename(name) {
  const s = String(name || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_');
  return s.slice(0, 80) || 'photo';
}

function isPasswordUser(user) {
  return user?.providerData?.some((p) => p.providerId === 'password') === true;
}

function refreshAvatarUI(user) {
  const name = user.displayName || user.email || '?';
  const photo = user.photoURL || '';
  const img = document.getElementById('settings-avatar-img');
  const ini = document.getElementById('settings-avatar-initial');
  if (!img || !ini) return;
  if (photo) {
    img.onerror = () => {
      img.classList.add('hidden');
      ini.classList.remove('hidden');
      ini.textContent = (name[0] || '?').toUpperCase();
    };
    img.onload = () => {
      img.classList.remove('hidden');
      ini.classList.add('hidden');
    };
    img.src = photo;
    if (img.complete && img.naturalHeight > 0) {
      img.classList.remove('hidden');
      ini.classList.add('hidden');
    }
  } else {
    img.removeAttribute('src');
    img.classList.add('hidden');
    ini.classList.remove('hidden');
    ini.textContent = (name[0] || '?').toUpperCase();
  }
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

function showSuccess(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideSuccess(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

function authErrorMessage(code, fallback) {
  switch (code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Current password is incorrect.';
    case 'auth/requires-recent-login':
      return 'For security, sign out and sign in again, then try once more.';
    case 'auth/email-already-in-use':
      return 'That email is already used by another account.';
    case 'auth/invalid-email':
      return 'Enter a valid email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    default:
      return fallback || 'Something went wrong. Try again.';
  }
}

async function loadUserExtras(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      const dbBio = snap.data().bio;
      document.getElementById('settings-bio').value = dbBio != null ? String(dbBio) : '';
    }
  } catch (e) {
    console.error(e);
  }
}

function bindForms() {
  if (formsBound || !auth.currentUser) return;
  formsBound = true;
  
  const user = auth.currentUser;
  
  // Update Profile Text
  document.getElementById('settings-display-name').value = user.displayName || '';
  document.getElementById('settings-current-email').textContent = user.email || '—';
  const pwd = isPasswordUser(user);
  document.getElementById('block-email-password')?.classList.toggle('hidden', !pwd);
  document.getElementById('block-google-only')?.classList.toggle('hidden', pwd);
  const provText = document.getElementById('account-provider-text');
  if (provText) {
    provText.textContent = pwd ? 'Signed in with email and password' : 'Signed in with Google';
  }
  
  loadUserExtras(user.uid);
  loadReadingGoal(user.uid);
  refreshAvatarUI(user);

  document.getElementById('btn-choose-avatar')?.addEventListener('click', () => {
    document.getElementById('avatar-file-input')?.click();
  });

  document.getElementById('avatar-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !auth.currentUser) return;
    if (file.size > MAX_AVATAR_BYTES) { return alert('File is too large. Maximum size is 3 MB.'); }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) { return alert('Please choose an image file.'); }
    
    const btn = document.getElementById('btn-choose-avatar');
    const prev = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span>Uploading…</span>';
    try {
      const uid = auth.currentUser.uid;
      const path = `avatars/${uid}/${Date.now()}_${sanitizeFilename(file.name)}`;
      const sRef = ref(storage, path);
      await uploadBytes(sRef, file, { contentType: file.type });
      const url = await getDownloadURL(sRef);
      await updateProfile(auth.currentUser, { photoURL: url });
      await auth.currentUser.reload();
      localStorage.setItem('akarabook_user', JSON.stringify(auth.currentUser));
      refreshUserUI(); // App top level UI
      refreshAvatarUI(auth.currentUser);
    } catch (err) {
      alert(err.message || 'Upload failed.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = prev;
    }
  });

  document.getElementById('btn-remove-avatar')?.addEventListener('click', async () => {
    if (!auth.currentUser?.photoURL) return;
    if (!confirm('Remove your profile photo?')) return;
    try {
      await updateProfile(auth.currentUser, { photoURL: null });
      await auth.currentUser.reload();
      localStorage.setItem('akarabook_user', JSON.stringify(auth.currentUser));
      refreshUserUI();
      refreshAvatarUI(auth.currentUser);
    } catch (err) {
      alert(err.message || 'Could not remove photo.');
    }
  });

  document.getElementById('form-profile-core')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('profile-core-error'); hideSuccess('profile-core-success');
    const displayName = document.getElementById('settings-display-name').value.trim();
    const bio = document.getElementById('settings-bio').value.trim();
    if (!displayName) return showError('profile-core-error', 'Display name is required.');
    
    const btn = document.getElementById('btn-save-profile-core');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await updateProfile(auth.currentUser, { displayName });
      await setDoc(doc(db, 'users', auth.currentUser.uid), { bio, updatedAt: Timestamp.now() }, { merge: true });
      await auth.currentUser.reload();
      localStorage.setItem('akarabook_user', JSON.stringify(auth.currentUser));
      refreshUserUI();
      refreshAvatarUI(auth.currentUser);
      showSuccess('profile-core-success', 'Profile saved.');
    } catch (err) {
      showError('profile-core-error', err.message || 'Could not save profile.');
    } finally {
      btn.disabled = false; btn.textContent = 'Save profile';
    }
  });

  document.getElementById('form-change-password')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError('password-change-error'); hideSuccess('password-change-success');
    const current = document.getElementById('current-password').value;
    const next = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-new-password').value;
    if (next !== confirm) return showError('password-change-error', 'New passwords do not match.');
    if (next.length < 6) return showError('password-change-error', 'New password must be at least 6 characters.');
    const user = auth.currentUser;
    const btn = document.getElementById('btn-submit-password');
    btn.disabled = true; btn.textContent = 'Updating…';
    try {
      const cred = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, next);
      document.getElementById('current-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-new-password').value = '';
      showSuccess('password-change-success', 'Password updated.');
    } catch (err) {
      showError('password-change-error', authErrorMessage(err.code, err.message));
    } finally {
      btn.disabled = false; btn.textContent = 'Update password';
    }
  });

  const rm = (() => { try { return localStorage.getItem('akarabook_reduced_motion') === '1'; } catch (e) { return false; } })();
  const cb = document.getElementById('pref-reduced-motion');
  if (cb) cb.checked = rm;
  
  document.getElementById('pref-reduced-motion')?.addEventListener('change', (e) => {
    try {
      if (e.target.checked) {
        localStorage.setItem('akarabook_reduced_motion', '1');
        document.documentElement.setAttribute('data-reduced-motion', 'on');
      } else {
        localStorage.removeItem('akarabook_reduced_motion');
        document.documentElement.removeAttribute('data-reduced-motion');
      }
    } catch (err) { console.error(err); }
  });

  document.getElementById('btn-save-goal')?.addEventListener('click', async () => {
    const val = parseInt(document.getElementById('goal-target-input')?.value, 10) || 0;
    if (!val || val < 1) return;
    const btn = document.getElementById('btn-save-goal');
    btn.disabled = true;
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid), { readingGoal: val }, { merge: true });
      readingGoal = val;
      updateGoalCard();
      const msg = document.getElementById('goal-save-msg');
      if (msg) { msg.classList.remove('hidden'); setTimeout(() => msg.classList.add('hidden'), 2500); }
    } catch (e) { console.error(e); }
    finally { btn.disabled = false; }
  });
}
