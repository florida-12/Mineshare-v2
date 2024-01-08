const { Client } = require('pg');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

async function checkRating() {
    try {
        const client = new Client({
            user: process.env.DATABASE_USER,
            password: process.env.DATABASE_PASSWORD,
            host: 'mineshare.top',
            port: 5432,
            database: 'mineshare_v2',
        });

        await client.connect();

        const result = await client.query('SELECT * FROM servers;');
        const servers = result.rows;

        for (const server of servers) {
            const serverUrl = `https://api.mcstatus.io/v2/status/java/${server.ip}:${server.port}`;

            try {
                const response = await axios.get(serverUrl);
                const serverStatus = response.data;

                const currentPlayers = serverStatus.players.online;

                if (server.banner != 'default-server-picture.gif') {
                    if (!server.banner_rate_add) {
                        await client.query(`UPDATE servers SET banner_rate_add = true, rate = $1 WHERE ip = $2;`, [(server.rate + 10), server.ip]);
                    }
                } else {
                    if (server.banner_rate_add) {
                        await client.query(`UPDATE servers SET banner_rate_add = false, rate = $1 WHERE ip = $2;`, [(server.rate - 10), server.ip]);
                    }
                }

                if (server.premium_status) {
                    if (!server.premium_rate_add) {
                        await client.query(`UPDATE servers SET premium_rate_add = true, rate = $1 WHERE ip = $2;`, [(server.rate + 10), server.ip]);
                    }
                } else {
                    if (server.premium_rate_add) {
                        await client.query(`UPDATE servers SET premium_rate_add = false, rate = $1 WHERE ip = $2;`, [(server.rate - 10), server.ip]);
                    }
                }

                if (server.verification) {
                    if (!server.verification_rate_add) {
                        await client.query(`UPDATE servers SET verification_rate_add = true, rate = $1 WHERE ip = $2;`, [(server.rate + 10), server.ip]);
                    }
                } else {
                    if (server.verification_rate_add) {
                        await client.query(`UPDATE servers SET verification_rate_add = false, rate = $1 WHERE ip = $2;`, [(server.rate - 10), server.ip]);
                    }
                }

                if (currentPlayers > 5) {
                    if (!server.activity_rate_add) {
                        await client.query(`UPDATE servers SET activity_rate_add = true, rate = $1 WHERE ip = $2;`, [(server.rate + 10), server.ip]);
                    }
                } else {
                    if (server.activity_rate_add) {
                        await client.query(`UPDATE servers SET activity_rate_add = false, rate = $1 WHERE ip = $2;`, [(server.rate - 10), server.ip]);
                    }
                }        
                
                if (currentPlayers > 40) {
                    if (!server.popularity_rate_add) {
                        await client.query(`UPDATE servers SET popularity_rate_add = true, rate = $1 WHERE ip = $2;`, [(server.rate + 10), server.ip]);
                    }
                } else {
                    if (server.popularity_rate_add) {
                        await client.query(`UPDATE servers SET popularity_rate_add = false, rate = $1 WHERE ip = $2;`, [(server.rate - 10), server.ip]);
                    }
                }

                if (currentPlayers > 100) {
                    if (!server.superiority_rate_add) {
                        await client.query(`UPDATE servers SET superiority_rate_add = true, rate = $1 WHERE ip = $2;`, [(server.rate + 10), server.ip]);
                    }
                } else {
                    if (server.superiority_rate_add) {
                        await client.query(`UPDATE servers SET superiority_rate_add = false, rate = $1 WHERE ip = $2;`, [(server.rate - 10), server.ip]);
                    }
                }
            } catch (error) {
                console.error(error.message);
            }
        }

        await client.end();

        console.log('------------------------------------------------');
    } catch (error) {
        console.error('Ошибка при подключении к базе данных:', error.message);
    }
}

setInterval(checkRating, 30000);