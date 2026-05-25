const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

/* =====================================
   STATIC FRONTEND
===================================== */

app.use(express.static(path.join(__dirname, "public")));

/* =====================================
   HOME PAGE
===================================== */

app.get("/", (req, res) => {

    res.sendFile(
        path.join(
            __dirname,
            "public",
            "JobOpening.html"
        )
    );

});

/* =====================================
   ZOHO CONFIG
===================================== */

const CLIENT_ID =
process.env.CLIENT_ID;

const CLIENT_SECRET =
process.env.CLIENT_SECRET;

const REFRESH_TOKEN =
process.env.REFRESH_TOKEN;

/* =====================================
   ACCESS TOKEN
===================================== */

let cachedAccessToken = null;
let accessTokenExpiry = 0;
let accessTokenPromise = null;
let zohoRequestQueue = Promise.resolve();
let lastZohoAuthFailure = 0;
const ZOHO_AUTH_COOLDOWN_MS = 60_000;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function createZohoAccessToken() {
    const now = Date.now();
    if (now - lastZohoAuthFailure < ZOHO_AUTH_COOLDOWN_MS) {
        throw new Error('Zoho auth rate limit active. Please wait a moment and retry.');
    }

    const response = await fetch(
        "https://accounts.zoho.in/oauth/v2/token",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                refresh_token: REFRESH_TOKEN,
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "refresh_token"
            })
        }
    );

    const result = await response.json();

    if (!result.access_token) {
        lastZohoAuthFailure = Date.now();
        const errorMessage = result.error_description || result.error || result.message || JSON.stringify(result);
        throw new Error(`Zoho auth failed: ${errorMessage}`);
    }

    const expiresIn = Number(result.expires_in || 3600);
    cachedAccessToken = result.access_token;
    accessTokenExpiry = Date.now() + (expiresIn * 1000);
    return cachedAccessToken;
}

async function getAccessToken() {
    const now = Date.now();
    if (cachedAccessToken && accessTokenExpiry > now + 30_000) {
        return cachedAccessToken;
    }

    if (accessTokenPromise) {
        return accessTokenPromise;
    }

    accessTokenPromise = createZohoAccessToken()
        .catch(err => {
            accessTokenPromise = null;
            throw err;
        })
        .then(token => {
            accessTokenPromise = null;
            return token;
        });

    return accessTokenPromise;
}

function queueZohoRequest(fn) {
    const queued = zohoRequestQueue.then(() => fn()).catch(err => {
        // Keep the queue flowing even if one request fails
        return Promise.reject(err);
    });

    zohoRequestQueue = queued.catch(() => {});
    return queued;
}

async function fetchZohoModuleData(moduleName, accessToken) {
    let allData = [];

    for (let page = 1; page <= 10; page++) {
        const url = `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;
        console.log("Fetching:", url);

        const response = await fetch(url, {
            headers: {
                Authorization: `Zoho-oauthtoken ${accessToken}`
            }
        });

        const rawBody = await response.text();

        if (!rawBody || !rawBody.trim()) {
            console.log(`Page ${page}: empty response, stopping fetch loop.`);
            break;
        }

        let result;
        try {
            result = JSON.parse(rawBody);
        } catch (parseError) {
            throw new Error(`Zoho invalid JSON response: ${rawBody.slice(0, 200)}`);
        }

        if (!response.ok) {
            const errorMessage = result.error_description || result.error || result.message || response.status;
            throw new Error(`Zoho API call failed: ${errorMessage}`);
        }

        if (!result.data) {
            const errorMessage = result.code || result.error || JSON.stringify(result);
            throw new Error(`Zoho API error: ${errorMessage}`);
        }

        allData = [...allData, ...result.data];
        console.log(`Page ${page}:`, result.data.length);

        if (result.data.length === 0 || result.data.length < 200) {
            break;
        }

        await sleep(250);
    }

    return allData;
}

app.get("/dashboard-data", async (req, res) => {
    try {
        const accessToken = await getAccessToken();
        const modules = ['JobOpenings', 'Interviews', 'Calls', 'Offers'];
        const data = {};

        for (const moduleName of modules) {
            data[moduleName] = await fetchZohoModuleData(moduleName, accessToken);
        }

        res.json({
            success: true,
            data,
            counts: {
                JobOpenings: data.JobOpenings.length,
                Interviews: data.Interviews.length,
                Calls: data.Calls.length,
                Offers: data.Offers.length
            }
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/* =====================================
   FETCH MODULE DATA
===================================== */

app.get("/module/:moduleName", async (req, res) => {
    try {
        const moduleName = req.params.moduleName;
        const allData = await queueZohoRequest(async () => {
            const accessToken = await getAccessToken();
            return fetchZohoModuleData(moduleName, accessToken);
        });

        res.json({
            success: true,
            count: allData.length,
            data: allData
        });
    } catch (error) {
        console.log(error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/* =====================================
   EXPORT FOR SERVERLESS (Vercel)
===================================== */

module.exports = app;