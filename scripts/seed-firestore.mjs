/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import admin from 'firebase-admin';
import { DEFAULT_COSTUMES, DEFAULT_ITEMS } from '../firebase/catalog.js';

loadEnv({ path: '.env.local' });

const projectId = process.env.VITE_FIREBASE_PROJECT_ID || 'pixelroyale-2aa32';

function credential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    return admin.credential.cert(JSON.parse(raw));
  }
  return admin.credential.applicationDefault();
}

function init() {
  if (admin.apps.length) return;
  try {
    admin.initializeApp({ projectId, credential: credential() });
  } catch (error) {
    console.error('Firebase Admin 초기화에 실패했습니다.');
    console.error('GOOGLE_APPLICATION_CREDENTIALS 또는 FIREBASE_SERVICE_ACCOUNT_JSON 을 설정하세요.');
    throw error;
  }
}

async function setDocs(collectionName, rows) {
  const db = admin.firestore();
  let batch = db.batch();
  let count = 0;
  for (const row of rows) {
    const { id, ...data } = row;
    batch.set(db.collection(collectionName).doc(id), data, { merge: true });
    count++;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return count;
}

init();
const costumeCount = await setDocs('costumes', DEFAULT_COSTUMES);
const itemCount = await setDocs('items', DEFAULT_ITEMS);
console.log(`Seed complete: costumes=${costumeCount}, items=${itemCount}, project=${projectId}`);
