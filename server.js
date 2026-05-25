const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

/* =====================================
   CORS
===================================== */

app.use(cors({
    origin: "*"
}));

app.use(express.json());

/* =====================================
   TEST ROUTE
===================================== */

app.get("/", (req, res) => {

    res.send("Recruit Dashboard API Running");

});

/* =====================================
   HEALTH
===================================== */

app.get("/health", (req, res) => {

    res.json({
        success: true,
        message: "Server Running"
    });

});

/* =====================================
   DASHBOARD API
===================================== */

app.get("/dashboard-data", async (req, res) => {

    try {

        res.json({

            success: true,

            message: "Dashboard API Working",

            data: {
                JobOpenings: [],
                Interviews: [],
                Calls: [],
                Offers: [],
                Candidates: []
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
   MODULE API
===================================== */

app.get("/module/:moduleName", async (req, res) => {

    try {

        const moduleName =
        req.params.moduleName;

        res.json({

            success: true,

            module: moduleName,

            data: []

        });

    } catch (error) {

        res.status(500).json({

            success: false,
            error: error.message

        });

    }

});

/* =====================================
   PORT
===================================== */

const PORT =
process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(
        `Server Running On Port ${PORT}`
    );

});