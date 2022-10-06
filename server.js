// packages

const express = require('express');
const helmet = require('helmet');
const mariadb = require('mariadb');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

// env load

dotenv.config();

// create connection pool to db

const pool = mariadb.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
    connectionLimit: 5
})

// create express app

const app = express();

// use helmet and json

app.use(helmet());
app.use(express.json());

// add ratelimit use cloudflare-ip header as keygenerator; use x-api-key header to bypass ratelimit

const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,

    keyGenerator: async (req) => {
        return req.headers['cf-connecting-ip'] || req.ip;
    },

    handler: (req, res) => {
        res.status(429).json({ error: 'Too many requests, please try again later.' });
    },

    skip: (req) => {
        return req.headers['x-api-key'] == process.env.API_KEY;
    }
})

app.use(limiter);

// check x-api-key

async function checkKey(req, res, next) {
    if (req.headers['x-api-key'] != process.env.API_KEY) {
        return res.status(401).json(
            { error: 'Invalid API key.' }
        );
    }

    next()
}

// routes

app.get('/', async (req, res) => {
    res.status(200).json({
        status: 'online',
    })
});

// update user data

app.put("/v1/player-data/update/:id", checkKey, async (req, res) => {
    const {id} = req.params;
    const {points, inventory, challenges} = req.body;

    if (!id) {
        return res.status(400).json({
            error: 'Missing id parameter'
        })
    }

    const conn = await pool.getConnection();

    try {
        await conn.query("UPDATE `playerdata` SET points = ?, inventory = ?, challenges = ? WHERE userid = ?;", [points, JSON.stringify(inventory), JSON.stringify(challenges), id])

        res.status(200).json({
            status: 'success'
        })
    } catch (err) {
        res.status(500).json({
            error: err
        })
    }

    conn.release()
})

// get user data by userid

app.get('/v1/player-data/:id', checkKey, async (req, res) => {
    const {id} = req.params;

    if (!id) {
        return res.status(400).json({
            error: 'Missing id parameter'
        })
    }

    const conn = await pool.getConnection();

    try {
        const rows = await conn.query(`SELECT points, challenges, inventory FROM \`playerdata\` WHERE userid = ? LIMIT 1;`, [id]);
        const row = rows[0]

        if (row) {
            row.inventory = JSON.parse(row.inventory);
            row.challenges = JSON.parse(row.challenges);

            res.status(200).json(row);
        } else {
            res.status(404).json({
                error: 'User not found'
            })
        }
    } catch (err) {
        res.status(500).json({
            error: err
        })
    }

    conn.release();
});

// start server

app.listen(process.env.PORT || 3000, () => {
    console.log('Server started');
})