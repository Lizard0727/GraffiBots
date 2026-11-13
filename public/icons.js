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
    soccer: (c = '#1fbf6e') => `<path d="M24,4 C36,4 44,13 44,24 C44,36 35,44 24,44 C12,44 4,36 4,24 C4,12 13,4 24,4 Z" fill="#fff" ${st()}/>
      <path d="M24,14 L32,20 L29,30 L19,30 L16,20 Z" fill="#141018"/><path d="M24,14 L24,5 M32,20 L42,17 M29,30 L35,40 M19,30 L13,40 M16,20 L6,17" ${st(2.4)}/>
      <path d="M8,30 C12,36 16,38 20,39" stroke="${c}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`,
    battery: (c = '#9cff2e') => `<path d="M12,11 L34,10 C36,10 37,11 37,13 L38,40 C38,42 37,43 35,43 L13,44 C11,44 10,43 10,41 L10,13 C10,11 11,11 12,11 Z" fill="#2a2d3a" ${st()}/>
      <path d="M19,5 L28,5 L28,10 L19,10 Z" fill="#c9d3dc" ${st(2.4)}/><path d="M14,30 L33,29 L34,39 L14,40 Z" fill="${c}"/><path d="M14,21 L33,20 L33,27 L14,28 Z" fill="${c}"/>
      <path d="M26,13 L18,26 L24,26 L21,37" fill="none" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>`,
    // 能力
    super: (c = '#ffdf2e') => `<path d="M24,3 L29,17 L44,14 L33,25 L42,38 L27,33 L22,46 L19,32 L5,36 L14,24 L4,13 L19,16 Z" fill="${c}" ${st()}/><circle cx="24" cy="24" r="5" fill="#ff3ea5" ${st(2.2)}/>`,
    skill: (c = '#7af0ff') => `<path d="M22,4 C24,16 28,20 41,22 C28,25 24,29 22,44 C20,29 16,25 4,23 C16,20 20,16 22,4 Z" fill="${c}" ${st()}/><path d="M39,6 L40,13 M36,10 L43,9" ${st(2.6)}/>`,
    passive: (c = '#9cff2e') => `<path d="M24,4 L41,10 C41,27 35,38 24,44 C13,38 7,27 7,10 Z" fill="${c}" ${st()}/><path d="M16,24 L22,30 L33,17" fill="none" stroke="#141018" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
    play: (c = '#141018') => `<path d="M14,8 C14,6 16,5 18,6 L40,21 C42,22 42,25 40,26 L18,41 C16,42 14,41 14,39 Z" fill="${c}"/>`,
    team: (c = '#4fb8ff') => `<circle cx="17" cy="17" r="8" fill="${c}" ${st()}/><circle cx="32" cy="19" r="7" fill="#ff5fc1" ${st()}/>
      <path d="M5,42 C5,31 11,27 17,27 C23,27 28,31 28,42 Z" fill="${c}" ${st()}/><path d="M24,42 C25,33 28,29 32,29 C38,29 43,33 43,42 Z" fill="#ff5fc1" ${st()}/>`,
    back: (c = '#141018') => `<path d="M28,8 L12,24 L28,40" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
    star: (c = '#ffdf2e') => `<path d="M24,4 L30,17 L44,18 L33,28 L37,43 L24,35 L11,43 L15,28 L4,18 L18,17 Z" fill="${c}" ${st()}/>`,
  };
  const svg = (name, color, size) => `<svg class="gi gi-${name}" viewBox="0 0 48 48" width="${size || 48}" height="${size || 48}" aria-hidden="true">${(I[name] || I.star)(color)}</svg>`;
  // 把页面上 data-icon 的元素填成图标
  function fill(root) {
    for (const el of (root || document).querySelectorAll('[data-icon]')) {
      if (el.dataset.iconDone) continue;
      el.innerHTML = svg(el.dataset.icon, el.dataset.iconColor) + el.innerHTML;
      el.dataset.iconDone = '1';
    }
  }
  window.GI = { svg, fill, names: Object.keys(I) };
})();
