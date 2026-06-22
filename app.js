// Firebase Setup
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

// State
let map, markersLayer, satelliteLayer, streetLayer;
let useClustering = false;
let allData = [];

// Map Init
function initMap() {
  const amboseliCenter = [-2.699, 37.230];
  map = L.map('map', { zoomControl: true }).setView(amboseliCenter, 16);

  // Satellite/aerial layer (default)
  satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, GeoEye, Earthstar Geographics'
    }
  );

  // Street map layer
  streetLayer = L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }
  );

  // Add satellite by default
  satelliteLayer.addTo(map);

  // Layer switcher top-right
  L.control.layers(
    {
      '<span style="font-weight:600">&#x1F6F0; Satellite / Aerial</span>': satelliteLayer,
      '<span style="font-weight:600">&#x1F5FA; Street Map</span>': streetLayer
    },
    {},
    { position: 'topright', collapsed: false }
  ).addTo(map);

  setupMarkersLayer(useClustering);

  // Bright green dot icon - visible on satellite imagery
  window.TREE_DOT_ICON = L.divIcon({
    html: '<span class="tree-dot"></span>',
    className: 'tree-dot-icon',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10]
  });
}

function setupMarkersLayer(enableClustering) {
  if (markersLayer) { try { map.removeLayer(markersLayer); } catch (e) {} }
  markersLayer = (enableClustering && typeof L.markerClusterGroup === 'function')
    ? L.markerClusterGroup()
    : L.layerGroup();
  map.addLayer(markersLayer);
}

// Status bar
function showStatus(msg, type) {
  type = type || 'info';
  var colors = { info: '#2f7a2f', error: '#dc3545', warn: '#ff9800' };
  var bar = document.getElementById('statusBar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'statusBar';
    bar.style.cssText = [
      'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
      'padding:10px 20px', 'border-radius:8px', 'color:#fff', 'font-size:0.9rem',
      'z-index:9999', 'box-shadow:0 2px 8px rgba(0,0,0,0.3)', 'transition:opacity 0.5s'
    ].join(';');
    document.body.appendChild(bar);
  }
  bar.style.background = colors[type] || colors.info;
  bar.style.opacity = '1';
  bar.textContent = msg;
  if (type !== 'error') {
    setTimeout(function() { bar.style.opacity = '0'; }, 4000);
  }
}

// Firestore real-time listener
function subscribeToPlantings() {
  showStatus('Connecting to database...');

  getDocs(plantingsCol).then(function(snapshot) {
    console.log('[Firestore] Initial fetch: ' + snapshot.size + ' documents');
    if (snapshot.size === 0) {
      showStatus('No trees in database yet. Add some from the Admin page!', 'warn');
    }
  }).catch(function(err) {
    console.error('[Firestore] getDocs error:', err);
    showStatus('Database error: ' + err.message + ' - Check Firestore Rules', 'error');
  });

  onSnapshot(plantingsCol, function(snapshot) {
    console.log('[Firestore] onSnapshot: ' + snapshot.size + ' docs');
    allData = snapshot.docs.map(function(d) {
      var data = d.data();
      return Object.assign({ id: d.id }, data, {
        latitude:  Number(data.latitude),
        longitude: Number(data.longitude)
      });
    });
    allData.sort(function(a, b) {
      return (a.date || '').localeCompare(b.date || '');
    });
    renderMarkers();
    renderStats();
    if (allData.length > 0) {
      showStatus(allData.length + ' trees loaded');
      // Auto-fit map to show all trees
      var validPoints = allData.filter(function(p) {
        return isFinite(p.latitude) && isFinite(p.longitude);
      }).map(function(p) { return [p.latitude, p.longitude]; });
      if (validPoints.length > 0) {
        map.fitBounds(L.latLngBounds(validPoints), { padding: [40, 40], maxZoom: 17 });
      }
    }
  }, function(err) {
    console.error('[Firestore] onSnapshot error:', err.code, err.message);
    showStatus('Live sync error: ' + err.message, 'error');
  });
}

