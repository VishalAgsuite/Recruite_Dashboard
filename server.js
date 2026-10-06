// const express = require("express");
// const cors = require("cors");
// const path = require("path");
// require("dotenv").config();

// const app = express();

// /* =====================================
//    CORS
// ===================================== */

// app.use(cors({
//     origin: "*",
//     methods: ["GET", "POST"],
//     allowedHeaders: ["Content-Type", "Authorization"]
// }));

// // Ensure OPTIONS (preflight) requests and explicit headers are handled
// app.options("*", cors());

// app.use((req, res, next) => {

//     const origin = req.get("origin") || "*";

//     res.header("Access-Control-Allow-Origin", origin);

//     res.header(
//         "Access-Control-Allow-Methods",
//         "GET,POST,OPTIONS"
//     );

//     res.header(
//         "Access-Control-Allow-Headers",
//         "Content-Type,Authorization"
//     );

//     // Some proxies or browsers require Vary
//     res.header("Vary", "Origin");

//     if (req.method === "OPTIONS") {
//         return res.sendStatus(204);
//     }

//     next();

// });

// app.use(express.json());

// /* =====================================
//    STATIC FRONTEND
// ===================================== */

// app.use(express.static(path.join(__dirname, "public")));

// /* =====================================
//    HOME PAGE
// ===================================== */

// app.get("/", (req, res) => {

//     res.sendFile(
//         path.join(
//             __dirname,
//             "public",
//             "JobOpening.html"
//         )
//     );

// });

// /* =====================================
//    ZOHO CONFIG
// ===================================== */

// const CLIENT_ID = process.env.CLIENT_ID;
// const CLIENT_SECRET = process.env.CLIENT_SECRET;
// const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

// /* =====================================
//    ACCESS TOKEN CACHE
// ===================================== */

// let cachedAccessToken = null;
// let accessTokenExpiry = 0;
// let accessTokenPromise = null;

// /* =====================================
//    MODULE CACHE
// ===================================== */

// let zohoModuleCache = {};
// const MODULE_CACHE_TTL_MS = 2 * 60 * 1000;

// /* =====================================
//    UTIL
// ===================================== */

// function sleep(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }

// /* =====================================
//    CREATE ACCESS TOKEN
// ===================================== */

// async function createZohoAccessToken() {

//     console.log("Generating New Zoho Access Token...");

//     const response = await fetch(
//         "https://accounts.zoho.in/oauth/v2/token",
//         {
//             method: "POST",

//             headers: {
//                 "Content-Type":
//                 "application/x-www-form-urlencoded"
//             },

//             body: new URLSearchParams({

//                 refresh_token:
//                 REFRESH_TOKEN,

//                 client_id:
//                 CLIENT_ID,

//                 client_secret:
//                 CLIENT_SECRET,

//                 grant_type:
//                 "refresh_token"

//             })

//         }
//     );

//     const result = await response.json();

//     console.log("Zoho Token Response:", result);

//     if (!result.access_token) {

//         throw new Error(
//             result.error_description ||
//             result.error ||
//             "Failed to generate token"
//         );

//     }

//     cachedAccessToken = result.access_token;

//     accessTokenExpiry =
//     Date.now() +
//     ((result.expires_in || 3600) * 1000);

//     return cachedAccessToken;

// }

// /* =====================================
//    GET ACCESS TOKEN
// ===================================== */

// async function getAccessToken() {

//     const now = Date.now();

//     if (
//         cachedAccessToken &&
//         accessTokenExpiry > now + 30000
//     ) {
//         return cachedAccessToken;
//     }

//     if (accessTokenPromise) {
//         return accessTokenPromise;
//     }

//     accessTokenPromise =
//     createZohoAccessToken()
//         .then(token => {

//             accessTokenPromise = null;

//             return token;

//         })
//         .catch(error => {

//             accessTokenPromise = null;

//             throw error;

//         });

//     return accessTokenPromise;

// }

