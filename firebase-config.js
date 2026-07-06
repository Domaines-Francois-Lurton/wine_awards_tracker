import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDUfjB1EU92cIpASKyvNYaWFgCft4-EVhU",
  authDomain: "wine-awards-lurton.firebaseapp.com",
  projectId: "wine-awards-lurton",
  storageBucket: "wine-awards-lurton.firebasestorage.app",
  messagingSenderId: "1053905058426",
  appId: "1:1053905058426:web:bd8b048445062f4f9159c3",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
