// ─── Firebase Setup ───────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc,
  onSnapshot, query, orderBy
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

// ─── Password ─────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "lekatoo126";
const SESSION_KEY = "amboseli_admin_auth";

function isLoggedIn() {
  return sessionStorage.getItem(SESSION_KEY) === "true";
}

function login(password) {
  if (password === ADMIN_PASSWORD) {
    sessionStorage.setItem(SESSION_KEY, "true");
    return true;
  }
  return false;
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.reload();
}

// ─── State ────────────────────────────────────────────────────────────────────
let allData = [];

// ─── Firestore: Real-time listener ───────────────────────────────────────────
function subscribeToPlantings() {
  const q = query(plantingsCol, orderBy("date", "asc"));
  onSnapshot(q, (snapshot) => {
    allData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTable();
  });
}

// ─── Firestore: Add ───────────────────────────────────────────────────────────
async function addPlanting(obj) {
  try {
    await addDoc(plantingsCol, obj);
  } catch (err) {
    console.error("Error saving:", err);
    alert("Failed to save. Check internet connection.");
  }
}

// ─── Firestore: Delete ────────────────────────────────────────────────────────
async function deletePlanting(id) {
  if (!confirm("Delete this planting?")) return;
  try {
    await deleteDoc(doc(db, "plantings", id));
  } catch (err) {
    alert("Failed to delete.");
  }
}
window._deletePlanting = deletePlanting;

