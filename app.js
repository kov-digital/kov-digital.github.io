const WEEKLY_POINT_LIMIT = 10;
const MAX_DAILY_SAME_PERSON = 2;
const MAX_DEPT_PER_WEEK = 2;
const SHADOW_DEPARTMENTS = ['Аналитика', 'Саппорт', 'Разработка', 'Бухгалтерия', 'Инфраструктура'];
const CATEGORIES = [
  'Клиентский успех',
  'Решение критической ситуации',
  'Командная помощь',
  'Экспертность / обучение',
  'Качество / надежность',
  'Инновация и улучшение процессов'
];

const data = {
  employees: [
    { id: 'u101', name: 'Анна', department: 'Продажи', join_date: '2022-03-15' },
    { id: 'u102', name: 'Иван', department: 'Разработка', join_date: '2021-11-01' },
    { id: 'u103', name: 'Мария', department: 'Аналитика', join_date: '2023-02-10' },
    { id: 'u104', name: 'Дмитрий', department: 'Саппорт', join_date: '2020-08-20' },
    { id: 'u105', name: 'Екатерина', department: 'Маркетинг', join_date: '2022-07-05' },
    { id: 'u106', name: 'Сергей', department: 'Финансы', join_date: '2021-04-22' },
    { id: 'u107', name: 'Ольга', department: 'Бухгалтерия', join_date: '2019-09-17' },
    { id: 'u108', name: 'Роман', department: 'Инфраструктура', join_date: '2020-12-01' }
  ],
  gratitudes: [],
  badges: []
};

let currentUserId = data.employees[0].id;
const ITEM_CLASS =
  'relative rounded-2xl border border-slate-100 bg-white p-4 shadow-lg text-slate-800 overflow-hidden';

