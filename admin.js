import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyALkQrmJSVMoKOHID9c3ojSt0w4Tl7GjfM",
  authDomain: "amboseli-trees.firebaseapp.com",
  projectId: "amboseli-trees",
  storageBucket: "amboseli-trees.firebasestorage.app",
  messagingSenderId: "1014751005749",
  appId: "1:1014751005749:web:cb79ed5b00a4b1cb39b57c"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const plantingsCol = collection(db, "plantings");

const ADMIN_PASSWORD = "lekatoo126";
const SESSION_KEY = "amboseli_admin_auth";
function isLoggedIn() { return sessionStorage.getItem(SESSION_KEY) === "true"; }
function login(pw) {
  if (pw === ADMIN_PASSWORD) { sessionStorage.setItem(SESSION_KEY, "true"); return true; }
  return false;
}
function logout() { sessionStorage.removeItem(SESSION_KEY); window.location.reload(); }

let allData = [];

function subscribeToPlantings() {
  onSnapshot(plantingsCol, (snapshot) => {
    allData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    allData.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    renderTable();
  }, err => {
    console.error("Firestore error:", err.code, err.message);
  });
}

async function savePlanting(obj) {
  const record = {
    latitude:   Number(obj.latitude),
    longitude:  Number(obj.longitude),
    species:    String(obj.species    || '').trim(),
    planted_by: String(obj.planted_by || 'Green Planet Ambassadors').trim() || 'Green Planet Ambassadors',
    date:       String(obj.date       || new Date().toISOString().split('T')[0]).trim(),
    boma:       String(obj.boma       || '').trim(),
    duration:   String(obj.duration   || '').trim()
  };
  if (!isFinite(record.latitude) || !isFinite(record.longitude)) return false;
  if (isDuplicate(record)) return false; // skip duplicates
  await addDoc(plantingsCol, record);
  return true;
}

// Check if a planting already exists in allData (same lat, lon, species)
function isDuplicate(record) {
  return allData.some(existing =>
    Math.abs(existing.latitude  - record.latitude)  < 0.000001 &&
    Math.abs(existing.longitude - record.longitude) < 0.000001 &&
    (existing.species || '').trim().toLowerCase() === (record.species || '').trim().toLowerCase()
  );
}

async function deletePlanting(id) {
  if (!confirm("Delete this planting?")) return;
  try { await deleteDoc(doc(db, "plantings", id)); }
  catch (err) { alert("Failed to delete: " + err.message); }
}
window._deletePlanting = deletePlanting;