// /* =====================================
//    FETCH SINGLE PAGE
// ===================================== */

// async function fetchZohoModulePage(
//     moduleName,
//     accessToken,
//     page
// ) {

//     const url =
//     `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;

//     console.log("Fetching:", url);

//     const response = await fetch(
//         url,
//         {
//             method: "GET",

//             headers: {
//                 Authorization:
//                 `Zoho-oauthtoken ${accessToken}`
//             }
//         }
//     );

//     const result = await response.json();

//     if (!response.ok) {

//         console.log(result);

//         throw new Error(
//             result.message ||
//             result.code ||
//             "Zoho API Error"
//         );

//     }

//     return result;

// }

// /* =====================================
//    FETCH COMPLETE MODULE
// ===================================== */

// async function fetchZohoModuleData(
//     moduleName,
//     accessToken
// ) {

//     const cache = zohoModuleCache[moduleName];

//     if (
//         cache &&
//         cache.expiry > Date.now()
//     ) {

//         console.log(
//             `${moduleName} loaded from cache`
//         );

//         return cache.data;

//     }

//     let allData = [];

//     // 13K Candidate Support
//     const MAX_PAGES = 70;

//     for (let page = 1; page <= MAX_PAGES; page++) {

//         try {

//             const result =
//             await fetchZohoModulePage(
//                 moduleName,
//                 accessToken,
//                 page
//             );

//             const records =
//             result.data || [];

//             console.log(
//                 `${moduleName} Page ${page}: ${records.length}`
//             );

//             allData = [
//                 ...allData,
//                 ...records
//             ];

//             if (records.length < 200) {
//                 break;
//             }

//             await sleep(200);

//         } catch (error) {

//             console.log(
//                 `Error Page ${page}:`,
//                 error.message
//             );

//             break;

//         }

//     }

//     zohoModuleCache[moduleName] = {

//         data: allData,

//         expiry:
//         Date.now() +
//         MODULE_CACHE_TTL_MS

//     };

//     console.log(
//         `${moduleName} Total Records:`,
//         allData.length
//     );

//     return allData;

// }

// /* =====================================
//    DASHBOARD DATA
// ===================================== */

// app.get(
//     ["/dashboard-data", "/api/dashboard-data"],
//     async (req, res) => {

//         try {

//             const accessToken =
//             await getAccessToken();

//             const modules = [

//                 "JobOpenings",
//                 "Interviews",
//                 "Calls",
//                 "Offers",
//                 "Candidates"

//             ];

//             const data = {};

//             for (const moduleName of modules) {

//                 data[moduleName] =
//                 await fetchZohoModuleData(
//                     moduleName,
//                     accessToken
//                 );

//             }

//             res.json({

//                 success: true,

//                 data,

//                 counts: {

//                     JobOpenings:
//                     data.JobOpenings.length,

//                     Interviews:
//                     data.Interviews.length,

//                     Calls:
//                     data.Calls.length,

//                     Offers:
//                     data.Offers.length,

//                     Candidates:
//                     data.Candidates.length

//                 }

//             });

//         } catch (error) {

//             console.log(error);

//             res.status(500).json({

//                 success: false,

//                 error:
//                 error.message

//             });

//         }

//     }
// );

// /* =====================================
//    MODULE API
// ===================================== */

// app.get(
//     ["/module/:moduleName", "/api/module/:moduleName"],
//     async (req, res) => {

//         try {

//             const moduleName =
//             req.params.moduleName;

//             const accessToken =
//             await getAccessToken();

//             const data =
//             await fetchZohoModuleData(
//                 moduleName,
//                 accessToken
//             );

//             res.json({

//                 success: true,

//                 count:
//                 data.length,

//                 data

//             });

//         } catch (error) {

//             console.log(error);

//             res.status(500).json({

//                 success: false,

//                 error:
//                 error.message

//             });

//         }

//     }
// );

// /* =====================================
//    HEALTH CHECK
// ===================================== */

