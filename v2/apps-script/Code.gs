/**
 * Приём вопросов с главной страницы СРОО «РАДИ ДЕТЕЙ» (учебный прототип).
 * Вопрос записывается строкой в Google Таблицу и уходит письмом владельцу.
 *
 * Как подключить:
 * 1. Создайте Google Таблицу, откройте в ней Расширения, Apps Script и вставьте этот файл.
 * 2. Один раз запустите функцию setup и выдайте разрешения (таблица и почта).
 * 3. Развернуть, Новое развёртывание, Веб-приложение. Выполнять от имени: я. Доступ: все.
 * 4. Скопируйте адрес веб-приложения (он заканчивается на /exec) в константу APPS_SCRIPT_URL
 *    в начале script.js.
 *
 * Адрес получателя письма скрипт берёт из аккаунта владельца: в коде адресов и ключей нет.
 * Проверки те же, что в script.js: запрос без имени, вопроса, согласия или контакта не записывается.
 */
const SHEET_NAME = 'Вопросы';
const HEADERS = ['Дата и время', 'Имя', 'E-mail', 'Телефон', 'Вопрос', 'Письмо владельцу'];
const MAX_NAME = 100;
const MAX_QUESTION = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;
const PHONE_RE = /^\+?[\d\s()\-‐-―−]+$/;

/** Запустить один раз вручную: создаёт лист и запрашивает разрешения на таблицу и почту. */
function setup() {
  getSheet_();
  MailApp.getRemainingDailyQuota();
}

/** Проверка из браузера: адрес /exec должен ответить {"ok":true}. */
function doGet() {
  return json_({ ok: true });
}

function doPost(e) {
  const params = (e && e.parameter) || {};
  /* Поле-ловушка заполнено только у спам-ботов: отвечаем «ok», но ничего не записываем */
  if (params.website) return json_({ ok: true });

  const data = validate_(params);
  if (!data) return json_({ ok: false, error: 'invalid' });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    /* Сначала запись в таблицу: если она не удалась, письмо не уходит и повторная отправка не даст дублей */
    const sheet = getSheet_();
    const row = sheet.getLastRow() + 1;
    const range = sheet.getRange(row, 1, 1, HEADERS.length);
    /* Обычный текст в ячейках: строка вида =... или +7... не станет формулой или числом */
    range.setNumberFormats([['yyyy-mm-dd hh:mm:ss', '@', '@', '@', '@', '@']]);
    range.setValues([[new Date(), safe_(data.name), safe_(data.email), data.phone, safe_(data.question), 'отправляется']]);
    sheet.getRange(row, HEADERS.length).setValue(sendMail_(data));
    return json_({ ok: true });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
  }
}

/** Возвращает очищенные данные или null, если проверка не пройдена. */
function validate_(p) {
  const name = String(p.name || '').trim();
  const email = String(p.email || '').trim();
  const phone = String(p.phone || '').trim();
  const question = String(p.question || '').replace(/\r\n?/g, '\n').trim();

  if (!name || name.length > MAX_NAME) return null;
  if (!question || question.length > MAX_QUESTION) return null;
  if (p.consent !== 'yes') return null;
  if (!email && !phone) return null;
  if (email && !EMAIL_RE.test(email)) return null;
  if (phone) {
    const digits = phone.replace(/\D/g, '').length;
    if (!PHONE_RE.test(phone) || digits < 10 || digits > 15) return null;
  }
  return { name: name, email: email, phone: phone, question: question };
}

/** Письмо владельцу аккаунта, в котором развёрнут скрипт. Сбой письма не отменяет запись в таблицу. */
function sendMail_(data) {
  try {
    const options = {
      to: Session.getEffectiveUser().getEmail(),
      subject: 'Новый вопрос с сайта «РАДИ ДЕТЕЙ» (учебный прототип)',
      body: [
        'Имя: ' + data.name,
        'E-mail: ' + (data.email || 'не указан'),
        'Телефон: ' + (data.phone || 'не указан'),
        '',
        'Вопрос:',
        data.question
      ].join('\n')
    };
    if (data.email) options.replyTo = data.email;
    MailApp.sendEmail(options);
    return 'отправлено';
  } catch (error) {
    console.error(error);
    return 'не отправлено';
  }
}

/** Лист «Вопросы» с заголовками; создаётся при первом обращении. */
function getSheet_() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Защита от формул в таблице: значение, начинающееся с = + - @, получает впереди апостроф. */
function safe_(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}
