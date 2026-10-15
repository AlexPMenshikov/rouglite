(function () {
  var SPR = 16;
  var sprites = {};
  var floorLayouts = {};
  var source = 'builtin';
  var SETTINGS_KEY = 'rouglite_tileset_enabled_v1';
  var enabled = true;
  var loadId = 0;

  function px(c, x, y, color) {
    c.fillStyle = color;
    c.fillRect(x, y, 1, 1);
  }

  function rect(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }

  function makeCanvas(draw) {
    var cv = document.createElement('canvas');
    cv.width = SPR;
    cv.height = SPR;
    var c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    draw(c);
    return cv;
  }

  function buildBuiltin() {
    sprites.floor = makeCanvas(function (c) {
      rect(c, 0, 0, 16, 16, '#3a3550');
      for (var y = 0; y < 16; y += 4) {
        for (var x = 0; x < 16; x += 4) {
          var lite = ((x / 4 + y / 4) % 2 === 0);
          rect(c, x, y, 4, 4, lite ? '#4e4a68' : '#35314a');
          px(c, x + 1, y + 1, lite ? '#5c5878' : '#2e2a42');
        }
      }
    });

    sprites.floorDim = makeCanvas(function (c) {
      rect(c, 0, 0, 16, 16, '#222030');
      for (var y = 0; y < 16; y += 4) {
        for (var x = 0; x < 16; x += 4) {
          rect(c, x, y, 4, 4, ((x / 4 + y / 4) % 2 === 0) ? '#2a2838' : '#1c1a28');
        }
      }
    });

    sprites.wall = makeCanvas(function (c) {
      rect(c, 0, 0, 16, 16, '#1a1420');
      for (var row = 0; row < 4; row++) {
        for (var col = 0; col < 4; col++) {
          var bx = col * 4 + (row % 2 ? 0 : 2);
          var by = row * 4;
          if (bx >= 16) continue;
          rect(c, bx, by, 3, 3, '#6b5344');
          px(c, bx, by, '#8a6e58');
          px(c, bx + 2, by + 2, '#4a3828');
        }
      }
      rect(c, 0, 0, 16, 2, '#2a2030');
    });

    sprites.wallDim = makeCanvas(function (c) {
      rect(c, 0, 0, 16, 16, '#12101a');
      for (var row = 0; row < 4; row++) {
        for (var col = 0; col < 4; col++) {
          var bx = col * 4 + (row % 2 ? 0 : 2);
          var by = row * 4;
          if (bx >= 16) continue;
          rect(c, bx, by, 3, 3, '#3d3228');
        }
      }
    });

    sprites.stairs = makeCanvas(function (c) {
      rect(c, 0, 0, 16, 16, '#3a3550');
      rect(c, 3, 3, 10, 10, '#1a1420');
      for (var i = 0; i < 5; i++) {
        rect(c, 4, 4 + i * 2, 8, 1, '#8ee3ef');
        px(c, 5 + i, 4 + i * 2, '#c8f8ff');
      }
      px(c, 7, 12, '#ffd166');
    });

    sprites.player = makeCanvas(function (c) {
      rect(c, 5, 2, 6, 2, '#e8c090');
      px(c, 6, 3, '#1a1a28');
      px(c, 9, 3, '#1a1a28');
      rect(c, 4, 4, 8, 6, '#3080e8');
      rect(c, 3, 5, 1, 4, '#2060c0');
      rect(c, 12, 5, 1, 4, '#2060c0');
      rect(c, 5, 10, 2, 4, '#1a1a28');
      rect(c, 9, 10, 2, 4, '#1a1a28');
      rect(c, 11, 4, 2, 8, '#c0c8d8');
      px(c, 12, 3, '#e8f0ff');
    });

    sprites.slime = makeCanvas(function (c) {
      rect(c, 3, 8, 10, 5, '#48c868');
      rect(c, 4, 5, 8, 4, '#58d878');
      px(c, 5, 7, '#1a4028');
      px(c, 9, 7, '#1a4028');
      px(c, 6, 6, '#e8ffe8');
    });

    sprites.rat = makeCanvas(function (c) {
      rect(c, 4, 7, 8, 4, '#a08050');
      rect(c, 2, 8, 3, 2, '#806840');
      px(c, 2, 8, '#c0a070');
      rect(c, 10, 7, 3, 2, '#806840');
      px(c, 5, 8, '#1a1010');
      px(c, 8, 8, '#1a1010');
    });

    sprites.skeleton = makeCanvas(function (c) {
      rect(c, 6, 2, 4, 4, '#e8e8e8');
      px(c, 7, 4, '#1a1a28');
      px(c, 9, 4, '#1a1a28');
      rect(c, 7, 6, 2, 6, '#d0d0d0');
      rect(c, 4, 7, 8, 1, '#d0d0d0');
      rect(c, 5, 8, 2, 4, '#c8c8c8');
      rect(c, 9, 8, 2, 4, '#c8c8c8');
    });

    sprites.archer = makeCanvas(function (c) {
      rect(c, 5, 3, 6, 3, '#ffd166');
      px(c, 6, 4, '#1a1a28');
      px(c, 9, 4, '#1a1a28');
      rect(c, 5, 6, 6, 5, '#6b8040');
      rect(c, 11, 5, 1, 7, '#8b6040');
      px(c, 11, 4, '#604020');
    });

    sprites.bat = makeCanvas(function (c) {
      px(c, 7, 6, '#9060e0');
      rect(c, 3, 5, 4, 2, '#b080ff');
      rect(c, 9, 5, 4, 2, '#b080ff');
      px(c, 2, 6, '#7040c0');
      px(c, 13, 6, '#7040c0');
      px(c, 7, 7, '#1a1028');
    });

    sprites.demon = makeCanvas(function (c) {
      px(c, 5, 2, '#ff5020');
      px(c, 10, 2, '#ff5020');
      rect(c, 5, 3, 6, 4, '#c83818');
      px(c, 6, 5, '#ffe040');
      px(c, 9, 5, '#ffe040');
      rect(c, 4, 7, 8, 5, '#902818');
      rect(c, 3, 8, 2, 4, '#601810');
      rect(c, 11, 8, 2, 4, '#601810');
    });

    sprites.wolf = makeCanvas(function (c) {
      rect(c, 2, 7, 9, 4, '#9a9a8a');
      rect(c, 9, 5, 4, 3, '#8a8a7a');
      px(c, 12, 6, '#1a1a28');
      rect(c, 10, 4, 2, 2, '#8a8a7a');
      rect(c, 13, 4, 2, 2, '#8a8a7a');
      rect(c, 3, 11, 2, 3, '#6a6a5a');
      rect(c, 7, 11, 2, 3, '#6a6a5a');
      rect(c, 10, 8, 3, 1, '#7a7a6a');
    });

    sprites.spider = makeCanvas(function (c) {
      rect(c, 6, 6, 4, 4, '#8a5a9a');
      px(c, 7, 7, '#1a1028');
      px(c, 9, 7, '#1a1028');
      for (var i = 0; i < 3; i++) {
        rect(c, 2, 6 + i, 4, 1, '#6a4a7a');
        rect(c, 10, 6 + i, 4, 1, '#6a4a7a');
      }
      px(c, 5, 5, '#5a3a6a');
      px(c, 10, 5, '#5a3a6a');
    });

    sprites.eagle = makeCanvas(function (c) {
      rect(c, 6, 6, 4, 4, '#b08050');
      rect(c, 3, 7, 4, 2, '#c09060');
      rect(c, 9, 7, 4, 2, '#c09060');
      px(c, 7, 7, '#1a1010');
      px(c, 9, 7, '#1a1010');
      px(c, 8, 9, '#ffd166');
      rect(c, 6, 10, 4, 2, '#8a6038');
    });

    sprites.goat = makeCanvas(function (c) {
      rect(c, 3, 7, 8, 5, '#a09080');
      rect(c, 9, 4, 4, 4, '#908070');
      px(c, 12, 5, '#1a1010');
      px(c, 10, 3, '#d0d0c8');
      px(c, 12, 3, '#d0d0c8');
      rect(c, 4, 12, 2, 3, '#6a5a4a');
      rect(c, 9, 12, 2, 3, '#6a5a4a');
    });

    sprites.scorpion = makeCanvas(function (c) {
      rect(c, 4, 8, 7, 4, '#d8b060');
      px(c, 5, 9, '#8a6830');
      px(c, 10, 9, '#8a6830');
      rect(c, 11, 6, 2, 2, '#c8a050');
      rect(c, 13, 4, 1, 4, '#c8a050');
      rect(c, 12, 3, 2, 1, '#c8a050');
      rect(c, 2, 7, 2, 1, '#b89048');
      rect(c, 2, 10, 2, 1, '#b89048');
    });

    sprites.mummy = makeCanvas(function (c) {
      rect(c, 5, 2, 6, 12, '#d8c8a0');
      rect(c, 5, 2, 6, 2, '#b8a880');
      rect(c, 4, 5, 8, 1, '#c8b890');
      rect(c, 4, 8, 8, 1, '#c8b890');
      rect(c, 4, 11, 8, 1, '#c8b890');
      px(c, 6, 4, '#1a1a28');
      px(c, 9, 4, '#1a1a28');
      rect(c, 3, 6, 2, 3, '#c0b088');
      rect(c, 11, 9, 2, 3, '#c0b088');
    });

    sprites.cultist = makeCanvas(function (c) {
      rect(c, 4, 3, 8, 4, '#a04050');
      rect(c, 5, 4, 6, 3, '#2a1018');
      px(c, 6, 5, '#ff6070');
      px(c, 9, 5, '#ff6070');
      rect(c, 5, 7, 6, 7, '#803040');
      rect(c, 4, 8, 1, 5, '#702838');
      rect(c, 11, 8, 1, 5, '#702838');
    });

    sprites.zombie = makeCanvas(function (c) {
      rect(c, 5, 3, 6, 4, '#7a9a6a');
      px(c, 6, 5, '#1a2810');
      px(c, 9, 5, '#1a2810');
      rect(c, 6, 6, 4, 1, '#4a6840');
      rect(c, 5, 7, 6, 6, '#5a7a4a');
      rect(c, 3, 8, 2, 3, '#6a8a5a');
      rect(c, 11, 9, 2, 2, '#6a8a5a');
      rect(c, 5, 13, 2, 2, '#3a5030');
      rect(c, 9, 13, 2, 2, '#3a5030');
    });

    sprites.ghost = makeCanvas(function (c) {
      rect(c, 5, 3, 6, 6, '#a0d8ff');
      rect(c, 4, 5, 8, 4, '#a0d8ff');
      px(c, 6, 5, '#10283a');
      px(c, 9, 5, '#10283a');
      rect(c, 5, 9, 2, 3, '#a0d8ff');
      rect(c, 8, 9, 2, 2, '#a0d8ff');
      rect(c, 11, 9, 2, 4, '#a0d8ff');
    });

    sprites.ghoul = makeCanvas(function (c) {
      rect(c, 5, 3, 6, 4, '#6a8a7a');
      px(c, 6, 5, '#e0ffe0');
      px(c, 9, 5, '#e0ffe0');
      rect(c, 5, 7, 6, 6, '#54705f');
      rect(c, 3, 8, 2, 4, '#5f7f6a');
      rect(c, 11, 8, 2, 4, '#5f7f6a');
      px(c, 6, 11, '#c8ffd0');
      px(c, 9, 11, '#c8ffd0');
      rect(c, 5, 13, 2, 2, '#3a5044');
      rect(c, 9, 13, 2, 2, '#3a5044');
    });

    sprites.golem = makeCanvas(function (c) {
      rect(c, 4, 3, 8, 5, '#909090');
      px(c, 6, 5, '#ffe040');
      px(c, 9, 5, '#ffe040');
      rect(c, 3, 8, 10, 5, '#808080');
      rect(c, 2, 9, 2, 4, '#707070');
      rect(c, 12, 9, 2, 4, '#707070');
      rect(c, 4, 13, 3, 3, '#606060');
      rect(c, 9, 13, 3, 3, '#606060');
    });

    sprites.croc = makeCanvas(function (c) {
      rect(c, 2, 8, 11, 4, '#4a7a4a');
      rect(c, 11, 7, 4, 3, '#3d683d');
      px(c, 14, 8, '#e0ffe0');
      px(c, 3, 9, '#1a2810');
      rect(c, 2, 9, 12, 1, '#6aaa6a');
      rect(c, 3, 12, 2, 3, '#356035');
      rect(c, 9, 12, 2, 3, '#356035');
    });

    sprites.boss = makeCanvas(function (c) {
      rect(c, 2, 1, 12, 3, '#802020');
      rect(c, 3, 4, 10, 6, '#a02828');
      px(c, 4, 6, '#ff4040');
      px(c, 11, 6, '#ff4040');
      rect(c, 2, 10, 4, 4, '#601818');
      rect(c, 10, 10, 4, 4, '#601818');
      rect(c, 6, 10, 4, 5, '#701818');
    });

    sprites.boss_slime = makeCanvas(function (c) {
      rect(c, 2, 7, 12, 6, '#38b858');
      rect(c, 3, 4, 10, 5, '#58d878');
      rect(c, 5, 2, 6, 3, '#78f090');
      px(c, 5, 6, '#103018');
      px(c, 10, 6, '#103018');
      px(c, 6, 5, '#e8ffe8');
      px(c, 9, 5, '#e8ffe8');
      rect(c, 7, 9, 2, 2, '#206030');
    });

    sprites.boss_rat = makeCanvas(function (c) {
      rect(c, 3, 6, 10, 5, '#a07040');
      rect(c, 1, 7, 3, 3, '#805828');
      rect(c, 12, 5, 3, 2, '#805828');
      px(c, 1, 7, '#c09050');
      px(c, 5, 7, '#1a1010');
      px(c, 9, 7, '#1a1010');
      px(c, 7, 9, '#ff8080');
      rect(c, 4, 4, 3, 2, '#c09050');
      rect(c, 9, 4, 3, 2, '#c09050');
    });

    sprites.boss_bone = makeCanvas(function (c) {
      rect(c, 4, 1, 8, 5, '#f0f0f0');
      px(c, 6, 3, '#1a1a28');
      px(c, 9, 3, '#1a1a28');
      rect(c, 6, 6, 4, 5, '#d8d8d8');
      rect(c, 2, 7, 12, 2, '#e0e0e0');
      rect(c, 3, 10, 3, 4, '#c8c8c8');
      rect(c, 10, 10, 3, 4, '#c8c8c8');
      px(c, 5, 2, '#ff5050');
      px(c, 10, 2, '#ff5050');
    });

    sprites.boss_archer = makeCanvas(function (c) {
      rect(c, 5, 2, 6, 3, '#ffe080');
      px(c, 6, 3, '#1a1a28');
      px(c, 9, 3, '#1a1a28');
      rect(c, 4, 5, 8, 6, '#486028');
      rect(c, 12, 3, 2, 10, '#8b6040');
      px(c, 12, 2, '#604020');
      rect(c, 2, 7, 2, 2, '#c0a060');
      px(c, 7, 7, '#ffd166');
    });

    sprites.boss_bat = makeCanvas(function (c) {
      rect(c, 6, 5, 4, 4, '#7040c0');
      rect(c, 1, 4, 5, 3, '#b080ff');
      rect(c, 10, 4, 5, 3, '#b080ff');
      px(c, 0, 5, '#502090');
      px(c, 15, 5, '#502090');
      px(c, 7, 6, '#ffe060');
      px(c, 9, 6, '#ffe060');
      rect(c, 7, 9, 2, 2, '#401870');
    });

    sprites.boss_brute = makeCanvas(function (c) {
      rect(c, 3, 2, 10, 4, '#908070');
      rect(c, 2, 6, 12, 6, '#706050');
      px(c, 5, 4, '#ff4040');
      px(c, 10, 4, '#ff4040');
      rect(c, 1, 7, 3, 5, '#605040');
      rect(c, 12, 7, 3, 5, '#605040');
      px(c, 7, 8, '#c0b0a0');
    });

    sprites.boss_witch = makeCanvas(function (c) {
      rect(c, 5, 1, 6, 2, '#301848');
      rect(c, 4, 3, 8, 3, '#c060e0');
      px(c, 6, 4, '#1a1028');
      px(c, 9, 4, '#1a1028');
      rect(c, 3, 6, 10, 7, '#502070');
      px(c, 7, 8, '#ff80ff');
      rect(c, 12, 5, 2, 6, '#a040d0');
    });

    sprites.boss_knight = makeCanvas(function (c) {
      rect(c, 5, 1, 6, 4, '#808898');
      px(c, 6, 3, '#1a1a28');
      px(c, 9, 3, '#1a1a28');
      rect(c, 3, 5, 10, 6, '#606878');
      rect(c, 2, 6, 2, 5, '#505860');
      rect(c, 12, 4, 2, 8, '#c0c8d8');
      px(c, 13, 3, '#e8f0ff');
      rect(c, 5, 11, 2, 3, '#404850');
      rect(c, 9, 11, 2, 3, '#404850');
    });

    sprites.boss_demon = makeCanvas(function (c) {
      px(c, 4, 1, '#ff6020');
      px(c, 11, 1, '#ff6020');
      rect(c, 4, 2, 8, 5, '#d03010');
      px(c, 6, 4, '#ffe040');
      px(c, 9, 4, '#ffe040');
      rect(c, 3, 7, 10, 6, '#801810');
      rect(c, 1, 8, 3, 5, '#601010');
      rect(c, 12, 8, 3, 5, '#601010');
      px(c, 7, 9, '#ff8040');
    });

    sprites.boss_lich = makeCanvas(function (c) {
      rect(c, 5, 1, 6, 4, '#d0f0ff');
      px(c, 6, 3, '#204060');
      px(c, 9, 3, '#204060');
      rect(c, 4, 5, 8, 7, '#406888');
      rect(c, 3, 6, 2, 6, '#90e0ff');
      rect(c, 11, 6, 2, 6, '#90e0ff');
      px(c, 7, 7, '#60ffff');
      rect(c, 6, 12, 4, 2, '#203040');
    });

    sprites.torch = makeCanvas(function (c) {
      rect(c, 7, 8, 2, 6, '#6a4830');
      px(c, 7, 8, '#8a6840');
      rect(c, 6, 4, 4, 4, '#ff9020');
      px(c, 7, 3, '#ffe060');
      px(c, 8, 5, '#ff4000');
      px(c, 7, 6, '#ff7000');
    });

    sprites.torchFlame = makeCanvas(function (c) {
      px(c, 7, 2, '#fff0a0');
      rect(c, 6, 3, 4, 4, '#ff9020');
      px(c, 7, 4, '#ff4000');
      px(c, 8, 5, '#ff7000');
      px(c, 6, 5, '#ffb040');
    });

    sprites.trapSpike = makeCanvas(function (c) {
      rect(c, 1, 11, 14, 4, '#292531');
      rect(c, 2, 10, 12, 2, '#7a7580');
      rect(c, 3, 9, 10, 1, '#b2aeb4');
      for (var i = 0; i < 3; i++) {
        var x = 3 + i * 4;
        rect(c, x, 8, 2, 2, '#c5d0d8');
        px(c, x + 1, 6, '#e9f0f2');
        px(c, x + 1, 7, '#d6e0e5');
      }
      rect(c, 2, 13, 12, 1, '#514c59');
    });

    sprites.trapNeedle = makeCanvas(function (c) {
      rect(c, 1, 11, 14, 4, '#292531');
      rect(c, 2, 10, 12, 2, '#766f7c');
      rect(c, 3, 9, 10, 1, '#b2aeb4');
      for (var i = 0; i < 3; i++) {
        var x = 4 + i * 4;
        px(c, x, 7, '#f2e7c5');
        rect(c, x, 8, 1, 2, '#c5b995');
      }
      rect(c, 2, 13, 12, 1, '#514c59');
    });

    sprites.trapFlame = makeCanvas(function (c) {
      rect(c, 1, 11, 14, 4, '#292531');
      rect(c, 3, 9, 10, 3, '#554a52');
      rect(c, 5, 8, 6, 2, '#8f4c32');
      rect(c, 6, 7, 4, 2, '#d66a26');
      px(c, 7, 5, '#ffd84a');
      rect(c, 7, 6, 2, 2, '#ff9b27');
      rect(c, 2, 13, 12, 1, '#514c59');
    });

    sprites.trapDisarmed = makeCanvas(function (c) {
      rect(c, 1, 11, 14, 4, '#292531');
      rect(c, 2, 10, 12, 2, '#625d68');
      rect(c, 3, 9, 10, 1, '#89848c');
      rect(c, 5, 7, 1, 4, '#9c8c71');
      rect(c, 10, 7, 1, 4, '#9c8c71');
      rect(c, 6, 9, 4, 1, '#b6a888');
      rect(c, 2, 13, 12, 1, '#514c59');
    });

    sprites.trapTriggered = makeCanvas(function (c) {
      rect(c, 1, 11, 14, 4, '#292531');
      rect(c, 2, 10, 12, 2, '#625d68');
      rect(c, 3, 9, 10, 1, '#89848c');
      rect(c, 4, 7, 4, 1, '#8d9298');
      rect(c, 9, 8, 3, 1, '#8d9298');
      px(c, 5, 6, '#b7bdc0');
      px(c, 10, 7, '#b7bdc0');
      rect(c, 2, 13, 12, 1, '#514c59');
    });

    sprites.gold = makeCanvas(function (c) {
      rect(c, 5, 9, 6, 3, '#b8860b');
      px(c, 6, 8, '#ffd166');
      px(c, 8, 7, '#ffe080');
      px(c, 9, 9, '#ffd166');
    });

    sprites.potion = makeCanvas(function (c) {
      rect(c, 7, 3, 2, 2, '#c0c0d0');
      rect(c, 6, 5, 4, 6, '#e04058');
      px(c, 7, 6, '#ff8090');
      rect(c, 6, 11, 4, 1, '#802030');
    });

    sprites.key = makeCanvas(function (c) {
      rect(c, 3, 2, 6, 6, '#ffd166');
      rect(c, 4, 3, 4, 4, '#3a3550');
      rect(c, 6, 7, 3, 2, '#ffd166');
      rect(c, 8, 8, 2, 6, '#ffd166');
      rect(c, 10, 11, 3, 2, '#ffd166');
      rect(c, 10, 13, 2, 2, '#ffd166');
      px(c, 5, 2, '#fff0a8');
    });

    sprites.sword = makeCanvas(function (c) {
      rect(c, 7, 2, 2, 9, '#c0c8e8');
      px(c, 8, 2, '#ffffff');
      rect(c, 6, 11, 4, 1, '#806040');
      rect(c, 7, 12, 2, 2, '#604020');
    });

    sprites.bow = makeCanvas(function (c) {
      rect(c, 11, 2, 1, 12, '#8a5a2c');
      rect(c, 10, 3, 1, 3, '#a06c36');
      rect(c, 10, 10, 1, 3, '#a06c36');
      rect(c, 9, 5, 1, 6, '#c8b48a');
      rect(c, 3, 7, 7, 1, '#e8e0c8');
      rect(c, 2, 6, 2, 1, '#d8d0b8');
      rect(c, 2, 9, 2, 1, '#d8d0b8');
      px(c, 4, 7, '#ffffff');
    });

    sprites.crossbow = makeCanvas(function (c) {
      rect(c, 2, 4, 12, 2, '#8a6a44');
      rect(c, 2, 4, 2, 2, '#c0c0d0');
      rect(c, 12, 4, 2, 2, '#c0c0d0');
      rect(c, 7, 6, 2, 6, '#6a4a2c');
      rect(c, 5, 11, 6, 2, '#a0743f');
      rect(c, 7, 7, 2, 4, '#f0e8d0');
    });

    sprites.axe = makeCanvas(function (c) {
      rect(c, 7, 2, 2, 12, '#8a5a2c');
      rect(c, 7, 2, 1, 12, '#6a4420');
      rect(c, 4, 3, 5, 5, '#c0c8d8');
      rect(c, 3, 4, 1, 3, '#8a93a8');
      rect(c, 5, 2, 3, 1, '#e8eef8');
    });

    sprites.spear = makeCanvas(function (c) {
      rect(c, 7, 3, 2, 12, '#8a5a2c');
      rect(c, 7, 3, 1, 12, '#6a4420');
      rect(c, 6, 0, 4, 3, '#c0c8d8');
      rect(c, 7, 2, 2, 3, '#a8b0c4');
      rect(c, 7, 0, 1, 3, '#f0f4ff');
      rect(c, 6, 13, 4, 1, '#604020');
    });

    sprites.shield = makeCanvas(function (c) {
      rect(c, 4, 3, 8, 10, '#4a78b8');
      rect(c, 5, 4, 6, 8, '#7eb8ff');
      px(c, 7, 6, '#e8f4ff');
      px(c, 8, 6, '#e8f4ff');
      rect(c, 6, 8, 4, 1, '#2a5080');
    });

    sprites.helmet = makeCanvas(function (c) {
      rect(c, 3, 3, 10, 9, '#aab7c4');
      rect(c, 5, 1, 6, 3, '#dce8f0');
      rect(c, 2, 9, 12, 3, '#dce8f0');
      rect(c, 6, 6, 4, 2, '#3a3550');
      rect(c, 7, 8, 2, 4, '#3a3550');
    });

    sprites.ring = makeCanvas(function (c) {
      rect(c, 4, 6, 8, 7, '#ffd166');
      rect(c, 6, 5, 4, 9, '#3a3550');
      rect(c, 7, 4, 2, 2, '#fff0a8');
      rect(c, 7, 13, 2, 2, '#ffd166');
    });

    sprites.amulet = makeCanvas(function (c) {
      rect(c, 7, 1, 2, 3, '#dce8f0');
      rect(c, 5, 3, 6, 2, '#dce8f0');
      rect(c, 6, 5, 4, 2, '#ffd166');
      rect(c, 5, 7, 6, 6, '#65aaff');
      rect(c, 7, 13, 2, 2, '#dce8f0');
      px(c, 7, 8, '#dce8f0');
    });

    sprites.boots = makeCanvas(function (c) {
      rect(c, 3, 7, 4, 5, '#8b6040');
      rect(c, 9, 7, 4, 5, '#8b6040');
      rect(c, 3, 11, 5, 2, '#c9a86a');
      rect(c, 9, 11, 5, 2, '#c9a86a');
      px(c, 4, 8, '#604020');
      px(c, 10, 8, '#604020');
    });

    sprites.decorStone = makeCanvas(function (c) {
      rect(c, 2, 9, 6, 4, '#777782');
      rect(c, 4, 7, 5, 4, '#9999a0');
      rect(c, 9, 10, 5, 3, '#686875');
      rect(c, 5, 8, 2, 1, '#c0bfc3');
      px(c, 11, 11, '#a5a4aa');
      px(c, 3, 12, '#454550');
    });

    sprites.decorGrass = makeCanvas(function (c) {
      rect(c, 3, 12, 10, 1, '#365c39');
      rect(c, 5, 9, 1, 4, '#71b85d');
      rect(c, 7, 7, 1, 6, '#8bd36a');
      rect(c, 9, 10, 1, 3, '#4d984f');
      rect(c, 11, 8, 1, 5, '#76c65f');
      px(c, 4, 11, '#b0db70');
      px(c, 12, 10, '#b0db70');
    });

    sprites.decorMoss = makeCanvas(function (c) {
      rect(c, 2, 10, 4, 3, '#396b48');
      rect(c, 5, 8, 5, 5, '#4f8b56');
      rect(c, 9, 9, 5, 4, '#3d754b');
      rect(c, 4, 9, 2, 2, '#70a85d');
      rect(c, 8, 8, 2, 2, '#83b96b');
      px(c, 12, 10, '#8fc373');
    });

    sprites.decorMushroom = makeCanvas(function (c) {
      rect(c, 5, 9, 2, 4, '#e6d4aa');
      rect(c, 3, 7, 6, 3, '#c94c58');
      rect(c, 4, 6, 4, 1, '#e27575');
      px(c, 5, 7, '#ffe4c4');
      rect(c, 10, 11, 2, 2, '#e6d4aa');
      rect(c, 9, 9, 4, 2, '#d8994e');
      px(c, 10, 9, '#ffe4c4');
    });

    sprites.decorPuddle = makeCanvas(function (c) {
      rect(c, 3, 9, 10, 4, '#245d83');
      rect(c, 5, 7, 7, 6, '#347fa0');
      rect(c, 6, 8, 5, 3, '#54b8c3');
      rect(c, 5, 8, 3, 1, '#b2ecdc');
      px(c, 11, 11, '#8ad9db');
    });

    sprites.decorLake = makeCanvas(function (c) {
      rect(c, 2, 8, 12, 5, '#1e5478');
      rect(c, 3, 6, 10, 8, '#28799a');
      rect(c, 5, 7, 7, 5, '#43a9bb');
      rect(c, 6, 8, 5, 2, '#8dd9d5');
      rect(c, 4, 12, 8, 1, '#163e63');
      px(c, 11, 11, '#b3eee0');
    });

    sprites.decorStream = makeCanvas(function (c) {
      for (var row = 0; row < 8; row++) {
        var sx = row < 4 ? 5 + row : 9 - (row - 4);
        rect(c, sx, row * 2, 4, 2, '#28799a');
        rect(c, sx + 1, row * 2, 2, 1, '#74cbd0');
      }
      px(c, 8, 3, '#b3eee0');
      px(c, 6, 11, '#b3eee0');
    });

// Лес, горы, пустыня, склеп. Наборы декораций по локациям — в CONFIG.LOCATION_GEN.
    sprites.decorTree = makeCanvas(function (c) {
      rect(c, 7, 10, 2, 5, '#5a3a22');
      rect(c, 4, 8, 8, 4, '#2f6b34');
      rect(c, 3, 5, 10, 5, '#377a3a');
      rect(c, 5, 2, 6, 4, '#43914a');
      px(c, 6, 3, '#5fb35c');
      px(c, 5, 6, '#5fb35c');
      px(c, 9, 5, '#2b5f31');
      px(c, 8, 14, '#4a2f1c');
    });

    sprites.decorPine = makeCanvas(function (c) {
      rect(c, 7, 12, 2, 4, '#4a3320');
      rect(c, 5, 7, 6, 6, '#1f4d33');
      rect(c, 4, 4, 8, 4, '#27603f');
      rect(c, 6, 1, 4, 4, '#2f7349');
      px(c, 7, 2, '#3d8f57');
      px(c, 5, 8, '#2a6b43');
      px(c, 10, 6, '#1b4229');
    });

    sprites.decorBush = makeCanvas(function (c) {
      rect(c, 3, 13, 10, 1, '#2a5a31');
      rect(c, 4, 9, 8, 5, '#356b3c');
      rect(c, 6, 6, 5, 5, '#3f8046');
      px(c, 7, 7, '#57a35c');
      px(c, 5, 10, '#28552f');
      px(c, 9, 12, '#28552f');
    });

    sprites.decorCactus = makeCanvas(function (c) {
      rect(c, 7, 3, 3, 12, '#3f7d3a');
      rect(c, 8, 4, 1, 10, '#57a04b');
      rect(c, 3, 7, 4, 2, '#3f7d3a');
      rect(c, 3, 7, 2, 5, '#3f7d3a');
      rect(c, 10, 8, 3, 2, '#3f7d3a');
      rect(c, 11, 8, 2, 4, '#3f7d3a');
      px(c, 8, 2, '#6fbf5e');
      px(c, 4, 12, '#6fbf5e');
      px(c, 12, 11, '#2f5f2c');
    });

    sprites.decorSand = makeCanvas(function (c) {
      rect(c, 2, 9, 12, 4, '#d8b878');
      rect(c, 3, 8, 8, 2, '#e8cd93');
      rect(c, 5, 6, 6, 1, '#f0dba8');
      px(c, 11, 10, '#c2a066');
      px(c, 4, 12, '#c2a066');
      px(c, 8, 7, '#f7e8bd');
    });

    sprites.decorCoffin = makeCanvas(function (c) {
      rect(c, 5, 2, 6, 13, '#7a5a3a');
      rect(c, 6, 3, 4, 11, '#9a7550');
      rect(c, 5, 2, 6, 1, '#5e452c');
      rect(c, 5, 14, 6, 1, '#5e452c');
      for (var cross = 0; cross < 4; cross++) {
        px(c, 6 + cross, 5 + cross, '#4a3524');
        px(c, 9 - cross, 5 + cross, '#4a3524');
      }
      px(c, 7, 8, '#d8c090');
      px(c, 8, 9, '#d8c090');
    });

    sprites.decorCross = makeCanvas(function (c) {
      rect(c, 3, 13, 10, 2, '#3d3228');
      rect(c, 7, 3, 2, 10, '#6b5344');
      rect(c, 8, 4, 1, 8, '#8a6b56');
      rect(c, 4, 6, 8, 2, '#6b5344');
      rect(c, 5, 7, 6, 1, '#8a6b56');
      px(c, 5, 5, '#a08872');
    });

    sprites.decorBones = makeCanvas(function (c) {
      rect(c, 6, 3, 5, 4, '#e8e0cc');
      rect(c, 7, 4, 1, 2, '#2a2438');
      rect(c, 9, 4, 1, 2, '#2a2438');
      rect(c, 4, 8, 8, 1, '#d8d0bc');
      rect(c, 5, 10, 7, 1, '#d8d0bc');
      rect(c, 3, 12, 10, 1, '#c8c0ac');
      px(c, 5, 13, '#e8e0cc');
      px(c, 11, 9, '#b8b09c');
    });

    sprites.blacksmith = makeCanvas(function (c) {
      rect(c, 3, 2, 10, 3, '#5a4a3a');
      rect(c, 4, 5, 8, 8, '#8a7a6a');
      rect(c, 5, 6, 2, 2, '#4a3a2a');
      rect(c, 9, 6, 2, 2, '#4a3a2a');
      rect(c, 6, 10, 4, 2, '#c0b0a0');
      px(c, 6, 5, '#d0c0b0');
      px(c, 7, 7, '#e0d0c0');
      rect(c, 2, 12, 12, 2, '#3a2a1a');
    });

    sprites.head = sprites.helmet;
    sprites.armor = sprites.shield;

    sprites.fog = makeCanvas(function (c) {
      rect(c, 0, 0, 16, 16, '#0a0810');
    });
  }

  // Иконки интерфейса. Отдельный набор, а не мировые тайлы: кнопка «Инвентарь»
  // должна читаться как сумка, а не как случайный предмет с пола.
  function buildUiIcons() {
    function arrow(c, x, y, color) {
      for (var i = 0; i < 5; i++) px(c, x + i, y + i, color);
      for (var j = 0; j < 5; j++) px(c, x + i, y + 8 - i, color);
      rect(c, x, y + 4, 4, 1, color);
    }

    sprites.uiPlay = makeCanvas(function (c) {
      for (var y = 0; y < 12; y++) {
        rect(c, 3 + Math.floor(y / 2), 2 + y, 1, 1, '#7ae582');
      }
      rect(c, 3, 8, 8, 1, '#7ae582');
    });

    sprites.uiBack = makeCanvas(function (c) {
      arrow(c, 4, 2, '#ffd166');
    });

    sprites.uiHelp = makeCanvas(function (c) {
      rect(c, 5, 2, 6, 1, '#9fd4ff');
      rect(c, 9, 3, 2, 2, '#9fd4ff');
      rect(c, 7, 5, 2, 2, '#9fd4ff');
      rect(c, 7, 8, 2, 5, '#9fd4ff');
      px(c, 7, 6, '#d8ecff');
      px(c, 7, 13, '#9fd4ff');
      px(c, 4, 12, '#9fd4ff');
    });

    sprites.uiInventory = makeCanvas(function (c) {
      rect(c, 3, 5, 10, 9, '#8b6040');
      rect(c, 4, 6, 8, 7, '#c9a86a');
      rect(c, 5, 3, 6, 2, '#8b6040');
      rect(c, 6, 8, 4, 3, '#604020');
      px(c, 5, 3, '#c9a86a');
      px(c, 10, 12, '#604020');
    });

    sprites.uiSoundOn = makeCanvas(function (c) {
      rect(c, 2, 6, 3, 4, '#e8e0f0');
      rect(c, 5, 4, 2, 8, '#e8e0f0');
      rect(c, 7, 2, 2, 12, '#e8e0f0');
      rect(c, 10, 5, 2, 6, '#7ae582');
      rect(c, 9, 3, 1, 10, '#7ae582');
      px(c, 12, 7, '#7ae582');
    });

    sprites.uiSoundOff = makeCanvas(function (c) {
      rect(c, 2, 6, 3, 4, '#e8e0f0');
      rect(c, 5, 4, 2, 8, '#e8e0f0');
      rect(c, 7, 2, 2, 12, '#e8e0f0');
      for (var i = 0; i < 6; i++) {
        px(c, 10 + i, 4 + i, '#ff8a80');
        px(c, 15 - i, 4 + i, '#ff8a80');
      }
    });

    sprites.uiView = makeCanvas(function (c) {
      rect(c, 3, 6, 10, 4, '#ffd166');
      rect(c, 5, 4, 6, 8, '#ffd166');
      rect(c, 7, 6, 2, 4, '#3a3550');
      px(c, 7, 7, '#c8f8ff');
      px(c, 3, 7, '#ffe9a8');
      px(c, 12, 7, '#ffe9a8');
    });

    sprites.uiRest = makeCanvas(function (c) {
      rect(c, 4, 3, 8, 1, '#c9a0ff');
      rect(c, 4, 12, 8, 1, '#c9a0ff');
      rect(c, 7, 4, 2, 8, '#c9a0ff');
      rect(c, 5, 6, 6, 4, '#8b5fd0');
      px(c, 6, 7, '#e0c8ff');
    });

    sprites.uiShop = makeCanvas(function (c) {
      rect(c, 2, 5, 12, 8, '#c9a86a');
      rect(c, 3, 6, 10, 6, '#e0c48a');
      rect(c, 6, 3, 4, 2, '#8b6040');
      px(c, 5, 8, '#8b6040');
      px(c, 8, 8, '#8b6040');
      px(c, 11, 8, '#8b6040');
      rect(c, 3, 13, 10, 1, '#8b6040');
    });

    sprites.uiDebug = makeCanvas(function (c) {
      rect(c, 3, 3, 10, 3, '#c0c8d8');
      rect(c, 3, 6, 4, 3, '#c0c8d8');
      rect(c, 9, 6, 4, 3, '#c0c8d8');
      rect(c, 6, 9, 4, 4, '#9098a8');
      rect(c, 7, 13, 2, 2, '#ffd166');
    });

    sprites.uiRoom = makeCanvas(function (c) {
      rect(c, 2, 4, 5, 5, '#7ae582');
      rect(c, 9, 4, 5, 5, '#7ae582');
      rect(c, 7, 6, 2, 2, '#c0c8d8');
      rect(c, 3, 10, 10, 4, '#4a9c62');
      px(c, 4, 5, '#c8ffd8');
    });

    sprites.uiLan = makeCanvas(function (c) {
      rect(c, 2, 8, 12, 3, '#5a4a6a');
      rect(c, 3, 5, 10, 3, '#8b7aa8');
      px(c, 5, 6, '#ffd166');
      px(c, 10, 6, '#ffd166');
      rect(c, 4, 12, 2, 2, '#c0c8d8');
      rect(c, 10, 12, 2, 2, '#c0c8d8');
    });

    sprites.uiLog = makeCanvas(function (c) {
      rect(c, 2, 2, 12, 12, '#f4e7c5');
      rect(c, 2, 2, 12, 1, '#c9b88a');
      rect(c, 2, 13, 12, 1, '#c9b88a');
      for (var i = 0; i < 3; i++) rect(c, 4, 5 + i * 3, 8, 1, '#6a5a7a');
      rect(c, 4, 4, 5, 1, '#6a5a7a');
    });

    sprites.uiSkill = makeCanvas(function (c) {
      for (var i = 0; i < 4; i++) {
        px(c, 8 + i, 2 + i, '#ffd166');
        px(c, 7 - i, 2 + i, '#ffd166');
        px(c, 8 + i, 13 - i, '#ffd166');
        px(c, 7 - i, 13 - i, '#ffd166');
      }
      rect(c, 6, 6, 4, 4, '#ffe9a8');
      rect(c, 7, 7, 2, 2, '#fff8dc');
    });

    sprites.uiCamp = makeCanvas(function (c) {
      // Поленья крест-накрест внизу, пламя по центру.
      rect(c, 3, 11, 4, 2, '#8b5a2b');
      rect(c, 9, 11, 4, 2, '#8b5a2b');
      rect(c, 4, 12, 3, 2, '#6b4423');
      rect(c, 7, 6, 2, 5, '#ff9d2e');
      rect(c, 6, 8, 4, 3, '#ff9d2e');
      rect(c, 7, 3, 2, 3, '#ffd166');
      px(c, 7, 5, '#ffe9a8');
      px(c, 6, 9, '#ffe9a8');
      px(c, 9, 9, '#ffe9a8');
    });

    sprites.uiSend = makeCanvas(function (c) {
      for (var i = 0; i < 10; i++) {
        rect(c, 3 + i, 3 + i, 1, 1, '#9fd4ff');
      }
      rect(c, 3, 8, 6, 1, '#9fd4ff');
      for (var j = 0; j < 6; j++) px(c, 5 + j, 7 + j, '#9fd4ff');
      px(c, 3, 4, '#d8ecff');
    });

    sprites.uiBuy = makeCanvas(function (c) {
      rect(c, 3, 3, 2, 10, '#c9a86a');
      rect(c, 5, 5, 8, 1, '#c9a86a');
      rect(c, 5, 9, 8, 1, '#c9a86a');
      rect(c, 5, 13, 8, 1, '#c9a86a');
      px(c, 12, 2, '#ffd166');
    });

    sprites.uiEquip = makeCanvas(function (c) {
      rect(c, 4, 3, 8, 10, '#4a78b8');
      rect(c, 5, 4, 6, 8, '#7eb8ff');
      rect(c, 6, 8, 4, 1, '#2a5080');
      px(c, 7, 6, '#e8f4ff');
    });

    sprites.uiTrash = makeCanvas(function (c) {
      rect(c, 4, 2, 8, 2, '#c0c8d8');
      rect(c, 6, 4, 4, 10, '#9098a8');
      rect(c, 7, 6, 1, 6, '#5a6270');
      rect(c, 9, 6, 1, 6, '#5a6270');
    });

    sprites.uiUpgrade = makeCanvas(function (c) {
      arrow(c, 4, 2, '#7ae582');
    });

    sprites.uiQuest = makeCanvas(function (c) {
      rect(c, 3, 2, 2, 12, '#8b6040');
      rect(c, 5, 3, 8, 5, '#e04058');
      rect(c, 5, 4, 8, 1, '#ff8090');
      px(c, 12, 1, '#ffd166');
    });

    sprites.uiHp = makeCanvas(function (c) {
      rect(c, 6, 3, 4, 10, '#e04058');
      rect(c, 3, 6, 10, 4, '#e04058');
      px(c, 5, 4, '#ff8090');
    });

    sprites.uiXp = makeCanvas(function (c) {
      rect(c, 7, 2, 2, 12, '#58a858');
      rect(c, 2, 7, 12, 2, '#58a858');
      rect(c, 5, 5, 6, 6, '#7ac87a');
      px(c, 7, 7, '#d8ffd0');
    });

    sprites.uiGold = makeCanvas(function (c) {
      rect(c, 5, 9, 6, 3, '#b8860b');
      px(c, 6, 8, '#ffd166');
      px(c, 8, 7, '#ffe080');
      px(c, 9, 9, '#ffd166');
    });

    sprites.uiKey = sprites.key;

sprites.uiGem = makeCanvas(function (c) {
      for (var i = 0; i < 6; i++) px(c, 4 + i, 3 + i, '#65aaff');
      for (var j = 0; j < 6; j++) px(c, 11 - j, 3 + j, '#65aaff');
      rect(c, 5, 8, 6, 4, '#65aaff');
      px(c, 6, 9, '#c9e6ff');
      px(c, 9, 5, '#c9e6ff');
    });

    sprites.uiTag = makeCanvas(function (c) {
      rect(c, 2, 5, 8, 6, '#c9a86a');
      rect(c, 2, 5, 2, 6, '#e0c48a');
      px(c, 4, 7, '#604020');
      rect(c, 10, 6, 2, 4, '#8b6040');
      rect(c, 12, 7, 2, 2, '#8b6040');
    });

    sprites.uiList = makeCanvas(function (c) {
      rect(c, 2, 3, 4, 2, '#9fd4ff');
      rect(c, 7, 3, 7, 2, '#5a6a8a');
      rect(c, 2, 7, 4, 2, '#9fd4ff');
      rect(c, 7, 7, 7, 2, '#5a6a8a');
      rect(c, 2, 11, 4, 2, '#9fd4ff');
      rect(c, 7, 11, 7, 2, '#5a6a8a');
    });
  }

  // Спрайты, которых нет во внешнем атласе KENNEY_MAP: при его загрузке они
// достраиваются встроенными. Список обязательно включает спрайты ловушек —
  // render.js обращается к ним без запасной отрисовки.
  // Иконки кнопок. Список отдельно от BUILTIN_ONLY_SPRITES, потому что по
  // нему ui.js проверяет, что иконка для каждой кнопки нарисовалась.
  var UI_ICON_SPRITES = [
    'uiPlay', 'uiBack', 'uiHelp', 'uiInventory', 'uiSoundOn', 'uiSoundOff',
    'uiView', 'uiRest', 'uiShop', 'uiDebug', 'uiRoom', 'uiLan', 'uiLog',
    'uiSkill', 'uiSend', 'uiBuy', 'uiEquip', 'uiTrash', 'uiUpgrade', 'uiQuest',
    'uiCamp',
    'uiHp', 'uiXp', 'uiGold', 'uiKey', 'uiGem', 'uiTag', 'uiList',
  ];
  var BUILTIN_ONLY_SPRITES = [
    'shield', 'boots', 'sword', 'axe', 'spear', 'bow', 'crossbow', 'key', 'helmet', 'head', 'armor', 'ring', 'amulet',
    'torch', 'torchFlame',
    'trapSpike', 'trapNeedle', 'trapFlame', 'trapDisarmed', 'trapTriggered',
    'decorStone', 'decorGrass', 'decorMoss', 'decorMushroom', 'decorPuddle', 'decorLake',
    'decorStream', 'decorTree', 'decorPine', 'decorBush', 'decorCactus', 'decorSand',
    'decorCoffin', 'decorCross', 'decorBones',
    'blacksmith',
    'boss_slime', 'boss_rat', 'boss_bone', 'boss_archer', 'boss_bat',
    'boss_brute', 'boss_witch', 'boss_knight', 'boss_demon', 'boss_lich',
    'wolf', 'spider', 'eagle', 'goat', 'scorpion', 'mummy',
    'cultist', 'zombie', 'ghost', 'ghoul', 'golem', 'croc',
  ].concat(UI_ICON_SPRITES);

  function ensureExtraSprites() {
    var tmp = {};
    var saved = sprites;
    sprites = tmp;
    buildBuiltin();
    for (var i = 0; i < BUILTIN_ONLY_SPRITES.length; i++) {
      var k = BUILTIN_ONLY_SPRITES[i];
      if (!saved[k] && tmp[k]) saved[k] = tmp[k];
    }
    sprites = saved;
  }

  function floorGrayAmount(floor) {
    var maxF = (RK.CONFIG && RK.CONFIG.MAX_FLOOR) ? RK.CONFIG.MAX_FLOOR : 10;
    var t = Math.max(0, Math.min(1, ((floor || 1) - 1) / Math.max(1, maxF - 1)));
    return t;
  }

  function copySprite(sprite, darkness) {
    var cv = makeCanvas(function (c) {
      c.drawImage(sprite, 0, 0, SPR, SPR);
      c.fillStyle = 'rgba(8, 7, 16, ' + darkness + ')';
      c.fillRect(0, 0, SPR, SPR);
    });
    return cv;
  }

  function buildFloorLayouts(done, useExternal, currentLoadId) {
    var baseSprites = sprites;
    floorLayouts = {
      dark: {
        floor: copySprite(baseSprites.floor, 0.22),
        floorDim: copySprite(baseSprites.floorDim, 0.22),
        wall: copySprite(baseSprites.wall, 0.22),
        wallDim: copySprite(baseSprites.wallDim, 0.22),
      },
      deep: {
        floor: copySprite(baseSprites.floor, 0.42),
        floorDim: copySprite(baseSprites.floorDim, 0.42),
        wall: copySprite(baseSprites.wall, 0.42),
        wallDim: copySprite(baseSprites.wallDim, 0.42),
      },
    };

    if (!useExternal) {
      if (done) done();
      return;
    }

    var pending = 4;
    function loaded(layout, tile, image) {
      if (currentLoadId !== loadId) return;
      var cv = makeCanvas(function (c) {
        c.drawImage(image, 0, 0, SPR, SPR, 0, 0, SPR, SPR);
      });
      floorLayouts[layout][tile] = cv;
      var dim = tile + 'Dim';
      floorLayouts[layout][dim] = copySprite(cv, layout === 'deep' ? 0.22 : 0.12);
      pending--;
      if (!pending && done) done();
    }
    function failed() {
      if (currentLoadId !== loadId) return;
      pending--;
      if (!pending && done) done();
    }
    var files = [
      ['dark', 'floor', 'assets/floor-dark.png'],
      ['dark', 'wall', 'assets/wall-dark.png'],
      ['deep', 'floor', 'assets/floor-deep.png'],
      ['deep', 'wall', 'assets/wall-deep.png'],
    ];
    for (var i = 0; i < files.length; i++) {
      (function (file) {
        var image = new Image();
        image.onload = function () {
          if (currentLoadId !== loadId) return;
          if (image.width >= SPR && image.height >= SPR) {
            loaded(file[0], file[1], image);
          } else {
            failed();
          }
        };
        image.onerror = failed;
        image.src = file[2];
      })(files[i]);
    }
  }

  function drawFloorTile(ctx, floor, tile, visible, explored, dx, dy, size) {
    var layout = floor >= 7 ? floorLayouts.deep : (floor >= 4 ? floorLayouts.dark : null);
    var name = tile === 1 ? (visible ? 'floor' : (explored ? 'floorDim' : 'fog')) :
      (visible ? 'wall' : (explored ? 'wallDim' : 'fog'));
    var sprite = layout && layout[name] ? layout[name] : sprites[name];
    if (!sprite) sprite = sprites.floor;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sprite, dx, dy, size, size);
    if (layout && name !== 'fog') {
      var gradient = floor >= 7 ? ((floor - 7) / 3) * 0.16 : ((floor - 4) / 2) * 0.12;
      if (gradient > 0) {
        ctx.fillStyle = 'rgba(8, 7, 16, ' + gradient.toFixed(3) + ')';
        ctx.fillRect(dx, dy, size, size);
      }
    }
  }

  function sliceSheet(img, map) {
    var out = {};
    var cols = Math.floor(img.width / SPR);
    for (var key in map) {
      var idx = map[key];
      var sx = (idx % cols) * SPR;
      var sy = Math.floor(idx / cols) * SPR;
      if (sx + SPR > img.width || sy + SPR > img.height) continue;
      var cv = makeCanvas(function (c) {
        c.drawImage(img, sx, sy, SPR, SPR, 0, 0, SPR, SPR);
      });
      out[key] = cv;
    }
    return out;
  }

  function tryLoadExternal(path, map, done, currentLoadId) {
    var img = new Image();
    img.onload = function () {
      if (currentLoadId !== loadId) return;
      var externalSprites = sliceSheet(img, map);
      var loadedAny = false;
      for (var key in externalSprites) {
        sprites[key] = externalSprites[key];
        loadedAny = true;
      }
      if (loadedAny) {
        sheet = img;
        source = path;
      }
      done(loadedAny);
    };
    img.onerror = function () {
      if (currentLoadId !== loadId) return;
      done(false);
    };
    img.src = path;
  }

  var KENNEY_MAP = {
    floor: 0,
    wall: 1,
    floorDim: 2,
    wallDim: 3,
    stairs: 4,
    player: 5,
    slime: 6,
    rat: 7,
    skeleton: 8,
    archer: 9,
    bat: 10,
    demon: 11,
    boss: 12,
    gold: 13,
    potion: 14,
    sword: 15,
    fog: 16,
    key: 17,
    merchant: 18,
    door: 19,
    chest: 20,
    torch: 21,
    torchFlame: 22,
    shield: 23,
    boots: 24,
    ring: 25,
    amulet: 26,
    head: 27,
    armor: 28,
    boss_slime: 29,
    boss_rat: 30,
    boss_bone: 31,
    boss_archer: 32,
    boss_bat: 33,
    boss_brute: 34,
    boss_witch: 35,
    boss_knight: 36,
    boss_demon: 37,
    boss_lich: 38,
    blacksmith: 39,
    axe: 40,
    spear: 41,
    slime_enhanced: 6,
    rat_enhanced: 7,
    skeleton_enhanced: 8,
    archer_enhanced: 9,
    bat_enhanced: 10,
    demon_enhanced: 11,
  };

  function loadAssets(useExternal, done) {
    var currentLoadId = ++loadId;
    sprites = {};
    floorLayouts = {};
    sheet = null;
    source = 'builtin';
    enabled = useExternal;
    buildBuiltin();
    buildUiIcons();
    function finish(loadedExternal) {
      if (currentLoadId !== loadId) return;
      ensureExtraSprites();
      buildFloorLayouts(function () {
        if (currentLoadId === loadId && done) done(loadedExternal);
      }, useExternal, currentLoadId);
    }
    if (!useExternal) {
      finish(false);
      return;
    }
    tryLoadExternal('assets/tiny-dungeon.png', KENNEY_MAP, function (ok) {
      if (!ok) {
        tryLoadExternal('assets/spritesheet.png', KENNEY_MAP, function (ok2) {
          finish(ok2);
        }, currentLoadId);
      } else {
        finish(true);
      }
    }, currentLoadId);
  }

  function readEnabledPreference() {
    try {
      return localStorage.getItem(SETTINGS_KEY) !== 'false';
    } catch (e) {
      return true;
    }
  }

  function init(done) {
    loadAssets(readEnabledPreference(), done);
  }

  function setEnabled(value, done) {
    enabled = !!value;
    var error = null;
    try {
      localStorage.setItem(SETTINGS_KEY, enabled ? 'true' : 'false');
    } catch (e) {
      error = e;
    }
    loadAssets(enabled, function (loadedExternal) {
      if (done) done(error, loadedExternal);
    });
  }

  function draw(ctx, name, dx, dy, size) {
    var s = sprites[name];
    if (!s) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s, dx, dy, size, size);
    return true;
  }

  function ready() {
    return !!sprites.floor;
  }

  // Какие спрайты render.js обязан получить даже при внешнем атласе. Экспортируется,
// чтобы тест ловил случай, когда новый спрайт забыли добавить в список.
  function builtinFallbackNames() {
    return BUILTIN_ONLY_SPRITES.slice();
  }

  function iconNames() {
    return UI_ICON_SPRITES.slice();
  }

  RK.Assets = {
    SPRITE: SPR,
    init: init,
    setEnabled: setEnabled,
    enabled: function () { return enabled; },
    ready: ready,
    draw: draw,
    drawFloorTile: drawFloorTile,
    floorGrayAmount: floorGrayAmount,
    builtinFallbackNames: builtinFallbackNames,
    iconNames: iconNames,
    spriteNames: function () { return Object.keys(sprites); },
    source: function () { return source; },
  };
})();
