// ─── Firebase Setup ───────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, onSnapshot, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyALkQrmJSVMoKOHID9c3ojSt0w4Tl7GjfM",
  authDomain: "amboseli-trees.firebaseapp.com",
  projectId: "amboseli-trees",
  storageBucket: "amboseli-trees.firebasestorage.app",
  messagingSenderId: "1014751005749",
  appId: "1:1014751005749:web:cb79ed5b00a4b1cb39b57c",
  measurementId: "G-MXZC6BZJVW"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const plantingsCol = collection(db, "plantings");

// ─── State ────────────────────────────────────────────────────────────────────
let map, markersLayer;
let useClustering = false;
let allData = [];

// ─── Map Init ─────────────────────────────────────────────────────────────────
function initMap() {
  const amboseliCenter = [-2.648, 37.25];
  map = L.map('map').setView(amboseliCenter, 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  setupMarkersLayer(useClustering);
  window.TREE_DOT_ICON = L.divIcon({
    html: '<span class="tree-dot"></span>',
    className: 'tree-dot-icon',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -8]
  });
}

function setupMarkersLayer(enableClustering) {
  if (markersLayer) { try { map.removeLayer(markersLayer); } catch (e) {} }
  markersLayer = (enableClustering && typeof L.markerClusterGroup === 'function')
    ? L.markerClusterGroup()
    : L.layerGroup();
  map.addLayer(markersLayer);
}

// ─── Show status message on map ───────────────────────────────────────────────
function showStatus(msg, type = 'info') {
  const colors = { info: '#2f7a2f', error: '#dc3545', warn: '#ff9800' };
  let bar = document.getElementById('statusBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'statusBar';
    bar.style.cssText = `
      position:fixed; bottom:16px; left:50%; transform:translateX(-50%);
      padding:10px 20px; border-radius:8px; color:#fff; font-size:0.9rem;
      z-index:9999; box-shadow:0 2px 8px rgba(0,0,0,0.3); transition:opacity 0.5s;
    `;
    document.body.appendChild(bar);
  }
  bar.style.background = colors[type] || colors.info;
  bar.style.opacity = '1';
  bar.textContent = msg;
  if (type !== 'error') {
    setTimeout(() => { bar.style.opacity = '0'; }, 4000);
  }
}

// ─── Firestore: load data ─────────────────────────────────────────────────────
function subscribeToPlantings() {
  showStatus('🔄 Connecting to database...');

  // First do a one-time fetch to check if data exists at all
  getDocs(plantingsCol).then(snapshot => {
    console.log(`[Firestore] Initial fetch: ${snapshot.size} documents`);
    if (snapshot.size === 0) {
      showStatus('ℹ️ No trees in database yet. Add some from the Admin page!', 'warn');
    }
  }).catch(err => {
    console.error('[Firestore] getDocs error:', err);
    showStatus(`❌ Database error: ${err.message} — Check Firestore Rules in Firebase Console`, 'error');
  });

  // Real-time listener
  onSnapshot(plantingsCol, (snapshot) => {
    console.log(`[Firestore] onSnapshot fired: ${snapshot.size} docs`);
    allData = snapshot.docs.map(d => {
      const data = d.data();
      // Ensure lat/lon are numbers (Firestore may store as string)
      return {
        id: d.id,
        ...data,
        latitude: Number(data.latitude),
        longitude: Number(data.longitude)
      };
    });
    allData.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    console.log('[Firestore] allData sample:', allData.slice(0, 2));
    renderMarkers();
    renderStats();
    if (allData.length > 0) {
      showStatus(`✅ ${allData.length} trees loaded`);
    }
  }, (err) => {
    console.error('[Firestore] onSnapshot error:', err.code, err.message);
    showStatus(`❌ Live sync error: ${err.message}`, 'error');
  });
}

