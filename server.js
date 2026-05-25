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

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

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
   ACCESS TOKEN CACHE
===================================== */

let cachedAccessToken = null;

let accessTokenExpiry = 0;

let accessTokenPromise = null;

/* =====================================
   REQUEST CONTROL
===================================== */

let zohoRequestQueue =
Promise.resolve();

let lastZohoAuthFailure = 0;

const ZOHO_AUTH_COOLDOWN_MS =
60_000;

/* =====================================
   CACHE
===================================== */

let zohoModuleCache = {};

let pendingModuleFetches = {};

const MODULE_CACHE_TTL_MS =
2 * 60 * 1000;

/* =====================================
   SLEEP
===================================== */

function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );

}

/* =====================================
   CREATE ACCESS TOKEN
===================================== */

async function createZohoAccessToken() {

    const now = Date.now();

    if (
        now - lastZohoAuthFailure <
        ZOHO_AUTH_COOLDOWN_MS
    ) {

        throw new Error(
            "Zoho auth rate limit active. Please wait."
        );

    }

    console.log(`
=====================================
GENERATING ACCESS TOKEN
=====================================
`);

    const response = await fetch(
        "https://accounts.zoho.in/oauth/v2/token",
        {
            method: "POST",

            headers: {
                "Content-Type":
                "application/x-www-form-urlencoded"
            },

            body: new URLSearchParams({

                refresh_token:
                REFRESH_TOKEN,

                client_id:
                CLIENT_ID,

                client_secret:
                CLIENT_SECRET,

                grant_type:
                "refresh_token"

            })

        }
    );

    const result =
    await response.json();

    if (!result.access_token) {

        lastZohoAuthFailure =
        Date.now();

        console.log(result);

        const errorMessage =
            result.error_description ||
            result.error ||
            result.message ||
            JSON.stringify(result);

        throw new Error(
            `Zoho auth failed: ${errorMessage}`
        );

    }

    const expiresIn =
    Number(result.expires_in || 3600);

    cachedAccessToken =
    result.access_token;

    accessTokenExpiry =
    Date.now() + (expiresIn * 1000);

    console.log(`
=====================================
ACCESS TOKEN GENERATED
=====================================
`);

    return cachedAccessToken;

}

/* =====================================
   GET ACCESS TOKEN
===================================== */

