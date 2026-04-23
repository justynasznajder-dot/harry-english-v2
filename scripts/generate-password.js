const bcrypt = require('bcryptjs');

// INSTRUKCJA:
// 1. Edytuj listę użytkowników poniżej
// 2. Uruchom: node scripts/generate-password.js
// 3. Skopiuj wynik do .env.local

const users = [
  { username: 'jan.kowalski', password: 'TajneHaslo123!' },
  { username: 'anna.nowak', password: 'BezpieczneHaslo456!' },
  { username: 'test', password: 'test123' },
  { username: 'Justyna.Sznajder', password: 'mojehaslo2025' },
];

async function generateHashes() {
  console.log('\n🔐 Zahashowane hasła dla użytkowników:\n');
  console.log('=' .repeat(60));
  
  const hashed = [];
  
  for (const user of users) {
    const hash = await bcrypt.hash(user.password, 10);
    hashed.push(`${user.username}:${hash}`);
    
    console.log(`\n👤 Username: ${user.username}`);
    console.log(`🔑 Password: ${user.password}`);
    console.log(`🔒 Hashed: ${hash}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 SKOPIUJ PONIŻSZĄ LINIĘ DO .env.local:\n');
  console.log(`USERS=${hashed.join(',')}`);
  console.log('\n' + '='.repeat(60) + '\n');
}

generateHashes().catch(console.error);