// ─── Render markers ───────────────────────────────────────────────────────────
function renderMarkers() {
  if (markersLayer?.clearLayers) markersLayer.clearLayers();
  let placed = 0;
  allData.forEach(p => {
    if (!isFinite(p.latitude) || !isFinite(p.longitude)) {
      console.warn('[Marker] Skipping bad coords:', p);
      return;
    }
    const marker = L.marker([p.latitude, p.longitude], { icon: window.TREE_DOT_ICON });
    marker.bindPopup(`
      <div style="min-width:160px">
        <div style="font-weight:700;color:#126012">${escapeHtml(p.species || 'Unknown')}</div>
        <div style="font-size:0.9rem">By: <strong>${escapeHtml(p.planted_by || 'Unknown')}</strong></div>
        <div class="text-muted small">${p.date || ''}</div>
      </div>`);
    markersLayer.addLayer(marker);
    placed++;
  });
  console.log(`[Markers] Placed ${placed} of ${allData.length}`);
  document.getElementById('totalCounter').textContent = `${allData.length} trees`;
}

// ─── Render stats ─────────────────────────────────────────────────────────────
function renderStats() {
  const speciesCount = {}, planters = {};
  allData.forEach(p => {
    const s = (p.species || 'Unknown').trim();
    speciesCount[s] = (speciesCount[s] || 0) + 1;
    const b = (p.planted_by || 'Unknown').trim();
    planters[b] = (planters[b] || 0) + 1;
  });
  const speciesList = Object.entries(speciesCount).sort((a, b) => b[1] - a[1]);
  const plantersList = Object.entries(planters).sort((a, b) => b[1] - a[1]).slice(0, 5);

  document.getElementById('statsArea').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Trees</h3>
        <div class="stat-number">${allData.length}</div>
        <div class="text-muted small">Across all Amboseli plots</div>
      </div>
      <div class="stat-card">
        <h3>Species</h3>
        <div>${speciesList.slice(0, 6).map(s =>
          `<span class="species-badge">${escapeHtml(s[0])} (${s[1]})</span>`).join('')
          || '<span class="text-muted small">None yet</span>'}
        </div>
      </div>
    </div>
    <div class="stat-card mt-2">
      <h4>Top Planters</h4>
      ${plantersList.length ? plantersList.map(p => `
        <div class="planter-item">
          <div class="planter-avatar">${escapeHtml(p[0].charAt(0) || '?')}</div>
          <div>${escapeHtml(p[0])}<div class="text-muted small">${p[1]} trees</div></div>
        </div>`).join('') : '<div class="text-muted small">No data yet</div>'}
    </div>
    <div class="stat-card mt-2">
      <h4>Recent Plantings</h4>
      <div class="recent-list">
        ${allData.length ? allData.slice(-6).reverse().map(r => `
          <div style="padding:6px 0;border-bottom:1px solid #e8f5e9">
            <b>${escapeHtml(r.species || 'Unknown')}</b> — ${escapeHtml(r.planted_by || 'Unknown')}
            <div class="text-muted small">${r.date || ''} &bull; ${r.latitude}, ${r.longitude}</div>
          </div>`).join('')
        : '<div class="text-muted small">No plantings yet. Add some from the Admin page!</div>'}
      </div>
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  subscribeToPlantings();

  // Sidebar toggle
  document.getElementById('sidebarToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('sidebar-collapsed');
    setTimeout(() => map.invalidateSize(), 300);
  });

  // Clustering toggle
  const clusterToggle = document.getElementById('clusterToggle');
  if (clusterToggle) {
    clusterToggle.checked = useClustering;
    clusterToggle.addEventListener('change', e => {
      useClustering = e.target.checked;
      setupMarkersLayer(useClustering);
      renderMarkers();
    });
  }

  // PWA install
  let deferredPrompt;
  const installBtn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-block';
  });
  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.style.display = 'none';
  });

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log('SW registered'))
      .catch(e => console.warn('SW failed', e));
  }
});v
