const path = require('path');
const crypto = require('crypto');
const { DataStore } = require('./dataStore');

const DATA_FILE = path.join(__dirname, '..', 'data', 'data.json');
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

const store = new DataStore(DATA_FILE);

const now = () => new Date();

const startOfWeek = (d = now()) => {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
};

const startOfDay = (d = now()) => {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  return date;
};

const toISODate = (d) => d.toISOString();

const randomId = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const normalizeText = (text) => text.trim();

const buildSbiText = ({ situation, behavior, impact }) =>
  `S: ${situation}\nB: ${behavior}\nI: ${impact}`;

const validateSbiText = ({ situation, behavior, impact }) => {
  const parts = [situation, behavior, impact].map(normalizeText);
  const errors = [];
  parts.forEach((p, idx) => {
    if (p.length < 10) errors.push(`Часть ${idx + 1} слишком короткая (мин. 10 символов)`);
    if (p.length > 320) errors.push(`Часть ${idx + 1} слишком длинная (макс. 320 символов)`);
  });
  return errors;
};

const weeklyStats = (userId) => {
  const week = startOfWeek();
  const gratitudes = store.listGratitudes().filter((g) => new Date(g.date) >= week);
  const sent = gratitudes.filter((g) => g.sender_id === userId);
  const received = gratitudes.filter((g) => g.receiver_id === userId);
  return { week, sent, received };
};

const validateLimits = ({ senderId, receiverId, receiverDept, points }) => {
  const { week, sent } = weeklyStats(senderId);
  const errors = [];
  const pointsUsed = sent.reduce((sum, g) => sum + g.points, 0);
  if (pointsUsed + points > WEEKLY_POINT_LIMIT) {
    errors.push(
      `Лимит ${WEEKLY_POINT_LIMIT} баллов на неделю превышен (уже ${pointsUsed}, нужно ещё ${points})`
    );
  }

  const today = startOfDay();
  const sentToday = store
    .listGratitudes()
    .filter((g) => g.sender_id === senderId && new Date(g.date) >= today);
  const samePersonToday = sentToday.filter((g) => g.receiver_id === receiverId).length;
  if (samePersonToday >= MAX_DAILY_SAME_PERSON) {
    errors.push(`За сегодня уже ${samePersonToday} благодарностей этому коллеге (макс ${MAX_DAILY_SAME_PERSON})`);
  }

  const lastSent = sent[sent.length - 1];
  if (lastSent && lastSent.receiver_id === receiverId) {
    errors.push('Нельзя благодарить того же коллегу дважды подряд. Выбери другого.');
  }

  const deptCount = sent.filter((g) => g.receiver_department === receiverDept).length;
  if (deptCount >= MAX_DEPT_PER_WEEK) {
    errors.push(
      `Уже ${deptCount} благодарности в отдел ${receiverDept} на этой неделе (макс ${MAX_DEPT_PER_WEEK})`
    );
  }

  return { ok: errors.length === 0, errors, pointsUsed };
};

const sendGratitude = ({ senderId, receiverId, sbi, category, type, extraImpact }) => {
  const receiver = store.getEmployeeById(receiverId);
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

  const entry = {
    id: randomId(),
    sender_id: senderId,
    receiver_id: receiverId,
    receiver_department: receiver.department,
    text: buildSbiText(sbi),
    category,
    type: type === 'big' ? 'Большой вклад' : 'Обычная благодарность',
    points,
    extra: extraImpact ? normalizeText(extraImpact) : '',
    date: toISODate(now())
  };

  store.addGratitude(entry);
  maybeAddBadges(entry, pointsUsed + points);
  return { ok: true, entry };
};

const maybeAddBadges = (entry, totalPoints) => {
  const badges = store.listBadges();
  const existing = (userId, name) => badges.find((b) => b.user_id === userId && b.badge_name === name);

  if (entry.points >= 3 && !existing(entry.receiver_id, 'Большой вклад')) {
    store.addBadge({
      user_id: entry.receiver_id,
      badge_name: 'Большой вклад',
      description: 'Получил благодарность за большой вклад',
      date_awarded: toISODate(now())
    });
  }

  if (totalPoints >= WEEKLY_POINT_LIMIT && !existing(entry.sender_id, 'Щедрый коллега')) {
    store.addBadge({
      user_id: entry.sender_id,
      badge_name: 'Щедрый коллега',
      description: 'Использовал весь недельный лимит благодарностей',
      date_awarded: toISODate(now())
    });
  }
};

const getInvisibleHeroes = () => {
  const twoWeeksAgo = new Date(now());
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const gratitudes = store.listGratitudes();
  const recentReceivers = new Set(
    gratitudes.filter((g) => new Date(g.date) >= twoWeeksAgo).map((g) => g.receiver_id)
  );
  const candidates = store.getEmployees().filter((e) => !recentReceivers.has(e.id));

  const withScores = candidates.map((c) => {
    const autoScore = SHADOW_DEPARTMENTS.includes(c.department) ? 2 : 0;
    const tasksScore = Math.floor(Math.random() * 3); // заглушка для автоматических сигналов
    return { ...c, score: autoScore + tasksScore };
  });

  return withScores.sort((a, b) => b.score - a.score).slice(0, 5);
};

const getWeeklyHero = () => {
  const week = startOfWeek();
  const gratitudes = store.listGratitudes().filter((g) => new Date(g.date) >= week);
  const byUser = {};
  gratitudes.forEach((g) => {
    byUser[g.receiver_id] = byUser[g.receiver_id] || {
      receiver: store.getEmployeeById(g.receiver_id),
      total: 0,
      departments: new Set(),
      categories: new Set()
    };
    const bucket = byUser[g.receiver_id];
    bucket.total += 1;
    bucket.departments.add(g.receiver_department);
    bucket.categories.add(g.category);
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
  const badges = store.listBadges().filter((b) => b.user_id === userId);
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
  const { week, sent } = weeklyStats(senderId);
  const excludedIds = new Set(sent.map((g) => g.receiver_id));
  const sender = store.getEmployeeById(senderId);
  const candidates = store.getEmployees().filter((e) => e.id !== senderId);
  const scored = candidates
    .filter((c) => !excludedIds.has(c.id))
    .map((c) => {
      const invisible = getInvisibleHeroes().some((h) => h.id === c.id);
      const crossDeptBonus = sender && c.department !== sender.department ? 2 : 0;
      const shadowBonus = SHADOW_DEPARTMENTS.includes(c.department) ? 1 : 0;
      const frequencyPenalty = sent.filter((g) => g.receiver_department === c.department).length * -1;
      return { ...c, score: (invisible ? 3 : 0) + crossDeptBonus + shadowBonus + frequencyPenalty };
    });
  return scored.sort((a, b) => b.score - a.score).slice(0, 6);
};

module.exports = {
  store,
  WEEKLY_POINT_LIMIT,
  MAX_DAILY_SAME_PERSON,
  MAX_DEPT_PER_WEEK,
  CATEGORIES,
  validateLimits,
  sendGratitude,
  getInvisibleHeroes,
  getWeeklyHero,
  getUserMetrics,
  listReceiversFilteredByRules,
  buildSbiText,
  validateSbiText
};


