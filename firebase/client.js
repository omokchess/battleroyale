/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: String(import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: String(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: String(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: String(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: String(import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
  measurementId: String(import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '').trim(),
};

let app = null;
let auth = null;
let db = null;
let configured = false;

if (firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    configured = true;
  } catch (e) {
    console.error('[firebase] 클라이언트 생성 실패 - 게스트 모드로 진행합니다:', e);
  }
} else {
  console.warn(
    '[firebase] VITE_FIREBASE_* 환경변수 미설정 - ' +
    '로그인·랭킹·코인 기능이 비활성화(게스트 모드)됩니다. FIREBASE_SETUP.md 참고.'
  );
}

export const isFirebaseConfigured = configured;
export const firebaseApp = app;
export const firebaseAuth = auth;
export const firestore = db;
