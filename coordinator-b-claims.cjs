#!/usr/bin/env node

const { execSync } = require('child_process');

const REDIS_PASSWORD = "Hbzbkuv1VdlWq4KTbzDZ2wL+o1xWVGvjDgzWKMkVtcyfoXmzpW9P43UZ6CgGlxjb";

// Programming languages pool
const progLangs = [
  'Python', 'JavaScript', 'TypeScript', 'Ruby', 'Go', 'Rust', 'Java',
  'C++', 'C#', 'PHP', 'Swift', 'Kotlin', 'Scala', 'Haskell', 'Elixir',
  'Clojure', 'Dart', 'Lua', 'Perl', 'R', 'Julia', 'MATLAB', 'Fortran',
  'COBOL', 'Assembly', 'Shell', 'PowerShell', 'VB.NET', 'F#', 'OCaml',
  'Erlang', 'Zig', 'Nim', 'Crystal', 'V', 'D', 'Groovy', 'Ada', 'Pascal',
  'Scheme', 'Racket', 'Common-Lisp', 'Prolog', 'Smalltalk', 'Objective-C'
];

// Written languages pool (more variety)
const writtenLangs = [
  'Chinese', 'Arabic', 'Hindi', 'Portuguese', 'Italian', 'Russian',
  'Japanese', 'Korean', 'German', 'Turkish', 'Vietnamese', 'Polish',
  'Ukrainian', 'Romanian', 'Dutch', 'Greek', 'Czech', 'Swedish',
  'Hungarian', 'Serbian', 'Finnish', 'Danish', 'Bulgarian', 'Norwegian',
  'Slovak', 'Croatian', 'Hebrew', 'Thai', 'Malay', 'Indonesian',
  'Tagalog', 'Bengali', 'Tamil', 'Telugu', 'Urdu', 'Persian'
];

// Translation map
const translations = {
  'Chinese': '你好世界',
  'Arabic': 'مرحبا بالعالم',
  'Hindi': 'नमस्ते दुनिया',
  'Portuguese': 'Olá Mundo',
  'Italian': 'Ciao Mondo',
  'Russian': 'Привет мир',
  'Japanese': 'こんにちは世界',
  'Korean': '안녕하세요 세계',
  'German': 'Hallo Welt',
  'Turkish': 'Merhaba Dünya',
  'Vietnamese': 'Xin chào thế giới',
  'Polish': 'Witaj świecie',
  'Ukrainian': 'Привіт світ',
  'Romanian': 'Salut lume',
  'Dutch': 'Hallo wereld',
  'Greek': 'Γεια σου κόσμε',
  'Czech': 'Ahoj světe',
  'Swedish': 'Hej världen',
  'Hungarian': 'Helló világ',
  'Serbian': 'Здраво свете',
  'Finnish': 'Hei maailma',
  'Danish': 'Hej verden',
  'Bulgarian': 'Здравей свят',
  'Norwegian': 'Hei verden',
  'Slovak': 'Ahoj svet',
  'Croatian': 'Zdravo svijete',
  'Hebrew': 'שלום עולם',
  'Thai': 'สวัสดีชาวโลก',
  'Malay': 'Hai dunia',
  'Indonesian': 'Halo dunia',
  'Tagalog': 'Kamusta mundo',
  'Bengali': 'হ্যালো বিশ্ব',
  'Tamil': 'வணக்கம் உலகம்',
  'Telugu': 'హలో ప్రపంచం',
  'Urdu': 'ہیلو دنیا',
  'Persian': 'سلام دنیا'
};

function redisCmd(cmd) {
  try {
    return execSync(`redis-cli --pass "${REDIS_PASSWORD}" --no-auth-warning ${cmd}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch (error) {
    return '';
  }
}

// Check existing claims
const existingClaims = redisCmd('SMEMBERS coordination:claims:all').split('\n').filter(Boolean);
console.log(`Existing claims from Coordinator-A: ${existingClaims.length}`);

// Generate 35 unique claims for Coordinator-B
const myClaims = [];
const attempts = [];

// Generate diverse combinations
for (let i = 0; i < progLangs.length && myClaims.length < 35; i++) {
  for (let j = 0; j < writtenLangs.length && myClaims.length < 35; j++) {
    const claim = `${progLangs[i]}:${writtenLangs[j]}`;
    if (!existingClaims.includes(claim) && !attempts.includes(claim)) {
      attempts.push(claim);
      myClaims.push(claim);
    }
  }
}

console.log(`Generated ${myClaims.length} unique claims for Coordinator-B`);

// Claim all combinations atomically
for (const claim of myClaims) {
  redisCmd(`SADD coordination:claims:all "${claim}"`);
  redisCmd(`SADD coordination:claims:coordinator-b "${claim}"`);
}

// Publish coordination message
const coordMsg = JSON.stringify({
  coordinator: 'Coordinator-B',
  action: 'claimed',
  count: myClaims.length,
  timestamp: Date.now()
});
redisCmd(`PUBLISH coordination:claims:channel '${coordMsg}'`);

// Store claims details with translations
const claimsWithTranslations = myClaims.map(claim => {
  const [prog, written] = claim.split(':');
  return {
    claim,
    prog,
    written,
    translation: translations[written] || 'Hello World',
    agentId: `coder-b-${myClaims.indexOf(claim) + 1}`
  };
});

// Store as JSON for spawning
const fs = require('fs');
fs.writeFileSync(
  '/mnt/c/Users/masha/Documents/claude-flow-novice/coordinator-b-claims.json',
  JSON.stringify(claimsWithTranslations, null, 2)
);

console.log('Coordinator-B claims completed and stored');
console.log(`Claims file: /mnt/c/Users/masha/Documents/claude-flow-novice/coordinator-b-claims.json`);
