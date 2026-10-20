// Кодек матриц карты: снимок сжимает геометрию, а разворачивает её клиент.
(function () {

  // Матрицы карты в снимке жмутся run-length: пара [значение, длина] на
  // серию одинаковых клеток. tiles, regions и explored сжимаются в разы,
  // поэтому снимок на каждый шаг перестаёт весить десятки килобайт.
  // wallTypes не кодируется: стены чередуются почти везде и RLE раздувает поле.
  var MATRIX_FIELDS = ['tiles', 'floorTypes', 'regions', 'explored'];

  // Поля карты, которые меняет игра: разлитая кровь, положенные ловушки,
  // открытые двери и сундуки, зоны событий. Исследованное уходит отдельно.
  // Список обязан быть полным: забытое здесь поле осталось бы в неизменной
  // части, и клиент получил бы старое значение.
  var MAP_STATE_FIELDS = ['blood', 'traps', 'doors', 'chests', 'zones'];

  // Геометрия и постройки: в забеге они не меняются и едут один раз на локацию.
  // Новое поле карты обязано попасть в один из списков — проверяет тест.
  var MAP_STATIC_FIELDS = [
    'w', 'h', 'style', 'seed', 'floor',
    'wallTypes', 'regionStyles', 'rooms', 'stair', 'spawn',
    'buildings', 'decorations', 'torches', 'tavern', 'exits', 'pois', 'roads',
    'locationId', 'locationName', 'locationType',
  ];
  function encodeMatrix(matrix) {
    var encoded = [];
    for (var y = 0; y < matrix.length; y++) {
      var row = matrix[y];
      var runs = [];
      var value = row[0];
      var length = 1;
      for (var x = 1; x <= row.length; x++) {
        if (x < row.length && row[x] === value) {
          length++;
          continue;
        }
        runs.push(value, length);
        value = row[x];
        length = 1;
      }
      encoded.push(runs);
    }
    return encoded;
  }

  // Строка должна ровно заполнить width клеток: иначе снимок либо раздувает
  // карту, либо оставляет дыры, и рендер читает за границей.
  function decodeMatrix(encoded, width, height) {
    var matrix = [];
    if (!Array.isArray(encoded) || encoded.length !== height) return null;
    for (var y = 0; y < height; y++) {
      var runs = encoded[y];
      if (!Array.isArray(runs) || runs.length % 2 !== 0) return null;
      var row = [];
      for (var i = 0; i < runs.length; i += 2) {
        var value = runs[i];
        var length = runs[i + 1];
        if (typeof value !== 'boolean' && typeof value !== 'number') return null;
        if (!Number.isInteger(length) || length < 1) return null;
        for (var x = 0; x < length; x++) row.push(value);
      }
      if (row.length !== width) return null;
      matrix.push(row);
    }
    return matrix;
  }

  function encodeMatrices(map) {
    var out = {};
    MATRIX_FIELDS.forEach(function (field) {
      if (Array.isArray(map[field])) out[field] = encodeMatrix(map[field]);
    });
    return out;
  }

  function decodeMatrices(encoded, width, height) {
    if (!encoded || typeof encoded !== 'object') return null;
    var out = {};
    for (var i = 0; i < MATRIX_FIELDS.length; i++) {
      var field = MATRIX_FIELDS[i];
      if (!encoded[field]) continue;
      var matrix = decodeMatrix(encoded[field], width, height);
      if (!matrix) return null;
      out[field] = matrix;
    }
    return out;
  }

  RK.MapCodec = {
    MATRIX_FIELDS: MATRIX_FIELDS,
    MAP_STATE_FIELDS: MAP_STATE_FIELDS,
    MAP_STATIC_FIELDS: MAP_STATIC_FIELDS,
    encodeMatrix: encodeMatrix,
    decodeMatrix: decodeMatrix,
    encodeMatrices: encodeMatrices,
    decodeMatrices: decodeMatrices,
  };
})();
