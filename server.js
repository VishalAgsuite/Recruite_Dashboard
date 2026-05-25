const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();

/* =====================================
   IMPORTANT
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
    origin: function(origin, callback) {

        // allow postman / mobile apps

        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {

            return callback(null, true);

        } else {

            console.log("Blocked Origin:", origin);

            return callback(
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
   MANUAL HEADERS
===================================== */

app.use((req, res, next) => {

    res.header(
        "Access-Control-Allow-Origin",
        "https://recruite-dashboard.vercel.app"
    );

    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );

    res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
    );

    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }

    next();

});

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
   ZOHO CONFIG
===================================== */

const CLIENT_ID =
process.env.CLIENT_ID;

const CLIENT_SECRET =
process.env.CLIENT_SECRET;

const REFRESH_TOKEN =
process.env.REFRESH_TOKEN;

/* =====================================
   TOKEN CACHE
===================================== */

let cachedAccessToken = null;

let accessTokenExpiry = 0;

/* =====================================
   CREATE TOKEN
===================================== */

async function createZohoAccessToken() {

    console.log("Generating Zoho Token");

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

    console.log(result);

    if (!result.access_token) {

        throw new Error(
            result.error ||
            "Token Failed"
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
   GET TOKEN
===================================== */

async function getAccessToken() {

    if (
        cachedAccessToken &&
        accessTokenExpiry > Date.now()
    ) {

        return cachedAccessToken;

    }

    return await createZohoAccessToken();

}

/* =====================================
   FETCH MODULE
===================================== */

async function fetchZohoModuleData(
    moduleName,
    accessToken
) {

    let allData = [];

    for (let page = 1; page <= 50; page++) {

        const url =
        `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;

        console.log("Fetching:", url);

        const response =
        await fetch(url, {

            method: "GET",

            headers: {

                Authorization:
                `Zoho-oauthtoken ${accessToken}`

            }

        });

        const result =
        await response.json();

        if (!response.ok) {

            console.log(result);

            break;

        }

        const records =
        result.data || [];

        allData.push(...records);

        console.log(
            `${moduleName} Page ${page}:`,
            records.length
        );

        if (records.length < 200) {
            break;
        }

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

            console.log(
                "Dashboard API Called"
            );

            const accessToken =
            await getAccessToken();

            const modules = [

                "JobOpenings",
                "Candidates",
                "Interviews",
                "Calls",
                "Offers"

            ];

            const data = {};

            for (const module of modules) {

                data[module] =
                await fetchZohoModuleData(
                    module,
                    accessToken
                );

            }

            return res.status(200).json({

                success: true,

                counts: {

                    JobOpenings:
                    data.JobOpenings.length,

                    Candidates:
                    data.Candidates.length,

                    Interviews:
                    data.Interviews.length,

                    Calls:
                    data.Calls.length,

                    Offers:
                    data.Offers.length

                },

                data

            });

        } catch (error) {

            console.log(
                "Dashboard Error:",
                error
            );

            return res.status(500).json({

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

            const accessToken =
            await getAccessToken();

            const data =
            await fetchZohoModuleData(
                moduleName,
                accessToken
            );

            return res.json({

                success: true,

                count:
                data.length,

                data

            });

        } catch (error) {

            console.log(error);

            return res.status(500).json({

                success: false,

                error:
                error.message

            });

        }

    }
);

/* =====================================
   HEALTH
===================================== */

app.get("/health", (req, res) => {

    res.json({

        success: true,

        message:
        "API Running"

    });

});

/* =====================================
   START SERVER
===================================== */

const PORT =
process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `Server Running On ${PORT}`
    );

});