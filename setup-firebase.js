#!/usr/bin/env node

/**
 * Script helper para configurar Firebase en desarrollo local
 * 
 * Uso:
 *   node setup-firebase.js
 * 
 * Este script te guiará para obtener tus credenciales de Firebase
 * y crear el archivo .env.local automáticamente.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n🔥 Firebase Setup Helper\n');
console.log('Este asistente te ayudará a configurar Firebase localmente.\n');
console.log('Necesitarás tus credenciales de Firebase Console:');
console.log('👉 https://console.firebase.google.com\n');

const questions = [
  { key: 'NEXT_PUBLIC_FIREBASE_API_KEY', prompt: 'API Key (ej: AIzaSy...): ' },
  { key: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', prompt: 'Auth Domain (ej: moneytrack-889fe.firebaseapp.com): ' },
  { key: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID', prompt: 'Project ID (ej: moneytrack-889fe): ' },
  { key: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', prompt: 'Storage Bucket (ej: moneytrack-889fe.appspot.com): ' },
  { key: 'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', prompt: 'Messaging Sender ID (número): ' },
  { key: 'NEXT_PUBLIC_FIREBASE_APP_ID', prompt: 'App ID (ej: 1:123456789012:web...): ' },
  { key: 'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID', prompt: 'Measurement ID (ej: G-XXXXXXXXXX): ' }
];

const answers = {};
let currentQuestion = 0;

function askQuestion() {
  if (currentQuestion >= questions.length) {
    createEnvFile();
    return;
  }

  const q = questions[currentQuestion];
  rl.question(q.prompt, (answer) => {
    answers[q.key] = answer.trim();
    currentQuestion++;
    askQuestion();
  });
}

function createEnvFile() {
  rl.close();

  const envContent = `# ============================================================
# Firebase Configuration - Auto-generated
# Created: ${new Date().toLocaleString()}
# ============================================================

${Object.entries(answers).map(([key, value]) => `${key}=${value}`).join('\n')}

# ============================================================
# Este archivo NO se sube a Git (.gitignore)
# Es seguro tener estas credenciales localmente
# ============================================================
`;

  const envPath = path.join(process.cwd(), '.env.local');

  fs.writeFileSync(envPath, envContent, 'utf8');

  console.log('\n✅ Archivo .env.local creado exitosamente!\n');
  console.log('Ahora puedes ejecutar:');
  console.log('  npm run dev    (desarrollo)');
  console.log('  npm run build  (producción)\n');
}

console.log('Comencemos...\n');
askQuestion();