const qs = (id) => document.getElementById(id);
const now = () => new Date();
const startOfWeek = (d = now()) => {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
};
const startOfDay = (d = now()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const weeklyStats = (userId) => {
  const week = startOfWeek();
  const gratitudes = data.gratitudes.filter((g) => new Date(g.date) >= week);
  const sent = gratitudes.filter((g) => g.sender_id === userId);
  const received = gratitudes.filter((g) => g.receiver_id === userId);
  return { week, sent, received };
};

const validateLimits = ({ senderId, receiverId, receiverDept, points }) => {
  const { week, sent } = weeklyStats(senderId);
  const errors = [];
  const pointsUsed = sent.reduce((sum, g) => sum + g.points, 0);
  if (pointsUsed + points > WEEKLY_POINT_LIMIT) {
    errors.push(`Лимит ${WEEKLY_POINT_LIMIT} баллов/нед. Уже ${pointsUsed}, нужно ещё ${points}.`);
  }

  const today = startOfDay();
  const sentToday = data.gratitudes.filter(
    (g) => g.sender_id === senderId && new Date(g.date) >= today
  );
  const samePersonToday = sentToday.filter((g) => g.receiver_id === receiverId).length;
  if (samePersonToday >= MAX_DAILY_SAME_PERSON) {
    errors.push(`Сегодня уже ${samePersonToday} благодарностей этому коллеге (макс ${MAX_DAILY_SAME_PERSON}).`);
  }

  const lastSent = sent[sent.length - 1];
  if (lastSent && lastSent.receiver_id === receiverId) {
    errors.push('Нельзя благодарить того же коллегу дважды подряд.');
  }

  const deptCount = sent.filter((g) => g.receiver_department === receiverDept).length;
  if (deptCount >= MAX_DEPT_PER_WEEK) {
    errors.push(`Уже ${deptCount} благодарности в отдел ${receiverDept} (макс ${MAX_DEPT_PER_WEEK} за неделю).`);
  }

  return { ok: errors.length === 0, errors, pointsUsed };
};

const validateSbiText = ({ situation, behavior, impact }) => {
  const parts = [situation, behavior, impact].map((t) => t.trim());
  const errors = [];
  parts.forEach((p, idx) => {
    if (p.length < 10) errors.push(`Часть ${idx + 1} слишком короткая (мин. 10 симв.)`);
    if (p.length > 320) errors.push(`Часть ${idx + 1} слишком длинная (макс 320 симв.)`);
  });
  return errors;
};

const pickEmoji = (text) => {
  const t = text.toLowerCase();
  if (t.includes('клиент') || t.includes('customer') || t.includes('сделк')) return '🤝';
  if (t.includes('срочн') || t.includes('крит') || t.includes('авар')) return '⏱️';
  if (t.includes('команд') || t.includes('помощ')) return '🤗';
  if (t.includes('обуч') || t.includes('эксперт')) return '📚';
  if (t.includes('качество') || t.includes('надёж') || t.includes('надеж')) return '🛡️';
  if (t.includes('иннова') || t.includes('улучш')) return '✨';
  return '🌟';
};

const normalizePart = (part) => {
  const trimmed = part.trim().replace(/^[–—-]\s*/, '');
  if (!trimmed) return '';
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
};

const refineSituation = (s) => {
  let text = normalizePart(s);
  if (!text) return '';
  const lower = text.toLowerCase();
  const needsPrefix =
    /(закончилась|закончился|кончилась|кончился|сломался|сломалась|пропал|пропала|не хватило)/.test(lower);
  if (needsPrefix && !/^у\s(нас|меня|команды)/.test(lower)) {
    text = `у нас ${text}`;
  }
  return text;
};

const refineBehavior = (b) => {
  let text = normalizePart(b);
  if (!text) return '';
  const adverbs = ['оперативно', 'быстро', 'профессионально', 'заботливо'];
  const hasAdverb = adverbs.some((a) => text.startsWith(a));
  if (!hasAdverb) {
    text = `${adverbs[0]} ${text}`;
  }
  return text;
};

const refineImpact = (i) => {
  let text = normalizePart(i);
  if (!text) return '';
  const weForms = ['мы', 'команда', 'отдел', 'все'];
  const startsWe = weForms.some((w) => text.startsWith(w));
  if (!startsWe) {
    text = `мы ${text}`;
  }
  return text;
};

const buildSbiSentence = ({ situation, behavior, impact }) => {
  const s = refineSituation(situation);
  const b = refineBehavior(behavior);
  const i = refineImpact(impact);
  const emoji = pickEmoji(`${s} ${b} ${i}`);
  return `${emoji} Спасибо тебе! Когда ${s}, ты ${b}. Благодаря твоей помощи ${i}. Я это очень ценю!`;
};

const addGratitude = ({ senderId, receiverId, sbi, category, type, extraImpact, generatedText }) => {
  const receiver = data.employees.find((e) => e.id === receiverId);
  if (!receiver) return { ok: false, errors: ['Получатель не найден'] };
  const points = type === 'big' ? 3 : 1;
  const { ok, errors, pointsUsed } = validateLimits({
    senderId,
    receiverId,
    receiverDept: receiver.department,
    points
  });
  if (!ok) return { ok, errors };
  const sbiErrors = validateSbiText(sbi);
  if (sbiErrors.length) return { ok: false, errors: sbiErrors };

  const sbiSentence = generatedText || buildSbiSentence(sbi);
  const entry = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    sender_id: senderId,
    receiver_id: receiverId,
    receiver_department: receiver.department,
    text: sbiSentence,
    category,
    type: type === 'big' ? 'Большой вклад' : 'Обычная благодарность',
    points,
    extra: extraImpact?.trim() || '',
    date: new Date().toISOString()
  };

  data.gratitudes.push(entry);
  maybeAddBadges(entry, pointsUsed + points);
  return { ok: true, entry };
};

const maybeAddBadges = (entry, totalPoints) => {
  const exists = (userId, name) =>
    data.badges.find((b) => b.user_id === userId && b.badge_name === name);

  if (entry.points >= 3 && !exists(entry.receiver_id, 'Большой вклад')) {
    data.badges.push({
      user_id: entry.receiver_id,
      badge_name: 'Большой вклад',
      description: 'Получил благодарность за большой вклад',
      date_awarded: new Date().toISOString()
    });
  }
  if (totalPoints >= WEEKLY_POINT_LIMIT && !exists(entry.sender_id, 'Щедрый коллега')) {
    data.badges.push({
      user_id: entry.sender_id,
      badge_name: 'Щедрый коллега',
      description: 'Использовал весь недельный лимит благодарностей',
      date_awarded: new Date().toISOString()
    });
  }
};

