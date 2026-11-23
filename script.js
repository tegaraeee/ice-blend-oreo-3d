(() => {
  const $ = id => document.getElementById(id);
  const sceneHost = $('scene');

  let scene, camera, renderer, clock;
  let chef, prepCupGroup, prepToppingGroup, prepLidGroup, shopDoorPivot, frontWallGroup, ceilingGroup;
  let customers = [], ingredients3D = [], floatingPopups = [], coinParticles = [], swirlParticles = [];
  let decorGroups = {};
  let decorState = JSON.parse(localStorage.getItem('icc_decor') || '{"lanterns":true,"cozyTable":false,"flowerPlanter":false,"neonSign":false,"plushRug":false,"extraSeating":false,"displayCase":false,"wallClockArt":false}');
  let running = false, paused = false, soundOn = true;

  let coins = +(localStorage.getItem('icc_coins') || 0);
  let xp = +(localStorage.getItem('icc_xp') || 0);
  let streak = 0;
  let gameMode = localStorage.getItem('icc_mode') || 'rush';
  function getOrderDuration() {
    return gameMode === 'relaxed' ? 90 : 42;
  }
  let served = 0;
  let orderTime = getOrderDuration();
  let elapsed = 0;
  let currentOrder = null;
  let recipe = [];
  let customerIndex = 0;
  let spawnClock = 0;
  let toastClock;

  // Web Audio API synthesizer for realistic tactile sound effects (no external audio files needed)
  let audioCtx = null;
  function getAudioCtx() {
    if (!soundOn) return null;
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playTone(type) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'add') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420 + recipe.length * 45, now);
      osc.frequency.exponentialRampToValueAtTime(620 + recipe.length * 50, now + 0.09);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'serve') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.07);
        gain.gain.setValueAtTime(0.09, now + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.07);
        osc.stop(now + idx * 0.07 + 0.19);
      });
    } else if (type === 'error') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(195, now);
      osc.frequency.linearRampToValueAtTime(145, now + 0.16);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    }
  }

  const ingredientNames = [
    'milk',
    'cookies',
    'chocolate',
    'oreo_crumbs',
    'vanilla',
    'oreo_and_crumbs',
    'flavor_matcha',
    'flavor_strawberry',
    'flavor_avocado',
    'flavor_bubblegum',
    'flavor_grape',
    'sugar',
    'whipped_cream'
  ];

  const labels = {
    milk: 'Susu',
    cookies: 'Oreo',
    chocolate: 'Cokelat',
    oreo_crumbs: 'Rempahan Oreo',
    vanilla: 'Vanila',
    oreo_and_crumbs: 'Oreo',
    flavor_matcha: 'Matcha',
    flavor_strawberry: 'Strawberry',
    flavor_avocado: 'Alpukat',
    flavor_bubblegum: 'Permen karet',
    flavor_grape: 'Grape',
    sugar: 'Gula',
    whipped_cream: 'Whipped Cream'
  };

  const emoji = {
    milk: '🥛',
    cookies: '🍪',
    chocolate: '🍫',
    oreo_crumbs: '🥠',
    vanilla: '🍦',
    oreo_and_crumbs: '🍪',
    flavor_matcha: '🍵',
    flavor_strawberry: '🍓',
    flavor_avocado: '🥑',
    flavor_bubblegum: '🫧',
    flavor_grape: '🍇',
    sugar: '🧂',
    whipped_cream: '🍨'
  };

  const specialFlavors = [
    { key: 'flavor_matcha', label: 'Matcha', emoji: '🍵', color: 0x7da863 },
    { key: 'flavor_strawberry', label: 'Strawberry', emoji: '🍓', color: 0xe87b90 },
    { key: 'flavor_avocado', label: 'Alpukat', emoji: '🥑', color: 0x8fb359 },
    { key: 'flavor_bubblegum', label: 'Permen karet', emoji: '🫧', color: 0x79b8d8 },
    { key: 'flavor_grape', label: 'Grape', emoji: '🍇', color: 0x8e6ab5 }
  ];

  const orders = [
    {
      name: 'Ice Blend Oreo Biasa',
      items: ['milk', 'cookies', 'chocolate', 'oreo_crumbs', 'vanilla', 'sugar'],
      emoji: '🥤'
    },
    ...specialFlavors.map(f => ({
      name: 'Ice Blend Special (' + f.label + ')',
      items: ['milk', 'oreo_and_crumbs', f.key, 'sugar', 'whipped_cream'],
      emoji: f.emoji
    }))
  ];
  const customerFaces = ['🙂', '😎', '😊', '😋', '🤗', '🧑🏻', '👩🏽', '🧑🏾'];
  const customerNames = ['Alya', 'Bima', 'Citra', 'Doni', 'Nadia', 'Raka', 'Salsa', 'Fajar'];

  function mat(color, rough = 0.78, metalness = 0.0, opacity = 1.0) {
    const params = { color, roughness: rough, metalness };
    if (opacity < 1.0) {
      params.transparent = true;
      params.opacity = opacity;
    }
    return new THREE.MeshStandardMaterial(params);
  }

  function box(w, h, d, color, x, y, z, parent = scene, rough = 0.78) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, mat(color, rough));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function sphere(r, color, x, y, z, parent = scene, sx = 1, sy = 1, sz = 1, rough = 0.72) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), mat(color, rough));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  function cylinder(rt, rb, h, color, x, y, z, parent = scene, rough = 0.72, opacity = 1.0) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 24), mat(color, rough, 0.0, opacity));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function textSprite(text, bg = '#fff4e5', fg = '#654638') {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(4, 4, 504, 120, 28);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 65);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    s.scale.set(2.2, 0.55, 1);
    return s;
  }

  function spawnPopup(text, worldPos, bg = '#fff7e6', fg = '#4d7c5d') {
    const sp = textSprite(text, bg, fg);
    sp.position.copy(worldPos);
    sp.scale.set(1.65, 0.42, 1);
    scene.add(sp);
    floatingPopups.push({ sprite: sp, age: 0, duration: 1.35, startY: worldPos.y });
  }

  function spawnCoinBurst(worldPos) {
    for (let i = 0; i < 6; i++) {
      const coin = cylinder(0.09, 0.09, 0.025, 0xf2c04b, worldPos.x, worldPos.y + 0.2, worldPos.z, scene, 0.35, 1.0);
      coin.rotation.x = Math.PI / 2;
      const angle = (i / 6) * Math.PI * 2;
      coinParticles.push({
        mesh: coin,
        vx: Math.cos(angle) * 1.1,
        vy: 2.2 + Math.random() * 0.8,
        vz: Math.sin(angle) * 1.1,
        age: 0,
        duration: 0.85
      });
    }
  }

  function spawnIngredientSwirl(key) {
    if (!prepCupGroup) return;
    const flavorColorMap = {
      milk: 0xfaf7f0,
      cookies: 0x5d3d31,
      chocolate: 0x6e3f2f,
      oreo_crumbs: 0x3f2720,
      vanilla: 0xfff0c2,
      oreo_and_crumbs: 0x4b3128,
      flavor_matcha: 0x7da863,
      flavor_strawberry: 0xe87b90,
      flavor_avocado: 0x8fb359,
      flavor_bubblegum: 0x79b8d8,
      flavor_grape: 0x8e6ab5,
      sugar: 0xffffff,
      whipped_cream: 0xfffaf2
    };
    const col = flavorColorMap[key] || 0xf5d6a8;
    const center = prepCupGroup.position.clone().add(new THREE.Vector3(0, 0.36, 0));
    for (let i = 0; i < 7; i++) {
      const drop = sphere(0.036, col, center.x, center.y, center.z, scene, 1, 1, 1, 0.4);
      const ang = (i / 7) * Math.PI * 2;
      swirlParticles.push({
        mesh: drop,
        angle: ang,
        radius: 0.14 + (i % 3) * 0.04,
        vy: 1.35 + Math.random() * 0.55,
        age: 0,
        duration: 0.55
      });
    }
    prepCupGroup.userData.spinBoost = 6.5;
  }

  let cafeSeats = [];

  function initCafeSeats() {
    cafeSeats = [];
    const baseTables = [
      { x: -5.15, z: 0.45 },
      { x: -5.15, z: 3.25 },
      { x: 3.95, z: -2.35 }
    ];
    baseTables.forEach((tbl, tIdx) => {
      [-1, 1].forEach(side => {
        const cx = tbl.x + side * 0.98;
        const cz = tbl.z;
        // Approach point slightly to the front/side of the chair so customer walks cleanly without clipping table
        const approachZ = cz + (tIdx === 2 ? 0.68 : 0.65);
        cafeSeats.push({
          id: `base-${tIdx}-${side}`,
          x: cx,
          z: cz,
          approachX: cx,
          approachZ: approachZ,
          facing: side === -1 ? Math.PI / 2 : -Math.PI / 2,
          tableX: tbl.x + side * 0.36,
          tableY: 0.88,
          tableZ: tbl.z + (side === -1 ? -0.18 : 0.18),
          occupiedBy: null,
          requiresDecor: null
        });
      });
    });

    // Extra seating chairs (unlocked via Set Meja & Kursi Kafe Pastel)
    const exX = 4.45, exZ = -0.55;
    [-1, 1].forEach(side => {
      const cx = exX + side * 0.72;
      cafeSeats.push({
        id: `extra-${side}`,
        x: cx,
        z: exZ,
        approachX: cx,
        approachZ: exZ + 0.65,
        facing: side === -1 ? Math.PI / 2 : -Math.PI / 2,
        tableX: exX + side * 0.30,
        tableY: 0.87,
        tableZ: exZ + (side === -1 ? -0.16 : 0.16),
        occupiedBy: null,
        requiresDecor: 'extraSeating'
      });
    });
  }

  function claimAvailableSeat(customer) {
    const freeSeats = cafeSeats.filter(s => {
      if (s.occupiedBy && s.occupiedBy.parent && !s.occupiedBy.userData.done) return false;
      if (s.requiresDecor && !decorState[s.requiresDecor]) return false;
      return true;
    });
    if (freeSeats.length === 0) return null;
    const chosen = freeSeats[Math.floor(Math.random() * freeSeats.length)];
    chosen.occupiedBy = customer;
    return chosen;
  }

  function releaseSeat(customer) {
    cafeSeats.forEach(s => {
      if (s.occupiedBy === customer) s.occupiedBy = null;
    });
  }

  function buildDecorItems() {
    // 1. Lampu gantung hangat tambahan di area tengah-kanan toko
    const lanternsGroup = new THREE.Group();
    for (const lx of [-1.5, 1.5, 4.2]) {
      cylinder(0.02, 0.02, 0.65, 0x7c5844, lx, 4.35, 1.4, lanternsGroup);
      cylinder(0.18, 0.26, 0.16, 0xe89b72, lx, 3.98, 1.4, lanternsGroup, 0.5);
      sphere(0.16, 0xffe49e, lx, 3.88, 1.4, lanternsGroup, 1, 0.9, 1, 0.2);
    }
    scene.add(lanternsGroup);
    decorGroups.lanterns = lanternsGroup;

    // 2. Meja pojok estetik rapat ke dinding kanan (tidak menghalangi jalur jalan & antrean)
    const cozyTableGroup = new THREE.Group();
    const ctx = 6.32, ctz = 1.65;
    box(0.76, 0.1, 1.05, 0x8a5842, ctx, 0.82, ctz, cozyTableGroup);
    cylinder(0.09, 0.12, 0.72, 0x674232, ctx, 0.42, ctz, cozyTableGroup);
    cylinder(0.16, 0.19, 0.05, 0xfffaf2, ctx, 0.89, ctz, cozyTableGroup, 0.3);
    sphere(0.13, 0xf2a7b3, ctx, 0.96, ctz, cozyTableGroup, 1.1, 0.65, 1.1, 0.6);
    sphere(0.035, 0xe63946, ctx, 1.05, ctz, cozyTableGroup);
    scene.add(cozyTableGroup);
    decorGroups.cozyTable = cozyTableGroup;

    // 3. Rak tanaman hias & pot bunga warna-warni di dekat dinding
    const planterGroup = new THREE.Group();
    const spots = [
      [-6.35, -4.3, 0xd88c7a, 0xf7b2bd],
      [-6.35, 4.3, 0x8bb19b, 0xffd166],
      [6.35, -3.9, 0xc997b8, 0xa8dadc]
    ];
    spots.forEach(([px, pz, potCol, flowerCol]) => {
      cylinder(0.22, 0.17, 0.36, potCol, px, 0.18, pz, planterGroup);
      sphere(0.19, 0x6b9e73, px, 0.44, pz, planterGroup, 1.05, 0.85, 1.05);
      sphere(0.075, flowerCol, px + 0.08, 0.56, pz + 0.06, planterGroup);
      sphere(0.065, 0xfff8e7, px - 0.08, 0.54, pz - 0.05, planterGroup);
    });
    scene.add(planterGroup);
    decorGroups.flowerPlanter = planterGroup;

    // 4. Karpet Pastel & Jalur Antrean Hangat di lantai toko
    const rugGroup = new THREE.Group();
    // Karpet bundar besar di tengah area pelanggan
    cylinder(1.65, 1.65, 0.025, 0xf3d4c3, 1.75, 0.015, 1.85, rugGroup, 0.92);
    cylinder(1.42, 1.42, 0.028, 0xfff6ea, 1.75, 0.016, 1.85, rugGroup, 0.92);
    cylinder(1.12, 1.12, 0.030, 0xd8e8dc, 1.75, 0.017, 1.85, rugGroup, 0.92);
    // Karpet runner di depan meja koki
    box(2.6, 0.024, 0.65, 0xe8c7b0, -1.15, 0.014, 0.25, rugGroup, 0.9);
    box(2.4, 0.027, 0.48, 0xfaeee0, -1.15, 0.016, 0.25, rugGroup, 0.9);
    scene.add(rugGroup);
    decorGroups.plushRug = rugGroup;

    // 5. Neon Sign Estetik di Dinding Kanan & Dinding Belakang
    const neonGroup = new THREE.Group();
    // Bingkai papan neon di dinding kanan
    box(0.09, 1.15, 2.35, 0x3b2a28, 6.84, 2.55, 2.35, neonGroup, 0.35);
    // Tabung neon pink & mint bercahaya
    const neonPinkMat = new THREE.MeshStandardMaterial({
      color: 0xff8fab,
      emissive: 0xff5c8a,
      emissiveIntensity: 0.85,
      roughness: 0.25
    });
    const neonMintMat = new THREE.MeshStandardMaterial({
      color: 0x9ef0d1,
      emissive: 0x4cd4a9,
      emissiveIntensity: 0.75,
      roughness: 0.25
    });
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 2.15), neonPinkMat);
    topBar.position.set(6.78, 3.04, 2.35);
    neonGroup.add(topBar);
    const botBar = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 2.15), neonMintMat);
    botBar.position.set(6.78, 2.06, 2.35);
    neonGroup.add(botBar);
    // Ikon es krim neon sederhana
    const coneMesh = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 16), neonMintMat);
    coneMesh.rotation.x = Math.PI;
    coneMesh.position.set(6.77, 2.38, 1.65);
    neonGroup.add(coneMesh);
    const scoopNeon = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 14), neonPinkMat);
    scoopNeon.position.set(6.77, 2.63, 1.65);
    neonGroup.add(scoopNeon);

    const neonBanner = textSprite('SWEET & CHILL', '#3a2328', '#ff9ebb');
    neonBanner.position.set(6.72, 2.55, 2.58);
    neonBanner.rotation.y = -Math.PI / 2;
    neonBanner.scale.set(1.55, 0.42, 1);
    neonGroup.add(neonBanner);
    scene.add(neonGroup);
    decorGroups.neonSign = neonGroup;

    // 6. Set Kursi & Meja Santai Tambahan di Sisi Kanan
    const extraSeatingGroup = new THREE.Group();
    const tx = 4.45, tz = -0.55;
    cylinder(0.62, 0.62, 0.09, 0x9e684c, tx, 0.82, tz, extraSeatingGroup);
    cylinder(0.09, 0.12, 0.74, 0x724b38, tx, 0.42, tz, extraSeatingGroup);
    cylinder(0.32, 0.35, 0.05, 0x724b38, tx, 0.03, tz, extraSeatingGroup);
    // 2 kursi kafe pastel
    [
      [tx - 0.72, tz, 0xf2b5a7, 1],
      [tx + 0.72, tz, 0xa8cbb7, -1]
    ].forEach(([cx, cz, cushionCol, dir]) => {
      cylinder(0.28, 0.28, 0.08, cushionCol, cx, 0.48, cz, extraSeatingGroup);
      box(0.50, 0.52, 0.09, 0x7c523e, cx - dir * 0.22, 0.76, cz, extraSeatingGroup);
      for (const lx of [-0.16, 0.16]) {
        for (const lz of [-0.16, 0.16]) {
          cylinder(0.03, 0.035, 0.46, 0x6c4635, cx + lx, 0.23, cz + lz, extraSeatingGroup);
        }
      }
    });
    // Gelas dessert di atas meja
    cylinder(0.11, 0.08, 0.20, 0xfffaf2, tx, 0.96, tz, extraSeatingGroup, 0.25, 0.9);
    sphere(0.10, 0xf497b0, tx, 1.07, tz, extraSeatingGroup);
    scene.add(extraSeatingGroup);
    decorGroups.extraSeating = extraSeatingGroup;

    // 7. Etalase Kue & Gelato Mini (Kaca Transparan & Posisi Bersih di Area Kanan Belakang)
    const displayCaseGroup = new THREE.Group();
    const dx = 2.55, dz = -4.35;
    // Badan meja etalase kayu hangat
    box(1.24, 0.88, 0.86, 0x8f5d47, dx, 0.44, dz, displayCaseGroup);
    box(1.28, 0.08, 0.90, 0xf6e3cc, dx, 0.92, dz, displayCaseGroup);
    // 3 loyang gelato & topping warna-warni di atas rak dasar kaca (y = 0.96)
    const tubColors = [0xf7a8b8, 0x98c9a3, 0xf5d487];
    tubColors.forEach((col, idx) => {
      const bx = dx - 0.36 + idx * 0.36;
      box(0.28, 0.10, 0.52, 0xffffff, bx, 1.01, dz, displayCaseGroup);
      box(0.25, 0.14, 0.48, col, bx, 1.11, dz, displayCaseGroup, 0.55);
      // Scoop / topping kecil di atas loyang gelato
      sphere(0.065, 0xfffaf2, bx, 1.20, dz, displayCaseGroup, 1.0, 0.75, 1.0);
    });
    // Rak tengah kaca transparan
    const midShelfMat = new THREE.MeshStandardMaterial({
      color: 0xdff5f1,
      roughness: 0.15,
      transparent: true,
      opacity: 0.34,
      depthWrite: false
    });
    const midShelf = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.025, 0.74), midShelfMat);
    midShelf.position.set(dx, 1.26, dz);
    displayCaseGroup.add(midShelf);

    // Tiang rangka sudut tipis agar etalase terlihat jelas & rapi
    for (const sx of [-0.57, 0.57]) {
      for (const sz of [-0.37, 0.37]) {
        box(0.035, 0.56, 0.035, 0x7c523e, dx + sx, 1.24, dz + sz, displayCaseGroup);
      }
    }
    // Tutup atas & dinding kaca bening (transparan sehingga isi gelato terlihat jelas)
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xdff5f1,
      roughness: 0.12,
      transparent: true,
      opacity: 0.24,
      depthWrite: false
    });
    const topGlass = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.03, 0.76), glassMat);
    topGlass.position.set(dx, 1.52, dz);
    displayCaseGroup.add(topGlass);

    const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.52, 0.02), glassMat);
    frontGlass.position.set(dx, 1.24, dz + 0.37);
    displayCaseGroup.add(frontGlass);

    const backGlass = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.52, 0.02), glassMat);
    backGlass.position.set(dx, 1.24, dz - 0.37);
    displayCaseGroup.add(backGlass);

    scene.add(displayCaseGroup);
    decorGroups.displayCase = displayCaseGroup;

    // 8. Galeri Poster & Rak Pajangan Dinding Belakang
    const wallArtGroup = new THREE.Group();
    // Rak kayu gantung di sisi kanan dinding belakang
    box(2.1, 0.09, 0.32, 0x8d5b44, 3.55, 2.25, -5.24, wallArtGroup);
    // Toples cookies & boneka maskot mini di atas rak
    cylinder(0.13, 0.13, 0.26, 0xfff8ed, 2.95, 2.42, -5.22, wallArtGroup, 0.25, 0.88);
    sphere(0.10, 0x5c3a2e, 2.95, 2.38, -5.22, wallArtGroup);
    cylinder(0.13, 0.13, 0.26, 0xf7d6dc, 3.55, 2.42, -5.22, wallArtGroup, 0.35);
    sphere(0.14, 0xf5c396, 4.15, 2.43, -5.22, wallArtGroup);
    sphere(0.08, 0xffffff, 4.15, 2.57, -5.22, wallArtGroup);
    scene.add(wallArtGroup);
    decorGroups.wallClockArt = wallArtGroup;

    applyDecorVisibility();
  }

  function applyDecorVisibility() {
    Object.keys(decorGroups).forEach(k => {
      if (decorGroups[k]) decorGroups[k].visible = Boolean(decorState[k]);
    });
    localStorage.setItem('icc_decor', JSON.stringify(decorState));
  }

  const decorCatalog = [
    {
      key: 'lanterns',
      name: 'Lampu Gantung Hangat',
      desc: 'Menambah pencahayaan hangat di area tengah toko',
      price: 60,
      icon: '🏮'
    },
    {
      key: 'plushRug',
      name: 'Karpet Pastel & Runner Koki',
      desc: 'Karpet bundar lembut di area antrean dan alas meja racik',
      price: 85,
      icon: '🧶'
    },
    {
      key: 'cozyTable',
      name: 'Meja Pojok Kue Manis',
      desc: 'Menambah meja pajangan manis di sudut depan ruang',
      price: 110,
      icon: '🧁'
    },
    {
      key: 'wallClockArt',
      name: 'Rak Pajangan & Toples Cookies',
      desc: 'Rak kayu dinding lengkap dengan toples kukis dan pajangan lucu',
      price: 135,
      icon: '🍪'
    },
    {
      key: 'flowerPlanter',
      name: 'Pot Bunga & Tanaman Toko',
      desc: 'Menghadirkan nuansa segar dan penuh warna di sudut ruangan',
      price: 150,
      icon: '🌸'
    },
    {
      key: 'extraSeating',
      name: 'Set Meja & Kursi Kafe Pastel',
      desc: 'Menambah meja bundar dengan dua kursi empuk untuk pelanggan',
      price: 190,
      icon: '🪑'
    },
    {
      key: 'neonSign',
      name: 'Neon Sign Sweet & Chill',
      desc: 'Lampu neon es krim estetik menyala di dinding kanan toko',
      price: 230,
      icon: '✨'
    },
    {
      key: 'displayCase',
      name: 'Etalase Kaca Gelato & Topping',
      desc: 'Lemari pajangan gelato warna-warni di samping meja kasir',
      price: 280,
      icon: '🍨'
    }
  ];

  function renderDecorList() {
    const list = $('decor-list');
    if (!list) return;
    const ownedCount = decorCatalog.filter(it => Boolean(decorState[it.key])).length;
    const summaryEl = $('decor-summary');
    if (summaryEl) {
      summaryEl.textContent = `Terpasang: ${ownedCount}/${decorCatalog.length} item • Koinmu: 🪙 ${coins}`;
    }
    list.innerHTML = '';
    decorCatalog.forEach(item => {
      const owned = Boolean(decorState[item.key]);
      const row = document.createElement('div');
      row.className = 'decor-item';
      row.innerHTML = `
        <div class="decor-info">
          <div class="decor-icon">${item.icon}</div>
          <div>
            <b>${item.name}</b>
            <small>${item.desc} • ${owned ? 'Terpasang' : '🪙 ' + item.price + ' koin'}</small>
          </div>
        </div>
        <button class="decor-btn ${owned ? 'active' : (coins < item.price ? 'locked' : '')}" data-decor="${item.key}">
          ${owned ? '✓ Aktif' : 'Beli (' + item.price + ')'}
        </button>
      `;
      const btn = row.querySelector('[data-decor]');
      btn.addEventListener('click', () => {
        if (decorState[item.key]) {
          toast(item.name + ' sudah aktif di toko!');
          return;
        }
        if (coins < item.price) {
          playTone('error');
          toast('Koin belum cukup untuk membeli ' + item.name);
          return;
        }
        coins -= item.price;
        localStorage.setItem('icc_coins', coins);
        $('coins').textContent = coins;
        decorState[item.key] = true;
        applyDecorVisibility();
        playTone('serve');
        toast(item.name + ' dipasang ke toko 3D!');
        renderDecorList();
      });
      list.appendChild(row);
    });
  }

  // Compute exact world-space palm position so the cup base rests directly on the customer's palm(s)
  function getChefRightPalmWorld() {
    chef.updateMatrixWorld(true);
    const palmLocal = new THREE.Vector3(0, -0.02, 0.06);
    return chef.userData.armR.hand.localToWorld(palmLocal);
  }

  function getCustomerReceivePalmWorld(c) {
    c.updateMatrixWorld(true);
    // Midpoint between left and right inner palms when customer cups both hands to receive the drink
    const leftPalm = c.userData.armL.hand.localToWorld(new THREE.Vector3(0.04, 0.01, 0.04));
    const rightPalm = c.userData.armR.hand.localToWorld(new THREE.Vector3(-0.04, 0.01, 0.04));
    return leftPalm.add(rightPalm).multiplyScalar(0.5);
  }

  function getCustomerCarryPalmWorld(c) {
    c.updateMatrixWorld(true);
    // Right palm center when walking out with the cup held in hand
    return c.userData.armR.hand.localToWorld(new THREE.Vector3(-0.02, 0.02, 0.05));
  }

  // Build a detailed drink cup with dome lid & cookie bits that can be used both at prep station and handed over
  function createDrinkCup(includeDome = true) {
    const cup = new THREE.Group();
    // Translucent plastic cup body
    const cupBody = cylinder(0.145, 0.11, 0.34, 0xf8f3eb, 0, 0.17, 0, cup, 0.22, 0.86);
    // Ice cream / blend fill inside cup
    const blendFill = cylinder(0.138, 0.105, 0.24, 0xf6eedf, 0, 0.14, 0, cup, 0.65, 1.0);
    blendFill.name = 'blendFill';

    // Swirl / whipped topping mound on top
    const whipGroup = new THREE.Group();
    whipGroup.name = 'whipGroup';
    whipGroup.visible = false;
    sphere(0.125, 0xfffaf2, 0, 0.35, 0, whipGroup, 1.05, 0.58, 1.05, 0.5);
    sphere(0.085, 0xfffdf8, 0, 0.42, 0, whipGroup, 0.95, 0.55, 0.95, 0.5);
    cup.add(whipGroup);

    // Chocolate drizzle & cookie crumbs
    const toppingGroup = new THREE.Group();
    toppingGroup.name = 'toppingGroup';
    toppingGroup.visible = false;
    const cookiePositions = [
      [-0.06, 0.39, 0.05],
      [0.06, 0.40, 0.04],
      [0.0, 0.44, 0.02],
      [-0.04, 0.37, -0.06],
      [0.05, 0.38, -0.05]
    ];
    cookiePositions.forEach(([px, py, pz]) => {
      sphere(0.032, 0x3f2720, px, py, pz, toppingGroup, 1.1, 0.55, 1.1, 0.85);
    });
    cup.add(toppingGroup);

    // Clear dome lid with sipping hole ring
    const lidGroup = new THREE.Group();
    lidGroup.name = 'lidGroup';
    lidGroup.visible = includeDome;
    if (includeDome) {
      cylinder(0.155, 0.155, 0.03, 0xffffff, 0, 0.34, 0, lidGroup, 0.2, 0.65);
      sphere(0.142, 0xeaf4f8, 0, 0.38, 0, lidGroup, 1.0, 0.65, 1.0, 0.15);
      // Straw / sip hole rim
      cylinder(0.028, 0.028, 0.02, 0x8db5a2, 0.03, 0.465, 0.02, lidGroup, 0.35, 0.95);
    }
    cup.add(lidGroup);

    return cup;
  }

  function updatePrepCupVisual() {
    if (!prepCupGroup) return;
    const blend = prepCupGroup.getObjectByName('blendFill');
    const whip = prepCupGroup.getObjectByName('whipGroup');
    const topping = prepCupGroup.getObjectByName('toppingGroup');
    const lid = prepCupGroup.getObjectByName('lidGroup');

    const hasMilk = recipe.includes('milk');
    const hasVanilla = recipe.includes('vanilla');
    const hasCookies = recipe.includes('cookies');
    const hasChoco = recipe.includes('chocolate');
    const hasOreoCrumbs = recipe.includes('oreo_crumbs');
    const hasOreoCombo = recipe.includes('oreo_and_crumbs');
    const hasWhipCream = recipe.includes('whipped_cream');

    if (blend) {
      let fillColor = 0xf5efe4;
      if (recipe.includes('flavor_matcha')) fillColor = 0x7da863;
      else if (recipe.includes('flavor_strawberry')) fillColor = 0xe87b90;
      else if (recipe.includes('flavor_avocado')) fillColor = 0x8fb359;
      else if (recipe.includes('flavor_bubblegum')) fillColor = 0x79b8d8;
      else if (recipe.includes('flavor_grape')) fillColor = 0x8e6ab5;
      else if (hasChoco) fillColor = 0x7a4938;
      else if (hasCookies || hasOreoCombo) fillColor = 0xcab8a5;
      else if (hasVanilla) fillColor = 0xfff0c2;
      else if (hasMilk) fillColor = 0xfaf7f0;
      blend.material.color.setHex(fillColor);
      const totalNeeded = currentOrder ? currentOrder.userData.order.items.length : 6;
      blend.scale.y = Math.max(0.15, Math.min(1.0, recipe.length / totalNeeded));
    }
    if (whip) whip.visible = hasWhipCream;
    if (topping) topping.visible = hasOreoCrumbs || hasOreoCombo || hasCookies;
    if (lid) {
      const totalNeeded = currentOrder ? currentOrder.userData.order.items.length : 6;
      lid.visible = recipe.length > 0 && recipe.length >= totalNeeded;
    }
  }

  function makePerson(x, z, shirt, hat = false, isChef = false) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    scene.add(g);

    const skin = isChef ? 0xf0c39b : [0xe7b58c, 0xf1c7a2, 0x9a674d, 0xd89b72][Math.floor(Math.random() * 4)];
    const body = sphere(0.34, shirt, 0, 1.05, 0, g, 0.8, 1.25, 0.55);
    const head = sphere(0.25, skin, 0, 1.68, 0, g, 1, 1.08, 0.9);
    sphere(0.035, 0x382a27, -0.09, 1.72, 0.22, g);
    sphere(0.035, 0x382a27, 0.09, 1.72, 0.22, g);
    sphere(0.045, 0xd98279, 0, 1.59, 0.22, g, 0.9, 0.55, 0.5);

    if (hat) {
      cylinder(0.25, 0.25, 0.12, 0xffffff, 0, 1.99, 0, g);
      sphere(0.19, 0xffffff, 0, 2.12, 0, g, 1, 0.75, 1);
    }
    if (isChef) {
      box(0.25, 0.28, 0.06, 0x9b6854, 0, 1.15, 0.29, g);
      for (let i = 0; i < 2; i++) sphere(0.025, 0xffffff, -0.07 + i * 0.14, 1.27, 0.34, g);
    }

    function makeArm(side) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.29, 1.43, 0);
      g.add(pivot);
      cylinder(0.085, 0.105, 0.39, shirt, 0, -0.20, 0, pivot);
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.39, 0);
      pivot.add(elbow);
      cylinder(0.067, 0.078, 0.34, skin, 0, -0.17, 0, elbow);
      const hand = sphere(0.085, skin, 0, -0.37, 0.025, elbow, 0.9, 0.85, 0.9);
      return { pivot, elbow, hand };
    }

    const armL = makeArm(-1);
    const armR = makeArm(1);

    function makeLeg(side) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.13, 0.62, 0);
      g.add(pivot);
      cylinder(0.095, 0.11, 0.48, 0x6a5145, 0, -0.24, 0, pivot);
      box(0.17, 0.12, 0.28, 0x49372f, 0, -0.52, 0.075, pivot);
      return pivot;
    }

    const legL = makeLeg(-1);
    const legR = makeLeg(1);

    g.userData = {
      armL,
      armR,
      legL,
      legR,
      head,
      body,
      walk: Math.random() * 5,
      kind: isChef ? 'chef' : 'customer',
      action: 0,
      serving: 0,
      heldCup: null
    };
    return g;
  }

  function buildShop() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe8d7c2);
    scene.fog = new THREE.Fog(0xe8d7c2, 13, 27);

    camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 100);
    // Position camera inside the room so the enclosing walls, ceiling beams, and front entrance door are clearly visible
    camera.position.set(-1.6, 3.35, 4.85);
    camera.lookAt(1.35, 1.35, 0.35);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    sceneHost.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    scene.add(new THREE.HemisphereLight(0xfff3df, 0x987b65, 2.1));
    const sun = new THREE.DirectionalLight(0xffe6c7, 2.5);
    sun.position.set(-5, 10, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    // Room floor, baseboards, 4 enclosing walls & indoor ceiling beams
    box(14, 0.25, 11, 0xd9b99a, 0, -0.14, 0);
    // Subtle wooden floor planks for indoor depth
    for (let pz = -4.8; pz <= 4.8; pz += 1.2) {
      box(13.8, 0.015, 0.04, 0xc7a382, 0, 0.005, pz);
    }

    // Back wall (z = -5.45)
    box(14.2, 5, 0.22, 0xf4e6d4, 0, 2.35, -5.45);
    box(14.0, 0.18, 0.08, 0x9b6653, 0, 0.09, -5.32); // baseboard

    // Left wall (x = -7) with side window frame
    box(0.22, 5, 11.1, 0xf0ddc8, -7, 2.35, 0);
    box(0.08, 0.18, 10.9, 0x9b6653, -6.87, 0.09, 0);
    // Cozy side window on left wall
    box(0.10, 1.55, 2.2, 0xb8dfd8, -6.88, 2.45, -1.6, scene, 0.25);
    box(0.14, 0.10, 2.35, 0xffffff, -6.86, 3.25, -1.6);
    box(0.14, 0.10, 2.35, 0xffffff, -6.86, 1.65, -1.6);
    box(0.14, 1.65, 0.10, 0xffffff, -6.86, 2.45, -1.6);

    // Right wall (x = +7) with decorative menu boards & wall wainscoting
    box(0.22, 5, 11.1, 0xf0ddc8, 7, 2.35, 0);
    box(0.08, 0.18, 10.9, 0x9b6653, 6.87, 0.09, 0);
    box(0.08, 1.15, 10.8, 0xe3cbb2, 6.88, 0.65, 0);
    // Decorative menu frames on right wall
    box(0.08, 1.35, 1.05, 0x7c523e, 6.86, 2.65, -1.5);
    box(0.09, 1.15, 0.85, 0xfff8ec, 6.84, 2.65, -1.5);
    box(0.08, 1.35, 1.05, 0x7c523e, 6.86, 2.65, 0.4);
    box(0.09, 1.15, 0.85, 0xf5e5d3, 6.84, 2.65, 0.4);

    // Front wall (z = +5.45) enclosing the indoor room, leaving doorway opening at x = [4.45 .. 6.15]
    frontWallGroup = new THREE.Group();
    // Main left-to-center front wall segment (x from -7.1 to +4.45 -> width 11.55, center x = -1.325)
    box(11.55, 5, 0.22, 0xf2e1cd, -1.325, 2.35, 5.45, frontWallGroup);
    box(11.45, 0.18, 0.08, 0x9b6653, -1.325, 0.09, 5.32, frontWallGroup);
    // Front storefront glass window embedded in front wall
    box(3.4, 1.75, 0.12, 0xbfe2dc, -1.2, 2.35, 5.45, frontWallGroup, 0.2);
    box(3.55, 0.12, 0.26, 0xffffff, -1.2, 3.25, 5.45, frontWallGroup);
    box(3.55, 0.12, 0.26, 0xffffff, -1.2, 1.45, 5.45, frontWallGroup);
    box(0.12, 1.85, 0.26, 0xffffff, -1.2, 2.35, 5.45, frontWallGroup);
    // Header wall above the entrance door (x from 4.45 to 6.15 -> width 1.70, center x = 5.30, y from 2.75 to 4.85)
    box(1.70, 2.10, 0.22, 0xf2e1cd, 5.30, 3.80, 5.45, frontWallGroup);
    // Right pillar beside the entrance door (x from 6.15 to 7.10 -> width 0.95, center x = 6.625)
    box(0.95, 5, 0.22, 0xf2e1cd, 6.625, 2.35, 5.45, frontWallGroup);
    box(0.85, 0.18, 0.08, 0x9b6653, 6.625, 0.09, 5.32, frontWallGroup);
    scene.add(frontWallGroup);

    // Indoor ceiling & wooden rafters so it feels truly inside a cozy shop room
    ceilingGroup = new THREE.Group();
    box(14.3, 0.18, 11.2, 0xf9efe2, 0, 4.92, 0, ceilingGroup);
    for (let bz = -4.2; bz <= 4.2; bz += 2.1) {
      box(14.0, 0.18, 0.20, 0xb68466, 0, 4.76, bz, ceilingGroup);
    }
    scene.add(ceilingGroup);

    for (let i = -5; i <= 5; i += 2.5) {
      box(2, 0.12, 0.08, 0xd7b99b, i, 3.65, -5.31);
    }

    // Back sign & cafe banners
    box(4, 0.85, 0.12, 0x9b6653, 0, 3.35, -5.22);
    const signText = textSprite('COOKIE CREAM');
    signText.position.set(0, 3.36, -5.1);
    scene.add(signText);

    box(2.7, 0.62, 0.10, 0x315b8b, -3.55, 3.55, -5.22);
    const oreoText = textSprite('ICE BLEND OREO', '#eaf3ff');
    oreoText.position.set(-3.55, 3.56, -5.12);
    oreoText.scale.set(2.45, 0.48, 1);
    scene.add(oreoText);

    box(2.9, 0.62, 0.10, 0x24744e, 3.55, 3.55, -5.22);
    const schoolText = textSprite('SMKN 10 SEMARANG', '#e9fff1');
    schoolText.position.set(3.55, 3.56, -5.12);
    schoolText.scale.set(2.65, 0.48, 1);
    scene.add(schoolText);

    // Analog wall clock
    const clockFace = cylinder(0.43, 0.43, 0.10, 0xf8f0df, -2.0, 2.55, -5.20);
    clockFace.rotation.x = Math.PI / 2;
    const clockRim = cylinder(0.49, 0.49, 0.08, 0x80563f, -2.0, 2.55, -5.27);
    clockRim.rotation.x = Math.PI / 2;
    sphere(0.045, 0x5c4437, -2.0, 2.55, -5.12);
    const hourHand = box(0.045, 0.24, 0.025, 0x5c4437, -2.0, 2.64, -5.105);
    hourHand.rotation.z = -0.45;
    const minuteHand = box(0.035, 0.32, 0.025, 0x5c4437, -1.91, 2.58, -5.10);
    minuteHand.rotation.z = 0.18;

    // Cafe tables & chairs
    function cafeTable(x, z) {
      box(1.35, 0.12, 1.05, 0x9a674d, x, 0.82, z);
      cylinder(0.10, 0.13, 0.72, 0x76503d, x, 0.42, z);
      for (const dx of [-0.48, 0.48]) {
        for (const dz of [-0.34, 0.34]) {
          cylinder(0.045, 0.055, 0.78, 0x76503d, x + dx, 0.39, z + dz);
        }
      }
      for (const side of [-1, 1]) {
        const cx = x + side * 0.98;
        box(0.68, 0.12, 0.68, 0xb77e5b, cx, 0.48, z);
        box(0.68, 0.68, 0.12, 0x7b5140, cx, 0.83, z - side * 0.25);
        for (const dx of [-0.24, 0.24]) {
          for (const dz of [-0.22, 0.22]) {
            cylinder(0.035, 0.04, 0.48, 0x76503d, cx + dx, 0.23, z + dz);
          }
        }
      }
      cylinder(0.10, 0.13, 0.16, 0xd9b18a, x, 0.96, z);
      sphere(0.12, 0x75a879, x, 1.09, z, scene, 0.8, 0.8, 0.8);
    }

    cafeTable(-5.15, 0.45);
    cafeTable(-5.15, 3.25);
    cafeTable(3.95, -2.35);

    // Window, counter & prep station
    box(2.1, 1.8, 0.08, 0x9ec8c5, -5, 2.3, -5.28);
    box(2.2, 0.1, 0.12, 0xffffff, -5, 3.25, -5.2);
    box(0.1, 1.8, 0.12, 0xffffff, -5, 2.3, -5.2);

    box(5, 0.95, 1.15, 0x9a6650, 0, 0.48, -0.6);
    box(5.05, 0.12, 1.2, 0xf4dfc5, 0, 1.02, -0.6);
    box(3.5, 0.9, 1.15, 0xc18b69, -1.3, 0.48, 1.6);
    box(3.6, 0.12, 1.2, 0xffead4, -1.3, 0.98, 1.6);

    // Cash register
    box(0.55, 0.35, 0.45, 0x5b6c62, 2, 1.25, -0.55);
    box(0.38, 0.08, 0.08, 0x9dd1bd, 2, 1.46, -0.55);

    // Freezer & blender machine
    box(1.05, 1.65, 0.9, 0xb8d6d0, -5.5, 0.83, -2.7);
    box(0.9, 0.08, 0.75, 0xf7f1e7, -5.5, 1.69, -2.7);
    box(0.9, 1.05, 0.85, 0xe7e0d5, -3.7, 0.55, -2.7);
    cylinder(0.23, 0.23, 0.22, 0x8c6b58, -3.7, 1.18, -2.7);

    // Gelas saji & scoop es krim di meja depan agar scoop berada di dalam gelas (tidak melayang)
    const scoopColors = [0x4a3028, 0xf4e5ce, 0x8d553d];
    const cupAccentColors = [0xf0c5a8, 0xb6d2bd, 0xd8b5a4];
    for (let i = 0; i < 3; i++) {
      const gx = -2.4 + i * 0.9;
      const gz = 1.58;
      // Alas & badan gelas bening/pastel di atas meja (permukaan meja y = 1.04)
      cylinder(0.17, 0.13, 0.26, 0xf8f3eb, gx, 1.17, gz, scene, 0.2, 0.85);
      // Isi es krim di dalam gelas
      cylinder(0.155, 0.125, 0.16, cupAccentColors[i], gx, 1.13, gz, scene, 0.55, 0.95);
      // Scoop es krim duduk pas di atas/dalam gelas
      sphere(0.135, scoopColors[i], gx, 1.29, gz, scene, 1.0, 0.92, 1.0);
    }
    cylinder(0.3, 0.3, 0.5, 0xb4c99e, 5, 0.25, -3.8);
    for (let i = 0; i < 5; i++) {
      sphere(0.17, 0x709b75, 5 + Math.sin(i * 1.2) * 0.22, 0.65 + Math.cos(i) * 0.1, -3.8 + Math.cos(i * 1.2) * 0.2);
    }

    // Pendant lamps
    for (const x of [-3, 0, 3]) {
      cylinder(0.025, 0.025, 0.7, 0x8e735f, x, 4.3, -1.8);
      sphere(0.25, 0xffe6a8, x, 3.9, -1.8);
    }

    // Chef & ingredient jars
    chef = makePerson(-1.1, 0.2, 0xffffff, true, true);
    chef.rotation.y = 0;

    // Active drink cup sitting on the prep counter while chef prepares the order
    prepCupGroup = createDrinkCup(false);
    prepCupGroup.position.set(-1.1, 1.04, 1.45);
    const initBlend = prepCupGroup.getObjectByName('blendFill');
    if (initBlend) {
      initBlend.material.color.setHex(0xf3e5d2);
      initBlend.scale.y = 0.45;
    }
    scene.add(prepCupGroup);
    // 2 gelas tambahan di sisi paling kiri dan paling kanan meja pembuatan ice cookies
    const leftPrepCup = createDrinkCup(false);
    leftPrepCup.position.set(-2.92, 1.04, 1.45);
    const leftBlend = leftPrepCup.getObjectByName('blendFill');
    if (leftBlend) {
      leftBlend.material.color.setHex(0xd6c3ad);
      leftBlend.scale.y = 0.55;
    }
    const leftTopping = leftPrepCup.getObjectByName('toppingGroup');
    if (leftTopping) leftTopping.visible = true;
    scene.add(leftPrepCup);

    const rightPrepCup = createDrinkCup(true);
    rightPrepCup.position.set(-0.22, 1.04, 1.45);
    const rightBlend = rightPrepCup.getObjectByName('blendFill');
    if (rightBlend) {
      rightBlend.material.color.setHex(0xf8efe0);
      rightBlend.scale.y = 0.75;
    }
    const rightWhip = rightPrepCup.getObjectByName('whipGroup');
    if (rightWhip) rightWhip.visible = true;
    scene.add(rightPrepCup);

    const colors = [0xf6f2e9, 0xf5e2a8, 0x4a3028, 0x6a382d, 0xfff8ed, 0x3b2824];
    ingredientNames.forEach((name, i) => {
      const x = -2.5 + i * 0.48;
      const jar = cylinder(0.16, 0.18, 0.35, colors[i], x, 1.25, 1.58);
      ingredients3D.push(jar);
    });

    // Realistic hinged shop entrance door built into the front wall (x = 4.45 .. 6.15, z = 5.45)
    // Door frame jambs & lintel
    box(0.14, 2.75, 0.28, 0x7c523e, 4.52, 1.375, 5.45);
    box(0.14, 2.75, 0.28, 0x7c523e, 6.08, 1.375, 5.45);
    box(1.70, 0.14, 0.28, 0x7c523e, 5.30, 2.72, 5.45);
    // Floor welcome mat inside the doorway
    box(1.45, 0.025, 0.85, 0x8f5d47, 5.30, 0.015, 4.82);

    // Hinged door leaf pivoted at left jamb (x = 4.60, z = 5.45) so it swings open smoothly when customers enter/exit
    shopDoorPivot = new THREE.Group();
    shopDoorPivot.position.set(4.60, 0, 5.45);
    // Door wooden stiles & rails
    box(0.11, 2.62, 0.10, 0x8c5c45, 0.055, 1.31, 0, shopDoorPivot);
    box(0.11, 2.62, 0.10, 0x8c5c45, 1.345, 1.31, 0, shopDoorPivot);
    box(1.40, 0.14, 0.10, 0x8c5c45, 0.70, 2.55, 0, shopDoorPivot);
    box(1.40, 0.55, 0.10, 0x8c5c45, 0.70, 0.275, 0, shopDoorPivot);
    // Frosted glass panel in upper door
    box(1.18, 1.92, 0.04, 0xc7e7e2, 0.70, 1.51, 0, shopDoorPivot, 0.18);
    // Brass door handles (inside & outside)
    cylinder(0.022, 0.022, 0.24, 0xe6be63, 1.24, 1.18, -0.08, shopDoorPivot, 0.3);
    cylinder(0.022, 0.022, 0.24, 0xe6be63, 1.24, 1.18, 0.08, shopDoorPivot, 0.3);
    scene.add(shopDoorPivot);

    const doorSign = textSprite('WELCOME', '#fff5e4', '#6b4735');
    doorSign.position.set(5.30, 3.05, 5.26);
    doorSign.scale.set(1.35, 0.34, 1);
    scene.add(doorSign);

    // Queue markers positioned right next to the chef's counter so handoff happens up close
    const queueSlots = [
      new THREE.Vector3(1.05, 0, 1.30),
      new THREE.Vector3(1.75, 0, 1.82),
      new THREE.Vector3(2.45, 0, 2.34)
    ];
    queueSlots.forEach(slot => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.31, 24), mat(0xf5d6a8));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(slot.x, 0.01, slot.z);
      scene.add(ring);
    });

    initCafeSeats();
    buildDecorItems();
    spawnCustomer(true);
    setTimeout(() => spawnCustomer(false), 1400);
  }

  function removeStrayQueueCylinders() {
    if (!scene) return;
    const toRemove = [];
    const allowedParents = new Set();
    if (chef) allowedParents.add(chef);
    if (prepCupGroup) allowedParents.add(prepCupGroup);
    if (shopDoorPivot) allowedParents.add(shopDoorPivot);
    Object.values(decorGroups).forEach(g => { if (g) allowedParents.add(g); });

    scene.traverse(obj => {
      if (!obj.isMesh || !obj.geometry) return;
      if (obj.geometry.type !== 'CylinderGeometry') return;

      // Periksa apakah mesh ini berada di dalam hirarki karakter/koki/gelas/dekorasi resmi
      let cur = obj.parent;
      let isOfficial = false;
      while (cur) {
        if (allowedParents.has(cur) || (cur.userData && (cur.userData.kind === 'customer' || cur.userData.kind === 'chef'))) {
          isOfficial = true;
          break;
        }
        cur = cur.parent;
      }
      if (isOfficial) return;

      const worldPos = new THREE.Vector3();
      obj.getWorldPosition(worldPos);
      // Jika ada silinder/tabung nyasar di sekitar area antrean & tengah toko (x: -0.5..5.8, z: -0.5..6.8)
      const inQueueArea = worldPos.x > -0.5 && worldPos.x < 5.8 && worldPos.z > -0.5 && worldPos.z < 6.8;
      const params = obj.geometry.parameters || {};
      const radius = Math.max(params.radiusTop || 0, params.radiusBottom || 0);
      const height = params.height || 0;
      if (inQueueArea && radius >= 0.16 && height >= 0.22) {
        toRemove.push(obj);
      }
    });

    toRemove.forEach(mesh => {
      if (mesh.parent) mesh.parent.remove(mesh);
    });
  }

  function getQueueSlot(idx) {
    return new THREE.Vector3(1.05 + idx * 0.70, 0, 1.30 + idx * 0.52);
  }

  function refreshQueueTargets() {
    customers.forEach((c, idx) => {
      if (c.userData.state === 'arriving' || c.userData.state === 'waiting') {
        c.userData.target = getQueueSlot(idx);
      }
    });
  }

  function spawnCustomer(initial = false) {
    if (customers.length >= 3) return;
    const idx = customerIndex++ % customerNames.length;
    const c = makePerson(5.3, 6.25, [0xe7a7a0, 0x8daec3, 0xc5a4cf, 0x83aa8c, 0xe0bd7e][idx % 5], false, false);
    c.userData.target = getQueueSlot(customers.length);
    c.userData.state = 'arriving';
    c.userData.order = orders[Math.floor(Math.random() * orders.length)];
    c.userData.name = customerNames[idx];
    c.userData.face = customerFaces[idx];
    c.userData.bubble = textSprite('🍨 ORDER');
    c.userData.bubble.position.set(0, 2.5, 0);
    c.add(c.userData.bubble);
    customers.push(c);
    if (!currentOrder) activateCustomer(c);
  }

  function activateCustomer(c) {
    currentOrder = c;
    recipe = [];
    orderTime = getOrderDuration();
    if ($('timer')) $('timer').textContent = '⏱ ' + orderTime + 's';
    if ($('time-bar')) $('time-bar').style.width = '100%';
    updatePrepCupVisual();
    $('customer-avatar').textContent = c.userData.face;
    $('customer-name').textContent = c.userData.name;
    $('customer-says').textContent = 'Aku mau satu ' + c.userData.order.name + '!';
    $('order-name').textContent = c.userData.order.name;
    $('order-emoji').textContent = c.userData.order.emoji;
    $('order-description').textContent = c.userData.order.items.map(k => labels[k]).join(' • ');
    renderRecipe();
    feedback('Ayo buat pesanan ' + c.userData.name + '!');
  }

  function renderRecipe() {
    const steps = $('recipe-steps');
    steps.innerHTML = '';
    const wanted = currentOrder ? currentOrder.userData.order.items : orders[0].items;
    wanted.forEach(k => {
      const s = document.createElement('span');
      s.className = 'step' + (recipe.includes(k) ? ' done' : '');
      s.textContent = emoji[k] + ' ' + labels[k];
      steps.appendChild(s);
    });
    $('recipe-count').textContent = recipe.length + '/' + wanted.length + ' bahan';
    document.querySelectorAll('[data-ingredient]').forEach(b => {
      b.disabled = !running || paused || !currentOrder || recipe.includes(b.dataset.ingredient);
    });
  }

  function feedback(msg) {
    $('feedback').textContent = msg;
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastClock);
    toastClock = setTimeout(() => t.classList.remove('show'), 1800);
  }

  function addIngredient(key) {
    if (!running || paused || !currentOrder) return;
    const wanted = currentOrder.userData.order.items;
    if (recipe.includes(key)) {
      feedback('Bahan itu sudah ditambahkan.');
      return;
    }
    recipe.push(key);
    renderRecipe();
    updatePrepCupVisual();
    playTone('add');

    const jar = ingredients3D[ingredientNames.indexOf(key) % Math.max(1, ingredients3D.length)];
    if (jar) {
      jar.scale.y = 1.45;
      setTimeout(() => { if (jar) jar.scale.y = 1; }, 180);
    }

    // Pop & swirl the prep cup as an ingredient lands in it
    spawnIngredientSwirl(key);
    if (prepCupGroup) {
      prepCupGroup.scale.set(1.12, 0.88, 1.12);
      setTimeout(() => { if (prepCupGroup) prepCupGroup.scale.set(1, 1, 1); }, 160);
    }

    chef.userData.action = 1.15;
    chef.userData.armR.pivot.rotation.x = -1.05;
    chef.userData.armR.pivot.rotation.z = -0.18;
    chef.userData.armR.elbow.rotation.x = -0.35;
    chef.userData.body.position.z = 0.035;

    feedback(emoji[key] + ' ' + labels[key] + ' ditambahkan!');
    if (recipe.length === wanted.length) {
      feedback('Resep selesai! Tekan Sajikan ➜');
    }
  }

  function serve() {
    if (!running || paused || !currentOrder) return;
    const wanted = currentOrder.userData.order.items;
    const correct = wanted.length === recipe.length && wanted.every(k => recipe.includes(k));
    if (!correct) {
      playTone('error');
      feedback('Belum sesuai resep. Periksa bahan pesanan!');
      toast('Pesanan belum lengkap atau ada bahan berlebih');
      return;
    }

    playTone('serve');
    chef.userData.action = 0;

    streak += 1;
    const streakBonus = Math.min(25, (streak - 1) * 5);
    const modeBonus = gameMode === 'rush' ? 10 : 0;
    const earned = 25 + wanted.length * 5 + streakBonus + modeBonus;
    const gainedXp = 20 + Math.min(15, (streak - 1) * 3);
    coins += earned;
    xp += gainedXp;
    served++;
    localStorage.setItem('icc_coins', coins);
    localStorage.setItem('icc_xp', xp);

    $('coins').textContent = coins;
    $('xp').textContent = xp;
    if ($('streak')) $('streak').textContent = streak;
    $('level').textContent = 1 + Math.floor(xp / 100);
    $('served-count').textContent = served + '/5';
    const bonusNote = streak > 1 ? ` (🔥 ${streak}x +${streakBonus})` : (gameMode === 'rush' ? ' (⚡ Rush +10)' : '');
    toast('Pesanan benar! +' + earned + ' koin 🪙' + bonusNote);

    const c = currentOrder;
    c.userData.state = 'receiving';
    c.userData.bubble.visible = false;
    c.userData.receiveTime = 0;

    // Customer turns smoothly toward chef to receive the drink
    const faceChef = new THREE.Vector3(chef.position.x - c.position.x, 0, chef.position.z - c.position.z);
    c.userData.receiveFacing = Math.atan2(faceChef.x, faceChef.z);

    // Create finished drink cup with dome lid and place it squarely on chef's right palm
    const cup = createDrinkCup(true);
    scene.add(cup);

    c.userData.servingCup = cup;
    c.userData.cupProgress = 0;
    c.userData.handedOver = false;

    // Set up chef walk-up delivery sequence:
    // Phase 'approaching': chef walks forward toward the customer carrying the finished cup on their palm
    // Phase 'handing': chef extends right arm and transfers the cup onto the customer's palms
    // Phase 'returning': chef walks back to their prep station behind the counter
    const toCust = new THREE.Vector3(c.position.x - chef.position.x, 0, c.position.z - chef.position.z);
    const dir = toCust.length() > 0.01 ? toCust.clone().normalize() : new THREE.Vector3(1, 0, 0);
    const standPos = new THREE.Vector3(
      c.position.x - dir.x * 0.78,
      0,
      c.position.z - dir.z * 0.78
    );

    chef.userData.delivery = {
      phase: 'approaching',
      customer: c,
      cup: cup,
      homePos: chef.position.clone(),
      standPos: standPos,
      timer: 0
    };
    chef.userData.serving = 0;

    // Position cup on chef's right palm immediately
    chef.userData.armR.pivot.rotation.x = -0.68;
    chef.userData.armR.elbow.rotation.x = -0.52;
    cup.position.copy(getChefRightPalmWorld());

    spawnPopup('+' + earned + ' 🪙  +' + gainedXp + ' XP' + (streak > 1 ? ' 🔥' + streak + 'x' : ''), new THREE.Vector3(c.position.x, 2.35, c.position.z));
    spawnCoinBurst(new THREE.Vector3(c.position.x, 1.45, c.position.z));

    // Remove customer from active queue slot right away so the next customer can step forward after handoff
    customers = customers.filter(x => x !== c);

    // Reset prep cup for next order
    recipe = [];
    updatePrepCupVisual();
    currentOrder = null;
    renderRecipe();

    $('customer-avatar').textContent = '🧑‍🍳';
    $('customer-name').textContent = 'Mengantar pesanan...';
    $('customer-says').textContent = 'Koki sedang mengantarkan ke pelanggan!';
    $('order-name').textContent = 'Pesanan berikutnya';
    $('order-emoji').textContent = '🍨';
    $('order-description').textContent = 'Pelanggan baru segera dilayani.';
    feedback('Koki maju mengantarkan pesanan ke pelanggan!');

    if (served >= 5) {
      toast('Target harian tercapai! Bonus 100 koin');
      coins += 100;
      localStorage.setItem('icc_coins', coins);
      $('coins').textContent = coins;
      spawnPopup('BONUS +100 🪙', new THREE.Vector3(chef.position.x, 2.55, chef.position.z), '#fff3d1', '#9a6514');
      served = 0;
      $('served-count').textContent = '0/5';
    }
  }

  function resetRecipe() {
    recipe = [];
    updatePrepCupVisual();
    renderRecipe();
    feedback('Resep diulang. Mulai dari bahan pertama!');
  }

  function resize() {
    if (!renderer) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }

  function animateCustomer(c, i, dt, t) {
    const state = c.userData.state;
    const receiving = state === 'receiving';
    const sitting = state === 'sitting';
    const d = c.userData.target.clone().sub(c.position);
    const moving = !receiving && !sitting && d.length() > 0.08;

    if (receiving) {
      c.userData.receiveTime = (c.userData.receiveTime || 0) + dt;
      const reach = Math.min(1, c.userData.receiveTime / 0.48);

      // Both arms reach forward and inward so both palms cradle the cup base cleanly
      c.userData.armL.pivot.rotation.x = -0.88 * reach + Math.sin(t * 4) * 0.015;
      c.userData.armR.pivot.rotation.x = -0.88 * reach + Math.sin(t * 4) * 0.015;
      c.userData.armL.pivot.rotation.z = -0.26 * reach;
      c.userData.armR.pivot.rotation.z = 0.26 * reach;
      c.userData.armL.elbow.rotation.x = -0.58 * reach;
      c.userData.armR.elbow.rotation.x = -0.58 * reach;

      // Subtle appreciative nod & slight forward lean when receiving
      c.userData.body.position.z = 0.075 * reach + Math.sin(t * 3) * 0.012;
      c.userData.head.rotation.x = -0.12 * reach + Math.sin(t * 6) * 0.04;

      const diff = ((c.userData.receiveFacing - c.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      c.rotation.y += diff * Math.min(1, dt * 6);

      // Keep customer facing the approaching chef dynamically
      if (chef) {
        const dynFace = Math.atan2(chef.position.x - c.position.x, chef.position.z - c.position.z);
        const dynDiff = ((dynFace - c.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        c.rotation.y += dynDiff * Math.min(1, dt * 8);
      }

      if (c.userData.servingCup && c.userData.handedOver) {
        // Once handed over by the chef, lock cup base squarely onto the customer's palms
        const targetPalmPos = getCustomerReceivePalmWorld(c);
        c.userData.servingCup.position.copy(targetPalmPos);
        c.userData.servingCup.rotation.set(0, c.rotation.y, 0);
      }
    } else if (sitting) {
      const seat = c.userData.seat;
      c.userData.sitTimer = (c.userData.sitTimer || 0) + dt;
      // Smoothly settle onto the chair seat height (y = -0.14 offset puts hips right on y = 0.48 chair cushion)
      c.position.x += (seat.x - c.position.x) * Math.min(1, dt * 8);
      c.position.z += (seat.z - c.position.z) * Math.min(1, dt * 8);
      c.position.y += (-0.14 - c.position.y) * Math.min(1, dt * 8);

      const yawDiff = ((seat.facing - c.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      c.rotation.y += yawDiff * Math.min(1, dt * 8);

      // Seated leg pose (thighs forward, knees bent down)
      c.userData.legL.rotation.x = -1.35;
      c.userData.legR.rotation.x = -1.35;

      // Relaxed seated posture & occasional sipping/enjoying motion
      const sipWave = Math.max(0, Math.sin(t * 2.4 + i));
      c.userData.body.position.y = 1.05 + Math.sin(t * 2 + i) * 0.012;
      c.userData.body.position.z = 0.02;
      c.userData.head.rotation.x = -0.06 + sipWave * 0.09;
      c.userData.head.rotation.y = Math.sin(t * 1.1 + i) * 0.14;

      c.userData.armL.pivot.rotation.x = -0.35;
      c.userData.armL.elbow.rotation.x = -0.45;
      c.userData.armR.pivot.rotation.x = -0.48 - sipWave * 0.18;
      c.userData.armR.elbow.rotation.x = -0.52 - sipWave * 0.22;

      // Place the drink cup neatly on the cafe table surface right in front of the seated customer
      if (c.userData.servingCup) {
        c.userData.servingCup.position.set(seat.tableX, seat.tableY, seat.tableZ);
        c.userData.servingCup.rotation.set(0, seat.facing, 0);
      }

      // After enjoying their ice cream for ~10 seconds, stand up and walk out the exit door
      if (c.userData.sitTimer >= 10.5) {
        releaseSeat(c);
        c.position.set(seat.approachX, 0, seat.approachZ);
        c.userData.head.rotation.y = 0;
        c.userData.state = 'leaving';
        c.userData.target = new THREE.Vector3(5.3, 0, 7.4);
        // Remove empty cup from table or let customer carry it out
        if (c.userData.servingCup) {
          scene.remove(c.userData.servingCup);
          c.userData.servingCup = null;
        }
        spawnPopup('😊 TERIMA KASIH!', new THREE.Vector3(c.position.x, 2.35, c.position.z), '#fff8e8', '#7d563c');
      }
    } else if ((state === 'leaving' || state === 'going_to_seat') && c.userData.servingCup) {
      // Lock cup base squarely onto the customer's right palm while walking to the chair or out the door
      const palmPos = getCustomerCarryPalmWorld(c);
      c.userData.servingCup.position.copy(palmPos);
      c.userData.servingCup.rotation.set(0, c.rotation.y, 0);
    }

    if (moving) {
      c.position.y += (0 - c.position.y) * Math.min(1, dt * 8);
      d.normalize();
      c.position.addScaledVector(d, dt * (state === 'leaving' ? 2.3 : 1.65));
      const targetYaw = Math.atan2(d.x, d.z);
      const yawDiff = ((targetYaw - c.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      c.rotation.y += yawDiff * Math.min(1, dt * 8);
    }

    if (!sitting) {
      c.userData.legL.rotation.x = moving ? Math.sin(t * 9) * 0.48 : 0;
      c.userData.legR.rotation.x = moving ? -Math.sin(t * 9) * 0.48 : 0;
    }

    if (!receiving && !sitting) {
      const holdingCupWhileWalking = (state === 'leaving' || state === 'going_to_seat') && Boolean(c.userData.servingCup);
      c.userData.armL.pivot.rotation.x = moving ? -Math.sin(t * 9) * 0.22 : Math.sin(t * 1.5 + i) * 0.025;
      // Right arm holds the drink cup forward/slightly bent when carrying it
      c.userData.armR.pivot.rotation.x = holdingCupWhileWalking
        ? -0.65 + Math.sin(t * 6) * 0.04
        : (moving ? Math.sin(t * 9) * 0.22 : Math.sin(t * 1.5 + i + 1) * 0.025);
      c.userData.armR.elbow.rotation.x = holdingCupWhileWalking ? -0.42 : c.userData.armR.elbow.rotation.x * Math.max(0, 1 - dt * 4);

      c.userData.armL.pivot.rotation.z *= Math.max(0, 1 - dt * 4);
      c.userData.armR.pivot.rotation.z *= Math.max(0, 1 - dt * 4);
      c.userData.armL.elbow.rotation.x *= Math.max(0, 1 - dt * 4);
      c.userData.body.position.z *= Math.max(0, 1 - dt * 3);
      c.userData.head.rotation.x *= Math.max(0, 1 - dt * 3);
      c.userData.head.rotation.y *= Math.max(0, 1 - dt * 4);
      c.userData.body.position.y = 1.05 + (moving ? Math.abs(Math.sin(t * 9)) * 0.035 : Math.sin(t * 2 + i) * 0.015);
    }

    if (state === 'arriving' && c.position.distanceTo(c.userData.target) < 0.15) {
      c.userData.state = 'waiting';
      if (!currentOrder) activateCustomer(c);
    }

    if (state === 'going_to_seat' && c.position.distanceTo(c.userData.target) < 0.16) {
      const seat = c.userData.seat;
      if (c.userData.seatPhase === 'approach') {
        c.userData.seatPhase = 'chair';
        c.userData.target = new THREE.Vector3(seat.x, 0, seat.z);
      } else {
        c.userData.state = 'sitting';
        c.userData.sitTimer = 0;
      }
    }

    if (state === 'waiting' && !moving && chef) {
      const lookChefYaw = Math.atan2(chef.position.x - c.position.x, chef.position.z - c.position.z);
      const waitDiff = ((lookChefYaw - c.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      c.rotation.y += waitDiff * Math.min(1, dt * 6);
    }

    if (state === 'leaving' && c.position.distanceTo(c.userData.target) < 0.25) {
      releaseSeat(c);
      c.userData.done = true;
      if (c.userData.servingCup) scene.remove(c.userData.servingCup);
      scene.remove(c);
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.04);
    const t = clock.elapsedTime;

    if (running && !paused) {
      elapsed += dt;
      spawnClock += dt;

      if (currentOrder) {
        const maxDur = getOrderDuration();
        orderTime -= dt;
        $('timer').textContent = '⏱ ' + Math.max(0, Math.ceil(orderTime)) + 's';
        $('time-bar').style.width = Math.max(0, (orderTime / maxDur) * 100) + '%';
        $('time-bar').style.background = orderTime < 12 ? '#d87965' : '#8fbd9f';

        if (orderTime <= 0) {
          playTone('error');
          streak = 0;
          if ($('streak')) $('streak').textContent = '0';
          toast('Waktu habis! Streak reset & pelanggan pergi.');
          const c = currentOrder;
          c.userData.state = 'leaving';
          c.userData.target = new THREE.Vector3(5.3, 0, 7.4);
          c.userData.bubble.visible = false;
          customers = customers.filter(x => x !== c);
          refreshQueueTargets();
          currentOrder = null;
          recipe = [];
          updatePrepCupVisual();
          renderRecipe();
          spawnPopup('⌛ WAKTU HABIS', new THREE.Vector3(c.position.x, 2.35, c.position.z), '#ffe8e2', '#a64838');
          $('customer-avatar').textContent = '😕';
          $('customer-name').textContent = 'Waktu habis';
          $('customer-says').textContent = 'Yah, kelamaan menunggunya...';
          setTimeout(() => spawnCustomer(), 900);
        }
      }

      const spawnGap = gameMode === 'rush' ? 3.8 : 5.8;
      if (spawnClock > spawnGap && customers.length < 3) {
        spawnClock = 0;
        spawnCustomer();
      }

      const keys = window.gameKeys || {};
      if (keys.KeyA) chef.position.x = Math.max(-2.6, chef.position.x - 0.055);
      if (keys.KeyD) chef.position.x = Math.min(0.3, chef.position.x + 0.055);
      if (keys.KeyW) chef.position.z = Math.max(-0.1, chef.position.z - 0.045);
      if (keys.KeyS) chef.position.z = Math.min(1.1, chef.position.z + 0.045);
    }

    if (chef) {
      const u = chef.userData;
      const deliv = u.delivery;
      let chefAutoWalking = false;

      if (running && !paused && deliv) {
        const cust = deliv.customer;
        if (deliv.phase === 'approaching') {
          // Chef walks forward toward the ordering customer while carrying the finished cup on their right palm
          const toTarget = deliv.standPos.clone().sub(chef.position);
          toTarget.y = 0;
          const dist = toTarget.length();
          if (dist > 0.08) {
            chefAutoWalking = true;
            toTarget.normalize();
            chef.position.addScaledVector(toTarget, Math.min(dist, dt * 2.15));
            const targetYaw = Math.atan2(toTarget.x, toTarget.z);
            const yawDiff = ((targetYaw - chef.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            chef.rotation.y += yawDiff * Math.min(1, dt * 10);

            // Right arm bent forward steadily carrying the cup on the palm
            u.armR.pivot.rotation.x = -0.68 + Math.sin(t * 7) * 0.025;
            u.armR.pivot.rotation.z = -0.08;
            u.armR.elbow.rotation.x = -0.52;
            u.armL.pivot.rotation.x = -Math.sin(t * 10) * 0.24;
            u.armL.elbow.rotation.x = 0;
            u.body.position.y = 1.05 + Math.abs(Math.sin(t * 10)) * 0.03;

            if (deliv.cup) {
              deliv.cup.position.copy(getChefRightPalmWorld());
              deliv.cup.rotation.set(0, chef.rotation.y, 0);
            }
          } else {
            // Arrived right in front of the customer -> begin handoff!
            deliv.phase = 'handing';
            deliv.timer = 0;
            deliv.handFrom = getChefRightPalmWorld();
          }
        } else if (deliv.phase === 'handing') {
          deliv.timer += dt;
          const faceCust = Math.atan2(cust.position.x - chef.position.x, cust.position.z - chef.position.z);
          const yawDiff = ((faceCust - chef.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          chef.rotation.y += yawDiff * Math.min(1, dt * 10);

          const reach = Math.min(1, deliv.timer / 0.35);
          // Chef extends right arm forward so their palm meets the customer's palms
          u.armR.pivot.rotation.x = -0.68 - 0.36 * reach;
          u.armR.pivot.rotation.z = -0.14 * reach;
          u.armR.elbow.rotation.x = -0.52 + 0.14 * reach;
          u.armL.pivot.rotation.x = -0.35 * reach;
          u.body.position.z = 0.08 * reach;
          u.body.position.y = 1.05;
          u.head.rotation.x = -0.08 * reach;

          const p = Math.min(1, deliv.timer / 0.65);
          const smooth = p * p * (3 - 2 * p);
          const chefPalm = getChefRightPalmWorld();
          const custPalm = getCustomerReceivePalmWorld(cust);

          if (deliv.cup) {
            if (p < 1) {
              deliv.cup.position.lerpVectors(chefPalm, custPalm, smooth);
              deliv.cup.position.y += Math.sin(p * Math.PI) * 0.04;
              deliv.cup.rotation.set(0, chef.rotation.y, 0);
            } else {
              // Cup is now resting squarely on the customer's palms
              deliv.cup.position.copy(custPalm);
              deliv.cup.rotation.set(0, cust.rotation.y, 0);
              cust.userData.handedOver = true;
            }
          }

          if (deliv.timer >= 0.95) {
            // Decide whether the customer dines in at a free cafe table/chair or walks straight out (takeaway)
            if (cust && cust.parent) {
              const wantsDineIn = Math.random() < 0.65;
              const seat = wantsDineIn ? claimAvailableSeat(cust) : null;
              if (seat) {
                cust.userData.seat = seat;
                cust.userData.state = 'going_to_seat';
                cust.userData.seatPhase = 'approach';
                cust.userData.target = new THREE.Vector3(seat.approachX, 0, seat.approachZ);
                spawnPopup('🪑 DUDUK SANTAI!', new THREE.Vector3(cust.position.x, 2.45, cust.position.z), '#eef9f2', '#3f7355');
                $('customer-avatar').textContent = '😋';
                $('customer-name').textContent = cust.userData.name + ' duduk di meja';
                $('customer-says').textContent = 'Nikmatin dulu di meja kafe!';
              } else {
                cust.userData.state = 'leaving';
                cust.userData.target = new THREE.Vector3(5.3, 0, 7.4);
                spawnPopup('💖 ENAK SEKALI!', new THREE.Vector3(cust.position.x, 2.45, cust.position.z), '#fff5f7', '#b34b68');
                $('customer-avatar').textContent = '🤩';
                $('customer-name').textContent = 'Pelanggan sangat puas!';
                $('customer-says').textContent = 'Wah, segar dan enak sekali!';
              }
            }
            refreshQueueTargets();
            setTimeout(() => spawnCustomer(), 700);

            deliv.phase = 'returning';
            deliv.timer = 0;
          }
        } else if (deliv.phase === 'returning') {
          const toHome = deliv.homePos.clone().sub(chef.position);
          toHome.y = 0;
          const dist = toHome.length();
          if (dist > 0.08) {
            chefAutoWalking = true;
            toHome.normalize();
            chef.position.addScaledVector(toHome, Math.min(dist, dt * 2.25));
            const backYaw = Math.atan2(toHome.x, toHome.z);
            const yawDiff = ((backYaw - chef.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
            chef.rotation.y += yawDiff * Math.min(1, dt * 10);

            u.armR.pivot.rotation.x = Math.sin(t * 10) * 0.24;
            u.armR.pivot.rotation.z = 0;
            u.armR.elbow.rotation.x = 0;
            u.armL.pivot.rotation.x = -Math.sin(t * 10) * 0.24;
            u.armL.elbow.rotation.x = 0;
            u.body.position.z = 0;
            u.body.position.y = 1.05 + Math.abs(Math.sin(t * 10)) * 0.03;
            u.head.rotation.x = 0;
          } else {
            chef.position.copy(deliv.homePos);
            chef.rotation.y = 0;
            u.armR.pivot.rotation.x = 0;
            u.armR.pivot.rotation.z = 0;
            u.armR.elbow.rotation.x = 0;
            u.armL.pivot.rotation.x = 0;
            u.armL.elbow.rotation.x = 0;
            u.body.position.z = 0;
            u.body.position.y = 1.05;
            u.head.rotation.x = 0;
            u.delivery = null;
          }
        }
      } else if (running && !paused && u.action > 0) {
        u.action = Math.max(0, u.action - dt);
        const phase = 1.15 - u.action;
        const reach = phase < 0.42 ? phase / 0.42 : Math.max(0, 1 - (phase - 0.42) / 0.73);
        u.armR.pivot.rotation.x = -1.05 * reach;
        u.armR.pivot.rotation.z = -0.18 * reach;
        u.armR.elbow.rotation.x = -0.35 * reach;
        u.body.position.z = 0.035 * reach;
      } else {
        chef.rotation.y = 0;
        u.armR.pivot.rotation.x = Math.sin(t * 1.7) * 0.035;
        u.armR.pivot.rotation.z = 0;
        u.armR.elbow.rotation.x = 0;
        u.armL.pivot.rotation.x = Math.sin(t * 1.5) * 0.045;
        u.body.position.z = 0;
        u.body.position.y = 1.05;
      }

      const manualWalking = !deliv && (window.gameKeys?.KeyA || window.gameKeys?.KeyD || window.gameKeys?.KeyW || window.gameKeys?.KeyS) && running && !paused;
      const walking = chefAutoWalking || manualWalking;
      if (walking) {
        u.legL.rotation.x = Math.sin(t * 10) * 0.48;
        u.legR.rotation.x = -Math.sin(t * 10) * 0.48;
        if (manualWalking) {
          u.armL.pivot.rotation.x = -Math.sin(t * 10) * 0.22;
          if (u.action <= 0) u.armR.pivot.rotation.x = Math.sin(t * 10) * 0.22;
        }
      } else {
        u.legL.rotation.x = 0;
        u.legR.rotation.x = 0;
      }
    }

    // Update both active queue customers and any customer currently receiving or walking away with a cup
    const allTrackedCustomers = [...customers];
    scene.traverse(obj => {
      if (obj.userData && obj.userData.kind === 'customer' && !allTrackedCustomers.includes(obj) && !obj.userData.done) {
        allTrackedCustomers.push(obj);
      }
    });

    allTrackedCustomers.forEach((c, i) => animateCustomer(c, i, dt, t));

    // Update floating score/XP popups
    floatingPopups = floatingPopups.filter(p => {
      p.age += dt;
      if (p.age >= p.duration) {
        scene.remove(p.sprite);
        return false;
      }
      const ratio = p.age / p.duration;
      p.sprite.position.y = p.startY + ratio * 0.75;
      p.sprite.material.opacity = Math.max(0, 1 - ratio * ratio);
      return true;
    });

    // Spin prep cup gently & boost when ingredients are added
    if (prepCupGroup) {
      const boost = prepCupGroup.userData.spinBoost || 0;
      prepCupGroup.rotation.y += dt * (0.55 + boost);
      if (boost > 0) {
        prepCupGroup.userData.spinBoost = Math.max(0, boost - dt * 11);
      }
    }

    // Update ingredient swirl particles above prep cup
    swirlParticles = swirlParticles.filter(sp => {
      sp.age += dt;
      if (sp.age >= sp.duration) {
        scene.remove(sp.mesh);
        return false;
      }
      const p = sp.age / sp.duration;
      const a = sp.angle + p * 7.5;
      const r = sp.radius * (1 - p * 0.45);
      const base = prepCupGroup ? prepCupGroup.position : new THREE.Vector3(-1.1, 1.04, 1.45);
      sp.mesh.position.set(
        base.x + Math.cos(a) * r,
        base.y + 0.35 + Math.sin(p * Math.PI) * 0.34,
        base.z + Math.sin(a) * r
      );
      const sc = Math.max(0.15, 1 - p);
      sp.mesh.scale.set(sc, sc, sc);
      return true;
    });

    // Update coin particles
    coinParticles = coinParticles.filter(cp => {
      cp.age += dt;
      if (cp.age >= cp.duration) {
        scene.remove(cp.mesh);
        return false;
      }
      cp.vy -= 6.5 * dt;
      cp.mesh.position.x += cp.vx * dt;
      cp.mesh.position.y = Math.max(0.05, cp.mesh.position.y + cp.vy * dt);
      cp.mesh.position.z += cp.vz * dt;
      cp.mesh.rotation.y += 9 * dt;
      return true;
    });

    // Swing entrance door open smoothly whenever a customer passes through the doorway
    if (shopDoorPivot) {
      let someoneAtDoor = false;
      allTrackedCustomers.forEach(c => {
        if (Math.abs(c.position.x - 5.3) < 1.35 && c.position.z > 3.9 && c.position.z < 6.8) {
          someoneAtDoor = true;
        }
      });
      const targetDoorAngle = someoneAtDoor ? -1.32 : 0;
      shopDoorPivot.rotation.y += (targetDoorAngle - shopDoorPivot.rotation.y) * Math.min(1, dt * 6.5);
    }

    removeStrayQueueCylinders();
    renderer.render(scene, camera);
  }

  function start() {
    if (running) return;
    running = true;
    paused = false;
    $('start-screen').classList.add('hidden');
    spawnClock = 0;
    if (!currentOrder && customers[0]) activateCustomer(customers[0]);
    renderRecipe();
    updatePrepCupVisual();
  }

  function pause() {
    if (!running) return;
    paused = !paused;
    $('pause-screen').classList.toggle('hidden', !paused);
    $('pause').textContent = paused ? '▶' : 'Ⅱ';
    renderRecipe();
  }

  function restart() {
    coins = 0;
    xp = 0;
    served = 0;
    localStorage.setItem('icc_coins', 0);
    localStorage.setItem('icc_xp', 0);
    $('coins').textContent = '0';
    $('xp').textContent = '0';
    $('level').textContent = '1';
    $('served-count').textContent = '0/5';
    location.reload();
  }

  function init() {
    $('coins').textContent = coins;
    $('xp').textContent = xp;
    $('level').textContent = 1 + Math.floor(xp / 100);
    buildShop();
    animate();

    const regularMenuIngredients = ['milk', 'cookies', 'chocolate', 'oreo_crumbs', 'vanilla', 'sugar'];
    const specialMenuIngredients = [
      'milk',
      'oreo_and_crumbs',
      'flavor_matcha',
      'flavor_strawberry',
      'flavor_avocado',
      'flavor_bubblegum',
      'flavor_grape',
      'sugar',
      'whipped_cream'
    ];

    function buildIngredientsGrid() {
      const regGrid = $('ingredients-regular-grid');
      const specGrid = $('ingredients-special-grid');
      if (!regGrid || !specGrid) return;

      regGrid.innerHTML = '';
      specGrid.innerHTML = '';

      regularMenuIngredients.forEach((key, idx) => {
        const btn = document.createElement('button');
        btn.dataset.ingredient = key;
        btn.dataset.menuGroup = 'regular-' + idx;
        btn.innerHTML = `${emoji[key]}<small>${labels[key]}</small>`;
        btn.addEventListener('click', () => addIngredient(key));
        regGrid.appendChild(btn);
      });

      specialMenuIngredients.forEach((key, idx) => {
        const btn = document.createElement('button');
        btn.dataset.ingredient = key;
        btn.dataset.menuGroup = 'special-' + idx;
        btn.innerHTML = `${emoji[key]}<small>${labels[key]}</small>`;
        btn.addEventListener('click', () => addIngredient(key));
        specGrid.appendChild(btn);
      });
    }
    buildIngredientsGrid();
    renderRecipe();
    $('serve').addEventListener('click', serve);
    $('reset-recipe').addEventListener('click', resetRecipe);
    $('play').addEventListener('click', start);
    $('pause').addEventListener('click', pause);
    $('resume').addEventListener('click', pause);
    $('restart').addEventListener('click', restart);
    $('decor-shop').addEventListener('click', () => {
      renderDecorList();
      $('decor-screen').classList.remove('hidden');
    });
    $('close-decor').addEventListener('click', () => $('decor-screen').classList.add('hidden'));
    $('settings').addEventListener('click', () => $('settings-screen').classList.remove('hidden'));
    $('close-settings').addEventListener('click', () => $('settings-screen').classList.add('hidden'));
    function syncModeButton() {
      const btn = $('mode-toggle');
      if (!btn) return;
      if (gameMode === 'rush') {
        btn.textContent = '⚡';
        btn.classList.add('rush-active');
        btn.title = 'Mode: Rush Hour (42s, +10 koin, antrean cepat) — Klik untuk Mode Santai';
      } else {
        btn.textContent = '🌿';
        btn.classList.remove('rush-active');
        btn.title = 'Mode: Santai (90s per pesanan) — Klik untuk Mode Rush Hour';
      }
      if (!currentOrder && $('timer')) {
        $('timer').textContent = '⏱ ' + getOrderDuration() + 's';
      }
    }
    syncModeButton();
    if ($('mode-toggle')) {
      $('mode-toggle').addEventListener('click', () => {
        gameMode = gameMode === 'rush' ? 'relaxed' : 'rush';
        localStorage.setItem('icc_mode', gameMode);
        if (currentOrder) {
          orderTime = Math.min(getOrderDuration(), Math.max(orderTime, gameMode === 'relaxed' ? 60 : 35));
        }
        syncModeButton();
        toast(gameMode === 'rush' ? '⚡ Mode Rush Hour aktif! Waktu 42s & bonus koin' : '🌿 Mode Santai aktif! Waktu 90s per pesanan');
      });
    }

    $('sound').addEventListener('click', () => {
      soundOn = !soundOn;
      $('sound').textContent = soundOn ? '🔊' : '🔇';
      toast(soundOn ? 'Suara aktif' : 'Suara dimatikan');
    });

    window.gameKeys = {};
    window.addEventListener('keydown', e => { window.gameKeys[e.code] = true; });
    window.addEventListener('keyup', e => { window.gameKeys[e.code] = false; });

    let drag = false, lastX = 0, lastY = 0, azimuth = -0.58, polar = 0.08, camDist = 5.4;
    const lookTarget = new THREE.Vector3(1.35, 1.35, 0.35);
    function updateIndoorCamera() {
      const cx = lookTarget.x + Math.sin(azimuth) * camDist;
      const cz = lookTarget.z + Math.cos(azimuth) * camDist;
      const cy = Math.max(1.5, Math.min(4.45, 2.85 + polar * 5.2));
      // Clamp inside room walls (-6.4..6.4, -4.8..5.05) so camera stays indoors
      camera.position.set(
        Math.max(-6.35, Math.min(6.35, cx)),
        cy,
        Math.max(-4.85, Math.min(5.05, cz))
      );
      camera.lookAt(lookTarget);
    }
    updateIndoorCamera();

    const canvas = renderer.domElement;
    canvas.addEventListener('pointerdown', e => {
      drag = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', () => { drag = false; });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      azimuth -= dx * 0.006;
      polar = Math.max(-0.22, Math.min(0.32, polar + dy * 0.003));
      updateIndoorCamera();
    });
    canvas.addEventListener('wheel', e => {
      camDist = Math.max(3.6, Math.min(7.2, camDist * (e.deltaY > 0 ? 1.06 : 0.94)));
      updateIndoorCamera();
    }, { passive: true });

    window.addEventListener('resize', resize);
  }

  init();
})();
