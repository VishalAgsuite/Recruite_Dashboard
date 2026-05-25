const fetch = global.fetch || require('node-fetch');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

async function createZohoAccessToken() {
  const res = await fetch('https://accounts.zoho.in/oauth/v2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: REFRESH_TOKEN,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token'
    })
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(j.error_description || j.error || 'No token');
  return j.access_token;
}

async function fetchZohoModulePage(moduleName, accessToken, page) {
  const url = `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
  if (!res.ok) throw new Error(`Zoho ${moduleName} page ${page} error ${res.status}`);
  return res.json();
}

module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const moduleName = req.query.moduleName || req.url.split('/').pop();

  if (!moduleName) return res.status(400).json({ success: false, error: 'moduleName required' });

  try {
    const token = await createZohoAccessToken();
    let all = [];
    for (let page = 1; page <= 70; page++) {
      const j = await fetchZohoModulePage(moduleName, token, page);
      const records = j.data || [];
      all = all.concat(records);
      if (records.length < 200) break;
    }
    res.json({ success: true, count: all.length, data: all });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
