// Firebase Realtime Database adapter for playing together (loaded only when needed).
import { connecting } from "./net.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getDatabase, ref, onValue, runTransaction, update, set, remove, onDisconnect, goOffline, goOnline }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-database.js";
import { getAuth, initializeAuth, signInAnonymously, onAuthStateChanged, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence }
  from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";

// Same Firebase project as CroatiaQuiz ("croatiabio"). Web config is public by design;
// access is governed by the database rules (see README).
const CONFIG = {
  apiKey: "AIzaSyCfl6mWI_7cf2VYnpxXB9WwTU_weoH8vA0",
  authDomain: "croatiabio.firebaseapp.com",
  projectId: "croatiabio",
  storageBucket: "croatiabio.firebasestorage.app",
  messagingSenderId: "113693793639",
  appId: "1:113693793639:web:b24cbab9ade143042523c2",
};
const DB_URLS = [
  "https://croatiabio-default-rtdb.europe-west1.firebasedatabase.app",
  "https://croatiabio-default-rtdb.firebaseio.com",
];

// where the database was found, so later connections skip asking (a whole request each time, slow from far away);
// kept on this device only (suite: keys don't sync)
const FOUND = "suite:db";
async function resolveDbUrl() {
  try { const known = localStorage.getItem(FOUND); if (DB_URLS.includes(known)) return known; } catch { /* private mode */ }
  for (const url of DB_URLS) {
    try {
      const res = await fetch(url + "/.json?shallow=true");
      if (res.status !== 404) {                // 200/401/403 all mean the instance exists
        try { localStorage.setItem(FOUND, url); } catch { /* private mode */ }
        return url;
      }
    } catch { /* try the next one */ }
  }
  return DB_URLS[0];
}

// Firebase marks every socket it opens as failed until it has proven itself (two answers from the server), and a
// connection that starts while the mark is there begins on its slow fallback, polling over plain requests, and only
// moves to a socket once it's up. A page left while its socket was still proving itself (moving on to a game, a
// quick switch to the camera to scan a code, the phone locked) leaves the mark behind for the next page; from Asia,
// polling the database in Belgium is seconds. A fresh page tries the socket first again; a network where sockets
// really fail costs one try before Firebase falls back by itself.
const FAILED = "firebase:previous_websocket_failure";
// how long a page can be away (in another app, the phone locked) and keep its connection when it comes back
const AWAY_MS = 20000;
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => { if (document.hidden) hiddenAt = Date.now(); });
addEventListener("pagehide", () => { hiddenAt = Date.now(); });

export async function connect() {
  try { localStorage.removeItem(FAILED); } catch { /* private mode */ }
  // Firebase's code has loaded by now (this module's imports): the stages from here, for the mark's bar (net.js)
  connecting("Finding the game server", 0.25);
  const app = initializeApp(CONFIG, "crates");
  const db = getDatabase(app, await resolveDbUrl());
  connecting("Signing in", 0.33);
  // the connection opened now, while the sign-in is read back (it waits only for the sign-in's token), not once the
  // first read or write asks for it
  let live = false;
  onValue(ref(db, ".info/connected"), snap => { live = snap.val() === true; });
  // Not getAuth(): that also sets up Firebase's pop-up sign-in, which on a phone (iOS, Safari, Android) it does at once,
  // before it will say who is signed in: a hidden frame from the project's firebaseapp.com and Google's apis.google.com
  // script, both awaited. Sign-in here is anonymous and has no pop-up, so none of that is wanted, and from Asia those
  // two hosts are slow or not there at all, which held every phone's connection (and a watcher's, and a join's) for as
  // long as they took to fail. The same storage, in the same order, so a device keeps the user it has.
  let auth;
  try { auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] }); }
  catch { auth = getAuth(app); }                                    // already initialized (a second connect on this page)
  const user = await new Promise((resolve, reject) => {
    const off = onAuthStateChanged(auth, u => { if (u) { off(); resolve(u); } });
    signInAnonymously(auth).catch(reject);
  });
  connecting("Connected", 0.45);

  return {
    uid: user.uid,
    watch(path, cb, onError) {
      return onValue(ref(db, path), snap => cb(snap.val()), err => onError?.(err));
    },
    async tx(path, fn) {
      const r = await runTransaction(ref(db, path), fn, { applyLocally: false });
      return { committed: r.committed, value: r.snapshot.val() };
    },
    update(path, obj) {
      return update(ref(db, path), obj);
    },
    /**
     * Calls cb(ms) with how far this device's clock is from the database's (add it to Date.now() for the shared
     * time), and again whenever that estimate improves; returns a stop function. Real-time games agree on "now" by it.
     */
    serverOffset(cb) {
      return onValue(ref(db, ".info/serverTimeOffset"), snap => cb(snap.val() || 0));
    },
    /** Calls cb(true/false) whenever this device's connection to the database comes or goes; returns a stop function. */
    connection(cb) {
      return onValue(ref(db, ".info/connected"), snap => cb(snap.val() === true));
    },
    /**
     * Drops and reopens the connection when the page comes back from a while away, or finds itself offline: Safari can
     * resume a page whose socket died while it slept, and Firebase's own retries are by then far apart. After a moment
     * away (another app, the camera) a connection that's still up is kept: a new one costs several round trips to the
     * database, and marks this device away to the others meanwhile.
     */
    reconnect() {
      if (live && hiddenAt && Date.now() - hiddenAt < AWAY_MS) return;
      goOffline(db);
      goOnline(db);
    },
    /** Holds path at true while this page is connected (removed when it disconnects); returns a stop function. */
    session(path) {
      const off = onValue(ref(db, ".info/connected"), snap => {
        if (snap.val() !== true) return;
        onDisconnect(ref(db, path)).remove();
        set(ref(db, path), true);
      });
      return () => { off(); onDisconnect(ref(db, path)).cancel(); remove(ref(db, path)); };
    },
    /** Marks path online while connected and offline on disconnect; returns a function that stops it. */
    presence(path) {
      const off = onValue(ref(db, ".info/connected"), snap => {
        if (snap.val() !== true) return;
        onDisconnect(ref(db, path)).update({ online: false });
        update(ref(db, path), { online: true });
      });
      return () => { off(); onDisconnect(ref(db, path)).cancel(); };
    },
  };
}
