// Декорации локации: деревья, камни, озёра и ручьи.
(function () {

  function placeDecorations(g, occupied) {
    var profile = RK.MapBase.locationProfile(g.locationType);
    var random = RK.MapBase.seededRandom(g.seed, 0xa511e9b3);

    var blocked = {};
    var groups = [g.doors, g.chests, g.traps, g.torches, occupied];
    for (var gi = 0; gi < groups.length; gi++) {
      var group = groups[gi] || [];
      for (var oi = 0; oi < group.length; oi++) {
        if (group[oi] && group[oi].x != null && group[oi].y != null) {
          blocked[group[oi].x + ',' + group[oi].y] = true;
        }
      }
    }

    var candidates = [];
    for (var y = 0; y < g.h; y++) {
      for (var x = 0; x < g.w; x++) {
        if (g.tiles[y][x] !== 1 || blocked[x + ',' + y]) continue;
        if (RK.Pathfind.manhattan(x, y, g.spawn.x, g.spawn.y) < 3) continue;
        // У города лестницы нет: отступать от неё не нужно.
        if (g.stair && RK.Pathfind.manhattan(x, y, g.stair.x, g.stair.y) < 2) continue;
        if (g.tavern && RK.MapObjects.isInTavern(g, x, y)) continue;
        candidates.push({ x: x, y: y });
      }
    }

    function opennessAt(x, y) {
      var count = 0;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          var nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < g.w && ny < g.h && g.tiles[ny][nx] === 1) count++;
        }
      }
      return count;
    }

    for (var ci = 0; ci < candidates.length; ci++) {
      candidates[ci].openness = opennessAt(candidates[ci].x, candidates[ci].y);
    }

    for (var ci = candidates.length - 1; ci > 0; ci--) {
      var swapIndex = Math.floor(random() * (ci + 1));
      var candidate = candidates[ci];
      candidates[ci] = candidates[swapIndex];
      candidates[swapIndex] = candidate;
    }

    // Набор декораций задаёт профиль локации: в лесу деревья, в склепе гробы.
    var types = profile.decor.slice();
    for (var ti = types.length - 1; ti > 0; ti--) {
      var typeSwapIndex = Math.floor(random() * (ti + 1));
      var type = types[ti];
      types[ti] = types[typeSwapIndex];
      types[typeSwapIndex] = type;
    }

    var decorations = [];
    var available = {};
    var pointByKey = {};
    for (var ai = 0; ai < candidates.length; ai++) {
      var point = candidates[ai];
      var pointKey = point.x + ',' + point.y;
      available[pointKey] = true;
      pointByKey[pointKey] = point;
    }

    function addDecoration(point, asset, extra) {
      var key = point.x + ',' + point.y;
      if (!available[key]) return false;
      delete available[key];
      var decoration = {
        x: point.x,
        y: point.y,
        asset: asset,
      };
      if (extra) {
        for (var name in extra) {
          if (Object.prototype.hasOwnProperty.call(extra, name)) decoration[name] = extra[name];
        }
      }
      decorations.push(decoration);
      return true;
    }

    // Плотность и состав декораций — из профиля; запасной набор для станет лишним.
    var regularTarget = Math.min(candidates.length,
      Math.max(types.length, Math.round(candidates.length * profile.decorDensity)));
    for (var di = 0; di < regularTarget; di++) {
      addDecoration(candidates[di], types[di % types.length]);
    }

    function adjacent4(point) {
      return [
        { x: point.x + 1, y: point.y },
        { x: point.x - 1, y: point.y },
        { x: point.x, y: point.y + 1 },
        { x: point.x, y: point.y - 1 },
      ];
    }

    var lakeSize = g.style === 'cave' ? 5 + Math.floor(random() * 4) : 4 + Math.floor(random() * 4);
    var lakeCells = [];
    // Озеро и ручей — только там, где вода уместна: в пустыне и склепе их нет.
    if (profile.water && candidates.length > regularTarget) {
      var lakeCandidates = [];
      var totalOpenness = 0;
      for (var ci = 0; ci < candidates.length; ci++) {
        var cand = candidates[ci];
        if (available[cand.x + ',' + cand.y]) {
          var weight = cand.openness || 1;
          lakeCandidates.push(cand);
          totalOpenness += weight;
        }
      }
      var lakeStart = null;
      if (lakeCandidates.length > 0 && totalOpenness > 0) {
        var r = random() * totalOpenness;
        var acc = 0;
        for (var li = 0; li < lakeCandidates.length; li++) {
          acc += lakeCandidates[li].openness || 1;
          if (r <= acc) {
            lakeStart = lakeCandidates[li];
            break;
          }
        }
      }
      if (lakeStart) {
        lakeCells.push(lakeStart);
        var lakeKeys = {};
        lakeKeys[lakeStart.x + ',' + lakeStart.y] = true;
        while (lakeCells.length < lakeSize) {
          var frontier = [];
          var frontierKeys = {};
          for (var lc = 0; lc < lakeCells.length; lc++) {
            var neighbors = adjacent4(lakeCells[lc]);
            for (var ln = 0; ln < neighbors.length; ln++) {
              var neighborKey = neighbors[ln].x + ',' + neighbors[ln].y;
              if (available[neighborKey] && !lakeKeys[neighborKey] && !frontierKeys[neighborKey]) {
                frontierKeys[neighborKey] = true;
                frontier.push(pointByKey[neighborKey]);
              }
            }
          }
          if (!frontier.length) break;
          var totalFrontierOpen = 0;
          for (var fi = 0; fi < frontier.length; fi++) {
            totalFrontierOpen += frontier[fi].openness || 1;
          }
          var lakePoint;
          if (totalFrontierOpen > 0) {
            var rf = random() * totalFrontierOpen;
            var accf = 0;
            for (var fi = 0; fi < frontier.length; fi++) {
              accf += frontier[fi].openness || 1;
              if (rf <= accf) {
                lakePoint = frontier[fi];
                break;
              }
            }
          } else {
            lakePoint = frontier[Math.floor(random() * frontier.length)];
          }
          lakeCells.push(lakePoint);
          lakeKeys[lakePoint.x + ',' + lakePoint.y] = true;
        }

        // Try to merge nearby available clusters into single connected body
        if (lakeCells.length < lakeSize * 1.5) {
          var merged = false;
          for (var ma = 0; ma < 6 && !merged; ma++) {
            var bestA = null;
            var bestB = null;
            var bestDist = 9999;
            for (var la = 0; la < lakeCells.length; la++) {
              for (var lb = 0; lb < lakeCells.length; lb++) {
                if (la === lb) continue;
                var d = Math.max(Math.abs(lakeCells[la].x - lakeCells[lb].x), Math.abs(lakeCells[la].y - lakeCells[lb].y));
                if (d < bestDist && d >= 2 && d <= 3) {
                  bestDist = d;
                  bestA = lakeCells[la];
                  bestB = lakeCells[lb];
                }
              }
            }
            if (!bestA || !bestB) break;
            var stepCount = bestDist;
            var sx = bestA.x;
            var sy = bestA.y;
            var tx = bestB.x;
            var ty = bestB.y;
            var dxStep = (tx - sx) / stepCount;
            var dyStep = (ty - sy) / stepCount;
            var pathBridge = [];
            for (var st = 1; st < stepCount; st++) {
              var bx = Math.round(sx + dxStep * st);
              var by = Math.round(sy + dyStep * st);
              var bkey = bx + ',' + by;
              if (available[bkey] && !lakeKeys[bkey]) {
                pathBridge.push(pointByKey[bkey]);
              }
            }
            if (pathBridge.length > 0) {
              for (var pb = 0; pb < pathBridge.length; pb++) {
                var pk = pathBridge[pb].x + ',' + pathBridge[pb].y;
                lakeCells.push(pathBridge[pb]);
                lakeKeys[pk] = true;
                if (lakeCells.length >= lakeSize + 2) break;
              }
              merged = true;
            } else {
              break;
            }
          }
        }

        for (var li = 0; li < lakeCells.length; li++) {
          addDecoration(lakeCells[li], 'decorLake', { waterPhase: random() * Math.PI * 2 });
        }
      }
    }

    var streamSize = g.style === 'cave' ? 10 + Math.floor(random() * 4) : 8 + Math.floor(random() * 4);
    var bestStream = [];
    var streamAttempts = profile.water ? Math.min(20, candidates.length) : 0;
    var directions4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];

    // Возвращает индекс направления в directions4. Ненормированные направления
    // (их даёт «волна», прибавляющая единицу к координате) дают 0 — как и
    // раньше; нормализовать их здесь нельзя, это меняет форму потоков.
    function dir4ToIndex(dx, dy) {
      if (dx === 1 && dy === 0) return 0;
      if (dx === 0 && dy === 1) return 1;
      if (dx === -1 && dy === 0) return 2;
      if (dx === 0 && dy === -1) return 3;
      return 0;
    }

    for (var sa = 0; sa < streamAttempts && bestStream.length < streamSize; sa++) {
      var streamCandidates = [];
      var totalStreamOpen = 0;
      for (var ci = 0; ci < candidates.length; ci++) {
        var cand = candidates[ci];
        var ck = cand.x + ',' + cand.y;
        if (available[ck]) {
          var weight = cand.openness || 1;
          streamCandidates.push(cand);
          totalStreamOpen += weight;
        }
      }
      var streamStart = null;
      if (streamCandidates.length > 0 && totalStreamOpen > 0) {
        var r = random() * totalStreamOpen;
        var acc = 0;
        for (var si = 0; si < streamCandidates.length; si++) {
          acc += streamCandidates[si].openness || 1;
          if (r <= acc) {
            streamStart = streamCandidates[si];
            break;
          }
        }
      }
      if (!streamStart) continue;
      var skStart = streamStart.x + ',' + streamStart.y;
      if (!available[skStart]) continue;
      var path = [streamStart];
      var used = {};
      used[skStart] = true;

      var curDir = directions4[Math.floor(random() * 4)];
      var dirIdx = dir4ToIndex(curDir[0], curDir[1]);

      var steps = 0;
      while (path.length < streamSize && steps < streamSize * 2) {
        steps++;
        var prev = path[path.length - 1];

        var dirChoices = [];
        dirChoices.push([curDir[0], curDir[1]]);

        // gentle turns
        if (random() < 0.35) dirChoices.push([directions4[(dirIdx + 1) % 4][0], directions4[(dirIdx + 1) % 4][1]]);
        if (random() < 0.35) dirChoices.push([directions4[(dirIdx + 3) % 4][0], directions4[(dirIdx + 3) % 4][1]]);

        // occasional sharper curve
        if (random() < 0.25) dirChoices.push([directions4[(dirIdx + 2) % 4][0], directions4[(dirIdx + 2) % 4][1]]);

        // wave bias
        if (random() < 0.4) dirChoices.push([curDir[0] + (random() < 0.5 ? 1 : -1), curDir[1]]);
        if (random() < 0.4) dirChoices.push([curDir[0], curDir[1] + (random() < 0.5 ? 1 : -1)]);

        dirChoices.push([prev.x < g.w / 2 ? 1 : -1, 0]);
        dirChoices.push([0, prev.y < g.h / 2 ? 1 : -1]);

        var candidatesNext = [];
        for (var dc = 0; dc < dirChoices.length; dc++) {
          var dd = dirChoices[dc];
          for (var stepLen = 1; stepLen <= 2; stepLen++) {
            var nx = prev.x + dd[0] * stepLen;
            var ny = prev.y + dd[1] * stepLen;
            if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
            var nk = nx + ',' + ny;
            if (available[nk] && !used[nk]) {
              var distFromLast = Math.abs(nx - prev.x) + Math.abs(ny - prev.y);
              if (distFromLast > 2) continue;
              var cand = pointByKey[nk];
              var weight = (cand && cand.openness) ? cand.openness : 1;
              candidatesNext.push({ x: nx, y: ny, dx: dd[0], dy: dd[1], d: distFromLast, weight: weight });
            }
          }
        }

        if (candidatesNext.length === 0) {
          // try to find any adjacent available not used
          for (var dyc = -1; dyc <= 1; dyc++) {
            for (var dxc = -1; dxc <= 1; dxc++) {
              if (dxc === 0 && dyc === 0) continue;
              var nnx = prev.x + dxc;
              var nny = prev.y + dyc;
              if (nnx < 0 || nny < 0 || nnx >= g.w || nny >= g.h) continue;
              var nnk = nnx + ',' + nny;
              if (available[nnk] && !used[nnk]) {
                candidatesNext.push({ x: nnx, y: nny, dx: dxc, dy: dyc, d: 1 });
              }
            }
          }
        }

        if (candidatesNext.length === 0) break;
        var totalWeight = 0;
        for (var cn = 0; cn < candidatesNext.length; cn++) {
          totalWeight += candidatesNext[cn].weight || 1;
        }
        var chosen;
        if (totalWeight > 0) {
          var r = random() * totalWeight;
          var acc = 0;
          for (var cn = 0; cn < candidatesNext.length; cn++) {
            acc += candidatesNext[cn].weight || 1;
            if (r <= acc) {
              chosen = candidatesNext[cn];
              break;
            }
          }
        } else {
          chosen = candidatesNext[Math.floor(random() * candidatesNext.length)];
        }
        path.push({ x: chosen.x, y: chosen.y });
        used[chosen.x + ',' + chosen.y] = true;
        var ndir = chosen.dx !== 0 || chosen.dy !== 0 ? [chosen.dx, chosen.dy] : curDir;
        curDir = ndir;
        // Повороты следующего шага отсчитываются от направления, в которое
        // поток пошёл сейчас, а не от того, с чего он начался.
        dirIdx = dir4ToIndex(curDir[0], curDir[1]);
      }

      if (path.length > bestStream.length) bestStream = path;
    }

    for (var si = 0; si < bestStream.length; si++) {
      addDecoration(bestStream[si], 'decorStream', { flowIndex: si });
    }

    return decorations;
  }

  RK.MapDecor = {
    placeDecorations: placeDecorations,
  };
})();