// app.get("/health", (req, res) => {

//     res.json({

//         success: true,

//         message:
//         "Server Running Successfully"

//     });

// });

// /* =====================================
//    LOCAL SERVER
// ===================================== */

// if (process.env.NODE_ENV !== "production") {

//     const PORT =
//     process.env.PORT || 3000;

//     app.listen(PORT, () => {

//         console.log(
//             `Server Running On Port ${PORT}`
//         );

//     });

// }

// /* =====================================
//    EXPORT FOR VERCEL
// ===================================== */

// module.exports = app;



const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

/* =====================================
   CORS
===================================== */

app.use(cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// Ensure OPTIONS (preflight) requests and explicit headers are handled
app.options("*", cors());

app.use((req, res, next) => {

    const origin = req.get("origin") || "*";

    res.header("Access-Control-Allow-Origin", origin);

    res.header(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
    );

    res.header(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization"
    );

    // Some proxies or browsers require Vary
    res.header("Vary", "Origin");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    next();

});

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

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

/* =====================================
   ACCESS TOKEN CACHE
===================================== */

let cachedAccessToken = null;
let accessTokenExpiry = 0;
let accessTokenPromise = null;

/* =====================================
   MODULE CACHE
===================================== */

let zohoModuleCache = {};
const MODULE_CACHE_TTL_MS = 2 * 60 * 1000;

// How many module pages to fetch concurrently (instead of one-by-one).
const PAGE_BATCH_SIZE = 5;

// Fields the dashboard actually reads per module. Requesting only these
// shrinks each ~144 KB page to a fraction of the size. `id` is always
// returned by Zoho, so it does not need to be listed.
// Leave a module out (or set null) to fetch all fields.
const MODULE_FIELDS = {
    JobOpenings: "Assigned_Recruiter",
    Interviews:
        "Interviewer,Created_By,Start_DateTime,from_start_Date,start_Date,Created_Time",
    Calls:
        "Call_Owner,Owner,Created_By,Posting_Title,Related_To,Call_Start_Time,Created_Time,Modified_Time",
    Offers: "Job_Opening_Name,Posting_Title,Created_Time",
    Candidates: "Full_Name,Email,Phone,Candidate_Status,Owner,Created_Time"
};

/* =====================================
   UTIL
===================================== */

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* =====================================
   CREATE ACCESS TOKEN
===================================== */

async function createZohoAccessToken() {

    console.log("Generating New Zoho Access Token...");

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

    const result = await response.json();

    console.log("Zoho Token Response:", result);

    if (!result.access_token) {

        throw new Error(
            result.error_description ||
            result.error ||
            "Failed to generate token"
        );

    }

    cachedAccessToken = result.access_token;

    accessTokenExpiry =
    Date.now() +
    ((result.expires_in || 3600) * 1000);

    return cachedAccessToken;

}

/* =====================================
   GET ACCESS TOKEN
===================================== */

async function getAccessToken() {

    const now = Date.now();

    if (
        cachedAccessToken &&
        accessTokenExpiry > now + 30000
    ) {
        return cachedAccessToken;
    }

    if (accessTokenPromise) {
        return accessTokenPromise;
    }

    accessTokenPromise =
    createZohoAccessToken()
        .then(token => {

            accessTokenPromise = null;

            return token;

        })
        .catch(error => {

            accessTokenPromise = null;

            throw error;

        });

    return accessTokenPromise;

}

/* =====================================
   FETCH SINGLE PAGE
===================================== */

async function fetchZohoModulePage(
    moduleName,
    accessToken,
    page,
    fields
) {

    let url =
    `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;

    // Only request the fields the dashboard needs. This shrinks each
    // page response dramatically (Zoho otherwise returns every field).
    if (fields) {
        url += `&fields=${encodeURIComponent(fields)}`;
    }

    console.log("Fetching:", url);

    const response = await fetch(
        url,
        {
            method: "GET",

            headers: {
                Authorization:
                `Zoho-oauthtoken ${accessToken}`
            }
        }
    );

    const result = await response.json();

    if (!response.ok) {

        console.log(result);

        throw new Error(
            result.message ||
            result.code ||
            "Zoho API Error"
        );

    }

    return result;

}

/* =====================================
   FETCH COMPLETE MODULE
===================================== */

async function fetchZohoModuleData(
    moduleName,
    accessToken
) {

    const cache = zohoModuleCache[moduleName];

    if (
        cache &&
        cache.expiry > Date.now()
    ) {

        console.log(
            `${moduleName} loaded from cache`
        );

        return cache.data;

    }

    let allData = [];
    const fields = MODULE_FIELDS[moduleName] || null;

    // 13K Candidate Support (70 pages * 200 = 14,000 records).
    const MAX_PAGES = 70;

    // Fetch pages in concurrent batches instead of one-at-a-time with a
    // sleep between each. We keep requesting batches until a page comes
    // back with fewer than 200 records (the last page) or we hit MAX_PAGES.
    let nextPage = 1;
    let reachedEnd = false;

    while (!reachedEnd && nextPage <= MAX_PAGES) {

        const batchPages = [];
        for (
            let i = 0;
            i < PAGE_BATCH_SIZE && nextPage <= MAX_PAGES;
            i++
        ) {
            batchPages.push(nextPage++);
        }

        const results = await Promise.all(
            batchPages.map(page =>
                fetchZohoModulePage(
                    moduleName,
                    accessToken,
                    page,
                    fields
                )
            )
        );

        // Keep page order so date-sorted data stays consistent.
        for (let i = 0; i < results.length; i++) {

            const records = results[i].data || [];

            console.log(
                `${moduleName} Page ${batchPages[i]}: ${records.length}`
            );

            allData = allData.concat(records);

            if (records.length < 200) {
                reachedEnd = true;
                break;
            }

        }

    }

    zohoModuleCache[moduleName] = {

        data: allData,

        expiry:
        Date.now() +
        MODULE_CACHE_TTL_MS

    };

    console.log(
        `${moduleName} Total Records:`,
        allData.length
    );

    return allData;

}

/* =====================================
   DASHBOARD DATA
===================================== */

app.get(
    ["/dashboard-data", "/api/dashboard-data"],
    async (req, res) => {

        try {

            const accessToken =
            await getAccessToken();

            // Candidates are NOT fetched here: the performance dashboard
            // never uses them, and that module is ~13K records (the bulk
            // of the old load time). Candidate.html loads them on demand
            // via /module/Candidates.
            const modules = [

                "JobOpenings",
                "Interviews",
                "Calls",
                "Offers"

            ];

            // Fetch all modules in parallel instead of one after another.
            const results = await Promise.all(
                modules.map(moduleName =>
                    fetchZohoModuleData(moduleName, accessToken)
                )
            );

            const data = {};
            const counts = {};

            modules.forEach((moduleName, i) => {
                data[moduleName] = results[i];
                counts[moduleName] = results[i].length;
            });

            res.json({

                success: true,

                data,

                counts

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
    ["/module/:moduleName", "/api/module/:moduleName"],
    async (req, res) => {

        try {

            const moduleName =
            req.params.moduleName;

            const accessToken =
            await getAccessToken();

            const data =
            await fetchZohoModuleData(
                moduleName,
                accessToken
            );

            res.json({

                success: true,

                count:
                data.length,

                data

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
   HEALTH CHECK
===================================== */

app.get("/health", (req, res) => {

    res.json({

        success: true,

        message:
        "Server Running Successfully"

    });

});

/* =====================================
   LOCAL SERVER
===================================== */

if (process.env.NODE_ENV !== "production") {

    const PORT =
    process.env.PORT || 3000;

    app.listen(PORT, () => {

        console.log(
            `Server Running On Port ${PORT}`
        );

    });

}

/* =====================================
   EXPORT FOR VERCEL
===================================== */

module.exports = app;