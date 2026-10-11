/* СРОО «РАДИ ДЕТЕЙ», главная. JS только для меню на телефоне и формы «Задать вопрос»
   (STANDARD.md, раздел 7). Без сборщиков и библиотек. Без JS видны все тексты и ссылки. */
'use strict';

/* Адрес развёрнутого веб-приложения Google Apps Script (заканчивается на /exec). Скрипт принимает
   POST (application/x-www-form-urlencoded) с полями name, email, phone, message, consent, website
   и отвечает JSON {"ok":true} или {"ok":false,"error":"..."}. Если адрес убрать, при отправке форма
   честно покажет ошибку и сохранит введённое. */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxw_0V6pC-xbKwMaKvdDbNQicsvfR79bbKyzTsBVmWYT9RfmJraTM0lLmSxyKj4fY0i/exec';

/* Сколько ждать ответа сервера, мс. Потом форма покажет ошибку и даст отправить снова. */
const REQUEST_TIMEOUT_MS = 25000;

/* Ограничения длины: вопрос до 1000 знаков (раздел 5.7), имя до 100 */
const MAX_NAME = 100;
const MAX_QUESTION = 1000;

/* Тексты сообщений формы */
const MESSAGES = {
  name: 'Укажите имя',
  nameLong: 'Имя длиннее 100 знаков, сократите его',
  contacts: 'Укажите e-mail или телефон',
  email: 'Проверьте e-mail: он должен быть вида name@example.org',
  phone: 'Проверьте телефон: нужно от 10 до 15 цифр',
  question: 'Напишите вопрос',
  questionLong: 'Вопрос длиннее 1000 знаков, сократите его',
  consent: 'Подтвердите согласие на обработку персональных данных',
  sending: 'Отправляем вопрос…',
  sent: 'Вопрос отправлен',
  failed: 'Не удалось отправить вопрос. Проверьте интернет и нажмите «Отправить» ещё раз. Введённое сохранено.'
};

/* Меню на телефоне и планшете: кнопка «Меню», Esc закрывает, ссылка внутри меню тоже закрывает */
(function initMenu() {
  const button = document.querySelector('.menu-btn');
  const nav = document.getElementById('site-nav');
  if (!button || !nav) return;
  const wide = window.matchMedia('(min-width: 1280px)');

  function setOpen(open) {
    nav.classList.toggle('is-open', open);
    button.setAttribute('aria-expanded', String(open));
  }

  button.addEventListener('click', function () {
    setOpen(button.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || button.getAttribute('aria-expanded') !== 'true') return;
    const focusInside = nav.contains(document.activeElement) || document.activeElement === button;
    setOpen(false);
    if (focusInside) button.focus();
  });
  nav.addEventListener('click', function (event) {
    if (event.target.closest('a')) setOpen(false);
  });
  wide.addEventListener('change', function () {
    if (wide.matches) setOpen(false);
  });
})();

/* Пояснение к согласию: с JS сворачивается, ссылка раскрывает и скрывает; без JS текст виден всегда */
(function initConsentNote() {
  const link = document.getElementById('q-consent-link');
  const note = document.getElementById('q-consent-note');
  if (!link || !note) return;
  note.hidden = true;
  link.setAttribute('aria-expanded', 'false');
  link.addEventListener('click', function (event) {
    event.preventDefault();
    const open = note.hidden;
    note.hidden = !open;
    link.setAttribute('aria-expanded', String(open));
  });
})();

