// Описания локаций и выходов между ними.
(function () {
  function location(id, type, name, gen, exits) {
    return { id: id, type: type, name: name, gen: gen, exits: exits };
  }

  RK.WorldData = {
    LOCATIONS: {
      city_start: location('city_start', 'city', 'Город Арген', {
        width: 64, height: 46, style: 'stone',
      }, [
        { id: 'gate_north', x: 32, y: 1, to: 'wilderness_forest', toExit: 'gate_south', label: 'Ворота на север', asset: 'stairs' },
        { id: 'gate_east', x: 62, y: 23, to: 'wilderness_desert', toExit: 'gate_west', label: 'Ворота на восток', asset: 'stairs' },
        { id: 'gate_west', x: 2, y: 23, to: 'wilderness_mountains', toExit: 'gate_east', label: 'Ворота на запад', asset: 'stairs' },
        { id: 'gate_swamp', x: 20, y: 44, to: 'wilderness_swamp', toExit: 'city_gate', label: 'Дорога к болоту', asset: 'stairs' },
        { id: 'gate_oasis', x: 44, y: 44, to: 'wilderness_oasis', toExit: 'city_gate', label: 'Дорога к оазису', asset: 'stairs' },
      ]),
      wilderness_forest: location('wilderness_forest', 'wilderness', 'Лес Ворона', {
        width: 64, height: 46, style: 'forest',
      }, [
        { id: 'gate_south', x: 32, y: 44, to: 'city_start', toExit: 'gate_north', label: 'Ворота на юг', asset: 'stairs' },
        { id: 'cave_entrance', x: 50, y: 10, to: 'dungeon_crypt', toExit: 'stairs_up', label: 'Вход в склеп', asset: 'stairs' },
        { id: 'swamp_path', x: 8, y: 38, to: 'wilderness_swamp', toExit: 'forest_path', label: 'Тропа к болоту', asset: 'stairs' },
        { id: 'ruins_entrance', x: 58, y: 8, to: 'dungeon_ruins', toExit: 'ruins_exit', label: 'Вход в руины', asset: 'stairs' },
        { id: 'mountain_trail', x: 12, y: 5, to: 'wilderness_mountains', toExit: 'forest_trail', label: 'Тропа в горы', asset: 'stairs' },
      ]),
      dungeon_crypt: location('dungeon_crypt', 'crypt', 'Склеп Тёмного', {
        width: 48, height: 34, style: 'crypt',
      }, [
        { id: 'stairs_up', x: 24, y: 1, to: 'wilderness_forest', toExit: 'cave_entrance', label: 'Вход в склеп', asset: 'stairs' },
        { id: 'stairs_down', x: 24, y: 32, to: 'dungeon_crypt_deep', toExit: 'stairs_up', label: 'Нижний ярус', asset: 'stairs' },
      ]),
      dungeon_crypt_deep: location('dungeon_crypt_deep', 'crypt', 'Склеп Тёмного: Глубины', {
        width: 52, height: 38, style: 'crypt',
      }, [
        { id: 'stairs_up', x: 26, y: 1, to: 'dungeon_crypt', toExit: 'stairs_down', label: 'Верхний ярус', asset: 'stairs' },
      ]),
      wilderness_swamp: location('wilderness_swamp', 'wilderness', 'Болото Теней', {
        width: 60, height: 42, style: 'fungal',
      }, [
        { id: 'forest_path', x: 30, y: 40, to: 'wilderness_forest', toExit: 'swamp_path', label: 'Тропа в лес', asset: 'stairs' },
        { id: 'ruins_path', x: 55, y: 10, to: 'dungeon_ruins', toExit: 'swamp_entrance', label: 'Путь к руинам', asset: 'stairs' },
        { id: 'sewer_entrance', x: 5, y: 20, to: 'dungeon_sewers', toExit: 'swamp_exit', label: 'Вход в канализацию', asset: 'stairs' },
        { id: 'city_gate', x: 30, y: 2, to: 'city_start', toExit: 'gate_swamp', label: 'Дорога в город', asset: 'stairs' },
      ]),
      dungeon_ruins: location('dungeon_ruins', 'ruins', 'Руины Старой Крепости', {
        width: 52, height: 38, style: 'ruins',
      }, [
        { id: 'ruins_exit', x: 26, y: 1, to: 'wilderness_forest', toExit: 'ruins_entrance', label: 'Выход в лес', asset: 'stairs' },
        { id: 'swamp_entrance', x: 48, y: 36, to: 'wilderness_swamp', toExit: 'ruins_path', label: 'Выход к болоту', asset: 'stairs' },
        { id: 'sewer_entrance', x: 4, y: 36, to: 'dungeon_sewers', toExit: 'ruins_exit', label: 'Вход в канализацию', asset: 'stairs' },
        { id: 'deep_entrance', x: 26, y: 36, to: 'dungeon_ruins_deep', toExit: 'stairs_up', label: 'Нижний уровень', asset: 'stairs' },
      ]),
      dungeon_ruins_deep: location('dungeon_ruins_deep', 'ruins', 'Руины: Заброшенные Кладовые', {
        width: 48, height: 34, style: 'ruins',
      }, [
        { id: 'stairs_up', x: 24, y: 1, to: 'dungeon_ruins', toExit: 'deep_entrance', label: 'Верхний уровень', asset: 'stairs' },
      ]),
      wilderness_mountains: location('wilderness_mountains', 'mountains', 'Горы Ветра', {
        width: 60, height: 44, style: 'mountain',
      }, [
        { id: 'gate_east', x: 58, y: 22, to: 'city_start', toExit: 'gate_west', label: 'Ворота в город', asset: 'stairs' },
        { id: 'forest_trail', x: 10, y: 8, to: 'wilderness_forest', toExit: 'mountain_trail', label: 'Тропа в лес', asset: 'stairs' },
        { id: 'cave_entrance', x: 30, y: 40, to: 'dungeon_mountain_cave', toExit: 'mountain_exit', label: 'Пещерный вход', asset: 'stairs' },
        { id: 'desert_pass', x: 30, y: 4, to: 'wilderness_desert', toExit: 'mountain_pass', label: 'Перевал в пустыню', asset: 'stairs' },
      ]),
      dungeon_mountain_cave: location('dungeon_mountain_cave', 'dungeon', 'Пещеры Ветра', {
        width: 48, height: 34, style: 'cave',
      }, [
        { id: 'mountain_exit', x: 24, y: 1, to: 'wilderness_mountains', toExit: 'cave_entrance', label: 'Выход в горы', asset: 'stairs' },
        { id: 'deep_entrance', x: 24, y: 32, to: 'dungeon_mountain_deep', toExit: 'stairs_up', label: 'Глубокие пещеры', asset: 'stairs' },
      ]),
      dungeon_mountain_deep: location('dungeon_mountain_deep', 'dungeon', 'Пещеры: Магмовые Залы', {
        width: 52, height: 38, style: 'magma',
      }, [
        { id: 'stairs_up', x: 26, y: 1, to: 'dungeon_mountain_cave', toExit: 'deep_entrance', label: 'Верхний уровень', asset: 'stairs' },
      ]),
      wilderness_desert: location('wilderness_desert', 'desert', 'Пустыня Песков', {
        width: 64, height: 46, style: 'desert',
      }, [
        { id: 'gate_west', x: 2, y: 23, to: 'city_start', toExit: 'gate_east', label: 'Ворота в город', asset: 'stairs' },
        { id: 'mountain_pass', x: 10, y: 10, to: 'wilderness_mountains', toExit: 'desert_pass', label: 'Перевал в горы', asset: 'stairs' },
        { id: 'ruins_entrance', x: 55, y: 12, to: 'dungeon_desert_ruins', toExit: 'desert_exit', label: 'Руины в песках', asset: 'stairs' },
        { id: 'oasis', x: 32, y: 40, to: 'wilderness_oasis', toExit: 'desert_path', label: 'Оазис', asset: 'stairs' },
      ]),
      wilderness_oasis: location('wilderness_oasis', 'wilderness', 'Оазис Жизни', {
        width: 40, height: 30, style: 'forest',
      }, [
        { id: 'desert_path', x: 20, y: 2, to: 'wilderness_desert', toExit: 'oasis', label: 'Путь в пустыню', asset: 'stairs' },
        { id: 'sewer_entrance', x: 5, y: 15, to: 'dungeon_sewers', toExit: 'oasis_exit', label: 'Скрытый вход', asset: 'stairs' },
        { id: 'city_gate', x: 38, y: 15, to: 'city_start', toExit: 'gate_oasis', label: 'Дорога в город', asset: 'stairs' },
      ]),
      dungeon_desert_ruins: location('dungeon_desert_ruins', 'ruins', 'Песчаные Руины', {
        width: 48, height: 34, style: 'ruins',
      }, [
        { id: 'desert_exit', x: 24, y: 1, to: 'wilderness_desert', toExit: 'ruins_entrance', label: 'Выход в пустыню', asset: 'stairs' },
        { id: 'deep_entrance', x: 24, y: 32, to: 'dungeon_desert_deep', toExit: 'stairs_up', label: 'Подземные залы', asset: 'stairs' },
      ]),
      dungeon_desert_deep: location('dungeon_desert_deep', 'ruins', 'Руины: Запечатанные Сокровищницы', {
        width: 52, height: 38, style: 'temple',
      }, [
        { id: 'stairs_up', x: 26, y: 1, to: 'dungeon_desert_ruins', toExit: 'deep_entrance', label: 'Верхний уровень', asset: 'stairs' },
      ]),
      dungeon_sewers: location('dungeon_sewers', 'sewers', 'Канализация Аргена', {
        width: 56, height: 40, style: 'sewer',
      }, [
        { id: 'swamp_exit', x: 10, y: 5, to: 'wilderness_swamp', toExit: 'sewer_entrance', label: 'Выход в болото', asset: 'stairs' },
        { id: 'ruins_exit', x: 46, y: 5, to: 'dungeon_ruins', toExit: 'sewer_entrance', label: 'Выход в руины', asset: 'stairs' },
        { id: 'oasis_exit', x: 28, y: 38, to: 'wilderness_oasis', toExit: 'sewer_entrance', label: 'Выход в оазис', asset: 'stairs' },
        { id: 'city_entrance', x: 28, y: 2, to: 'city_start', toExit: 'sewer_entrance', label: 'Секретный ход в город', asset: 'stairs' },
      ]),
    },
  };
})();