const getInvisibleHeroes = () => {
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const recentReceivers = new Set(
    data.gratitudes.filter((g) => new Date(g.date) >= twoWeeksAgo).map((g) => g.receiver_id)
  );
  const candidates = data.employees.filter((e) => !recentReceivers.has(e.id));
  const scored = candidates.map((c) => {
    const shadow = SHADOW_DEPARTMENTS.includes(c.department) ? 2 : 0;
    const tasksScore = Math.floor(Math.random() * 3);
    return { ...c, score: shadow + tasksScore };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, 5);
};

const getWeeklyHero = () => {
  const week = startOfWeek();
  const gratitudes = data.gratitudes.filter((g) => new Date(g.date) >= week);
  const byUser = {};
  gratitudes.forEach((g) => {
    if (!byUser[g.receiver_id]) {
      byUser[g.receiver_id] = {
        receiver: data.employees.find((e) => e.id === g.receiver_id),
        total: 0,
        departments: new Set(),
        categories: new Set()
      };
    }
    const b = byUser[g.receiver_id];
    b.total += 1;
    b.departments.add(g.receiver_department);
    b.categories.add(g.category);
  });
  const scored = Object.values(byUser).map((b) => ({
    receiver: b.receiver,
    total: b.total,
    deptCount: b.departments.size,
    categories: Array.from(b.categories),
    score: b.total + b.departments.size * 1.5 + b.categories.size * 0.5
  }));
  return scored.sort((a, b) => b.score - a.score).slice(0, 3);
};

const getUserMetrics = (userId) => {
  const { week, sent, received } = weeklyStats(userId);
  const pointsUsed = sent.reduce((sum, g) => sum + g.points, 0);
  const uniqueDept = new Set(received.map((g) => g.receiver_department));
  const badges = data.badges.filter((b) => b.user_id === userId);
  const nextReward = Math.max(0, 15 - pointsUsed);
  return {
    weekStart: week,
    pointsUsed,
    pointsLeft: Math.max(0, WEEKLY_POINT_LIMIT - pointsUsed),
    receivedCount: received.length,
    uniqueDeptCount: uniqueDept.size,
    badges,
    nextReward
  };
};

const listReceiversFilteredByRules = (senderId) => {
  const { sent } = weeklyStats(senderId);
  const sender = data.employees.find((e) => e.id === senderId);
  const excludedIds = new Set(sent.map((g) => g.receiver_id));
  const invisible = getInvisibleHeroes();
  return data.employees
    .filter((e) => e.id !== senderId && !excludedIds.has(e.id))
    .map((c) => {
      const inv = invisible.some((h) => h.id === c.id);
      const crossDept = sender && c.department !== sender.department ? 2 : 0;
      const shadow = SHADOW_DEPARTMENTS.includes(c.department) ? 1 : 0;
      const freqPenalty = sent.filter((g) => g.receiver_department === c.department).length * -1;
      return { ...c, score: (inv ? 3 : 0) + crossDept + shadow + freqPenalty };
    })
    .sort((a, b) => b.score - a.score);
};

const renderUsers = () => {
  const select = qs('currentUser');
  select.innerHTML = data.employees.map((e) => `<option value="${e.id}">${e.name} (${e.department})</option>`).join('');
  select.value = currentUserId;
};

const renderReceivers = () => {
  const options = listReceiversFilteredByRules(currentUserId);
  const select = qs('receiver');
  select.innerHTML = options.map((o) => `<option value="${o.id}">${o.name} (${o.department})</option>`).join('');
};

const renderCategories = () => {
  qs('category').innerHTML = CATEGORIES.map((c) => `<option>${c}</option>`).join('');
};

const renderLimits = () => {
  const m = getUserMetrics(currentUserId);
  qs('limitInfo').textContent = `Лимит: ${m.pointsUsed}/${WEEKLY_POINT_LIMIT} баллов`;
  qs('limits').innerHTML = `
    <div class="${ITEM_CLASS}">
      Твой лимит: ${WEEKLY_POINT_LIMIT} баллов/нед.<br>
      Использовано: <b>${m.pointsUsed}</b> | Осталось: <b>${m.pointsLeft}</b><br>
      Совет: выбери коллегу из другого отдела или «невидимого героя».
    </div>`;
};

const renderMetrics = () => {
  const m = getUserMetrics(currentUserId);
  const badges = m.badges.length
    ? m.badges.map((b) => `🏅 ${b.badge_name} — ${b.description}`).join('<br>')
    : 'Бейджей пока нет — самое время их заработать!';
  qs('metrics').innerHTML = `
    <div class="${ITEM_CLASS}">
      🌟 Баллы за неделю: <b>${m.pointsUsed}/${WEEKLY_POINT_LIMIT}</b><br>
      🔁 От разных отделов: <b>${m.uniqueDeptCount}</b><br>
      ✨ Получено благодарностей: <b>${m.receivedCount}</b><br>
      🎯 До следующей награды осталось ~${m.nextReward} баллов<br>
      ${badges}
    </div>`;
};

const renderWeeklyHero = () => {
  const heroes = getWeeklyHero();
  const container = qs('weeklyHero');
  if (!heroes.length) {
    container.innerHTML = `<div class="${ITEM_CLASS}">На этой неделе пока нет благодарностей — будь первым!</div>`;
    return;
  }
  container.innerHTML = heroes
    .map(
      (h, idx) =>
        `<div class="${ITEM_CLASS}">
          🏆 ${idx === 0 ? 'Герой недели' : 'Претендент'} — <b>${h.receiver.name}</b><br>
          Благодарностей: ${h.total} | Отделов: ${h.deptCount}<br>
          Категории: ${h.categories.join(', ')}
        </div>`
    )
    .join('');
};

const renderInvisible = () => {
  const heroes = getInvisibleHeroes();
  const container = qs('invisible');
  if (!heroes.length) {
    container.innerHTML = `<div class="${ITEM_CLASS}">Все получили благодарности за 14 дней 🎉</div>`;
    return;
  }
  container.innerHTML = heroes
    .map(
      (h) =>
        `<div class="${ITEM_CLASS}">
          ✨ ${h.name} — ${h.department} (0 благодарностей 14 дней)<br>
          <button class="mt-2 inline-flex items-center rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-indigo-200" data-recv="${h.id}">Поблагодарить</button>
        </div>`
    )
    .join('');
};

const renderWeeklyFeed = () => {
  const week = startOfWeek();
  const feed = data.gratitudes
    .filter((g) => new Date(g.date) >= week)
    .slice(-5)
    .reverse();
  const container = qs('weeklyFeed');
  if (!feed.length) {
    container.innerHTML = `<div class="${ITEM_CLASS}">Пока нет благодарностей за неделю. Добавь первую!</div>`;
    return;
  }
  container.innerHTML = feed
    .map((g) => {
      const sender = data.employees.find((e) => e.id === g.sender_id);
      const receiver = data.employees.find((e) => e.id === g.receiver_id);
      const tone = pickEmoji(g.text);
      const palette = [
        'from-indigo-500 via-sky-400 to-emerald-300',
        'from-fuchsia-500 via-purple-400 to-indigo-300',
        'from-amber-400 via-orange-300 to-rose-300',
        'from-emerald-400 via-teal-300 to-sky-300',
        'from-rose-400 via-pink-300 to-violet-300'
      ];
      const grad = palette[Math.floor(Math.random() * palette.length)];
      return `<div class="relative rounded-2xl border border-slate-100 bg-white shadow-xl overflow-hidden">
        <div class="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-gradient-to-br ${grad} blur-3xl opacity-70"></div>
        <div class="absolute top-4 left-4 w-16 h-16 rounded-full bg-white/60 backdrop-blur-lg shadow-inner shadow-white/50"></div>
        <div class="relative h-24 bg-gradient-to-r ${grad} opacity-95"></div>
        <div class="relative p-4 space-y-2 text-slate-800">
          <div class="flex items-center gap-2 text-sm font-semibold text-slate-600">${tone} ${g.category} · ${g.type}</div>
          <div class="text-base font-semibold">✨ ${sender?.name} → ${receiver?.name}</div>
          <div class="text-sm leading-relaxed text-slate-700">${g.text.replace(/\n/g, '<br>')}</div>
        </div>
      </div>`;
    })
    .join('');
};

const updateAll = () => {
  renderReceivers();
  renderLimits();
  renderMetrics();
  renderWeeklyHero();
  renderInvisible();
  renderWeeklyFeed();
};

const resetForm = () => {
  qs('situation').value = '';
  qs('behavior').value = '';
  qs('impact').value = '';
  qs('extra').value = '';
  const validation = qs('validation');
  validation.textContent = '';
  validation.classList.remove('text-rose-700', 'text-emerald-700');
};

const generateSbiText = async ({ situation, behavior, impact }) => {
  // 1) Пользовательский хук: window.aiGenerateSbi (должен вернуть строку)
  if (typeof window !== 'undefined' && typeof window.aiGenerateSbi === 'function') {
    try {
      const res = await window.aiGenerateSbi({ situation, behavior, impact });
      if (res && typeof res === 'string' && res.trim()) return res.trim();
    } catch (e) {
      console.warn('aiGenerateSbi failed, fallback to heuristic', e);
    }
  }

  // 2) Кастомный эндпоинт: window.AI_SBI_ENDPOINT (+ optional window.AI_SBI_KEY)
  if (typeof window !== 'undefined' && window.AI_SBI_ENDPOINT) {
    try {
      const resp = await fetch(window.AI_SBI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(window.AI_SBI_KEY ? { Authorization: `Bearer ${window.AI_SBI_KEY}` } : {})
        },
        body: JSON.stringify({ situation, behavior, impact })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.text) return String(data.text).trim();
      }
    } catch (e) {
      console.warn('Custom AI endpoint failed, fallback to heuristic', e);
    }
  }

  // 3) Хеуристический fallback
  return buildSbiSentence({ situation, behavior, impact });
};

