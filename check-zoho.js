require('dotenv').config();
const fetch = global.fetch || require('node-fetch');
(async () => {
  try {
    const tokenRes = await fetch('https://accounts.zoho.in/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: process.env.REFRESH_TOKEN,
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    });
    const tokenJson = await tokenRes.json();
    console.log('tokenStatus', tokenRes.status, Object.keys(tokenJson));
    if (!tokenJson.access_token) {
      console.log(JSON.stringify(tokenJson, null, 2));
      return;
    }
    const access = tokenJson.access_token;
    const url = 'https://recruit.zoho.in/recruit/v2/JobOpenings?page=1&per_page=2';
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${access}` }
    });
    const json = await res.json();
    console.log('zohoStatus', res.status, Object.keys(json));
    console.log(JSON.stringify(json, null, 2));
  } catch (err) {
    console.error(err);
  }
})();