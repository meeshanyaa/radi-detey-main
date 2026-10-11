// Приём вопросов с главной «РАДИ ДЕТЕЙ» (учебный прототип).
// Скрипт привязан к Google Таблице «РАДИ ДЕТЕЙ — вопросы (учебные)»: Расширения → Apps Script.
// Развёртывание: Deploy → New deployment → Web app, Execute as: Me, Who has access: Anyone.
// После каждой правки кода: Deploy → Manage deployments → Edit → Version: New version.
// Адреса почты в коде нет: письмо уходит владельцу скрипта.
// Аннотация ниже ограничивает доступ скрипта одной таблицей, к которой он привязан.

/** @OnlyCurrentDoc */

const LIMITS = { name: 100, email: 254, phone: 30, message: 1000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS_RE = /^[+\d\s()-]+$/;
const HEADER = ['Дата', 'Имя', 'E-mail', 'Телефон', 'Вопрос', 'Согласие'];

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    // скрытое поле заполняют только боты: отвечаем «принято» и ничего не записываем
    if (p.website) return reply_({ ok: true });

    const data = {
      name: line_(p.name),
      email: line_(p.email),
      phone: line_(p.phone),
      message: String(p.message || '').trim(),
      consent: p.consent === 'да',
    };
    const error = validate_(data);
    if (error) return reply_({ ok: false, error: error });

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      sheet_().appendRow([new Date(), text_(data.name), text_(data.email), text_(data.phone), text_(data.message), 'да']);
    } finally {
      lock.releaseLock();
    }

    // строка уже записана, поэтому сбой письма не превращается в ошибку для посетителя
    try {
      notify_(data);
    } catch (mailError) {
      console.error('Письмо не отправлено: ' + mailError);
    }
    return reply_({ ok: true });
  } catch (err) {
    console.error(err);
    return reply_({ ok: false, error: 'server' });
  }
}

// GET отдаёт саму страницу: запасная ссылка на домене Google для мобильного интернета, где github.io не открывается.
// Файл page.html в проекте — копия google.html из репозитория (tools/build-google-mirror.py).
function doGet() {
  return HtmlService.createHtmlOutputFromFile('page')
    .setTitle('РАДИ ДЕТЕЙ — общественная организация родителей детей-инвалидов (учебный прототип)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// те же проверки, что в script.js: без имени, вопроса, согласия и хотя бы одного контакта строка не записывается
function validate_(d) {
  if (d.name.length < 2 || d.name.length > LIMITS.name) return 'name';
  if (!d.email && !d.phone) return 'contacts';
  if (d.email && (d.email.length > LIMITS.email || !EMAIL_RE.test(d.email))) return 'email';
  if (d.phone) {
    const digits = d.phone.replace(/\D/g, '').length;
    if (d.phone.length > LIMITS.phone || !PHONE_CHARS_RE.test(d.phone) || digits < 10 || digits > 15) return 'phone';
  }
  if (!d.message || d.message.length > LIMITS.message) return 'message';
  if (!d.consent) return 'consent';
  return '';
}

// одна строка без лишних пробелов и переносов
function line_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

// апостроф в начале: таблица хранит значение как текст и не принимает «=…» или «+7…» за формулу
function text_(value) {
  return value ? "'" + value : '';
}

function sheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function notify_(d) {
  const owner = Session.getEffectiveUser().getEmail();
  const body = [
    'Имя: ' + d.name,
    'E-mail: ' + (d.email || 'не указан'),
    'Телефон: ' + (d.phone || 'не указан'),
    '',
    d.message,
    '',
    'Таблица: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl(),
  ].join('\n');
  MailApp.sendEmail({
    to: owner,
    subject: 'Вопрос с сайта «РАДИ ДЕТЕЙ»: ' + d.name,
    body: body,
    name: 'Сайт «РАДИ ДЕТЕЙ» (учебный)',
  });
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
