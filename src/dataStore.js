const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = {
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
  badges: [],
  limits: []
};

class DataStore {
  constructor(dataFile) {
    this.dataFile = dataFile;
    const dir = path.dirname(dataFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(dataFile)) {
      this.data = DEFAULT_DATA;
      this.save();
    } else {
      this.data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    }
  }

  save() {
    fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  getEmployees() {
    return this.data.employees;
  }

  searchEmployees(term) {
    const q = term.trim().toLowerCase();
    return this.data.employees.filter(
      (e) => e.name.toLowerCase().includes(q) || e.id.toLowerCase() === q
    );
  }

  getEmployeeById(id) {
    return this.data.employees.find((e) => e.id === id);
  }

  addGratitude(entry) {
    this.data.gratitudes.push(entry);
    this.save();
  }

  listGratitudes() {
    return this.data.gratitudes;
  }

  listBadges() {
    return this.data.badges;
  }

  addBadge(badge) {
    this.data.badges.push(badge);
    this.save();
  }

  upsertLimit(limit) {
    const idx = this.data.limits.findIndex(
      (l) => l.user_id === limit.user_id && l.week_start === limit.week_start
    );
    if (idx >= 0) {
      this.data.limits[idx] = limit;
    } else {
      this.data.limits.push(limit);
    }
    this.save();
  }

  getLimits() {
    return this.data.limits;
  }
}

module.exports = { DataStore };