// ─── Render table ─────────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.querySelector('#plantingsTable tbody');
  document.getElementById('tableCount').textContent = `${allData.length} trees`;
  tbody.innerHTML = allData.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(p.species || '—')}</td>
      <td>${escapeHtml(p.planted_by || '—')}</td>
      <td>${p.date || '—'}</td>
      <td>${p.latitude}</td>
      <td>${p.longitude}</td>
      <td>
        <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="window._deletePlanting('${p.id}')">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`).join('');
}

// ─── File Import ──────────────────────────────────────────────────────────────
function handleFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => processRows(res.data, file.name)
    });
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const reader = new FileReader();
    reader.onload = function (e) {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { raw: false });
      processRows(rows, file.name);
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('Unsupported file type. Please use .csv, .xlsx, or .xls');
  }
}

async function processRows(rows, filename) {
  const progressWrap = document.getElementById('progressWrap');
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const progressCount = document.getElementById('progressCount');
  const importResult = document.getElementById('importResult');

  const valid = rows.filter(r => {
    const lat = parseFloat(r.latitude || r.lat || r.Latitude || r.Lat);
    const lon = parseFloat(r.longitude || r.lon || r.Longitude || r.Lon);
    return isFinite(lat) && isFinite(lon);
  });

  if (valid.length === 0) {
    importResult.style.display = 'block';
    importResult.className = 'alert alert-warning py-2 small mb-2';
    importResult.textContent = `No valid rows found in "${filename}". Columns needed: latitude, longitude, species, planted_by, date`;
    return;
  }

  progressWrap.style.display = 'block';
  importResult.style.display = 'none';
  progressLabel.textContent = `Importing "${filename}"...`;

  let added = 0;
  for (const r of valid) {
    const lat = parseFloat(r.latitude || r.lat || r.Latitude || r.Lat);
    const lon = parseFloat(r.longitude || r.lon || r.Longitude || r.Lon);
    await addPlanting({
      latitude: lat,
      longitude: lon,
      species: (r.species || r.Species || '').trim(),
      planted_by: (r.planted_by || r.plantedBy || r.PlantedBy || r['Planted By'] || 'Unknown').trim(),
      date: (r.date || r.Date || new Date().toISOString().split('T')[0]).trim()
    });
    added++;
    const pct = Math.round((added / valid.length) * 100);
    progressBar.style.width = pct + '%';
    progressCount.textContent = `${added} / ${valid.length}`;
  }

  progressWrap.style.display = 'none';
  importResult.style.display = 'block';
  importResult.className = 'alert alert-success py-2 small mb-2';
  importResult.innerHTML = `<i class="bi bi-check-circle"></i> Imported <strong>${added} trees</strong> from <em>${filename}</em>. Now visible on all devices!`;
}

// ─── Export ───────────────────────────────────────────────────────────────────
function exportCsv() {
  if (!allData.length) { alert('No data to export.'); return; }
  const csv = Papa.unparse(allData.map(({ id, ...rest }) => rest));
  downloadFile(csv, 'amboseli_plantings.csv', 'text/csv');
}

function exportXlsx() {
  if (!allData.length) { alert('No data to export.'); return; }
  const ws = XLSX.utils.json_to_sheet(allData.map(({ id, ...rest }) => rest));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantings');
  XLSX.writeFile(wb, 'amboseli_plantings.xlsx');
}

function downloadTemplateCsv() {
  downloadFile(
    'latitude,longitude,species,planted_by,date\n-2.648,37.25,Acacia tortilis,John Doe,2024-01-15\n',
    'amboseli_template.csv', 'text/csv'
  );
}

function downloadTemplateXlsx() {
  const ws = XLSX.utils.json_to_sheet([
    { latitude: -2.648, longitude: 37.25, species: 'Acacia tortilis', planted_by: 'John Doe', date: '2024-01-15' }
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'amboseli_template.xlsx');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('loginScreen');
  const adminArea = document.getElementById('adminArea');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');
  const togglePwd = document.getElementById('togglePwd');

  // ── Check session ──
  if (isLoggedIn()) {
    loginScreen.style.display = 'none';
    adminArea.style.display = 'block';
    initAdmin();
  }

  // ── Login button ──
  loginBtn.addEventListener('click', () => {
    if (login(passwordInput.value)) {
      loginScreen.style.display = 'none';
      adminArea.style.display = 'block';
      loginError.style.display = 'none';
      initAdmin();
    } else {
      loginError.style.display = 'block';
      passwordInput.value = '';
      passwordInput.focus();
    }
  });

  // ── Enter key to login ──
  passwordInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') loginBtn.click();
  });

  // ── Show/hide password ──
  togglePwd.addEventListener('click', () => {
    const isText = passwordInput.type === 'text';
    passwordInput.type = isText ? 'password' : 'text';
    togglePwd.innerHTML = isText
      ? '<i class="bi bi-eye"></i>'
      : '<i class="bi bi-eye-slash"></i>';
  });
});

function initAdmin() {
  subscribeToPlantings();

  // Drag & Drop
  const dropZone = document.getElementById('dropZone');
  const importFile = document.getElementById('importFile');
  dropZone.addEventListener('click', () => importFile.click());
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0]; if (file) handleFile(file);
  });
  importFile.addEventListener('change', e => {
    const f = e.target.files[0]; if (f) handleFile(f); e.target.value = '';
  });

  // Manual add
  document.getElementById('adminAddBtn').addEventListener('click', () => {
    const lat = parseFloat(document.getElementById('aLat').value);
    const lon = parseFloat(document.getElementById('aLon').value);
    const species = document.getElementById('aSpecies').value.trim();
    const planter = document.getElementById('aPlanter').value.trim();
    const date = document.getElementById('aDate').value || new Date().toISOString().split('T')[0];
    if (!isFinite(lat) || !isFinite(lon)) { alert('Enter valid coordinates.'); return; }
    addPlanting({ latitude: lat, longitude: lon, species, planted_by: planter, date });
    ['aLat','aLon','aSpecies','aPlanter','aDate'].forEach(id => document.getElementById(id).value = '');
  });

  // Geolocate
  document.getElementById('geolocateAdminBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      document.getElementById('aLat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('aLon').value = pos.coords.longitude.toFixed(6);
    }, err => alert('Could not get location: ' + err.message));
  });

  // Export
  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('exportXlsxBtn').addEventListener('click', exportXlsx);

  // Templates
  document.getElementById('downloadTemplateCsv').addEventListener('click', downloadTemplateCsv);
  document.getElementById('downloadTemplateXlsx').addEventListener('click', downloadTemplateXlsx);

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Are you sure you want to log out?')) logout();
  });
}