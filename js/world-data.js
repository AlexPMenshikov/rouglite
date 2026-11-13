// Описания локаций и выходов между ними.
(function () {
  function location(id, type, name, style, exits) {
    return { id: id, type: type, name: name, style: style, exits: exits };
  }

  RK.WorldData = {
    LOCATIONS: {
      city_start: location('city_start', 'city', 'Город Арген', 'stone', [
        { id: 'gate_north', x: 32, y: 1, to: 'wilderness_forest', toExit: 'gate_south', label: 'Ворота на север', asset: 'stairs' },
        { id: 'gate_magma', x: 12, y: 1, to: 'dungeon_mountain_deep', toExit: 'city_entrance', label: 'Вход в Магмовые Залы', asset: 'stairs' },
        { id: 'gate_sand_ruins', x: 52, y: 1, to: 'dungeon_desert_ruins', toExit: 'city_entrance', label: 'Вход в Песчаные Руины', asset: 'stairs' },
        { id: 'gate_east', x: 62, y: 32, to: 'wilderness_desert', toExit: 'gate_west', label: 'Ворота на восток', asset: 'stairs' },
        { id: 'gate_west', x: 2, y: 32, to: 'wilderness_mountains', toExit: 'gate_east', label: 'Ворота на запад', asset: 'stairs' },
        { id: 'gate_swamp', x: 20, y: 62, to: 'wilderness_swamp', toExit: 'city_gate', label: 'Дорога к болоту', asset: 'stairs' },
        { id: 'gate_oasis', x: 44, y: 62, to: 'wilderness_oasis', toExit: 'city_gate', label: 'Дорога к оазису', asset: 'stairs' },
        { id: 'gate_treasuries', x: 12, y: 62, to: 'dungeon_desert_deep', toExit: 'city_entrance', label: 'Вход в Запечатанные Сокровищницы', asset: 'stairs' },
        { id: 'sewer_entrance', x: 52, y: 62, to: 'dungeon_sewers', toExit: 'city_entrance', label: 'Вход в канализацию', asset: 'stairs' },
      ]),
      wilderness_forest: location('wilderness_forest', 'wilderness', 'Лес Ворона', 'forest', [
        { id: 'gate_south', x: 32, y: 62, to: 'city_start', toExit: 'gate_north', label: 'Ворота на юг', asset: 'stairs' },
        { id: 'cave_entrance', x: 50, y: 10, to: 'dungeon_crypt', toExit: 'stairs_up', label: 'Вход в склеп', asset: 'stairs' },
        { id: 'swamp_path', x: 8, y: 54, to: 'wilderness_swamp', toExit: 'forest_path', label: 'Тропа к болоту', asset: 'stairs' },
        { id: 'ruins_entrance', x: 58, y: 8, to: 'dungeon_ruins', toExit: 'ruins_exit', label: 'Вход в руины', asset: 'stairs' },
        { id: 'mountain_trail', x: 12, y: 5, to: 'wilderness_mountains', toExit: 'forest_trail', label: 'Тропа в горы', asset: 'stairs' },
      ]),
      dungeon_crypt: location('dungeon_crypt', 'crypt', 'Склеп Тёмного', 'crypt', [
        { id: 'stairs_up', x: 24, y: 1, to: 'wilderness_forest', toExit: 'cave_entrance', label: 'Вход в склеп', asset: 'stairs' },
        { id: 'stairs_down', x: 24, y: 62, to: 'dungeon_crypt_deep', toExit: 'stairs_up', label: 'Нижний ярус', asset: 'stairs' },
      ]),
      dungeon_crypt_deep: location('dungeon_crypt_deep', 'crypt', 'Склеп Тёмного: Глубины', 'crypt', [
        { id: 'stairs_up', x: 26, y: 1, to: 'dungeon_crypt', toExit: 'stairs_down', label: 'Верхний ярус', asset: 'stairs' },
      ]),
      wilderness_swamp: location('wilderness_swamp', 'wilderness', 'Болото Теней', 'fungal', [
        { id: 'forest_path', x: 30, y: 60, to: 'wilderness_forest', toExit: 'swamp_path', label: 'Тропа в лес', asset: 'stairs' },
        { id: 'ruins_path', x: 55, y: 10, to: 'dungeon_ruins', toExit: 'swamp_entrance', label: 'Путь к руинам', asset: 'stairs' },
        { id: 'sewer_entrance', x: 5, y: 32, to: 'dungeon_sewers', toExit: 'swamp_exit', label: 'Вход в канализацию', asset: 'stairs' },
        { id: 'city_gate', x: 30, y: 2, to: 'city_start', toExit: 'gate_swamp', label: 'Дорога в город', asset: 'stairs' },
      ]),
      dungeon_ruins: location('dungeon_ruins', 'ruins', 'Руины Старой Крепости', 'ruins', [
        { id: 'ruins_exit', x: 26, y: 1, to: 'wilderness_forest', toExit: 'ruins_entrance', label: 'Выход в лес', asset: 'stairs' },
        { id: 'swamp_entrance', x: 60, y: 60, to: 'wilderness_swamp', toExit: 'ruins_path', label: 'Выход к болоту', asset: 'stairs' },
        { id: 'sewer_entrance', x: 4, y: 60, to: 'dungeon_sewers', toExit: 'ruins_exit', label: 'Вход в канализацию', asset: 'stairs' },
        { id: 'deep_entrance', x: 26, y: 60, to: 'dungeon_ruins_deep', toExit: 'stairs_up', label: 'Нижний уровень', asset: 'stairs' },
      ]),
      dungeon_ruins_deep: location('dungeon_ruins_deep', 'ruins', 'Руины: Заброшенные Кладовые', 'ruins', [
        { id: 'stairs_up', x: 24, y: 1, to: 'dungeon_ruins', toExit: 'deep_entrance', label: 'Верхний уровень', asset: 'stairs' },
      ]),
      wilderness_mountains: location('wilderness_mountains', 'mountains', 'Горы Ветра', 'mountain', [
        { id: 'gate_east', x: 62, y: 32, to: 'city_start', toExit: 'gate_west', label: 'Ворота в город', asset: 'stairs' },
        { id: 'forest_trail', x: 10, y: 8, to: 'wilderness_forest', toExit: 'mountain_trail', label: 'Тропа в лес', asset: 'stairs' },
        { id: 'cave_entrance', x: 30, y: 60, to: 'dungeon_mountain_cave', toExit: 'mountain_exit', label: 'Пещерный вход', asset: 'stairs' },
        { id: 'desert_pass', x: 30, y: 4, to: 'wilderness_desert', toExit: 'mountain_pass', label: 'Перевал в пустыню', asset: 'stairs' },
      ]),
      dungeon_mountain_cave: location('dungeon_mountain_cave', 'dungeon', 'Пещеры Ветра', 'cave', [
        { id: 'mountain_exit', x: 24, y: 1, to: 'wilderness_mountains', toExit: 'cave_entrance', label: 'Выход в горы', asset: 'stairs' },
        { id: 'deep_entrance', x: 24, y: 62, to: 'dungeon_mountain_deep', toExit: 'stairs_up', label: 'Глубокие пещеры', asset: 'stairs' },
      ]),
      dungeon_mountain_deep: location('dungeon_mountain_deep', 'dungeon', 'Пещеры: Магмовые Залы', 'magma', [
        { id: 'stairs_up', x: 26, y: 1, to: 'dungeon_mountain_cave', toExit: 'deep_entrance', label: 'Верхний уровень', asset: 'stairs' },
        { id: 'city_entrance', x: 50, y: 62, to: 'city_start', toExit: 'gate_magma', label: 'Выход в город', asset: 'stairs' },
      ]),
      wilderness_desert: location('wilderness_desert', 'desert', 'Пустыня Песков', 'desert', [
        { id: 'gate_west', x: 2, y: 32, to: 'city_start', toExit: 'gate_east', label: 'Ворота в город', asset: 'stairs' },
        { id: 'mountain_pass', x: 10, y: 10, to: 'wilderness_mountains', toExit: 'desert_pass', label: 'Перевал в горы', asset: 'stairs' },
        { id: 'ruins_entrance', x: 55, y: 12, to: 'dungeon_desert_ruins', toExit: 'desert_exit', label: 'Руины в песках', asset: 'stairs' },
        { id: 'oasis', x: 32, y: 60, to: 'wilderness_oasis', toExit: 'desert_path', label: 'Оазис', asset: 'stairs' },
      ]),
      wilderness_oasis: location('wilderness_oasis', 'wilderness', 'Оазис Жизни', 'forest', [
        { id: 'desert_path', x: 20, y: 2, to: 'wilderness_desert', toExit: 'oasis', label: 'Путь в пустыню', asset: 'stairs' },
        { id: 'sewer_entrance', x: 5, y: 32, to: 'dungeon_sewers', toExit: 'oasis_exit', label: 'Скрытый вход', asset: 'stairs' },
        { id: 'city_gate', x: 62, y: 32, to: 'city_start', toExit: 'gate_oasis', label: 'Дорога в город', asset: 'stairs' },
      ]),
      dungeon_desert_ruins: location('dungeon_desert_ruins', 'ruins', 'Песчаные Руины', 'ruins', [
        { id: 'desert_exit', x: 24, y: 1, to: 'wilderness_desert', toExit: 'ruins_entrance', label: 'Выход в пустыню', asset: 'stairs' },
        { id: 'deep_entrance', x: 24, y: 62, to: 'dungeon_desert_deep', toExit: 'stairs_up', label: 'Подземные залы', asset: 'stairs' },
        { id: 'city_entrance', x: 50, y: 62, to: 'city_start', toExit: 'gate_sand_ruins', label: 'Выход в город', asset: 'stairs' },
      ]),
      dungeon_desert_deep: location('dungeon_desert_deep', 'ruins', 'Руины: Запечатанные Сокровищницы', 'temple', [
        { id: 'stairs_up', x: 26, y: 1, to: 'dungeon_desert_ruins', toExit: 'deep_entrance', label: 'Верхний уровень', asset: 'stairs' },
        { id: 'city_entrance', x: 50, y: 62, to: 'city_start', toExit: 'gate_treasuries', label: 'Выход в город', asset: 'stairs' },
      ]),
      dungeon_sewers: location('dungeon_sewers', 'sewers', 'Канализация Аргена', 'sewer', [
        { id: 'swamp_exit', x: 10, y: 5, to: 'wilderness_swamp', toExit: 'sewer_entrance', label: 'Выход в болото', asset: 'stairs' },
        { id: 'ruins_exit', x: 54, y: 5, to: 'dungeon_ruins', toExit: 'sewer_entrance', label: 'Выход в руины', asset: 'stairs' },
        { id: 'oasis_exit', x: 28, y: 62, to: 'wilderness_oasis', toExit: 'sewer_entrance', label: 'Выход в оазис', asset: 'stairs' },
        { id: 'city_entrance', x: 28, y: 2, to: 'city_start', toExit: 'sewer_entrance', label: 'Секретный ход в город', asset: 'stairs' },
      ]),
    },
  };
})();
