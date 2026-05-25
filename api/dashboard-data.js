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

  const json = await res.json();

  if (!json.access_token) throw new Error(json.error_description || json.error || 'No token');

  return { token: json.access_token, expires_in: json.expires_in || 3600 };
}

async function fetchZohoModulePage(moduleName, accessToken, page) {
  const url = `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;
  const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` } });
  if (!res.ok) throw new Error(`Zoho ${moduleName} page ${page} error ${res.status}`);
  return res.json();
}

async function fetchZohoModuleData(moduleName, accessToken) {
  let all = [];
  for (let page = 1; page <= 70; page++) {
    const result = await fetchZohoModulePage(moduleName, accessToken, page);
    const records = result.data || [];
    all = all.concat(records);
    if (records.length < 200) break;
  }
  return all;
}

module.exports = async (req, res) => {
  // CORS
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const tok = await createZohoAccessToken();
    const modules = ['JobOpenings','Interviews','Calls','Offers','Candidates'];
    const data = {};
    for (const m of modules) data[m] = await fetchZohoModuleData(m, tok.token);

    res.json({ success: true, data, counts: Object.fromEntries(modules.map(m => [m, data[m].length])) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
