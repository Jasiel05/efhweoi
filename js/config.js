// ============ CONFIGURACIÓN: aquí ajustas el juego sin tocar la lógica ============
export const CONFIG = {
  stage: { w: 640, h: 1080 },          // área de juego (px lógicos)
  bgScroll: 0.15,                      // velocidad del fondo (unidades de textura por segundo)
  floorScroll: 0.6,   // velocidad del suelo en perspectiva (Fácil y Normal)
  iceStages: [0, 0.4, 0.7, 0.9],   // en qué fracción del tiempo aparece cada helado (0 = inicio, 1 = final)
  audio: { volume: 0.5, menu: 'audio/menu.mp3' },   // volume: de 0 a 1
  sfx: { volume: 0.4, shot: 'audio/stellashot.mp3', enemy: 'audio/vespershot.wav', bomb: 'audio/bomb.wav' },

  // Modelos 3D. height = alto en píxeles del juego. CAMBIA los nombres por los de tus .glb
  models: {
    player: { url: 'models/stella.glb', height: 110 },
    boss:   { url: 'models/vesper.glb', height: 160 },
  },
  // Imágenes PNG (si falta alguna se usa un dibujo provisional)
  images: {
    bullet: 'img/bala.png',            // 64x64, la punta del helado hacia ABAJO
    shot: 'img/disparo.png',           // 64x64, disparo de Stella
    life: 'img/vida.png', bomb: 'img/bomba.png',
    bossIcon: 'img/vesper_icono.png',
    bossIconAngry: 'img/vesper_enojada.png',
    ice: ['img/helado_0.png', 'img/helado_1.png', 'img/helado_2.png', 'img/helado_3.png'],
    logo: 'img/logo.png',
  },
  player: {
    speed: 380, focusSpeed: 170,       // px/s normal y con Shift
    hitRadius: 5,                      // hitbox oculta
    grazeRadius: 28,                   // distancia para sumar graze
    shotInterval: 0.07, shotSpeed: 900, shotDamage: 1,
    invul: 2.0, bombInvul: 3.0, bombFlashFrames: 24,
  },
  boss: { hitRadius: 55 },
  bulletRadius: 9, bulletSize: 34, maxBullets: 3000,
  score: { graze: 50, hit: 10, bomb: 1000, win: 20000, perSecondLeft: 100 },

  // Dificultades: vidas/bombas, vida de Vesper, tiempo (s), velocidad y cantidad de balas,
  // brazos de la espiral y qué patrones usa en cada fase.
  difficulties: {
    facil:   { name: 'Fácil', background: 'img/fondo_facil.png', perspective: true, music: 'audio/stage1.mp3',   lives: 5, bombs: 3, bossHP: 700,  time: 165, bulletSpeed: 0.8,  density: 0.6, arms: 1,
               phases: [['ring'], ['aimed', 'ring'], ['spiral']] },
    normal:  { name: 'Normal', background: 'img/fondo_normal.png', perspective: true, music: 'audio/stage2.mp3',  lives: 4, bombs: 3, bossHP: 1100, time: 150, bulletSpeed: 1.0,  density: 1.0, arms: 2,
               phases: [['ring', 'aimed'], ['spiral', 'aimed'], ['spiral', 'ring', 'rain']] },
    dificil: { name: 'Difícil', background: 'img/fondo_dificil.png', perspective: true, music: 'audio/stage3.mp3', lives: 3, bombs: 3, bossHP: 1500, time: 135, bulletSpeed: 1.25, density: 1.5, arms: 3,
               phases: [['ring', 'aimed'], ['spiral', 'aimed', 'rain'], ['spiral', 'ring', 'rain']] },
  },
};
