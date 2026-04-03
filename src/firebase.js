import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, query, orderBy, limit, getDocs, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBQ-enwRhwN4ATUyyyb8TGui-6uFpPvWKA",
  authDomain: "datacenter-disaster.firebaseapp.com",
  projectId: "datacenter-disaster",
  storageBucket: "datacenter-disaster.firebasestorage.app",
  messagingSenderId: "822235747826",
  appId: "1:822235747826:web:658e0d3ecf9e43530dc76b",
  measurementId: "G-XQKDDDMBX6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const SCORES_COLLECTION = 'highscores';

export async function submitScoreToFirebase(entry) {
  try {
    await addDoc(collection(db, SCORES_COLLECTION), {
      initials: entry.initials,
      score: entry.score,
      level: entry.level,
      time: entry.time,
      timestamp: Date.now()
    });
    return true;
  } catch (e) {
    console.warn('Firebase score submit failed:', e);
    return false;
  }
}

export async function fetchTopScores(count = 20) {
  try {
    const q = query(collection(db, SCORES_COLLECTION), orderBy('score', 'desc'), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('Firebase fetch failed:', e);
    return null;
  }
}

export async function fetchLevelScores(level, count = 20) {
  try {
    const q = query(collection(db, SCORES_COLLECTION), where('level', '==', level), orderBy('score', 'desc'), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch (e) {
    console.warn('Firebase level fetch failed:', e);
    return null;
  }
}