const init = () => {
  renderUsers();
  renderCategories();
  updateAll();

  qs('currentUser').addEventListener('change', (e) => {
    currentUserId = e.target.value;
    resetForm();
    updateAll();
  });

  qs('receiver').addEventListener('change', () => {
    resetForm();
  });

  qs('gratitudeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const receiverId = qs('receiver').value;
    const category = qs('category').value;
    const situation = qs('situation').value;
    const behavior = qs('behavior').value;
    const impact = qs('impact').value;
    const type = [...document.querySelectorAll('input[name="gtype"]')].find((r) => r.checked).value;
    const extra = qs('extra').value;
    const validation = qs('validation');
    validation.textContent = 'Генерируем формулировку...';
    validation.classList.remove('text-rose-700');
    validation.classList.add('text-slate-600');
    const generatedText = await generateSbiText({ situation, behavior, impact });
    const res = addGratitude({
      senderId: currentUserId,
      receiverId,
      sbi: { situation, behavior, impact },
      category,
      type,
      extraImpact: type === 'big' ? extra : '',
      generatedText
    });
    if (!res.ok) {
      validation.textContent = res.errors.join(' • ');
      validation.classList.remove('text-emerald-700');
      validation.classList.add('text-rose-700');
    } else {
      validation.textContent = `✅ Благодарность отправлена: ${generatedText}`;
      validation.classList.remove('text-rose-700');
      validation.classList.add('text-emerald-700');
      resetForm();
      updateAll();
    }
  });

  document.querySelectorAll('input[name="gtype"]').forEach((r) => {
    r.addEventListener('change', (e) => {
      const isBig = e.target.value === 'big';
      qs('extra').disabled = !isBig;
      if (!isBig) qs('extra').value = '';
    });
  });

  qs('invisible').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-recv]');
    if (btn) {
      qs('receiver').value = btn.dataset.recv;
      qs('receiver').focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
};

document.addEventListener('DOMContentLoaded', init);

