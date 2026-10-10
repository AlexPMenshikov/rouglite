(function () {
  var SPR = 16;
  var sprites = {};
  var floorLayouts = {};
  var sheet = null;
  var source = 'builtin';

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

    sprites.head = sprites.helmet;
    sprites.armor = sprites.shield;

    sprites.fog = makeCanvas(function (c) {
      rect(c, 0, 0, 16, 16, '#0a0810');
    });
  }

  function ensureExtraSprites() {
    var tmp = {};
    var saved = sprites;
    sprites = tmp;
    buildBuiltin();
    var extras = [
      'shield', 'boots', 'sword', 'key', 'helmet', 'head', 'armor', 'ring', 'amulet',
      'torch', 'torchFlame',
      'boss_slime', 'boss_rat', 'boss_bone', 'boss_archer', 'boss_bat',
      'boss_brute', 'boss_witch', 'boss_knight', 'boss_demon', 'boss_lich',
    ];
    for (var i = 0; i < extras.length; i++) {
      var k = extras[i];
      if (!saved[k]) saved[k] = tmp[k];
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

  function buildFloorLayouts(done) {
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

    var pending = 4;
    function loaded(layout, tile, image) {
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

  function tryLoadExternal(path, map, done) {
    var img = new Image();
    img.onload = function () {
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
  };

  function init(done) {
    buildBuiltin();
    tryLoadExternal('assets/tiny-dungeon.png', KENNEY_MAP, function (ok) {
      if (!ok) {
        tryLoadExternal('assets/spritesheet.png', KENNEY_MAP, function (ok2) {
          ensureExtraSprites();
          buildFloorLayouts(function () {
            if (done) done(ok2);
          });
        });
      } else {
        ensureExtraSprites();
        buildFloorLayouts(function () {
          if (done) done(true);
        });
      }
    });
  }

  function draw(ctx, name, dx, dy, size) {
    var s = sprites[name] || sprites.floor;
    if (!s) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s, dx, dy, size, size);
  }

  function ready() {
    return !!sprites.floor;
  }

  RK.Assets = {
    SPRITE: SPR,
    init: init,
    ready: ready,
    draw: draw,
    drawFloorTile: drawFloorTile,
    floorGrayAmount: floorGrayAmount,
    source: function () { return source; },
  };
})();
