const { Client } = require('pg');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

async function createClient() {
  return new Client({
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    host: process.env.DATABASE_HOST || 'craftomania.net',
    port: 5432,
    database: process.env.DATABASE_NAME || 'mineshare_v2',
  });
}

async function updateServerStatus(client, ip, online, currentPlayers, maxPlayers) {
  try {
    await client.query(
      `UPDATE servers SET online_status = $1, current_players = $2, max_players = $3 WHERE ip = $4;`,
      [online, currentPlayers, maxPlayers, ip]
    );
    console.log(`Updated status for server ${ip}: online=${online}, players=${currentPlayers}/${maxPlayers}`);
  } catch (error) {
    console.error(`Error updating status for server ${ip} in the database:`, error.message);
  }
}

async function updatePremiumStatus(client, server) {
  const currentDate = new Date();
  const premiumRegDate = new Date(server.premium_regdate);

  if (isNaN(premiumRegDate.getTime())) {
    console.error('Invalid premium_regdate:', server.premium_regdate);
    return;
  }

  const daysDifference = Math.floor((currentDate - premiumRegDate) / (1000 * 60 * 60 * 24));
  if (daysDifference > 30) {
    try {
      await client.query(`UPDATE servers SET premium_status = false WHERE ip = $1;`, [server.ip]);
      console.log(`Updated premium_status to false for server ${server.ip}`);
    } catch (error) {
      console.error('Error updating premium_status:', error.message);
    }
  }
}

async function checkServerStatus(client, server) {
  const serverUrl = `https://api.mcstatus.io/v2/status/java/${server.ip}:${server.port}`;

  try {
    const response = await axios.get(serverUrl);
    const serverStatus = response.data;

    if (!serverStatus || (serverStatus.online === undefined && !serverStatus.players)) {
      throw new Error('Invalid server status response');
    }

    const online = serverStatus.online ?? false; // default to false if undefined
    const currentPlayers = serverStatus.players ? serverStatus.players.online : 0; // default to 0 if undefined
    const maxPlayers = serverStatus.players ? serverStatus.players.max : 0; // default to 0 if undefined

    console.log(`Server ${server.ip} is ${online ? 'online' : 'offline'}. Players: ${currentPlayers}/${maxPlayers}`);

    await updatePremiumStatus(client, server);
    await updateServerStatus(client, server.ip, online, currentPlayers, maxPlayers);
  } catch (error) {
    console.error(`Error fetching status for server ${server.ip}:`, error.message);
  }
}

async function checkServersOnline() {
  const client = await createClient();

  try {
    await client.connect();
    const result = await client.query('SELECT ip, port, premium_regdate FROM servers ORDER by id;');
    const servers = result.rows;

    for (const server of servers) {
      await checkServerStatus(client, server);
    }

    setTimeout(checkServersOnline, 60000);
    console.log('------------------------------------------------');
  } catch (error) {
    console.error('Error connecting to the database:', error.message);
  } finally {
    await client.end();
  }
}

checkServersOnline();