// Render markers
function renderMarkers() {
  if (markersLayer && markersLayer.clearLayers) markersLayer.clearLayers();
  var placed = 0;
  allData.forEach(function(p) {
    if (!isFinite(p.latitude) || !isFinite(p.longitude)) return;
    var marker = L.marker([p.latitude, p.longitude], { icon: window.TREE_DOT_ICON });
    marker.bindPopup([
      '<div style="min-width:160px">',
      '<div style="font-weight:700;color:#126012">' + escapeHtml(p.species || 'Unknown') + '</div>',
      '<div style="font-size:0.9rem">By: <strong>' + escapeHtml(p.planted_by || 'Unknown') + '</strong></div>',
      '<div class="text-muted small">' + (p.date || '') + '</div>',
      '</div>'
    ].join(''));
    markersLayer.addLayer(marker);
    placed++;
  });
  console.log('[Markers] Placed ' + placed + ' of ' + allData.length);
  document.getElementById('totalCounter').textContent = allData.length + ' trees';
}

// Render stats
function renderStats() {
  var speciesCount = {}, planters = {};
  allData.forEach(function(p) {
    var s = (p.species || 'Unknown').trim();
    speciesCount[s] = (speciesCount[s] || 0) + 1;
    var b = (p.planted_by || 'Unknown').trim();
    planters[b] = (planters[b] || 0) + 1;
  });
  var speciesList = Object.entries(speciesCount).sort(function(a,b){ return b[1]-a[1]; });
  var plantersList = Object.entries(planters).sort(function(a,b){ return b[1]-a[1]; }).slice(0,5);

  var speciesHtml = speciesList.slice(0,6).map(function(s) {
    return '<span class="species-badge">' + escapeHtml(s[0]) + ' (' + s[1] + ')</span>';
  }).join('') || '<span class="text-muted small">None yet</span>';

  var plantersHtml = plantersList.length ? plantersList.map(function(p) {
    return '<div class="planter-item">' +
      '<div class="planter-avatar">' + escapeHtml(p[0].charAt(0) || '?') + '</div>' +
      '<div>' + escapeHtml(p[0]) + '<div class="text-muted small">' + p[1] + ' trees</div></div>' +
      '</div>';
  }).join('') : '<div class="text-muted small">No data yet</div>';

  var recentHtml = allData.length ? allData.slice(-6).reverse().map(function(r) {
    return '<div style="padding:6px 0;border-bottom:1px solid #e8f5e9">' +
      '<b>' + escapeHtml(r.species || 'Unknown') + '</b> - ' + escapeHtml(r.planted_by || 'Unknown') +
      '<div class="text-muted small">' + (r.date || '') + ' &bull; ' + r.latitude + ', ' + r.longitude + '</div>' +
      '</div>';
  }).join('') : '<div class="text-muted small">No plantings yet. Add some from the Admin page!</div>';

  document.getElementById('statsArea').innerHTML =
    '<div class="stats-grid">' +
      '<div class="stat-card">' +
        '<h3>Total Trees</h3>' +
        '<div class="stat-number">' + allData.length + '</div>' +
        '<div class="text-muted small">Across all Amboseli plots</div>' +
      '</div>' +
      '<div class="stat-card"><h3>Species</h3><div>' + speciesHtml + '</div></div>' +
    '</div>' +
    '<div class="stat-card mt-2"><h4>Top Planters</h4>' + plantersHtml + '</div>' +
    '<div class="stat-card mt-2"><h4>Recent Plantings</h4>' +
      '<div class="recent-list">' + recentHtml + '</div>' +
    '</div>';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(c) {
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}

// Boot
window.addEventListener('DOMContentLoaded', function() {
  initMap();
  subscribeToPlantings();

  // Sidebar toggle
  var sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', function() {
      var sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('sidebar-collapsed');
      setTimeout(function() { map.invalidateSize(); }, 300);
    });
  }

  // Clustering toggle
  var clusterToggle = document.getElementById('clusterToggle');
  if (clusterToggle) {
    clusterToggle.checked = useClustering;
    clusterToggle.addEventListener('change', function(e) {
      useClustering = e.target.checked;
      setupMarkersLayer(useClustering);
      renderMarkers();
    });
  }

  // PWA install
  var deferredPrompt;
  var installBtn = document.getElementById('installBtn');
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-block';
  });
  if (installBtn) {
    installBtn.addEventListener('click', async function() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.style.display = 'none';
    });
  }

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(function() { console.log('SW registered'); })
      .catch(function(e) { console.warn('SW failed', e); });
  }
});
