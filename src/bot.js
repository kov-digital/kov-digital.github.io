require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const {
  store,
  CATEGORIES,
  WEEKLY_POINT_LIMIT,
  sendGratitude,
  getInvisibleHeroes,
  getWeeklyHero,
  getUserMetrics,
  listReceiversFilteredByRules,
  buildSbiText
} = require('./core');

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN не задан. Добавьте его в .env и перезапустите.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const state = new Map(); // userId -> { step, payload }

const MAIN_MENU = [
  [{ text: '1. Отправить благодарность', callback_data: 'menu_send' }],
  [
    { text: '2. Благодарности недели', callback_data: 'menu_feed' },
    { text: '3. Герой недели', callback_data: 'menu_hero' }
  ],
  [
    { text: '4. Мои достижения', callback_data: 'menu_metrics' },
    { text: '5. Невидимые герои', callback_data: 'menu_invisible' }
  ],
  [{ text: '6. Лимит на неделю', callback_data: 'menu_limit' }]
];

const reply = (chatId, text, keyboard) =>
  bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined
  });

const startMenu = (chatId, name) =>
  reply(
    chatId,
    `👋 Привет, ${name}!\nЯ бот признаний компании. Что хочешь сделать?`,
    MAIN_MENU
  );

const setState = (userId, next) => state.set(userId, next);
const getState = (userId) => state.get(userId);
const dropState = (userId) => state.delete(userId);

bot.onText(/\/start|\/menu/, (msg) => {
  startMenu(msg.chat.id, msg.from.first_name || 'коллега');
});

bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = String(query.from.id);
  const data = query.data;

  switch (true) {
    case data === 'menu_send':
      startSendFlow(chatId, userId);
      break;
    case data === 'menu_invisible':
      showInvisible(chatId, userId);
      break;
    case data === 'menu_hero':
      showWeeklyHero(chatId);
      break;
    case data === 'menu_metrics':
      showMetrics(chatId, userId);
      break;
    case data === 'menu_limit':
      showLimit(chatId, userId);
      break;
    case data === 'menu_feed':
      showWeeklyFeed(chatId);
      break;
    case data.startsWith('recv:'):
      selectReceiver(chatId, userId, data.split(':')[1]);
      break;
    case data.startsWith('cat:'):
      chooseCategory(chatId, userId, Number(data.split(':')[1]));
      break;
    case data.startsWith('type:'):
      chooseType(chatId, userId, data.split(':')[1]);
      break;
    case data === 'confirm:send':
      submitGratitude(chatId, userId);
      break;
    case data === 'confirm:edit':
      startSendFlow(chatId, userId);
      break;
    case data === 'confirm:cancel':
      dropState(userId);
      reply(chatId, 'Отменено. Вернулся в меню.', MAIN_MENU);
      break;
    default:
      reply(chatId, 'Не понял действие. Попробуй снова.', MAIN_MENU);
  }
});

bot.on('message', (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const current = getState(userId);
  if (!current) {
    startMenu(chatId, msg.from.first_name || 'коллега');
    return;
  }
  handleStepInput(chatId, userId, current, msg.text || '');
});

const startSendFlow = (chatId, userId) => {
  setState(userId, { step: 'choose_receiver', payload: {} });
  const suggestions = listReceiversFilteredByRules(userId);
  const keyboard = suggestions.map((p) => [
    { text: `${p.name} (${p.department})`, callback_data: `recv:${p.id}` }
  ]);
  reply(
    chatId,
    'Шаг 1. Кому хочешь сказать спасибо?\n(можешь выбрать кнопку или написать имя вручную)',
    keyboard
  );
};

const selectReceiver = (chatId, userId, receiverId) => {
  const st = getState(userId);
  if (!st || st.step !== 'choose_receiver') return;
  st.payload.receiverId = receiverId;
  st.step = 's';
  setState(userId, st);
  reply(chatId, 'Шаг 2. S — ситуация: что произошло? (1–2 предложения)');
};