async function getAccessToken() {

    const now = Date.now();

    if (
        cachedAccessToken &&
        accessTokenExpiry >
        now + 30_000
    ) {

        return cachedAccessToken;

    }

    if (accessTokenPromise) {

        return accessTokenPromise;

    }

    accessTokenPromise =
    createZohoAccessToken()
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

/* =====================================
   REQUEST QUEUE
===================================== */

function queueZohoRequest(fn) {

    const queued =
    zohoRequestQueue
        .then(() => fn())
        .catch(err => {

            return Promise.reject(err);

        });

    zohoRequestQueue =
    queued.catch(() => {});

    return queued;

}

/* =====================================
   FETCH SINGLE PAGE
===================================== */

async function fetchZohoModulePage(
    moduleName,
    accessToken,
    page,
    attempt = 1
) {

    const MAX_ATTEMPTS = 3;

    const url =
    `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;

    try {

        const response =
        await fetch(url, {

            headers: {
                Authorization:
                `Zoho-oauthtoken ${accessToken}`
            }

        });

        const rawBody =
        await response.text();

        /*
        RETRY FOR SERVER ERROR
        */

        if (
            !response.ok &&
            [429, 500, 502, 503, 504]
            .includes(response.status) &&
            attempt < MAX_ATTEMPTS
        ) {

            const waitMs =
            500 * attempt;

            console.log(`
=====================================
RETRYING API REQUEST
=====================================
Module : ${moduleName}
Page   : ${page}
Status : ${response.status}
Retry  : ${attempt}
=====================================
`);

            await sleep(waitMs);

            return fetchZohoModulePage(
                moduleName,
                accessToken,
                page,
                attempt + 1
            );

        }

        return {
            response,
            rawBody
        };

    } catch (error) {

        const errorCode =
            error.code ||
            (
                error.cause &&
                error.cause.code
            );

        const retryable =
            errorCode &&
            [
                "ECONNRESET",
                "ETIMEDOUT",
                "EAI_AGAIN",
                "ECONNREFUSED"
            ].includes(errorCode);

        if (
            retryable &&
            attempt < MAX_ATTEMPTS
        ) {

            const waitMs =
            500 * attempt;

            console.log(`
=====================================
NETWORK RETRY
=====================================
Module : ${moduleName}
Page   : ${page}
Code   : ${errorCode}
Retry  : ${attempt}
=====================================
`);

            await sleep(waitMs);

            return fetchZohoModulePage(
                moduleName,
                accessToken,
                page,
                attempt + 1
            );

        }

        throw error;

    }

}

/* =====================================
   CACHE WRAPPER
===================================== */

async function getZohoModuleData(
    moduleName,
    accessToken
) {

    const cacheEntry =
    zohoModuleCache[moduleName];

    /*
    CACHE HIT
    */

    if (
        cacheEntry &&
        cacheEntry.expiresAt > Date.now()
    ) {

        console.log(`
=====================================
CACHE HIT
=====================================
Module : ${moduleName}
=====================================
`);

        return cacheEntry.data;

    }

    /*
    PREVENT DUPLICATE FETCH
    */

    if (
        pendingModuleFetches[moduleName]
    ) {

        return pendingModuleFetches[moduleName];

    }

    pendingModuleFetches[moduleName] =
    queueZohoRequest(async () => {

        const data =
        await fetchZohoModuleData(
            moduleName,
            accessToken
        );

        zohoModuleCache[moduleName] = {

            data,

            expiresAt:
            Date.now() +
            MODULE_CACHE_TTL_MS

        };

        return data;

    }).finally(() => {

        delete pendingModuleFetches[moduleName];

    });

    return pendingModuleFetches[moduleName];

}

/* =====================================
   FETCH ALL RECORDS
===================================== */

async function fetchZohoModuleData(
    moduleName,
    accessToken
) {

    let allData = [];

    let page = 1;

    let hasMore = true;

    while (hasMore) {

        const url =
        `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;

        console.log(`
=====================================
FETCHING MODULE
=====================================
Module : ${moduleName}
Page   : ${page}
=====================================
`);

        const {
            response,
            rawBody
        } = await fetchZohoModulePage(
            moduleName,
            accessToken,
            page
        );

        /*
        EMPTY RESPONSE
        */

        if (
            !rawBody ||
            !rawBody.trim()
        ) {

            console.log(`
=====================================
EMPTY RESPONSE
=====================================
Module : ${moduleName}
Page   : ${page}
=====================================
`);

            break;

        }

        let result;

        /*
        PARSE JSON
        */

        try {

            result =
            JSON.parse(rawBody);

        } catch (parseError) {

            console.log(`
=====================================
INVALID JSON
=====================================
${rawBody.slice(0, 300)}
=====================================
`);

            throw new Error(
                "Zoho invalid JSON response"
            );

        }

        /*
        API ERROR
        */

        if (!response.ok) {

            const errorMessage =
                result.error_description ||
                result.error ||
                result.message ||
                response.status;

            console.log(`
=====================================
ZOHO API ERROR
=====================================
Module : ${moduleName}
Page   : ${page}
Error  : ${errorMessage}
=====================================
`);

            throw new Error(
                `Zoho API call failed: ${errorMessage}`
            );

        }

        /*
        NO DATA
        */

        if (
            !result.data ||
            result.data.length === 0
        ) {

            console.log(`
=====================================
NO MORE RECORDS
=====================================
Module : ${moduleName}
=====================================
`);

            break;

        }

        /*
        ADD DATA
        */

        allData.push(...result.data);

        console.log(`
=====================================
PAGE FETCHED
=====================================
Module : ${moduleName}
Page   : ${page}
Page Records : ${result.data.length}
Total Records: ${allData.length}
=====================================
`);

        /*
        MORE RECORDS
        */

        if (
            result.info &&
            result.info.more_records === true
        ) {

            page++;

        } else {

            hasMore = false;

            console.log(`
=====================================
FETCH COMPLETED
=====================================
Module : ${moduleName}
Final Count : ${allData.length}
=====================================
`);

        }

        /*
        RATE LIMIT PROTECTION
        */

        await sleep(300);

    }

    return allData;

}

/* =====================================
   DASHBOARD API
===================================== */

app.get(
    "/dashboard-data",
    async (req, res) => {

        try {

            const accessToken =
            await getAccessToken();

            const modules = [

                "JobOpenings",
                "Interviews",
                "Calls",
                "Offers",
                "Candidates"

            ];

            const data = {};

            for (const moduleName of modules) {

                data[moduleName] =
                await getZohoModuleData(
                    moduleName,
                    accessToken
                );

            }

            res.json({

                success: true,

                data,

                counts: {

                    JobOpenings:
                    data.JobOpenings.length,

                    Interviews:
                    data.Interviews.length,

                    Calls:
                    data.Calls.length,

                    Offers:
                    data.Offers.length,

                    Candidates:
                    data.Candidates.length

                }

            });

        } catch (error) {

            console.log(error);

            res.status(500).json({

                success: false,

                error:
                error.message

            });

        }

    }
);

/* =====================================
   MODULE API
===================================== */

app.get(
    "/module/:moduleName",
    async (req, res) => {

        try {

            const moduleName =
            req.params.moduleName;

            console.log(`
=====================================
MODULE REQUEST
=====================================
${moduleName}
=====================================
`);

            const accessToken =
            await getAccessToken();

            const allData =
            await getZohoModuleData(
                moduleName,
                accessToken
            );

            res.json({

                success: true,

                module:
                moduleName,

                count:
                allData.length,

                data:
                allData

            });

        } catch (error) {

            console.log(error);

            res.status(500).json({

                success: false,

                error:
                error.message

            });

        }

    }
);

/* =====================================
   EXPORT FOR VERCEL
===================================== */

module.exports = app;

/* =====================================
   LOCAL SERVER
===================================== */

if (require.main === module) {

    const PORT =
    process.env.PORT || 3000;

    app.listen(PORT, () => {

        console.log(`
=====================================
SERVER RUNNING
=====================================

URL:
http://localhost:${PORT}

=====================================
`);

    });

}