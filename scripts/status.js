const { Client } = require('pg');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

async function updateServerStatus(ip, online, currentPlayers, maxPlayers) {
  const client = new Client({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: 'mineshare.top',
    port: 5432,
    database: 'mineshare_v2',
  });

  try {
    await client.connect();
    await client.query(
      `UPDATE servers SET online_status = $1, current_players = $2, max_players = $3 WHERE ip = $4;`,
      [online, currentPlayers, maxPlayers, ip]
    );
  } catch (error) {
    console.error(`Ошибка при обновлении статуса сервера ${ip} в базе данных:`, error.message);
  } finally {
    await client.end();
  }
}

async function checkServersOnline() {
  try {
    const client = new Client({
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      host: 'mineshare.top',
      port: 5432,
      database: 'mineshare_v2',
    });

    await client.connect();

    const result = await client.query('SELECT ip, port, premium_regdate FROM servers ORDER by id;');
    const servers = result.rows;

    for (const server of servers) {
      const serverUrl = `https://api.mcstatus.io/v2/status/java/${server.ip}:${server.port}`;

      try {
        const response = await axios.get(serverUrl);
        const serverStatus = response.data;

        const online = serverStatus.online;
        const currentPlayers = serverStatus.players.online;
        const maxPlayers = serverStatus.players.max;

        console.log(`Сервер ${server.ip} ${online ? 'онлайн' : 'офлайн'}. Игроков: ${currentPlayers}/${maxPlayers}`);

        // Check premium_regdate and update premium_status
        const currentDate = new Date();
        const premiumRegDate = new Date(server.premium_regdate);
        const daysDifference = Math.floor((currentDate - premiumRegDate) / (1000 * 60 * 60 * 24));

        if (Math.abs(daysDifference) > 30) {
          // Set premium_status to false if more than 30 days
          await client.query(`UPDATE servers SET premium_status = false WHERE ip = $1;`, [server.ip]);
        }

        // Обновляем статус в базе данных
        await updateServerStatus(server.ip, online, currentPlayers, maxPlayers);
      } catch (error) {
        console.error(`Ошибка при получении статуса сервера ${server.ip}:`, error.message);
      }
    }

    await client.end();

    setTimeout(checkServersOnline, 60000);
    console.log('------------------------------------------------');
  } catch (error) {
    console.error('Ошибка при подключении к базе данных:', error.message);
  }
}

checkServersOnline();