const handleStepInput = (chatId, userId, st, text) => {
  const trimmed = text.trim();
  switch (st.step) {
    case 'choose_receiver': {
      const found = store.searchEmployees(trimmed);
      if (found.length === 1) {
        selectReceiver(chatId, userId, found[0].id);
      } else {
        reply(chatId, 'Не нашёл такого коллегу. Выбери из списка или уточни имя.');
      }
      break;
    }
    case 's':
      st.payload.situation = trimmed;
      st.step = 'b';
      setState(userId, st);
      reply(chatId, 'Шаг 2. B — поведение: что сделал человек?');
      break;
    case 'b':
      st.payload.behavior = trimmed;
      st.step = 'i';
      setState(userId, st);
      reply(chatId, 'Шаг 2. I — влияние: какой был эффект?');
      break;
    case 'i':
      st.payload.impact = trimmed;
      st.step = 'category';
      setState(userId, st);
      showCategories(chatId);
      break;
    case 'extra':
      st.payload.extra = trimmed;
      st.step = 'confirm';
      setState(userId, st);
      showDraft(chatId, userId);
      break;
    default:
      reply(chatId, 'Не понял сообщение. Используй кнопки.', MAIN_MENU);
  }
};

const showCategories = (chatId) => {
  const keyboard = CATEGORIES.map((c, idx) => [{ text: c, callback_data: `cat:${idx}` }]);
  reply(chatId, 'Шаг 3. Выбери категорию вклада:', keyboard);
};

const chooseCategory = (chatId, userId, idx) => {
  const st = getState(userId);
  if (!st || st.step !== 'category') return;
  st.payload.category = CATEGORIES[idx];
  st.step = 'type';
  setState(userId, st);
  reply(chatId, 'Шаг 4. Тип благодарности:', [
    [{ text: '✨ Обычная (1 балл)', callback_data: 'type:normal' }],
    [{ text: '🔥 Большой вклад (3 балла)', callback_data: 'type:big' }]
  ]);
};

const chooseType = (chatId, userId, type) => {
  const st = getState(userId);
  if (!st || st.step !== 'type') return;
  st.payload.type = type;
  if (type === 'big') {
    st.step = 'extra';
    setState(userId, st);
    reply(chatId, 'Что делает вклад большим? Уточни в 1 фразе.');
  } else {
    st.step = 'confirm';
    setState(userId, st);
    showDraft(chatId, userId);
  }
};

const showDraft = (chatId, userId) => {
  const st = getState(userId);
  if (!st) return;
  const receiver = store.getEmployeeById(st.payload.receiverId);
  const text = buildSbiText(st.payload);
  reply(
    chatId,
    `🎉 Черновик:\nПолучатель: ${receiver?.name}\n${text}\nКатегория: ${st.payload.category}\nТип: ${
      st.payload.type === 'big' ? 'Большой вклад (3 балла)' : 'Обычная (1 балл)'
    }${st.payload.extra ? `\nУточнение: ${st.payload.extra}` : ''}\n\nОтправляем?`,
    [
      [
        { text: 'Да', callback_data: 'confirm:send' },
        { text: 'Редактировать', callback_data: 'confirm:edit' },
        { text: 'Отмена', callback_data: 'confirm:cancel' }
      ]
    ]
  );
};

const submitGratitude = (chatId, userId) => {
  const st = getState(userId);
  if (!st) return;
  const res = sendGratitude({
    senderId: userId,
    receiverId: st.payload.receiverId,
    sbi: {
      situation: st.payload.situation,
      behavior: st.payload.behavior,
      impact: st.payload.impact
    },
    category: st.payload.category,
    type: st.payload.type,
    extraImpact: st.payload.extra
  });
  if (!res.ok) {
    reply(chatId, `Не получилось отправить:\n- ${res.errors.join('\n- ')}`);
    return;
  }
  dropState(userId);
  const metrics = getUserMetrics(userId);
  reply(
    chatId,
    `✅ Благодарность отправлена!\nБаллы за неделю: ${metrics.pointsUsed}/${WEEKLY_POINT_LIMIT}\nОсталось: ${metrics.pointsLeft}\nСовет: попробуй выбрать коллегу из другого отдела 😉`,
    MAIN_MENU
  );
};

