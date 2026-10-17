'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Забеги сетевых комнат лежат на диске, чтобы пережить перезапуск сервера:
// забег считает сервер, и без файла перезапуск обнулял бы партию.
//
// Ключ файла — код комнаты. Он не секрет (виден в адресной строке), а забег и
// так доступен только тем, кто знает код, поэтому отдельного токена не нужно.

const DEFAULT_DIR = 'data/runs';
// Файл забега не должен занимать память процесса при чтении: всё, что больше
// этого, не наш снимок.
const MAX_FILE_BYTES = 4 * 1024 * 1024;
// Классы и границы берём из общего конфига, чтобы файл не принял класс,
  // которого нет в игре, и удачу за пределами допустимого счётчика.
const CONFIG = require('../js/config');
const CONFIG_PLAYER_CLASSES = CONFIG.PLAYER_CLASSES;
const MAX_LUCK = CONFIG.MAX_LUCK;

function runsDir() {
  return process.env.RUNS_DIR ? path.resolve(process.env.RUNS_DIR) : path.join(__dirname, '..', DEFAULT_DIR);
}

// Код комнаты состоит из букв и цифр и приходит от клиента, поэтому имя файла
// собирается только из проверенных символов: иначе '../../etc/passwd' стал бы
// путём за пределами каталога.
function fileFor(code) {
  if (typeof code !== 'string' || !/^[A-Z0-9]{4,8}$/.test(code)) return null;
  return path.join(runsDir(), code + '.json');
}

function ensureDir() {
  fs.mkdirSync(runsDir(), { recursive: true });
}

// Запись атомарная: сначала временный файл, потом переименование. Иначе падение
// сервера посреди записи оставит нечитаемый JSON, и комната не поднимется.
function saveRun(code, state, players) {
  if (!state || !state.game || !state.map) return false;
  const target = fileFor(code);
  if (!target) return false;
  let payload;
  try {
    // Токены едут вместе с забегом: без них игрок не вернёт своего героя
    // после перезапуска сервера. Поэтому файл — секрет уровня самой комнаты.
    payload = JSON.stringify({ version: 1, savedAt: Date.now(), state, players: players || [] });
  } catch (error) {
    return false;
  }
  try {
    ensureDir();
    const temporary = target + '.' + process.pid + '.tmp';
    fs.writeFileSync(temporary, payload, 'utf8');
    fs.renameSync(temporary, target);
    return true;
  } catch (error) {
    return false;
  }
}

// Файл на диске — недоверенный ввод, ровно как сообщение из сокета: слишком
// большой, битый или от другой версии он отвергается молча.
function loadRun(code) {
  const target = fileFor(code);
  if (!target) return null;
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return null;
  } catch {
    return null;
  }
  try {
    const saved = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (!saved || saved.version !== 1 || !saved.state) return null;
    const state = saved.state;
    if (!state.game || !state.game.player || !state.map) return null;
    const players = Array.isArray(saved.players) ? saved.players.filter(isStoredPlayer) : [];
    return { state, players };
  } catch {
    return null;
  }
}

// Запись игрока из файла — недоверенный ввод: без проверки формы злоупотребление
// полем host пересадило бы чужих игроков в роль хоста. luck — необязательное
// поле (старые файлы его не знают), но число, а не строка: иначе в счётчик
// удачи попало бы что угодно.
function isStoredPlayer(entry) {
  return !!entry &&
    typeof entry.id === 'string' && entry.id.length > 0 && entry.id.length <= 64 &&
    typeof entry.token === 'string' && entry.token.length >= 16 && entry.token.length <= 128 &&
    typeof entry.name === 'string' && entry.name.length <= 18 &&
    typeof entry.classId === 'string' && CONFIG_PLAYER_CLASSES.includes(entry.classId) &&
    typeof entry.host === 'boolean' &&
    (entry.luck === undefined || (Number.isFinite(entry.luck) && entry.luck >= 0 && entry.luck <= MAX_LUCK));
}

function deleteRun(code) {
  const target = fileFor(code);
  if (!target) return false;
  try {
    fs.unlinkSync(target);
    return true;
  } catch {
    return false;
  }
}

module.exports = { saveRun, loadRun, deleteRun, runsDir, MAX_FILE_BYTES };