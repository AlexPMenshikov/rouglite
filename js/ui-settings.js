// Настройки, сохранения и журнал боя: звук, чёткость, тайлсет, отладка.
(function () {
  var C = RK.CONFIG;
  var UI = RK.UI;

  // Чёткость отрисовки: пресеты живут в render.js — здесь только кнопки.
  var RESOLUTION_LABELS = { '1': 'Обычная', '1.5': 'Повышенная', '2': 'Максимальная' };
  var EFFECT_LABELS = { full: 'Полные', lite: 'Меньше', off: 'Выкл.' };

  var logCollapsed = loadLogCollapsedPreference();

  function el(id) { return UI.el(id); }
  function setText(id, text) { UI.setText(id, text); }
  function setValue(id, value) { UI.setValue(id, value); }
  function clearNode(node) { UI.clearNode(node); }
  function makeButton(spriteName, text, className) { return UI.makeButton(spriteName, text, className); }
  function onClick(id, handler) { UI.onClick(id, handler); }
  function onChange(id, handler) { UI.onChange(id, handler); }

  function loadLogCollapsedPreference() {
    try {
      var raw = localStorage.getItem('rk.logCollapsed');
      return raw === null ? false : raw === '1';
    } catch (error) {
      return false;
    }
  }

  function renderResolutionControl() {
    var scales = (RK.Render && RK.Render.resolutionScales) ? RK.Render.resolutionScales() : [1];
    var currentScale = (RK.Render && RK.Render.resolutionScale) ? RK.Render.resolutionScale() : 1;
    var table = scales.map(function (scale) {
      return { id: String(scale), label: RESOLUTION_LABELS[String(scale)] || (scale + '×') };
    });
    UI.renderButtonGroup('resolution-options', table, String(currentScale), function (id) {
      if (!RK.Render || !RK.Render.setResolutionScale) return;
      var saved = RK.Render.setResolutionScale(Number(id));
      if (!saved) UI.msg('Чёткость изменена, но сохранить настройку не удалось.', false);
      renderResolutionControl();
    });
  }

  // Поля отладки характеристик живут на экране настроек, значения берутся из героя.
  function fillDebugStats(p) {
    if (!p) return;
    setValue('debug-hp', String(p.hp));
    setValue('debug-max-hp', String(p.maxHp));
    setValue('debug-atk', String(p.atk));
    setValue('debug-def', String(p.def));
  }

  // В сетевой комнате характеристики задаёт сервер: правка формы её не изменит.
  function renderDebugStats() {
    var serverOwned = !!(RK.Network && RK.Network.inRoom && RK.Network.inRoom());
    var ids = ['debug-hp', 'debug-max-hp', 'debug-atk', 'debug-def'];
    for (var i = 0; i < ids.length; i++) {
      var field = el(ids[i]);
      if (field) field.disabled = serverOwned;
    }
    var button = el('btn-debug-apply');
    if (button) button.disabled = serverOwned;
    setText('debug-stats-hint', serverOwned
      ? 'В сетевой комнате характеристики задаёт сервер.'
      : 'Правка характеристик работает только в одиночной игре.');
    var g = RK.GAME || null;
    fillDebugStats(g ? UI.displayPlayer() : null);
  }

  function renderSettingsScreen() {
    renderResolutionControl();
    renderEffectsControls();
    renderDebugStats();
  }

  // Качество эффектов и тряска: настройки читает RK.Effects, хранит Meta.
  function renderEffectsControls() {
    var data = (RK.Meta && RK.Meta.data) ? RK.Meta.data : {};
    var current = C.EFFECT_QUALITIES.indexOf(data.effectsQuality) >= 0 ? data.effectsQuality : 'full';
    var table = C.EFFECT_QUALITIES.map(function (id) {
      return { id: id, label: EFFECT_LABELS[id] || id };
    });
    UI.renderButtonGroup('effects-quality-options', table, current, function (id) {
      if (!RK.Meta || !RK.Meta.data) return;
      RK.Meta.data.effectsQuality = id;
      RK.Meta.save();
      renderEffectsControls();
      if (RK.Render && RK.Render.draw) RK.Render.draw();
    });
    var shake = el('screen-shake');
    if (shake) shake.checked = data.screenShake !== false;
  }

  function initEffectsControls() {
    onChange('screen-shake', function () {
      if (!RK.Meta || !RK.Meta.data) return;
      RK.Meta.data.screenShake = !!el('screen-shake').checked;
      RK.Meta.save();
      if (RK.Render && RK.Render.draw) RK.Render.draw();
    });
  }

  function renderSavesScreen() {
    var list = el('saves-list');
    if (!list) return;
    clearNode(list);
    var saves = (RK.World && RK.World.listSaves) ? RK.World.listSaves() : [];
    if (!saves.length) {
      var empty = document.createElement('p');
      empty.textContent = 'Сохранений нет.';
      list.appendChild(empty);
      return;
    }
    saves.forEach(function (save) {
      var row = document.createElement('div');
      row.className = 'merchant-row';
      var label = document.createElement('span');
      label.textContent = (save.playerName || 'Герой') + ' — ур. ' + (save.level || 1);
      row.appendChild(label);
      var loadBtn = makeButton('uiPlay', 'Продолжить');
      loadBtn.addEventListener('click', function () {
        RK.UI.continueSavedRun(save.id);
      });
      row.appendChild(loadBtn);
      var deleteBtn = makeButton('uiBack', 'Удалить');
      deleteBtn.addEventListener('click', function () {
        if (RK.World && RK.World.clearRun) RK.World.clearRun(save.id);
        renderSavesScreen();
        RK.UI.refreshContinueButton();
      });
      row.appendChild(deleteBtn);
      list.appendChild(row);
    });
  }

  // Громкость звука и отладка характеристик живут на экране настроек.
  function initSettingsControls() {
    function updateAudioVolumeLabel() {
      var label = el('audio-volume-label');
      var slider = el('audio-volume');
      var value = slider ? Number(slider.value) : Math.round(RK.Audio.getVolume() * 100);
      if (slider && RK.Audio.getVolume) {
        slider.value = String(value);
      }
      if (label) label.textContent = 'Громкость: ' + value + '%';
    }
    var volumeSlider = el('audio-volume');
    if (volumeSlider) {
      volumeSlider.value = String(Math.round((RK.Audio.getVolume ? RK.Audio.getVolume() : 0.5) * 100));
      updateAudioVolumeLabel();
      onChange('audio-volume', function () {
        RK.Audio.setVolume(Number(this.value) / 100);
        updateAudioVolumeLabel();
      });
    }
    var debugForm = el('debug-stats-form');
    if (debugForm) {
      debugForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!this.reportValidity()) return;
        RK.Combat.setPlayerStats({
          hp: Number(el('debug-hp').value),
          maxHp: Number(el('debug-max-hp').value),
          atk: Number(el('debug-atk').value),
          def: Number(el('debug-def').value),
        });
      });
    }
  }

  function initTilesetControl() {
    var tilesetToggle = el('tileset-enabled');
    if (!tilesetToggle) return;
    tilesetToggle.checked = RK.Assets.enabled();
    onChange('tileset-enabled', function () {
      var useTileset = tilesetToggle.checked;
      tilesetToggle.disabled = true;
      refreshTilesetControl(useTileset ? 'Загрузка тайлсета…' : 'Переключение на встроенные тайлы…');
      RK.Assets.setEnabled(useTileset, function (error, loadedExternal) {
        tilesetToggle.disabled = false;
        tilesetToggle.checked = RK.Assets.enabled();
        if (error) {
          refreshTilesetControl('Настройка действует до закрытия страницы; сохранить её не удалось.', true);
        } else if (useTileset && !loadedExternal) {
          refreshTilesetControl('Тайлсет не найден — используются встроенные тайлы.', true);
        } else {
          refreshTilesetControl(useTileset ? 'Внешний тайлсет включён.' : 'Встроенные тайлы включены.', true);
        }
        // Запечённый слой пола нарисован прежними текстурами.
        if (RK.Render.invalidateFloorLayer) RK.Render.invalidateFloorLayer();
        UI.refreshIcons();
        RK.Render.draw();
      });
    });
  }

  // Виды показа: сверху, текст и изометрия. Кнопка листает по кругу.
  var MODE_LABELS = {
    graphics: 'Вид: графика',
    ascii: 'Вид: ASCII',
    iso: 'Вид: изометрия',
  };

  function initRenderModeButton() {
    var button = el('btn-render-mode');
    if (!button) return;
    var sync = function () {
      var mode = RK.Render.getMode();
      UI.setButtonLabel('btn-render-mode', MODE_LABELS[mode] || MODE_LABELS.graphics);
      button.setAttribute('aria-pressed', mode === 'ascii' ? 'true' : 'false');
      button.setAttribute('title', 'Переключить вид: графика, ASCII, изометрия');
    };
    sync();
    onClick('btn-render-mode', function () {
      var modes = RK.Render.modes ? RK.Render.modes() : ['graphics', 'ascii'];
      var nextMode = modes[(modes.indexOf(RK.Render.getMode()) + 1) % modes.length];
      var saved = RK.Render.setMode(nextMode);
      sync();
      // Вид сменился: HUD перерисовывает подсказки кнопок поворота камеры.
      if (RK.UI.refresh) RK.UI.refresh();
      if (!saved) UI.msg('Режим отображения изменён, но сохранить настройку не удалось.', false);
    });
  }

  function initDebugLogToggle() {
    var toggle = el('debug-log');
    if (!toggle) return;
    toggle.checked = UI.isDebugLogEnabled();
    onChange('debug-log', function () { UI.setDebugLogEnabled(toggle.checked); });
  }

  // Журнал прячется и возвращается одной и той же кнопкой в своей шапке.
  function applyLogCollapsed() {
    UI.toggleClass('log-panel', 'collapsed', logCollapsed);
    var button = el('btn-log-toggle');
    if (!button) return;
    button.setAttribute('aria-expanded', logCollapsed ? 'false' : 'true');
    button.title = logCollapsed ? 'Показать журнал' : 'Скрыть журнал';
    UI.setButtonLabel('btn-log-toggle', logCollapsed ? 'Журнал' : 'Свернуть');
  }

  function initLogPanelToggle() {
    if (!el('btn-log-toggle')) return;
    UI.decorateButton('btn-log-toggle', 'uiLog', 'Свернуть');
    applyLogCollapsed();
    onClick('btn-log-toggle', function () {
      logCollapsed = !logCollapsed;
      try { localStorage.setItem('rk.logCollapsed', logCollapsed ? '1' : '0'); } catch (error) {}
      applyLogCollapsed();
    });
  }

  function refreshTilesetControl(message, updateSelection) {
    var toggle = el('tileset-enabled');
    if (toggle && updateSelection) toggle.checked = RK.Assets.enabled();
    var status = el('tileset-status');
    if (status) status.textContent = message || '';
  }

  UI.registerRenderer('settings', renderSettingsScreen);
  UI.registerRenderer('saves', renderSavesScreen);

  RK.UI.renderSettingsScreen = renderSettingsScreen;
  RK.UI.renderSavesScreen = renderSavesScreen;
  RK.UI.fillDebugStats = fillDebugStats;
  RK.UI.refreshTilesetControl = refreshTilesetControl;

  UI.onInit(initSettingsControls);
  UI.onInit(initEffectsControls);
  UI.onInit(initTilesetControl);
  UI.onInit(initRenderModeButton);
  UI.onInit(initDebugLogToggle);
  UI.onInit(initLogPanelToggle);
})();
