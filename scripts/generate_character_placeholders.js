const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const charactersDir = path.join(rootDir, 'src', 'characters');

const characters = [
    { id: 'char_001', name: '绯砂', title: '赤焰荷官', accent: 'A', palette: ['#B43F5A', '#F7C873', '#311F33'], aura: '#FF8E72' },
    { id: 'char_002', name: '岚川', title: '冷锋猎手', accent: 'K', palette: ['#3A6EA5', '#9FD8CB', '#152238'], aura: '#7FD1FF' },
    { id: 'char_003', name: '秋璃', title: '琥珀术士', accent: 'Q', palette: ['#7A4E2D', '#E7A95A', '#2E1A12'], aura: '#FFD38A' },
    { id: 'char_004', name: '雾音', title: '夜色潜行者', accent: 'J', palette: ['#574B90', '#B8A1FF', '#1B1633'], aura: '#C7B6FF' },
    { id: 'char_005', name: '青炬', title: '翡翠赌徒', accent: '10', palette: ['#2F7F68', '#BFE3C0', '#16332D'], aura: '#7CF1CA' },
    { id: 'char_006', name: '曜尘', title: '金脉执旗手', accent: '9', palette: ['#9A6B2E', '#FFD68A', '#36230B'], aura: '#FFE8AA' },
    { id: 'char_007', name: '霜雀', title: '银月观测者', accent: '8', palette: ['#7D8EA3', '#E3ECF8', '#243040'], aura: '#D8EDFF' },
    { id: 'char_008', name: '墨岚', title: '暮海策士', accent: '7', palette: ['#345D7E', '#8EB8D8', '#152638'], aura: '#A7D5FF' },
    { id: 'char_009', name: '流火', title: '猩红斗牌手', accent: '6', palette: ['#9D3D3D', '#FFB28B', '#351316'], aura: '#FFA684' },
    { id: 'char_010', name: '铃曜', title: '晨星歌者', accent: '5', palette: ['#6F4DA7', '#F3B8FF', '#241237'], aura: '#F7C8FF' },
    { id: 'char_011', name: '沉舟', title: '深海掌局人', accent: '4', palette: ['#25506B', '#7AC0E5', '#101E2A'], aura: '#90DBFF' },
    { id: 'char_012', name: '焰罗', title: '暮金戏法师', accent: '3', palette: ['#8D5333', '#F6C08A', '#29130D'], aura: '#FFD7A6' }
];

