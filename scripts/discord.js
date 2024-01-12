const dotenv = require('dotenv');
const { Client, GatewayIntentBits } = require('discord.js')


const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent]
});


client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on('guildMemberAdd', member => {
    console.log('User: ' + member.user.username + ' has joined the server!');
    let role = member.guild.roles.cache.find(role => role.name === "📔 | Участник");
    member.roles.add(role);
});


dotenv.config();

client.login(process.env.DISCORD_TOKEN);
