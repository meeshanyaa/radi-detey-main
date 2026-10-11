/* Меню на телефоне и форма «Задать вопрос» (STANDARD.md, разделы 5.1 и 5.7). */

// Адрес веб-приложения Google Apps Script (код в apps-script.gs). Если адрес пуст, форма сообщает, что отправка не настроена.
const FORM_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbxw_0V6pC-xbKwMaKvdDbNQicsvfR79bbKyzTsBVmWYT9RfmJraTM0lLmSxyKj4fY0i/exec';

const ICON_ERROR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>';
const ICON_OK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>';

/* ---------- меню ---------- */

(function initMenu() {
  const button = document.querySelector('.menu-button');
  const nav = document.getElementById('nav');
  if (!button || !nav) return;
  const iconOpen = button.querySelector('.menu-button__open');
  const iconClose = button.querySelector('.menu-button__close');

  function setOpen(open) {
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Закрыть меню' : 'Меню');
    nav.classList.toggle('is-open', open);
    iconOpen.hidden = open;
    iconClose.hidden = !open;
  }

  button.addEventListener('click', () => setOpen(button.getAttribute('aria-expanded') !== 'true'));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false);
      button.focus();
    }
  });

  // после перехода по пункту меню оно закрывается
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a') && button.getAttribute('aria-expanded') === 'true') setOpen(false);
  });
})();

/* ---------- форма ---------- */

(function initForm() {
  const form = document.getElementById('question-form');
  if (!form) return;

  const fields = {
    name: form.elements.name,
    email: form.elements.email,
    phone: form.elements.phone,
    message: form.elements.message,
    consent: form.elements.consent,
  };
  const submit = form.querySelector('button[type="submit"]');
  const status = document.getElementById('form-status');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_CHARS_RE = /^[+\d\s()-]+$/;

  function phoneDigits(value) {
    return value.replace(/\D/g, '').length;
  }

  // каждая проверка возвращает текст ошибки или пустую строку
  const rules = {
    name: () => (fields.name.value.trim().length >= 2 ? '' : 'Укажите имя'),
    email: () => {
      const v = fields.email.value.trim();
      return !v || EMAIL_RE.test(v) ? '' : 'Проверьте e-mail: нужен адрес вида name@example.ru';
    },
    phone: () => {
      const v = fields.phone.value.trim();
      if (!v) return '';
      const digits = phoneDigits(v);
      return PHONE_CHARS_RE.test(v) && digits >= 10 && digits <= 15
        ? ''
        : 'Проверьте телефон: от 10 до 15 цифр, можно с +, пробелами, скобками и дефисами';
    },
    contacts: () =>
      fields.email.value.trim() || fields.phone.value.trim() ? '' : 'Укажите e-mail или телефон, можно оба',
    message: () => (fields.message.value.trim() ? '' : 'Напишите вопрос'),
    consent: () => (fields.consent.checked ? '' : 'Без согласия на обработку данных вопрос не отправить'),
  };

  function describedBy(el, id, on) {
    const ids = new Set((el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    if (on) ids.add(id);
    else ids.delete(id);
    if (ids.size) el.setAttribute('aria-describedby', [...ids].join(' '));
    else el.removeAttribute('aria-describedby');
  }

  function showError(key, text) {
    const box = document.getElementById(key + '-error');
    const targets = key === 'contacts' ? [fields.email, fields.phone] : [fields[key]];
    if (text) {
      box.innerHTML = ICON_ERROR + '<span></span>';
      box.querySelector('span').textContent = text;
      box.hidden = false;
    } else {
      box.hidden = true;
      box.textContent = '';
    }
    targets.forEach((el) => {
      describedBy(el, key + '-error', Boolean(text));
      refreshInvalid(el);
    });
  }

  // поле подсвечено, если ошибка в нём самом или, для e-mail и телефона, в группе контактов
  function refreshInvalid(el) {
    const own = !document.getElementById(el.name + '-error').hidden;
    const group = (el === fields.email || el === fields.phone) && !document.getElementById('contacts-error').hidden;
    if (own || group) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }

  function check(key) {
    const text = rules[key]();
    showError(key, text);
    return text;
  }

  function checkAll() {
    const order = ['name', 'email', 'phone', 'contacts', 'message', 'consent'];
    const failed = order.filter((key) => check(key));
    return failed;
  }

  let triedSubmit = false;

  // ошибки появляются после попытки отправки и при уходе с заполненного поля
  ['name', 'email', 'phone', 'message'].forEach((key) => {
    fields[key].addEventListener('blur', () => {
      if (fields[key].value.trim() || triedSubmit) check(key);
      if ((key === 'email' || key === 'phone') && triedSubmit) check('contacts');
    });
  });
  fields.consent.addEventListener('change', () => {
    if (triedSubmit) check('consent');
  });

  function setStatus(kind, text) {
    status.className = 'status status--' + kind;
    status.innerHTML = (kind === 'success' ? ICON_OK : ICON_ERROR) + '<span></span>';
    status.querySelector('span').textContent = text;
  }

  function clearStatus() {
    status.className = 'status';
    status.textContent = '';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    triedSubmit = true;
    clearStatus();

    const failed = checkAll();
    if (failed.length) {
      const first = failed[0] === 'contacts' ? fields.email : fields[failed[0]];
      first.focus();
      return;
    }

    if (!FORM_ENDPOINT) {
      setStatus('error', 'Отправка ещё не настроена. Попробуйте позже.');
      return;
    }

    const data = new URLSearchParams({
      name: fields.name.value.trim(),
      email: fields.email.value.trim(),
      phone: fields.phone.value.trim(),
      message: fields.message.value.trim(),
      consent: fields.consent.checked ? 'да' : '',
      website: form.elements.website.value,
    });

    submit.disabled = true;
    submit.textContent = 'Отправляем…';
    try {
      // тело URLSearchParams уходит как form-urlencoded: простой запрос без предварительного CORS-запроса
      const response = await fetch(FORM_ENDPOINT, { method: 'POST', body: data });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'bad response');
      form.reset();
      triedSubmit = false;
      setStatus('success', 'Вопрос отправлен. Спасибо!');
    } catch (error) {
      setStatus('error', 'Не удалось отправить. Проверьте интернет и попробуйте ещё раз, введённое сохранено.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Отправить';
    }
  });
})();