function ensureDir(dirPath) {
    fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(targetPath, contents) {
    ensureDir(path.dirname(targetPath));
    fs.writeFileSync(targetPath, contents, 'utf8');
}

function svgFrame(backgroundA, backgroundB) {
    return `
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${backgroundA}" />
        <stop offset="100%" stop-color="${backgroundB}" />
      </linearGradient>
      <radialGradient id="halo" cx="50%" cy="20%" r="80%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.55)" />
        <stop offset="100%" stop-color="rgba(255,255,255,0)" />
      </radialGradient>
    </defs>
    `;
}

function renderAvatar(character) {
    const [primary, secondary, dark] = character.palette;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  ${svgFrame(primary, dark)}
  <rect width="512" height="512" rx="160" fill="url(#bg)"/>
  <circle cx="256" cy="192" r="118" fill="${secondary}" opacity="0.18"/>
  <circle cx="256" cy="188" r="86" fill="#F7E4D1"/>
  <path d="M172 178c18-62 150-94 174 4c-7 10-20 19-37 24c-44 13-95 12-138-8c0-8 1-14 1-20Z" fill="${dark}"/>
  <path d="M160 418c14-86 64-120 96-120s84 34 96 120" fill="${primary}"/>
  <path d="M138 428c25-42 63-72 118-72s93 30 118 72" fill="${dark}" opacity="0.68"/>
  <circle cx="228" cy="194" r="9" fill="${dark}"/>
  <circle cx="284" cy="194" r="9" fill="${dark}"/>
  <path d="M228 238c12 11 44 11 56 0" stroke="${dark}" stroke-width="8" stroke-linecap="round" fill="none"/>
  <circle cx="372" cy="118" r="44" fill="${character.aura}" opacity="0.92"/>
  <text x="372" y="132" font-size="36" text-anchor="middle" fill="${dark}" font-family="Arial, sans-serif" font-weight="700">${character.accent}</text>
  <text x="256" y="470" font-size="34" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-family="Arial, sans-serif" font-weight="700">${character.name}</text>
</svg>
`;
}

function renderBust(character) {
    const [primary, secondary, dark] = character.palette;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 1024">
  ${svgFrame(dark, primary)}
  <rect width="768" height="1024" rx="72" fill="url(#bg)"/>
  <circle cx="384" cy="240" r="168" fill="${character.aura}" opacity="0.16"/>
  <path d="M208 936c20-222 132-332 176-332s156 110 176 332" fill="${primary}"/>
  <path d="M260 640c30-124 100-194 124-194s94 70 124 194" fill="${dark}" opacity="0.78"/>
  <circle cx="384" cy="344" r="122" fill="#F7E4D1"/>
  <path d="M274 324c26-88 212-114 238 0c-38 34-88 52-140 52c-36 0-72-10-106-30c0-10 2-16 8-22Z" fill="${dark}"/>
  <path d="M296 668c24 36 56 58 88 58s64-22 88-58" fill="${secondary}" opacity="0.3"/>
  <rect x="270" y="710" width="228" height="168" rx="34" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)"/>
  <text x="384" y="784" font-size="44" text-anchor="middle" fill="${secondary}" font-family="Arial, sans-serif" font-weight="700">${character.name}</text>
  <text x="384" y="834" font-size="24" text-anchor="middle" fill="rgba(255,255,255,0.78)" font-family="Arial, sans-serif">${character.title}</text>
  <circle cx="224" cy="214" r="54" fill="${secondary}" opacity="0.12"/>
  <circle cx="544" cy="178" r="42" fill="${secondary}" opacity="0.12"/>
  <text x="618" y="160" font-size="64" text-anchor="middle" fill="${character.aura}" font-family="Arial, sans-serif" font-weight="700">${character.accent}</text>
</svg>
`;
}

function renderFull(character) {
    const [primary, secondary, dark] = character.palette;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1536">
  ${svgFrame(primary, dark)}
  <rect width="1024" height="1536" rx="96" fill="url(#bg)"/>
  <circle cx="512" cy="258" r="196" fill="${character.aura}" opacity="0.16"/>
  <path d="M314 1378c24-316 92-532 198-532s174 216 198 532" fill="${primary}"/>
  <path d="M412 730c-6-114 42-210 100-210s106 96 100 210" fill="${dark}" opacity="0.82"/>
  <circle cx="512" cy="430" r="140" fill="#F7E4D1"/>
  <path d="M380 398c24-110 240-132 264 12c-38 30-92 54-150 54c-48 0-92-12-132-34c2-10 8-20 18-32Z" fill="${dark}"/>
  <path d="M352 948c58 86 108 122 160 122s102-36 160-122" fill="${secondary}" opacity="0.24"/>
  <rect x="128" y="1200" width="768" height="188" rx="48" fill="rgba(7,10,15,0.32)" stroke="rgba(255,255,255,0.18)"/>
  <text x="512" y="1284" font-size="82" text-anchor="middle" fill="${secondary}" font-family="Arial, sans-serif" font-weight="700">${character.name}</text>
  <text x="512" y="1360" font-size="34" text-anchor="middle" fill="rgba(255,255,255,0.78)" font-family="Arial, sans-serif">${character.title}</text>
  <circle cx="170" cy="188" r="72" fill="${secondary}" opacity="0.12"/>
  <circle cx="862" cy="300" r="86" fill="${secondary}" opacity="0.14"/>
  <text x="842" y="330" font-size="104" text-anchor="middle" fill="${character.aura}" font-family="Arial, sans-serif" font-weight="700">${character.accent}</text>
</svg>
`;
}

function main() {
    ensureDir(charactersDir);

    const manifest = {
        version: 1,
        defaultCharacterId: characters[0].id,
        aiCharacterIds: characters.slice(1).map((character) => character.id),
        characters: characters.map((character) => {
            const characterDir = path.join(charactersDir, character.id);
            writeFile(path.join(characterDir, 'avatar', 'thumb.svg'), renderAvatar(character));
            writeFile(path.join(characterDir, 'avatar', 'profile.svg'), renderAvatar(character));
            writeFile(path.join(characterDir, 'table', 'bust.svg'), renderBust(character));
            writeFile(path.join(characterDir, 'full', 'full.svg'), renderFull(character));
            writeFile(
                path.join(characterDir, 'meta.json'),
                JSON.stringify(
                    {
                        id: character.id,
                        name: character.name,
                        title: character.title,
                        accent: character.accent
                    },
                    null,
                    2
                ) + '\n'
            );

            return {
                id: character.id,
                name: character.name,
                title: character.title,
                accent: character.accent,
                tags: ['built-in', 'preset'],
                avatarThumb: `src/characters/${character.id}/avatar/thumb.svg`,
                avatarProfile: `src/characters/${character.id}/avatar/profile.svg`,
                tableBust: `src/characters/${character.id}/table/bust.svg`,
                fullBody: `src/characters/${character.id}/full/full.svg`,
                palette: {
                    primary: character.palette[0],
                    secondary: character.palette[1],
                    dark: character.palette[2],
                    aura: character.aura
                }
            };
        })
    };

    writeFile(path.join(charactersDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Generated ${characters.length} placeholder character packs.`);
}

main();
