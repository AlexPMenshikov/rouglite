// Инвентарь и хранилище: рюкзак, сортировка, экипировка и обмен с сундуком.
(function () {
  var C = RK.CONFIG;
  var UI = RK.UI;

  var SORT_MODES = [
    { id: 'value', label: 'Ценность', icon: 'uiGold' },
    { id: 'rarity', label: 'Редкость', icon: 'uiGem' },
    { id: 'type', label: 'Тип', icon: 'uiTag' },
    { id: 'none', label: 'Как есть', icon: 'uiList' },
  ];
  var SORT_MODE_DEFAULT = 'value';

  var FILTERS = [
    { id: 'all', label: 'Всё', icon: 'uiInventory' },
    { id: 'gear', label: 'Снаряжение', icon: 'uiEquip' },
    { id: 'weapon', label: 'Оружие', icon: 'sword' },
    { id: 'potion', label: 'Зелья', icon: 'potion' },
    { id: 'trap', label: 'Ловушки', icon: 'trapSpike' },
    { id: 'key', label: 'Ключи', icon: 'uiKey' },
  ];
  var FILTER_DEFAULT = 'all';

  var KIND_ORDER = {
    trap: 7,
    potion: 8,
    key: 9,
    gold: 10,
  };
  var KIND_RANK_OTHER = 11;

  var inventorySort = SORT_MODE_DEFAULT;
  var inventoryFilter = FILTER_DEFAULT;

  function el(id) { return UI.el(id); }
  function clearNode(node) { UI.clearNode(node); }
  function makeButton(spriteName, text, className) { return UI.makeButton(spriteName, text, className); }
  function commit(action, args, rerender) { UI.commit(action, args, rerender); }

  function rarityRank(item) {
    return C.RARITY_ORDER[item.rarity || 'common'] || 0;
  }

  function itemValue(item) {
    if (!item) return 0;
    var base = item.value || 0;
    if (item.kind === 'gold') base += item.amt || 0;
    return base;
  }

  function itemKindRank(item) {
    var kind = item.kind || 'loot';
    if (kind !== 'loot') return KIND_ORDER[kind] == null ? KIND_RANK_OTHER : KIND_ORDER[kind];
    var slotRank = C.SLOTS.indexOf(item.slot);
    return slotRank === -1 ? 6 : slotRank;
  }

  function matchesFilter(item, filter) {
    if (!filter || filter === 'all') return true;
    if (filter === 'gear') return item.kind === 'loot';
    if (filter === 'weapon') return item.kind === 'loot' && item.slot === 'weapon';
    return item.kind === filter;
  }

  // Backpack rows keep the real backpack index, so sorting never breaks actions.
  function sortedEntries(backpack, sortMode, filter) {
    var entries = [];
    for (var i = 0; i < (backpack || []).length; i++) {
      if (matchesFilter(backpack[i], filter)) entries.push({ item: backpack[i], index: i });
    }
    if (sortMode === 'none') return entries;
    entries.sort(function (a, b) {
      var diff = 0;
      if (sortMode === 'rarity') {
        diff = rarityRank(b.item) - rarityRank(a.item);
        if (!diff) diff = itemValue(b.item) - itemValue(a.item);
      } else if (sortMode === 'type') {
        diff = itemKindRank(a.item) - itemKindRank(b.item);
      } else {
        diff = itemValue(b.item) - itemValue(a.item);
      }
      return diff || a.index - b.index;
    });
    return entries;
  }

  function renderInventoryControls() {
    UI.renderButtonGroup('inventory-sort-modes', SORT_MODES, inventorySort, function (id) {
      inventorySort = id;
      renderInventoryScreen();
    });
    UI.renderButtonGroup('inventory-filters', FILTERS, inventoryFilter, function (id) {
      inventoryFilter = id;
      renderInventoryScreen();
    });
  }

  // Иконка кнопки соответствует действию, а не типу вещи: «Надеть» на кольце показывает щит.
  function itemButtonIcon(item) {
    if (item.kind === 'key') return 'uiKey';
    if (item.kind === 'potion') return 'potion';
    if (item.kind === 'food') return 'potion';
    if (item.kind === 'trap') return 'trapSpike';
    return item.equipped ? 'uiTrash' : 'uiEquip';
  }

  function itemButtonLabel(item) {
    if (item.kind === 'key') return 'Ключ';
    if (item.kind === 'potion') return 'Исп.';
    if (item.kind === 'food') return 'Съесть';
    if (item.kind === 'trap') return 'Установить';
    return item.equipped ? 'Снять' : 'Надеть';
  }

  function equipBlockReason(player, item) {
    if (!item || !item.slot) return '';
    if (!RK.Classes || !RK.Classes.equipRestriction) return '';
    return RK.Classes.equipRestriction(player, item, RK.Classes.targetSlotFor(player, item));
  }

  function renderEquipmentSlots(container, player, withTakeButton) {
    clearNode(container);
    if (!container) return;
    for (var i = 0; i < C.SLOTS.length; i++) {
      var slot = C.SLOTS[i];
      var item = player.equipment && player.equipment[slot];
      var row = document.createElement('div');
      row.className = 'inventory-slot-item' + (item ? ' rarity-' + (item.rarity || 'common') : '');
      var name = document.createElement('span');
      name.className = 'slot-name';
      name.textContent = C.SLOT_LABELS[slot];
      var value = document.createElement('span');
      value.className = 'slot-item';
      value.textContent = item ? item.name + (item.summary ? ' — ' + item.summary : '') : 'пусто';
      if (item) UI.appendSlotIcon(row, item);
      row.appendChild(name);
      row.appendChild(value);
      if (item && withTakeButton) {
        var takeButton = makeButton('uiEquip', 'Снять');
        takeButton.addEventListener('click', function (slotId) {
          return function (event) {
            event.stopPropagation();
            commit('unequipSlot', [slotId], renderInventoryScreen);
          };
        }(slot));
        row.appendChild(takeButton);
      }
      container.appendChild(row);
    }
  }

  function appendHint(label, text, blocked) {
    var hint = document.createElement('small');
    hint.className = blocked ? 'equip-hint blocked' : 'equip-hint';
    hint.textContent = text;
    label.appendChild(hint);
    label.setAttribute('title', text);
  }

  function renderInventoryScreen() {
    var g = RK.GAME || null;
    var p = g ? UI.displayPlayer() : null;
    var equipmentEl = el('inventory-equipment-slots');
    var listEl = el('inventory-backpack-list');
    if (!p || !equipmentEl || !listEl) return;

    renderInventoryControls();
    renderEquipmentSlots(equipmentEl, p, true);

    clearNode(listEl);
    var backpack = p.backpack || [];
    var entries = sortedEntries(backpack, inventorySort, inventoryFilter);
    if (!entries.length) {
      var empty = document.createElement('div');
      empty.className = 'inventory-row';
      empty.textContent = backpack.length ? 'Нет предметов по фильтру' : 'Рюкзак пуст';
      listEl.appendChild(empty);
      return;
    }

    for (var i = 0; i < entries.length; i++) {
      var loot = entries[i].item;
      var index = entries[i].index;
      var rowItem = document.createElement('div');
      rowItem.className = 'inventory-row rarity-' + (loot.rarity || 'common');
      var label = document.createElement('span');
      label.className = 'name';
      label.textContent = (loot.name || 'Предмет') +
        (loot.count > 1 ? ' ×' + loot.count : '') +
        (loot.summary ? ' — ' + loot.summary : '');
      if (loot.kind === 'loot' && C.SLOT_BODY_PARTS[loot.slot]) {
        appendHint(label, 'Надевается ' + C.SLOT_BODY_PARTS[loot.slot], false);
      }
      var blockReason = equipBlockReason(p, loot);
      if (blockReason) {
        appendHint(label, blockReason, true);
        rowItem.classList.add('blocked');
      }
      var actions = document.createElement('div');
      actions.className = 'actions';
      var useBtn = makeButton(itemButtonIcon(loot), itemButtonLabel(loot));
      useBtn.disabled = loot.kind === 'key' || !!blockReason;
      if (blockReason) useBtn.title = blockReason;
      useBtn.addEventListener('click', function (idx) {
        return function (event) {
          event.stopPropagation();
          commit('useInventoryItem', [idx], renderInventoryScreen);
        };
      }(index));
      var dropBtn = makeButton('uiTrash', 'Выбросить');
      dropBtn.addEventListener('click', function (idx) {
        return function (event) {
          event.stopPropagation();
          commit('dropInventoryItem', [idx], renderInventoryScreen);
        };
      }(index));
      actions.appendChild(useBtn);
      actions.appendChild(dropBtn);
      rowItem.appendChild(label);
      rowItem.appendChild(actions);
      listEl.appendChild(rowItem);
    }
  }

  // show() сам перестраивает экран: повторный рендер был бы второй перестройкой DOM с переподпиской обработчиков.
  function showInventory() {
    UI.show('inventory');
  }

  // Хранилище — единственный сундук с обменом: экран открывает E рядом с ним.
  function showStorage() {
    UI.show('storage');
  }

  function appendStorageEmpty(listEl, text) {
    var empty = document.createElement('div');
    empty.className = 'inventory-row';
    empty.textContent = text;
    listEl.appendChild(empty);
  }

  // Строка переноса: индекс остаётся индексом исходного массива, сортировки здесь нет.
  function appendStorageRows(listEl, items, label, disabled, onPick, emptyText) {
    var list = items || [];
    if (!list.length) {
      appendStorageEmpty(listEl, emptyText);
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var row = document.createElement('div');
      row.className = 'inventory-row rarity-' + (item.rarity || 'common');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = (item.name || 'Предмет') +
        (item.count > 1 ? ' ×' + item.count : '') +
        (item.summary ? ' — ' + item.summary : '');
      var button = makeButton('uiInventory', label);
      button.disabled = disabled;
      button.addEventListener('click', function (index) {
        return function () { onPick(index); };
      }(i));
      row.appendChild(name);
      row.appendChild(button);
      listEl.appendChild(row);
    }
  }

  function renderStorageScreen() {
    var g = RK.GAME || null;
    var p = g ? UI.displayPlayer() : null;
    var backpackList = el('storage-backpack-list');
    var chestList = el('storage-chest-list');
    if (!p || !backpackList || !chestList) return;
    clearNode(backpackList);
    clearNode(chestList);
    // Сундук ищется у героя этого экрана: в сетевой комнате снимок приносит и его содержимое.
    var chest = (RK.Combat && RK.Combat.nearestStorage) ? RK.Combat.nearestStorage() : null;
    appendStorageRows(backpackList, p.backpack, 'Положить', !chest, function (index) {
      commit('storeInChest', [index], renderStorageScreen);
    }, 'Рюкзак пуст.');
    if (!chest) {
      appendStorageEmpty(chestList, 'Рядом нет хранилища.');
      return;
    }
    appendStorageRows(chestList, chest.items, 'Взять', false, function (index) {
      commit('takeFromChest', [index], renderStorageScreen);
    }, 'Хранилище пусто.');
  }

  UI.registerRenderer('inventory', renderInventoryScreen, { onSync: true });
  UI.registerRenderer('storage', renderStorageScreen, { onSync: true });

  RK.UI.showInventory = showInventory;
  RK.UI.showStorage = showStorage;
  RK.UI.renderInventoryScreen = renderInventoryScreen;
  RK.UI.renderStorageScreen = renderStorageScreen;
  // Список вещей нужен и торговцу: порядок строк один на весь интерфейс.
  RK.UI.sortedEntries = sortedEntries;
  RK.UI.defaultSortMode = function () { return SORT_MODE_DEFAULT; };
  RK.UI.setInventorySort = function (mode) {
    inventorySort = mode || SORT_MODE_DEFAULT;
    if (UI.screen() === 'inventory') renderInventoryScreen();
    return inventorySort;
  };
  RK.UI.setInventoryFilter = function (filter) {
    inventoryFilter = filter || FILTER_DEFAULT;
    if (UI.screen() === 'inventory') renderInventoryScreen();
    return inventoryFilter;
  };
  RK.UI.inventorySort = function () { return inventorySort; };
  RK.UI.inventoryFilter = function () { return inventoryFilter; };
})();
