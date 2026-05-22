const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// =======================================
// ZOHO RECRUIT CONFIG
// =======================================

const CLIENT_ID =
    "1000.NHMGYZU58QP5NUM2ZA55Y9VAW227UY";

const CLIENT_SECRET =
    "0d395185ccd381475704a6857ddb44f3dbc46d97ab";

const REFRESH_TOKEN =
    "1000.d08be19c7a78699b56a3b712c794dd23.177f1f9dc565bb25869b0ac70af695ba";

const TOKEN_URL =
    "https://accounts.zoho.in/oauth/v2/token";

// =======================================
// ALL MODULES
// =======================================

const MODULES = {
    JobOpenings:
        "https://recruit.zoho.in/recruit/v2/JobOpenings",

    Candidates:
        "https://recruit.zoho.in/recruit/v2/Candidates",

    Interviews:
        "https://recruit.zoho.in/recruit/v2/Interviews",

    ToDos:
        "https://recruit.zoho.in/recruit/v2/ToDos",

    Offers:
        "https://recruit.zoho.in/recruit/v2/Offers",

    Calls:
        "https://recruit.zoho.in/recruit/v2/Calls"
};

// =======================================
// GET ACCESS TOKEN
// =======================================

async function getAccessToken() {

    try {

        const response = await fetch(
            TOKEN_URL,
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

        return result.access_token;

    } catch (error) {

        console.log("Token Error:", error);

        return null;
    }
}

// =======================================
// FETCH ALL RECORDS WITH PAGINATION
// =======================================

async function fetchAllRecords(baseUrl, accessToken) {

    let allData = [];

    let page = 1;

    let hasMore = true;

    try {

        while (hasMore) {

            const url =
                `${baseUrl}?page=${page}&per_page=200`;

            console.log("Fetching:", url);

            const response = await fetch(
                url,
                {
                    method: "GET",

                    headers: {
                        Authorization:
                            `Zoho-oauthtoken ${accessToken}`,

                        Accept:
                            "application/json"
                    }
                }
            );

            const result = await response.json();

            if (result.data && result.data.length > 0) {

                allData = [
                    ...allData,
                    ...result.data
                ];

                console.log(
                    `Page ${page} Records:`,
                    result.data.length
                );

                // IF LESS THAN 200 => LAST PAGE
                if (result.data.length < 200) {
                    hasMore = false;
                } else {
                    page++;
                }

            } else {

                hasMore = false;
            }
        }

        console.log(
            "Total Records:",
            allData.length
        );

        return {
            success: true,
            data: allData
        };

    } catch (error) {

        console.log("Fetch Error:", error);

        return {
            success: false,
            error: error.message,
            data: []
        };
    }
}

// =======================================
// RECRUITERWISE AGGREGATION LOGIC
// =======================================

function buildRecruiterReport(
    jobs,
    interviews,
    calls,
    offers,
    candidates
) {

    const report = {};

    // INIT FUNCTION

    const initRecruiter = (name) => {

        if (!report[name]) {

            report[name] = {
                recruiter: name,
                jobs: 0,
                candidates: 0,
                interviews: 0,
                calls: 0,
                offers: 0
            };
        }
    };

    // MAPS

    const jobInterviewsMap = {};
    const jobCallsMap = {};
    const jobOffersMap = {};
    const jobCandidatesMap = {};

    // =======================================
    // INTERVIEWS MAP
    // =======================================

    interviews.forEach(item => {

        const jobId =
            item.posting_title?.id ||
            item.Job_Opening_Name?.id;

        if (jobId) {

            if (!jobInterviewsMap[jobId]) {
                jobInterviewsMap[jobId] = [];
            }

            jobInterviewsMap[jobId].push(item);
        }
    });

    // =======================================
    // CALLS MAP
    // =======================================

    calls.forEach(item => {

        const jobId =
            item.Posting_Title?.id ||
            item.Related_To?.id;

        if (jobId) {

            if (!jobCallsMap[jobId]) {
                jobCallsMap[jobId] = [];
            }

            jobCallsMap[jobId].push(item);
        }
    });

    // =======================================
    // OFFERS MAP
    // =======================================

    offers.forEach(item => {

        const jobId =
            item.Job_Opening_Name?.id;

        if (jobId) {

            if (!jobOffersMap[jobId]) {
                jobOffersMap[jobId] = [];
            }

            jobOffersMap[jobId].push(item);
        }
    });

    // =======================================
    // CANDIDATES MAP
    // =======================================

    candidates.forEach(item => {

        const jobId =
            item.Job_Opening_Name?.id ||
            item.Posting_Title?.id;

        if (jobId) {

            if (!jobCandidatesMap[jobId]) {
                jobCandidatesMap[jobId] = [];
            }

            jobCandidatesMap[jobId].push(item);
        }
    });

    // =======================================
    // BUILD REPORT
    // =======================================

    jobs.forEach(job => {

        const jobId = job.id;

        let recruiters = [];

        if (Array.isArray(job.Assigned_Recruiter)) {

            recruiters = job.Assigned_Recruiter;

        } else if (job.Assigned_Recruiter) {

            recruiters = [job.Assigned_Recruiter];
        }

        const interviewCount =
            jobInterviewsMap[jobId]?.length || 0;

        const callCount =
            jobCallsMap[jobId]?.length || 0;

        const offerCount =
            jobOffersMap[jobId]?.length || 0;

        const candidateCount =
            jobCandidatesMap[jobId]?.length || 0;

        // NO RECRUITER

        if (recruiters.length === 0) {

            const fallback = "Unassigned";

            initRecruiter(fallback);

            report[fallback].jobs++;

            report[fallback].candidates +=
                candidateCount;

            report[fallback].interviews +=
                interviewCount;

            report[fallback].calls +=
                callCount;

            report[fallback].offers +=
                offerCount;

        } else {

            recruiters.forEach(r => {

                const recruiterName =
                    r.name ||
                    "Unknown Recruiter";

                initRecruiter(recruiterName);

                report[recruiterName].jobs++;

                report[recruiterName].candidates +=
                    candidateCount;

                report[recruiterName].interviews +=
                    interviewCount;

                report[recruiterName].calls +=
                    callCount;

                report[recruiterName].offers +=
                    offerCount;
            });
        }
    });

    return Object.values(report);
}

// =======================================
// RECRUITER REPORT API
// =======================================

app.get(
    "/recruiter-report",
    async (req, res) => {

        try {

            const accessToken =
                await getAccessToken();

            // FETCH ALL DATA WITH PAGINATION

            const [
                jobsRes,
                candidatesRes,
                interviewsRes,
                callsRes,
                offersRes
            ] = await Promise.all([

                fetchAllRecords(
                    MODULES.JobOpenings,
                    accessToken
                ),

                fetchAllRecords(
                    MODULES.Candidates,
                    accessToken
                ),

                fetchAllRecords(
                    MODULES.Interviews,
                    accessToken
                ),

                fetchAllRecords(
                    MODULES.Calls,
                    accessToken
                ),

                fetchAllRecords(
                    MODULES.Offers,
                    accessToken
                )
            ]);

            const jobs =
                jobsRes.data || [];

            const candidates =
                candidatesRes.data || [];

            const interviews =
                interviewsRes.data || [];

            const calls =
                callsRes.data || [];

            const offers =
                offersRes.data || [];

            // FINAL REPORT

            const finalReport =
                buildRecruiterReport(
                    jobs,
                    interviews,
                    calls,
                    offers,
                    candidates
                );

            res.json({
                success: true,

                total_recruiters:
                    finalReport.length,

                total_jobs:
                    jobs.length,

                total_candidates:
                    candidates.length,

                total_interviews:
                    interviews.length,

                total_calls:
                    calls.length,

                total_offers:
                    offers.length,

                data: finalReport
            });

        } catch (error) {

            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// =======================================
// GET ALL DATA
// =======================================

app.get(
    "/all-data",
    async (req, res) => {

        try {

            const accessToken =
                await getAccessToken();

            const result = {};

            await Promise.all(

                Object.keys(MODULES).map(
                    async (key) => {

                        result[key] =
                            await fetchAllRecords(
                                MODULES[key],
                                accessToken
                            );
                    }
                )
            );

            res.json({
                success: true,
                data: result
            });

        } catch (error) {

            res.status(500).json({
                error: error.message
            });
        }
    }
);

// =======================================
// SINGLE MODULE ROUTE
// =======================================

app.get(
    "/module/:name",
    async (req, res) => {

        try {

            const accessToken =
                await getAccessToken();

            const moduleName =
                req.params.name;

            const url =
                MODULES[moduleName];

            if (!url) {

                return res.status(400).json({
                    error:
                        "Invalid module name"
                });
            }

            // FETCH ALL RECORDS
            const data =
                await fetchAllRecords(
                    url,
                    accessToken
                );

            res.json(data);

        } catch (error) {

            res.status(500).json({
                error: error.message
            });
        }
    }
);

// =======================================
// HOME
// =======================================

app.get("/", (req, res) => {

    res.send(
        "Zoho Recruit Multi-Module API Running"
    );
});

// =======================================
// START SERVER
// =======================================

const PORT = 3000;

app.listen(PORT, () => {

    console.log(
        `Server running at http://localhost:${PORT}`
    );
});