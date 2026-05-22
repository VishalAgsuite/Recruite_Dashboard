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

async function getAccessToken() {

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

    return result.access_token;
}

/* =====================================
   FETCH MODULE DATA
===================================== */

app.get("/module/:moduleName", async (req, res) => {

    try {

        const moduleName =
        req.params.moduleName;

        const accessToken =
        await getAccessToken();

        let allData = [];

        for (let page = 1; page <= 10; page++) {

            const url =
            `https://recruit.zoho.in/recruit/v2/${moduleName}?page=${page}&per_page=200`;

            console.log("Fetching:", url);

            const response =
            await fetch(url, {

                headers: {
                    Authorization:
                    `Zoho-oauthtoken ${accessToken}`
                }

            });

            const result =
            await response.json();

            if (result.data) {

                allData =
                [...allData, ...result.data];

                console.log(
                    `Page ${page}:`,
                    result.data.length
                );

            } else {

                break;
            }
        }

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