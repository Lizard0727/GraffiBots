// 涂鸦机兵 — 手绘涂鸦风图标（粗黑描边 + 撞色填充，线条故意不规整）
(() => {
  'use strict';
  const K = '#141018';
  const st = (w = 3.2) => `stroke="${K}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const I = {
    // 驾驶员：戴护目镜的头
    pilot: (c = '#ff4d3d') => `<path d="M10,30 C9,16 17,8 25,8 C34,8 40,15 39,29 C38,38 32,42 24,42 C16,42 11,38 10,30 Z" fill="#ffd9bf" ${st()}/>
      <path d="M9,24 C10,11 19,5 26,6 C36,7 41,15 40,23 C34,18 27,22 21,17 C17,21 13,20 9,24 Z" fill="${c}" ${st()}/>
      <path d="M11,22 L38,21" ${st(5)}/><circle cx="18" cy="21" r="5" fill="#7af0ff" ${st(2.6)}/><circle cx="31" cy="21" r="5" fill="#7af0ff" ${st(2.6)}/>
      <path d="M19,33 Q25,37 31,32" fill="none" ${st(2.6)}/>`,
    // 机体：机兵的头 + 天线
    mech: (c = '#ffdf2e') => `<path d="M24,4 L25,11" ${st()}/><circle cx="24" cy="4" r="2.6" fill="#ff3ea5" ${st(2)}/>
      <path d="M9,14 C9,11 11,11 14,11 L35,10 C38,10 40,12 40,15 L41,34 C41,38 39,40 35,40 L13,41 C10,41 8,39 8,35 Z" fill="${c}" ${st()}/>
      <path d="M13,18 L36,17 L36,27 L13,28 Z" fill="#1d1b2a" ${st(2.4)}/><path d="M17,22 L21,22 M28,22 L32,22" stroke="#7af0ff" stroke-width="3.4" stroke-linecap="round"/>
      <path d="M17,34 L32,33" ${st(2.6)}/><path d="M5,22 L8,21 M41,21 L44,22" ${st(3.4)}/>`,
    trophy: (c = '#ffc531') => `<path d="M13,7 L36,7 C36,22 31,29 24,29 C17,29 13,22 13,7 Z" fill="${c}" ${st()}/>
      <path d="M13,11 C5,11 6,22 15,21 M36,11 C44,11 43,22 34,21" fill="none" ${st()}/>
      <path d="M21,29 L20,35 L29,35 L28,29" fill="${c}" ${st()}/><path d="M14,41 L35,40 L34,35 L15,36 Z" fill="#7a4a1a" ${st()}/>
      <path d="M19,12 L20,20" stroke="#fff8" stroke-width="3" stroke-linecap="round"/>`,
    book: (c = '#4fb8ff') => `<path d="M6,10 C14,7 20,9 24,13 C28,9 35,7 42,10 L42,39 C35,36 28,37 24,41 C20,37 13,36 6,39 Z" fill="#fff6e0" ${st()}/>
      <path d="M24,13 L24,41" ${st()}/><path d="M6,10 L6,39 C13,36 20,37 24,41" fill="${c}" ${st()}/>
      <path d="M29,17 L37,16 M29,23 L37,22 M29,29 L35,29" ${st(2.4)}/>`,
    gear: (c = '#c9d3dc') => `<path d="M24,5 L28,6 L29,11 L34,13 L38,10 L41,14 L38,18 L40,23 L45,25 L44,29 L39,30 L37,35 L40,39 L36,42 L32,39 L27,41 L25,46 L21,45 L20,40 L15,38 L11,41 L8,37 L11,33 L9,28 L4,26 L5,22 L10,21 L12,16 L9,12 L13,9 L17,12 L21,10 Z" fill="${c}" ${st(2.8)}/>
      <circle cx="24.5" cy="25.5" r="6.5" fill="#1d1b2a" ${st(2.6)}/>`,
    help: (c = '#ff5fc1') => `<path d="M24,4 C36,4 44,12 44,24 C44,36 36,44 24,44 C12,44 4,36 4,24 C4,13 12,4 24,4 Z" fill="${c}" ${st()}/>
      <path d="M17,18 C17,11 31,10 31,18 C31,24 24,23 24,30" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="24" cy="37" r="3" fill="#fff"/>`,
    // 模式
    turf: (c = '#ff3ea5') => `<path d="M14,16 L30,16 L32,42 C32,44 30,45 28,45 L16,45 C14,45 12,44 12,42 Z" fill="${c}" ${st()}/>
      <path d="M17,9 L27,9 L28,16 L16,16 Z" fill="#d8dce4" ${st()}/><path d="M20,5 L24,5 L24,9 L20,9 Z" fill="#141018"/>
      <path d="M15,26 L29,26" stroke="#fff8" stroke-width="4"/><circle cx="37" cy="8" r="2.4" fill="${c}"/><circle cx="42" cy="13" r="1.8" fill="${c}"/><circle cx="36" cy="16" r="1.6" fill="${c}"/>`,
    zone: (c = '#ff8a1f') => `<path d="M24,4 C36,4 44,12 44,24 C44,36 36,44 24,44 C12,44 4,36 4,24 C4,12 12,4 24,4 Z" fill="#fff" ${st()}/>
      <path d="M24,11 C32,11 37,17 37,24 C37,31 31,37 24,37 C17,37 11,31 11,24 C11,17 17,11 24,11 Z" fill="${c}" ${st(2.6)}/>
      <circle cx="24" cy="24" r="5.5" fill="#fff" ${st(2.4)}/><path d="M38,4 L28,20" ${st(3.4)}/><path d="M37,3 L44,4 L40,9 Z" fill="#141018"/>`,
    escort: (c = '#ffc531') => `<path d="M24,5 L40,17 L24,44 L8,17 Z" fill="${c}" ${st()}/><path d="M8,17 L40,17 M24,5 L18,17 L24,44 L30,17 Z" fill="none" ${st(2.4)}/>
      <path d="M15,13 L19,10" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    // 乐园：一串气球
    park: (c = '#ff6ec4') => `<path d="M24,26 L22,44 M30,24 L27,44" fill="none" ${st(2.4)}/><ellipse cx="18" cy="16" rx="9" ry="11" fill="${c}" ${st()}/><ellipse cx="32" cy="14" rx="8" ry="10" fill="#1fd6ee" ${st()}/><ellipse cx="26" cy="22" rx="8" ry="9" fill="#ffd23f" ${st()}/><path d="M15,11 q2,-3 5,-2" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    soccer: (c = '#1fbf6e') => `<path d="M24,4 C36,4 44,13 44,24 C44,36 35,44 24,44 C12,44 4,36 4,24 C4,12 13,4 24,4 Z" fill="#fff" ${st()}/>
      <path d="M24,14 L32,20 L29,30 L19,30 L16,20 Z" fill="#141018"/><path d="M24,14 L24,5 M32,20 L42,17 M29,30 L35,40 M19,30 L13,40 M16,20 L6,17" ${st(2.4)}/>
      <path d="M8,30 C12,36 16,38 20,39" stroke="${c}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
    battery: (c = '#9cff2e') => `<path d="M12,11 L34,10 C36,10 37,11 37,13 L38,40 C38,42 37,43 35,43 L13,44 C11,44 10,43 10,41 L10,13 C10,11 11,11 12,11 Z" fill="#2a2d3a" ${st()}/>
      <path d="M19,5 L28,5 L28,10 L19,10 Z" fill="#c9d3dc" ${st(2.4)}/><path d="M14,30 L33,29 L34,39 L14,40 Z" fill="${c}"/><path d="M14,21 L33,20 L33,27 L14,28 Z" fill="${c}"/>
      <path d="M26,13 L18,26 L24,26 L21,37" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`,
    elim: (c = '#ff3b52') => `<path d="M24,5 C35,5 42,12 42,22 C42,29 38,33 34,35 L34,42 L14,42 L14,35 C10,33 6,29 6,22 C6,12 13,5 24,5 Z" fill="#f4f0ea" ${st()}/>
      <path d="M13,20 L21,24 L14,29 Z M35,20 L27,24 L34,29 Z" fill="${c}" ${st(2.4)}/><path d="M20,35 L20,42 M24,35 L24,42 M28,35 L28,42" ${st(2.2)}/><path d="M4,6 L12,12 M44,6 L36,12" stroke="${c}" stroke-width="4" stroke-linecap="round"/>`,
    escape: (c = '#9aa0a8') => `<path d="M24,3 C36,3 45,12 45,24 C45,36 36,45 24,45 C12,45 3,36 3,24 C3,12 12,3 24,3 Z" fill="${c}" ${st()}/>
      <path d="M24,11 C31,11 37,17 37,24 C37,31 31,37 24,37 C17,37 11,31 11,24 C11,17 17,11 24,11 Z" fill="#9cff2e" ${st(2.6)} stroke-dasharray="5 3"/>
      <path d="M21,16 L28,16 L28,24 L33,24 L24,33 L15,24 L21,24 Z" fill="#ffe600" ${st(2.4)}/>`,
    mail: (c = '#fff6e3') => `<path d="M5,12 L43,12 L43,38 L5,38 Z" fill="${c}" ${st()}/><path d="M5,12 L24,27 L43,12" fill="none" ${st()}/><circle cx="38" cy="12" r="6" fill="#ff3ea5" ${st(2.2)}/>`,
    event: (c = '#ff5a36') => `<path d="M8,16 L40,16 L40,42 L8,42 Z" fill="${c}" ${st()}/><path d="M6,10 L42,10 L42,17 L6,17 Z" fill="#ffe600" ${st()}/><path d="M24,10 L24,42" stroke="#ffe600" stroke-width="5"/><path d="M24,10 C18,2 10,6 16,10 M24,10 C30,2 38,6 32,10" fill="none" ${st(2.6)}/>`,
    news: (c = '#1fd6ee') => `<path d="M8,6 L34,6 L40,12 L40,42 L8,42 Z" fill="#fff6e3" ${st()}/><path d="M14,16 L34,16 M14,23 L34,23 M14,30 L28,30" ${st(2.6)}/><path d="M30,32 L42,20 L46,24 L34,36 L29,37 Z" fill="${c}" ${st(2.2)}/>`,
    // 能力
    super: (c = '#ffdf2e') => `<path d="M24,3 L29,17 L44,14 L33,25 L42,38 L27,33 L22,46 L19,32 L5,36 L14,24 L4,13 L19,16 Z" fill="${c}" ${st()}/><circle cx="24" cy="24" r="5" fill="#ff3ea5" ${st(2.2)}/>`,
    skill: (c = '#7af0ff') => `<path d="M22,4 C24,16 28,20 41,22 C28,25 24,29 22,44 C20,29 16,25 4,23 C16,20 20,16 22,4 Z" fill="${c}" ${st()}/><path d="M39,6 L40,13 M36,10 L43,9" ${st(2.6)}/>`,
    passive: (c = '#9cff2e') => `<path d="M24,4 L41,10 C41,27 35,38 24,44 C13,38 7,27 7,10 Z" fill="${c}" ${st()}/><path d="M16,24 L22,30 L33,17" fill="none" stroke="#141018" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    play: (c = '#141018') => `<path d="M14,8 C14,6 16,5 18,6 L40,21 C42,22 42,25 40,26 L18,41 C16,42 14,41 14,39 Z" fill="${c}"/>`,
    team: (c = '#4fb8ff') => `<circle cx="17" cy="17" r="8" fill="${c}" ${st()}/><circle cx="32" cy="19" r="7" fill="#ff5fc1" ${st()}/>
      <path d="M5,42 C5,31 11,27 17,27 C23,27 28,31 28,42 Z" fill="${c}" ${st()}/><path d="M24,42 C25,33 28,29 32,29 C38,29 43,33 43,42 Z" fill="#ff5fc1" ${st()}/>`,
    back: (c = '#141018') => `<path d="M28,8 L12,24 L28,40" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
    // 货币
    coins: (c = '#ffc531') => `<path d="M24,6 C35,6 42,13 42,23 C42,34 35,42 24,42 C13,42 6,34 6,23 C6,13 13,6 24,6 Z" fill="${c}" ${st()}/>
      <path d="M24,12 C31,12 36,16 36,23 C36,30 31,35 24,35 C17,35 12,30 12,23 C12,16 17,12 24,12 Z" fill="none" stroke="#b9800a" stroke-width="2.6"/>
      <path d="M19,17 L24,23 L29,17 M24,23 L24,31 M19,25 L29,25" fill="none" stroke="${K}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M14,15 Q17,10 22,9" stroke="#fff9" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    // 乐园票
    // 1.8：灵符（夜都决战代币）/ 咒灵讨伐 / 封印争夺
    talismans: (c = '#b48cff') => `<path d="M15,5 L34,6 L33,43 L14,42 Z" fill="#f4e6c8" ${st()}/><path d="M24,9 L24,38" stroke="${c}" stroke-width="5" stroke-linecap="round"/><path d="M18,15 L30,15 M18,24 L30,24 M19,32 L29,32" stroke="#c8102e" stroke-width="2.6" stroke-linecap="round"/><circle cx="24" cy="24" r="4" fill="${c}" ${st(2)}/>`,
    raid: (c = '#ff2d4b') => `<path d="M8,30 C6,14 16,6 25,6 C35,6 43,14 41,30 C40,40 33,44 24,44 C15,44 9,40 8,30 Z" fill="#3a1a5a" ${st()}/><path d="M14,8 L10,1 M35,8 L39,1" ${st(3.4)}/><circle cx="17" cy="22" r="5" fill="#fff6e8" ${st(2)}/><circle cx="31" cy="20" r="6" fill="#fff6e8" ${st(2)}/><circle cx="24" cy="32" r="4" fill="#fff6e8" ${st(2)}/><circle cx="17" cy="22" r="2.2" fill="${c}"/><circle cx="31" cy="20" r="2.6" fill="${c}"/><circle cx="24" cy="32" r="1.8" fill="${c}"/>`,
    seal: (c = '#8a6bff') => `<path d="M24,4 L42,16 L36,40 L12,40 L6,16 Z" fill="${c}" ${st()}/><path d="M24,10 L35,18 L31,35 L17,35 L13,18 Z" fill="#d8b25a" ${st(2.4)}/><path d="M20,16 L28,16 L28,32 L20,32 Z" fill="#f4e6c8" ${st(2)}/><path d="M24,18 L24,30" stroke="#c8102e" stroke-width="2.4"/>`,
    tickets: (c = '#ff6ec4') => `<path d="M6,14 L42,14 L42,20 C38,20 38,28 42,28 L42,34 L6,34 L6,28 C10,28 10,20 6,20 Z" fill="${c}" ${st()}/><path d="M30,14 L30,34" stroke="#141018" stroke-width="2" stroke-dasharray="3 3"/><path d="M16,20 l2,4 l4,0 l-3,3 l1,4 l-4,-2 l-4,2 l1,-4 l-3,-3 l4,0 Z" fill="#ffe600"/>`,
    gems: (c = '#ff3ea5') => `<path d="M12,8 L36,8 L44,19 L24,43 L4,19 Z" fill="${c}" ${st()}/><path d="M4,19 L44,19 M12,8 L18,19 L24,43 L30,19 L36,8 M18,19 L24,8 L30,19" fill="none" ${st(2.2)}/>
      <path d="M14,12 L17,16" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    parts: (c = '#7af0ff') => `<path d="M30,6 C36,6 41,10 42,16 L36,16 L33,20 L36,24 L42,24 C40,30 34,33 28,31 L14,44 C11,47 5,42 8,39 L21,25 C19,18 23,6 30,6 Z" fill="${c}" ${st()}/><circle cx="11.5" cy="40.5" r="2" fill="${K}"/>`,
    crystals: (c = '#b78cff') => `<path d="M24,3 L33,15 L29,41 L19,41 L15,15 Z" fill="${c}" ${st()}/><path d="M15,15 L33,15 M24,3 L24,41" ${st(2.2)}/>
      <path d="M8,22 L14,18 L16,38 L11,39 Z M40,22 L34,18 L32,38 L37,39 Z" fill="${c}" ${st(2.4)}/><path d="M20,9 L19,14" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    chest: (c = '#ff8a1f') => `<path d="M6,20 L42,20 L41,41 L7,41 Z" fill="${c}" ${st()}/><path d="M6,20 C6,10 12,7 24,7 C36,7 42,10 42,20 Z" fill="${c}" ${st()}/>
      <path d="M6,20 L42,20" ${st()}/><path d="M20,17 L28,17 L28,27 L20,27 Z" fill="#ffe600" ${st(2.6)}/><path d="M24,21 L24,24" ${st(2.4)}/><path d="M12,26 L12,37 M36,26 L36,37" stroke="#0005" stroke-width="3" stroke-linecap="round"/>`,
    lock: (c = '#c9d3dc') => `<path d="M15,22 L15,15 C15,9 19,6 24,6 C29,6 33,9 33,15 L33,22" fill="none" ${st(4)}/><path d="M10,21 L38,21 L37,42 L11,42 Z" fill="${c}" ${st()}/><circle cx="24" cy="30" r="3" fill="${K}"/><path d="M24,31 L24,36" ${st(3)}/>`,
    up: (c = '#9cff2e') => `<path d="M24,4 L42,24 L31,24 L31,43 L17,43 L17,24 L6,24 Z" fill="${c}" ${st()}/>`,
    star: (c = '#ffdf2e') => `<path d="M24,4 L30,17 L44,18 L33,28 L37,43 L24,35 L11,43 L15,28 L4,18 L18,17 Z" fill="${c}" ${st()}/>`,
  };
  // 各档宝箱的大图（开箱动画用）：tier 决定配色和装饰
  const CHEST_LOOK = {
    starter: { body: '#ff5fc1', lid: '#ff8fd6', band: '#ffe600', deco: 'bow' },
    supply: { body: '#9a8a6a', lid: '#b8a882', band: '#5b5246', deco: 'stencil' },
    military: { body: '#4f6b3a', lid: '#63854a', band: '#ffe600', deco: 'stripes' },
    airdrop: { body: '#ffb42e', lid: '#ffd35e', band: '#141018', deco: 'chute' },
    hero: { body: '#7a4dff', lid: '#9a76ff', band: '#ffe600', deco: 'star' },
    strike: { body: '#2a1f3a', lid: '#4a3a66', band: '#ff3b52', deco: 'skull' },
  };
  function chestArt(id, open) {
    const L = CHEST_LOOK[id] || CHEST_LOOK.supply;
    let deco = '';
    if (L.deco === 'bow') deco = `<path d="M60,58 C46,40 34,50 44,60 C34,70 46,78 60,62 C74,78 86,70 76,60 C86,50 74,40 60,58 Z" fill="${L.band}" ${st(3)}/>`;
    if (L.deco === 'stencil') deco = `<text x="60" y="104" text-anchor="middle" font-family="Impact, sans-serif" font-size="17" fill="#2a241c" opacity=".75" letter-spacing="2">SUPPLY</text>`;
    if (L.deco === 'skull') deco = `<path d="M60,70 C48,70 42,78 42,88 C42,96 48,100 52,100 L52,108 L68,108 L68,100 C72,100 78,96 78,88 C78,78 72,70 60,70 Z" fill="#fff6e3" ${st(2.6)}/><circle cx="53" cy="88" r="5" fill="#ff3b52"/><circle cx="67" cy="88" r="5" fill="#ff3b52"/><path d="M30,64 L90,112 M90,64 L30,112" stroke="#ff3b52" stroke-width="5" opacity=".6"/>`;
    if (L.deco === 'stripes') deco = `<path d="M22,112 L34,90 M40,112 L52,90 M68,112 L80,90 M86,112 L98,90" stroke="#141018" stroke-width="6" opacity=".55"/>`;
    if (L.deco === 'chute') deco = `<path d="M18,30 C24,0 96,0 102,30 Z" fill="#fff6e3" ${st(3)}/><path d="M18,30 L34,62 M102,30 L86,62 M48,24 L52,62 M72,24 L68,62" stroke="#141018" stroke-width="2.4"/><path d="M38,30 C42,6 58,4 60,30 M60,30 C62,4 78,6 82,30" fill="#ff3ea5" ${st(2.4)}/>`;
    if (L.deco === 'star') deco = `<path d="M60,84 L65,95 L77,96 L68,104 L71,116 L60,110 L49,116 L52,104 L43,96 L55,95 Z" fill="${L.band}" ${st(2.6)}/>`;
    const lid = open
      ? `<g transform="translate(60 66) rotate(-28) translate(-60 -66)"><path d="M16,66 C16,38 32,30 60,30 C88,30 104,38 104,66 Z" fill="${L.lid}" ${st(4)}/><path d="M52,52 L68,52 L68,68 L52,68 Z" fill="${L.band}" ${st(3)}/></g>`
      : `<path d="M16,70 C16,42 32,34 60,34 C88,34 104,42 104,70 Z" fill="${L.lid}" ${st(4)}/><path d="M52,60 L68,60 L68,80 L52,80 Z" fill="${L.band}" ${st(3)}/><circle cx="60" cy="72" r="3" fill="${K}"/>`;
    return `<svg class="chest-art" viewBox="0 0 120 130" aria-hidden="true">
      <ellipse cx="60" cy="122" rx="48" ry="7" fill="#0006"/>
      <path d="M14,70 L106,70 L103,120 L17,120 Z" fill="${L.body}" ${st(4)}/>
      <path d="M14,84 L106,84" stroke="${L.band}" stroke-width="7"/><path d="M14,84 L106,84" ${st(2)} fill="none"/>
      <path d="M24,74 L24,116 M96,74 L96,116" stroke="#0004" stroke-width="4" stroke-linecap="round"/>
      ${open ? '<path d="M18,72 L102,72 L98,80 L22,80 Z" fill="#1d1b2a"/><g class="chest-glow"><path d="M30,72 L10,10 M60,70 L60,0 M90,72 L110,10" stroke="#fff8" stroke-width="8" stroke-linecap="round"/></g>' : ''}
      ${lid}${deco}
    </svg>`;
  }
  const svg = (name, color, size) => `<svg class="gi gi-${name}" viewBox="0 0 48 48" width="${size || 48}" height="${size || 48}" aria-hidden="true">${(I[name] || I.star)(color)}</svg>`;
  // 把页面上 data-icon 的元素填成图标
  function fill(root) {
    for (const el of (root || document).querySelectorAll('[data-icon]')) {
      if (el.dataset.iconDone) continue;
      el.innerHTML = svg(el.dataset.icon, el.dataset.iconColor) + el.innerHTML;
      el.dataset.iconDone = '1';
    }
  }
  window.GI = { svg, fill, chestArt, names: Object.keys(I) };
})();
