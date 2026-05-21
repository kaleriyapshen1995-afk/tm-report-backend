const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const B24_WEBHOOK = process.env.B24_WEBHOOK || 'https://crm.seller24.ru/rest/5/0m202a33aiqe1cyn/';

const SOURCE_MAP = {
  'Платформа':     ['SELLER24'],
  'Вебинар':       ['WEBINAR'],
  'Звонобот':      ['CALL_BOT', 'ROBOT'],
  'Реанимация':    ['REANIMATION'],
  'Холодная база': ['COLD_BASE', 'COLD'],
  'Прочее':        null,
};

async function b24(method, params = {}) {
  const url = `${B24_WEBHOOK}${method}.json`;
  const resp = await axios.post(url, params, { timeout: 15000 });
  if (resp.data.error) throw new Error(resp.data.error_description || resp.data.error);
  return resp.data.result;
}

async function fetchAllLeads(filter, select = ['ID', 'SOURCE_ID', 'DATE_CREATE', 'STATUS_ID', 'DATE_CLOSED']) {
  const allLeads = [];
  let start = 0;
  while (true) {
    const result = await b24('crm.lead.list', { filter, select, start });
    if (!result || result.length === 0) break;
    allLeads.push(...result);
    if (result.length < 50) break;
    start += 50;
  }
  return allLeads;
}

function fmtDate(date) { return date.toISOString().split('T')[0]; }

function monthRange(year, month) {
  const from = new Date(year, month, 1);
  const to   = new Date(year, month + 1, 0);
  return { from: fmtDate(from), to: fmtDate(to) };
}

app.get('/api/ping', async (req, res) => {
  try {
    const profile = await b24('profile');
    res.json({ ok: true, user: profile.NAME + ' ' + profile.LAST_NAME, portal: profile.PORTAL });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/sources', async (req, res) => {
  try {
    const fields = await b24('crm.lead.fields');
    const items = fields['SOURCE_ID']?.items || [];
    res.json({ ok: true, sources: items });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/leads', async (req, res) => {
  try {
    const year  = parseInt(req.query.year  || new Date().getFullYear());
    const month = parseInt(req.query.month || new Date().getMonth());
    const tm    = req.query.tm || null;
    const { from, to } = monthRange(year, month);
    const baseFilter = { '>=DATE_CREATE': from, '<=DATE_CREATE': to + 'T23:59:59' };
    const wonFilter  = { '>=DATE_CLOSED': from, '<=DATE_CLOSED': to + 'T23:59:59', 'STATUS_ID': 'WON' };
    if (tm && tm !== 'all') { baseFilter['ASSIGNED_BY_ID'] = tm; wonFilter['ASSIGNED_BY_ID'] = tm; }
    const [newLeads, wonLeads] = await Promise.all([fetchAllLeads(baseFilter), fetchAllLeads(wonFilter)]);
    const result = {};
    function getBlock(sourceId) {
      for (const [block, ids] of Object.entries(SOURCE_MAP)) {
        if (ids === null) continue;
        if (ids.includes(sourceId)) return block;
      }
      return 'Прочее';
    }
    function ensureDay(block, dateStr) {
      if (!result[block]) result[block] = {};
      if (!result[block][dateStr]) result[block][dateStr] = { new: 0, won: 0 };
    }
    newLeads.forEach(lead => { const b = getBlock(lead.SOURCE_ID); const d = (lead.DATE_CREATE||'').slice(0,10); ensureDay(b,d); result[b][d].new++; });
    wonLeads.forEach(lead => { const b = getBlock(lead.SOURCE_ID); const d = (lead.DATE_CLOSED||'').slice(0,10); ensureDay(b,d); result[b][d].won++; });
    res.json({ ok: true, year, month, from, to, totalNew: newLeads.length, totalWon: wonLeads.length, data: result });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/users', async (req, res) => {
  try {
    const users = await b24('user.get', { filter: { ACTIVE: true } });
    res.json({ ok: true, users: users.map(u => ({ id: u.ID, name: u.NAME + ' ' + u.LAST_NAME, email: u.EMAIL })) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

app.get('/api/debug-leads', async (req, res) => {
  try {
    const result = await b24('crm.lead.list', {
      filter: { '>=DATE_CREATE': '2026-05-01' },
      select: ['ID', 'SOURCE_ID', 'DATE_CREATE'],
      start: 0
    });
    const sources = [...new Set(result.map(l => l.SOURCE_ID))];
    res.json({ ok: true, uniqueSources: sources, sample: result.slice(0, 5) });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ TM Report backend запущен на порту ${PORT}`));