function renderTable() {
  const tbody = document.querySelector('#plantingsTable tbody');
  document.getElementById('tableCount').textContent = allData.length + ' trees';
  tbody.innerHTML = allData.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(p.species || '—')}</td>
      <td>${escapeHtml(p.boma || p.planted_by || '—')}</td>
      <td>${p.date || '—'}</td>
      <td>${p.latitude}</td>
      <td>${p.longitude}</td>
      <td>
        <button class="btn btn-outline-danger btn-sm py-0 px-1"
          onclick="window._deletePlanting('${p.id}')">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>`).join('');
}

// ── Smart row parser — handles your exact Excel format ───────────────────────
function parseRow(row) {
  // 1. Species: "Name of the tree" or fallback columns
  const species = (
    row['Name of the tree'] || row['name of the tree'] ||
    row['Tree'] || row['tree'] ||
    row['species'] || row['Species'] || ''
  ).toString().trim();

  // 2. Coordinates: "Coordinators" or "coordinates" column — format "lat/lon"
  let lat = NaN, lon = NaN;
  const coordRaw = (
    row['Coordinators'] || row['coordinators'] ||
    row['Coordinates']  || row['coordinates'] ||
    row['coords']       || row['Coords'] || ''
  ).toString().trim();

  if (coordRaw) {
    // Handle "lat/lon" format (e.g. "-2.696998/37.229750")
    const sep = coordRaw.includes('/') ? '/' : ',';
    const parts = coordRaw.split(sep);
    if (parts.length >= 2) {
      // Clean up stray dots like "-.2.701434" or "37.37.200443"
      const cleanNum = (s) => {
        s = s.toString().trim();
        // Fix double-dot issues like "-2.729813/37.37.200443"
        const m = s.match(/^(-?)(\d+\.\d+)/);
        return m ? parseFloat(m[1] + m[2]) : parseFloat(s);
      };
      lat = cleanNum(parts[0]);
      lon = cleanNum(parts[1]);
    }
  }

  // Fallback to separate lat/lon columns
  if (!isFinite(lat) || !isFinite(lon)) {
    lat = parseFloat(row['latitude'] || row['lat'] || row['Latitude'] || row['Lat'] || '');
    lon = parseFloat(row['longitude'] || row['lon'] || row['Longitude'] || row['Lon'] || '');
  }

  // 3. Boma (village/location)
  const boma = (
    row['Boma'] || row['boma'] || row['Location'] || row['location'] ||
    row['Village'] || row['village'] || ''
  ).toString().trim();

  // 4. Planted by
  const planted_by = (
    row['planted_by'] || row['Planted By'] || row['plantedBy'] ||
    row['Planter'] || ''
  ).toString().trim() || 'Green Planet Ambassadors';

  // 5. Date
  const date = (
    row['date'] || row['Date'] || row['DATE'] ||
    row['Planting Date'] || ''
  ).toString().trim() || new Date().toISOString().split('T')[0];

  // 6. Duration (bonus field in Sheet12)
  const duration = (row['Duration'] || row['duration'] || '').toString().trim();

  return { species, latitude: lat, longitude: lon, boma, planted_by, date, duration };
}

// ── File handler ──────────────────────────────────────────────────────────────
function handleFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (res) => processRows(res.data, file.name)
    });
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
      let allRows = [];

      wb.SheetNames.forEach(sheetName => {
        const ws = wb.Sheets[sheetName];
        // Convert to array-of-arrays to find real header row
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        const KEYWORDS = [
          'name of the tree','coordinators','coordinates','coords',
          'latitude','longitude','lat','lon','boma','species'
        ];

        // Find header row (first row containing a known keyword)
        let headerIdx = -1;
        for (let i = 0; i < Math.min(aoa.length, 8); i++) {
          const rowLower = aoa[i].map(c => String(c).toLowerCase().trim());
          if (KEYWORDS.some(k => rowLower.some(cell => cell.includes(k)))) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) {
          console.warn('Sheet "' + sheetName + '": no header found, skipping');
          return;
        }

        const headers = aoa[headerIdx].map(h => String(h).trim());
        aoa.slice(headerIdx + 1).forEach(row => {
          if (row.every(c => c === '' || c === null || c === undefined)) return;
          const obj = {};
          headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? row[i] : ''; });
          allRows.push(obj);
        });
      });

      console.log('[Excel] Total rows:', allRows.length, '| Sample:', allRows[0]);
      processRows(allRows, file.name);
    };
    reader.readAsArrayBuffer(file);
  } else {
    alert('Unsupported file. Use .csv, .xlsx, or .xls');
  }
}

async function processRows(rows, filename) {
  const progressWrap  = document.getElementById('progressWrap');
  const progressBar   = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const progressCount = document.getElementById('progressCount');

  // Parse all rows
  const parsed = rows.map(parseRow).filter(r => isFinite(r.latitude) && isFinite(r.longitude));
  console.log('[Import] Valid rows:', parsed.length, 'of', rows.length);

  if (parsed.length === 0) {
    showImportResult(
      '<b>No valid rows found</b> in "' + filename + '".<br>' +
      'Your file needs a <b>Coordinators</b> column with format <code>-2.696998/37.229750</code><br>' +
      'and a <b>Name of the tree</b> column.',
      'warning'
    );
    return;
  }

  progressWrap.style.display = 'block';
  showImportResult('', '');
  progressLabel.textContent = 'Saving ' + parsed.length + ' trees...';
  progressBar.style.width = '0%';

  let added = 0, skipped = 0, failed = 0;
  for (const row of parsed) {
    try {
      const saved = await savePlanting(row);
      if (saved === false) {
        skipped++;
      } else {
        added++;
      }
    } catch(err) {
      failed++;
      console.error('[Import] Failed:', row, err.message);
    }
    const pct = Math.round(((added + skipped + failed) / parsed.length) * 100);
    progressBar.style.width = pct + '%';
    progressCount.textContent = (added + skipped + failed) + ' / ' + parsed.length;
  }

  progressWrap.style.display = 'none';
  const skipMsg = skipped > 0 ? ' (' + skipped + ' duplicates skipped)' : '';
  if (failed === 0) {
    showImportResult(
      '<i class="bi bi-check-circle"></i> Saved <strong>' + added + ' trees</strong> from <em>' + filename + '</em>' + skipMsg + '. Now live on all devices!',
      added > 0 ? 'success' : 'warning'
    );
  } else {
    showImportResult(
      '<i class="bi bi-exclamation-triangle"></i> Saved ' + added + ' trees, ' + failed + ' failed' + skipMsg + '.',
      'warning'
    );
  }
}

function showImportResult(html, type) {
  const el = document.getElementById('importResult');
  if (!html) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.className = 'alert alert-' + type + ' py-2 small mb-2';
  el.innerHTML = html;
}

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
  const csv = 'Name of the tree,Coordinators,Boma,planted_by,date\nAcacia Kirkii,-2.696998/37.229750,Ikangere Village,Green Planet Ambassadors,2026-02-02\n';
  downloadFile(csv, 'amboseli_template.csv', 'text/csv');
}

function downloadTemplateXlsx() {
  const ws = XLSX.utils.json_to_sheet([{
    'Name of the tree': 'Acacia Kirkii',
    'Coordinators': '-2.696998/37.229750',
    'Boma': 'Ikangere Village',
    'planted_by': 'Green Planet Ambassadors',
    'date': '2026-02-02'
  }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, 'amboseli_template.xlsx');
}

function downloadFile(content, filename, type) {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([content], { type })),
    download: filename
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
}

window.addEventListener('DOMContentLoaded', () => {
  const loginScreen   = document.getElementById('loginScreen');
  const adminArea     = document.getElementById('adminArea');
  const passwordInput = document.getElementById('passwordInput');
  const loginBtn      = document.getElementById('loginBtn');
  const loginError    = document.getElementById('loginError');
  const togglePwd     = document.getElementById('togglePwd');

  if (isLoggedIn()) {
    loginScreen.style.display = 'none';
    adminArea.style.display = 'block';
    initAdmin();
  }

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

  passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') loginBtn.click(); });

  togglePwd.addEventListener('click', () => {
    const isText = passwordInput.type === 'text';
    passwordInput.type = isText ? 'password' : 'text';
    togglePwd.innerHTML = isText ? '<i class="bi bi-eye"></i>' : '<i class="bi bi-eye-slash"></i>';
  });
});

function initAdmin() {
  subscribeToPlantings();

  const dropZone   = document.getElementById('dropZone');
  const importFile = document.getElementById('importFile');
  dropZone.addEventListener('click', () => importFile.click());
  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });
  importFile.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
    e.target.value = '';
  });

  document.getElementById('adminAddBtn').addEventListener('click', async () => {
    const lat     = parseFloat(document.getElementById('aLat').value);
    const lon     = parseFloat(document.getElementById('aLon').value);
    const species = document.getElementById('aSpecies').value.trim();
    const boma    = document.getElementById('aBoma').value.trim();
    const planter = document.getElementById('aPlanter').value.trim();
    const date    = document.getElementById('aDate').value || new Date().toISOString().split('T')[0];
    if (!isFinite(lat) || !isFinite(lon)) { alert('Enter valid coordinates.'); return; }
    try {
      await savePlanting({ latitude: lat, longitude: lon, species, boma, planted_by: planter, date });
      ['aLat','aLon','aSpecies','aBoma','aPlanter','aDate'].forEach(id => document.getElementById(id).value = '');
      alert('Tree added!');
    } catch(err) {
      alert('Failed to save: ' + err.message + '\n\nCheck Firestore Rules in Firebase Console.');
    }
  });

  document.getElementById('geolocateAdminBtn').addEventListener('click', () => {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      document.getElementById('aLat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('aLon').value = pos.coords.longitude.toFixed(6);
    }, err => alert('Could not get location: ' + err.message));
  });

  document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
  document.getElementById('exportXlsxBtn').addEventListener('click', exportXlsx);
  document.getElementById('downloadTemplateCsv').addEventListener('click', downloadTemplateCsv);
  document.getElementById('downloadTemplateXlsx').addEventListener('click', downloadTemplateXlsx);
  document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('Log out?')) logout();
  });
}
