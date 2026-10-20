// Журнал заданий: активные и выполненные задания героя.
(function () {
  var UI = RK.UI;

  function el(id) { return UI.el(id); }
  function clearNode(node) { UI.clearNode(node); }
  function makeButton(spriteName, text, className) { return UI.makeButton(spriteName, text, className); }
  function commit(action, args, rerender) { UI.commit(action, args, rerender); }

  function renderQuestLogScreen() {
    var g = RK.GAME || null;
    if (!g) return;
    var activeList = el('questlog-active-list');
    var completedList = el('questlog-completed-list');
    if (!activeList || !completedList) return;
    clearNode(activeList);
    clearNode(completedList);

    var me = UI.myPlayerId();
    var quests = g.quests || [];
    var active = quests.filter(function (q) { return !q.completed && q.ownerId === me; });
    var completed = quests.filter(function (q) { return q.completed && q.ownerId === me; });

    if (!active.length) {
      var empty = document.createElement('div');
      empty.className = 'merchant-row';
      empty.textContent = 'Нет активных заданий.';
      activeList.appendChild(empty);
    } else {
      for (var i = 0; i < active.length; i++) {
        var q = active[i];
        var row = document.createElement('div');
        row.className = 'merchant-row';
        var info = document.createElement('div');
        info.style.flex = '1';
        var title = document.createElement('div');
        title.className = 'name';
        title.textContent = q.description || 'Задание';
        var progress = document.createElement('div');
        progress.style.fontSize = '11px';
        progress.style.color = '#aaa';
        progress.style.marginTop = '2px';
        if (q.progress != null && q.target != null) {
          progress.textContent = 'Прогресс: ' + q.progress + '/' + q.target;
        } else if (q.kind === 'visit') {
          progress.textContent = 'Посетите: ' + (q.type || 'локацию');
        }
        var giver = q.giver ? RK.Npc.nameOf({ kind: q.giver }) : '';
        var source = null;
        if (giver) {
          source = document.createElement('div');
          source.style.fontSize = '11px';
          source.style.color = '#9bd17c';
          source.style.marginTop = '2px';
          source.textContent = 'Заказчик: ' + giver;
        }
        var reward = document.createElement('div');
        reward.style.fontSize = '11px';
        reward.style.color = '#ffd166';
        reward.style.marginTop = '2px';
        reward.textContent = 'Награда: ' + (q.reward || 0) + ' золота';
        info.appendChild(title);
        info.appendChild(progress);
        if (source) info.appendChild(source);
        info.appendChild(reward);
        // Подсказка локации для квеста на босса.
        if (q.locationHint) {
          var hint = document.createElement('div');
          hint.style.fontSize = '11px';
          hint.style.color = '#ffd166';
          hint.style.marginTop = '2px';
          hint.textContent = 'Локация: ' + q.locationHint;
          info.appendChild(hint);
        }
        row.appendChild(info);
        if (q.progress >= q.target) {
          var btn = makeButton('uiQuest', 'Сдать');
          btn.addEventListener('click', function (quest) {
            return function () {
              commit('turnInQuestAny', [quest.id], renderQuestLogScreen);
            };
          }(q));
          row.appendChild(btn);
        }
        activeList.appendChild(row);
      }
    }

    if (!completed.length) {
      var empty = document.createElement('div');
      empty.className = 'merchant-row';
      empty.style.color = '#888';
      empty.textContent = 'Выполненных заданий пока нет.';
      completedList.appendChild(empty);
    } else {
      for (var j = 0; j < completed.length; j++) {
        var done = completed[j];
        var doneRow = document.createElement('div');
        doneRow.className = 'merchant-row';
        doneRow.style.opacity = '0.7';
        var doneInfo = document.createElement('div');
        doneInfo.style.flex = '1';
        var doneTitle = document.createElement('div');
        doneTitle.className = 'name';
        doneTitle.textContent = '✓ ' + (done.description || 'Задание');
        var doneReward = document.createElement('div');
        doneReward.style.fontSize = '11px';
        doneReward.style.color = '#ffd166';
        doneReward.style.marginTop = '2px';
        doneReward.textContent = 'Получено: ' + (done.reward || 0) + ' золота';
        doneInfo.appendChild(doneTitle);
        doneInfo.appendChild(doneReward);
        doneRow.appendChild(doneInfo);
        completedList.appendChild(doneRow);
      }
    }
  }

  function showQuestLog() {
    UI.show('questlog');
  }

  UI.registerRenderer('questlog', renderQuestLogScreen, { onSync: true });

  RK.UI.showQuestLog = showQuestLog;
  RK.UI.renderQuestLogScreen = renderQuestLogScreen;
})();
