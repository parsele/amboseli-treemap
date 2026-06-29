// ─── Firebase Auth Setup ──────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc
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
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ─── Save user role to Firestore ──────────────────────────────────────────────
async function saveUserProfile(uid, name, email, role) {
  await setDoc(doc(db, "users", uid), {
    name, email, role,
    createdAt: new Date().toISOString()
  });
}

// ─── Get user role from Firestore ─────────────────────────────────────────────
async function getUserRole(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data().role : 'user';
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function showPage(id) {
  ['loginPage','registerPage','homePage'].forEach(p => {
    const el = document.getElementById(p);
    if (el) el.style.display = 'none';
  });
  const target = document.getElementById(id);
  if (target) target.style.display = 'block';
}

function setError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = msg; el.style.display = msg ? 'block' : 'none'; }
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<span class="spinner-border spinner-border-sm me-2"></span>Please wait...'
    : btn.getAttribute('data-label');
}

// ─── Auth state listener ──────────────────────────────────────────────────────
export function initAuth(onLogin, onLogout) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const role = await getUserRole(user.uid);
      onLogin({ uid: user.uid, name: user.displayName, email: user.email, role });
    } else {
      onLogout();
    }
  });
}

// ─── Register ─────────────────────────────────────────────────────────────────
export async function registerUser(name, email, password, adminCode) {
  // Admin code grants admin role
  const ADMIN_CODE = "AMBOSELI-ADMIN-2026";
  const role = (adminCode === ADMIN_CODE) ? 'admin' : 'user';

  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await saveUserProfile(cred.user.uid, name, email, role);
  return { uid: cred.user.uid, name, email, role };
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const role = await getUserRole(cred.user.uid);
  return { uid: cred.user.uid, name: cred.user.displayName, email: cred.user.email, role };
}

// ─── Logout ───────────────────────────────────────────────────────────────────
export async function logoutUser() {
  await signOut(auth);
}
