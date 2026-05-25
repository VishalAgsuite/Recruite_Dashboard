const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

/* =====================================
   TRUST PROXY
===================================== */

app.set("trust proxy", 1);

/* =====================================
   CORS FIX
===================================== */

const allowedOrigins = [

    "https://recruite-dashboard.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:5500"

];

app.use(cors({

    origin: function (origin, callback) {

        // Allow Postman / Server Requests

        if (!origin) {

            return callback(null, true);

        }

        if (allowedOrigins.includes(origin)) {

            callback(null, true);

        } else {

            console.log(
                "Blocked By CORS:",
                origin
            );

            callback(
                new Error("CORS Not Allowed")
            );

        }

    },

    methods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    credentials: true

}));

/* =====================================
   PREFLIGHT
===================================== */

app.options("*", cors());

app.use(express.json());

/* =====================================
   STATIC FILES
===================================== */

app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

/* =====================================
   HOME
===================================== */

app.get("/", (req, res) => {

    res.send("Recruit Dashboard API Running");

});

/* =====================================
   HEALTH CHECK
===================================== */

app.get("/health", (req, res) => {

    res.status(200).json({

        success: true,

        message:
        "Server Running Successfully"

    });

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
   CACHE
===================================== */

let cachedAccessToken = null;

let accessTokenExpiry = 0;

let accessTokenPromise = null;

let zohoModuleCache = {};

const MODULE_CACHE_TTL_MS =
2 * 60 * 1000;

/* =====================================
   UTIL
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

    console.log(
        "Generating Zoho Access Token..."
    );

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

    console.log(
        "Zoho Token Response:",
        result
    );

    if (!result.access_token) {

        throw new Error(

            result.error_description ||
            result.error ||
            "Failed To Generate Token"

        );

    }

    cachedAccessToken =
    result.access_token;

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
    page

) {

    const url =
    `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;

    console.log(
        "Fetching:",
        url
    );

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

    const result =
    await response.json();

    if (!response.ok) {

        console.log(
            "Zoho API Error:",
            result
        );

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

    const cache =
    zohoModuleCache[moduleName];

    if (

        cache &&
        cache.expiry > Date.now()

    ) {

        console.log(
            `${moduleName} Loaded From Cache`
        );

        return cache.data;

    }

    let allData = [];

    const MAX_PAGES = 70;

    for (
        let page = 1;
        page <= MAX_PAGES;
        page++
    ) {

        try {

            const result =
            await fetchZohoModulePage(

                moduleName,
                accessToken,
                page

            );

            const records =
            result.data || [];

            console.log(
                `${moduleName} Page ${page}: ${records.length}`
            );

            allData = [
                ...allData,
                ...records
            ];

            if (
                records.length < 200
            ) {

                break;

            }

            await sleep(200);

        } catch (error) {

            console.log(
                `Error Fetching ${moduleName} Page ${page}:`,
                error.message
            );

            break;

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
   DASHBOARD DATA API
===================================== */

app.get(
    "/dashboard-data",
    async (req, res) => {

        try {

            console.log(
                "Dashboard API Called"
            );

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
                await fetchZohoModuleData(
                    moduleName,
                    accessToken
                );

            }

            res.status(200).json({

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

            console.log(
                "Dashboard Error:",
                error.message
            );

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

            console.log(
                "Module Request:",
                moduleName
            );

            const accessToken =
            await getAccessToken();

            const data =
            await fetchZohoModuleData(
                moduleName,
                accessToken
            );

            res.status(200).json({

                success: true,

                count:
                data.length,

                data

            });

        } catch (error) {

            console.log(
                "Module Error:",
                error.message
            );

            res.status(500).json({

                success: false,

                error:
                error.message

            });

        }

    }
);

/* =====================================
   GLOBAL ERROR HANDLER
===================================== */

app.use((err, req, res, next) => {

    console.log(
        "Global Error:",
        err.message
    );

    res.status(500).json({

        success: false,

        error:
        err.message

    });

});

/* =====================================
   START SERVER
===================================== */

const PORT =
process.env.PORT || 3000;

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Server Running On Port ${PORT}`
        );

    }
);