const showInvisible = (chatId, userId) => {
  const heroes = getInvisibleHeroes();
  if (!heroes.length) {
    reply(chatId, 'Кажется, невидимых героев нет. Отличная работа команды! 🎉');
    return;
  }
  const lines = heroes.map(
    (h, i) =>
      `${i + 1}. ${h.name} — ${h.department} (не получали благодарностей 2 недели)`
  );
  const keyboard = heroes.map((h) => [{ text: `Сказать спасибо ${h.name}`, callback_data: `recv:${h.id}` }]);
  setState(userId, { step: 'choose_receiver', payload: {} });
  reply(chatId, `✨ Невидимые герои:\n${lines.join('\n')}\nКого поблагодарим?`, keyboard);
};

const showWeeklyHero = (chatId) => {
  const heroes = getWeeklyHero();
  if (!heroes.length) {
    reply(chatId, 'На этой неделе пока нет благодарностей. Будь первым!');
    return;
  }
  const top = heroes[0];
  const text = `🏆 Герой недели — ${top.receiver.name}\nБлагодарностей: ${top.total}\nОтделов: ${top.deptCount}\nКатегории: ${top.categories.join(', ')}`;
  reply(chatId, text, [[{ text: 'Сказать спасибо', callback_data: 'menu_send' }]]);
};

const showMetrics = (chatId, userId) => {
  const m = getUserMetrics(userId);
  const badgeText = m.badges.length
    ? m.badges.map((b) => `🏅 ${b.badge_name} — ${b.description}`).join('\n')
    : 'Бейджей пока нет — самое время их заработать!';
  reply(
    chatId,
    `Твои достижения:\n🌟 Баллы за неделю: ${m.pointsUsed}/${WEEKLY_POINT_LIMIT}\n🔁 От разных отделов: ${m.uniqueDeptCount}\n✨ Получено благодарностей: ${m.receivedCount}\n🎯 До следующей награды осталось ~${m.nextReward} баллов\n${badgeText}`,
    MAIN_MENU
  );
};

const showLimit = (chatId, userId) => {
  const m = getUserMetrics(userId);
  reply(
    chatId,
    `Твой лимит на неделю: ${WEEKLY_POINT_LIMIT} баллов\nИспользовано: ${m.pointsUsed}\nОсталось: ${m.pointsLeft}\nСовет: выбери коллегу из другого отдела или невидимого героя 👇`,
    [[{ text: 'Предложить получателей', callback_data: 'menu_send' }]]
  );
};

const showWeeklyFeed = (chatId) => {
  const week = new Date();
  const monday = new Date(week);
  const day = (week.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - day);
  monday.setHours(0, 0, 0, 0);
  const feed = store
    .listGratitudes()
    .filter((g) => new Date(g.date) >= monday)
    .slice(-5)
    .reverse();
  if (!feed.length) {
    reply(chatId, 'Пока нет благодарностей за эту неделю. Будь первым!', MAIN_MENU);
    return;
  }
  const lines = feed.map((g) => {
    const sender = store.getEmployeeById(g.sender_id);
    const receiver = store.getEmployeeById(g.receiver_id);
    return `✨ ${sender?.name} → ${receiver?.name}\n${g.text}\nКатегория: ${g.category} | ${g.type}`;
  });
  reply(chatId, `Благодарности недели:\n\n${lines.join('\n\n')}`, MAIN_MENU);
};

console.log('Recognition bot запущен. Ожидаю сообщения в Telegram.');