/* Форма «Задать вопрос» */
(function initForm() {
  const form = document.getElementById('question-form');
  if (!form) return;

  const byId = function (id) { return document.getElementById(id); };
  const field = {
    name: byId('q-name'),
    email: byId('q-email'),
    phone: byId('q-phone'),
    question: byId('q-question'),
    consent: byId('q-consent')
  };
  const trap = byId('q-website');
  const submit = byId('q-submit');
  const status = byId('q-status');
  /* Текст ошибки у каждого поля; contacts относится к группе «Как с вами связаться» */
  const errorBox = {
    name: byId('q-name-error'),
    contacts: byId('q-contacts-error'),
    email: byId('q-email-error'),
    phone: byId('q-phone-error'),
    question: byId('q-question-error'),
    consent: byId('q-consent-error')
  };
  /* Текущие ошибки: пустая строка значит «ошибки нет» */
  const errors = { name: '', contacts: '', email: '', phone: '', question: '', consent: '' };
  let sending = false;
  /* В разметке кнопка неактивна: без работающего скрипта форма не уходит обычным запросом на сервер страницы */
  submit.disabled = false;

  const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[^\s@.]{2,}$/;
  const PHONE_RE = /^\+?[\d\s()\-‐-―−]+$/;

  function filled(input) { return input.value.trim() !== ''; }

  /* Проверки полей: возвращают текст ошибки или пустую строку */
  const check = {
    name: function () {
      const value = field.name.value.trim();
      if (!value) return MESSAGES.name;
      return value.length > MAX_NAME ? MESSAGES.nameLong : '';
    },
    email: function () {
      return !filled(field.email) || EMAIL_RE.test(field.email.value.trim()) ? '' : MESSAGES.email;
    },
    phone: function () {
      const value = field.phone.value.trim();
      if (!value) return '';
      const digits = value.replace(/\D/g, '').length;
      return PHONE_RE.test(value) && digits >= 10 && digits <= 15 ? '' : MESSAGES.phone;
    },
    contacts: function () {
      return filled(field.email) || filled(field.phone) ? '' : MESSAGES.contacts;
    },
    question: function () {
      const value = field.question.value.trim();
      if (!value) return MESSAGES.question;
      return value.length > MAX_QUESTION ? MESSAGES.questionLong : '';
    },
    consent: function () {
      return field.consent.checked ? '' : MESSAGES.consent;
    }
  };

  function setInvalid(input, invalid) {
    if (invalid) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  /* Показывает текущие ошибки: текст со значком под полем, рамка error, aria-invalid */
  function render() {
    Object.keys(errorBox).forEach(function (key) {
      errorBox[key].hidden = !errors[key];
      errorBox[key].querySelector('.error__text').textContent = errors[key];
    });
    setInvalid(field.name, errors.name);
    setInvalid(field.email, errors.email || errors.contacts);
    setInvalid(field.phone, errors.phone || errors.contacts);
    setInvalid(field.question, errors.question);
    setInvalid(field.consent, errors.consent);
  }

  /* Проверка всех полей после попытки отправки; возвращает первое поле с ошибкой в порядке на экране */
  function validateAll() {
    Object.keys(check).forEach(function (key) { errors[key] = check[key](); });
    render();
    if (errors.name) return field.name;
    if (errors.contacts || errors.email) return field.email;
    if (errors.phone) return field.phone;
    if (errors.question) return field.question;
    if (errors.consent) return field.consent;
    return null;
  }

  /* Проверка одного поля при уходе с заполненного поля и при исправлении ошибки */
  function validateField(key) {
    errors[key] = check[key]();
    if ((key === 'email' || key === 'phone') && errors.contacts && (filled(field.email) || filled(field.phone))) {
      errors.contacts = '';
    }
    render();
  }

  /* Сообщения под кнопкой: идёт отправка, успех, ошибка. Область aria-live="polite" есть в разметке. */
  const STATUS_ICON = { info: 'i-info', success: 'i-check-circle', error: 'i-alert' };

  function showStatus(kind, text) {
    status.className = 'status status--' + kind;
    status.innerHTML = '<p class="status__text"><svg class="icon" aria-hidden="true"><use href="#' +
      STATUS_ICON[kind] + '"/></svg><span></span></p>';
    status.querySelector('span').textContent = text;
  }

  function clearStatus() {
    status.className = 'status';
    status.textContent = '';
  }

  function resetForm() {
    form.reset();
    Object.keys(errors).forEach(function (key) { errors[key] = ''; });
    render();
  }

  function formBody() {
    const body = new URLSearchParams();
    body.set('name', field.name.value.trim());
    body.set('email', field.email.value.trim());
    body.set('phone', field.phone.value.trim());
    body.set('message', field.question.value.trim());
    body.set('consent', 'да');
    body.set('website', trap.value);
    return body;
  }

  /* Отправка в Google Apps Script. Любой сбой (нет адреса, нет сети, таймаут, ответ не «ok»)
     даёт сообщение об ошибке; введённое не стирается, кнопка снова активна. */
  async function send() {
    sending = true;
    submit.disabled = true;
    showStatus('info', MESSAGES.sending);
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    let ok = false;
    try {
      if (!APPS_SCRIPT_URL) throw new Error('Не задан APPS_SCRIPT_URL');
      const response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: formBody(),
        credentials: 'omit',
        signal: controller.signal
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const result = await response.json();
      ok = Boolean(result) && result.ok === true;
    } catch (error) {
      ok = false;
    }
    clearTimeout(timer);
    if (ok) {
      resetForm();
      showStatus('success', MESSAGES.sent);
    } else {
      showStatus('error', MESSAGES.failed);
    }
    sending = false;
    submit.disabled = false;
    /* Отключённая кнопка теряет фокус: возвращаем его, чтобы можно было нажать снова с клавиатуры */
    if (document.activeElement === document.body || document.activeElement === submit) submit.focus();
    status.scrollIntoView({ block: 'nearest' });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending) return;
    /* Поле-ловушка заполнено только у спам-ботов: ничего не отправляем, но и не выдаём себя */
    if (trap.value !== '') {
      resetForm();
      showStatus('success', MESSAGES.sent);
      return;
    }
    clearStatus();
    const firstInvalid = validateAll();
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    send();
  });

  /* Ошибка у заполненного поля появляется при уходе с него. Если человек ушёл мышью или пальцем
     (например, нажал чекбокс или «Отправить»), показываем её, когда нажатие закончилось: иначе текст
     ошибки сдвинул бы вёрстку между нажатием и отпусканием, и нажатие пропало бы. */
  let pointerDown = false;
  let pendingBlur = [];
  function releasePointer() {
    pointerDown = false;
    const keys = pendingBlur;
    pendingBlur = [];
    keys.forEach(validateField);
  }
  document.addEventListener('pointerdown', function () { pointerDown = true; }, true);
  document.addEventListener('click', function () { setTimeout(releasePointer, 0); }, true);
  ['pointerup', 'pointercancel'].forEach(function (type) {
    /* Страховка на случай, если после нажатия не придёт click */
    document.addEventListener(type, function () { setTimeout(releasePointer, 400); }, true);
  });
  form.addEventListener('focusout', function (event) {
    const key = Object.keys(field).find(function (name) { return field[name] === event.target; });
    if (!key || key === 'consent' || event.target.value === '') return;
    if (!pointerDown) validateField(key);
    else if (pendingBlur.indexOf(key) < 0) pendingBlur.push(key);
  });

  /* Обход клавишей Tab: у многострочного поля браузер показывает только строку с кареткой,
     поэтому поле целиком возвращаем в окно сами. Нажатие мышью и касание этого не запускают. */
  let tabPressed = false;
  document.addEventListener('keydown', function (event) { tabPressed = event.key === 'Tab'; }, true);
  document.addEventListener('pointerdown', function () { tabPressed = false; }, true);
  form.addEventListener('focusin', function (event) {
    if (tabPressed) event.target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    tabPressed = false;
  });

  /* Пока ошибка показана, исправление снимает её сразу; новые ошибки при вводе не появляются,
     кроме превышения длины вопроса: поле не обрезает текст молча, поэтому говорим об этом сразу */
  form.addEventListener('input', function (event) {
    const key = Object.keys(field).find(function (name) { return field[name] === event.target; });
    if (!key) return;
    if (errors[key] || (key === 'question' && field.question.value.trim().length > MAX_QUESTION)) validateField(key);
    if (errors.contacts && (key === 'email' || key === 'phone') && check.contacts() === '') {
      errors.contacts = '';
      render();
    }
  });
  field.consent.addEventListener('change', function () {
    if (errors.consent && field.consent.checked) validateField('consent');
  });
})();
