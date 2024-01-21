const dotenv = require('dotenv');
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js')


const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent]
});


client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    const imageEmbed = new EmbedBuilder().setColor(0x2b2d31).setImage('https://mineshare.top/img/mineshare-wallpaper.png');

    const rulesEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(`
        **[Общие постановления]**

        \`1.1\` Запрещен спам, флуд, оффтоп.
        \`1.2\` Запрещены рекламная и предпринимательская деятельность.
        \`1.3\` Запрещены обман, скам и дезинформация участников.
        \`1.4\` Запрещено обсуждение тем провокационного характера.
        \`1.5\` Запрещено прямое или косвенное оскорбление администрации.
        \`1.5\` Запрещено нарушение правил сообщества [Discord](https://discord.com/guidelines).
        
        **[Голосовые каналы]**
        
        \`2.1\` Запрещено создавать помехи общению.
        \`2.2\` Запрещено использование сторонних программ.
        \`2.3\` Запрещено злоупотребление переходами между голосовыми каналами.
        
        **[Административный кодекс]**
        
        \`3.1\` Администрация сама в праве определять меру пресечения.
        \`3.2\` Блокировка аккаунта является крайней мерой пресечения.
        \`3.3\` Заблокированный аккаунт не подлежит восстановлению.
        
        **Незнание правил не освобождает от ответственности!**`)
        .setImage('https://mineshare.top/img/mineshare-underline.png');

    const servicesEmbed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setDescription(`        
        **[Премиум-подписка]**
        
        Премиум статус предоставляет возможность выбора уникальной раскаски, которая выделит ваш сервер среди остальных. Также вам начисляются дополнительные рейтинговые очки и множитель лайков.
        
        **[Cloud-бустер]**
        
        Используйте CloudBoost, чтобы моментально получить +50 очков рейтинга для выбранного сервера. В случае, если ваш рейтинговый счет составляет 100 единиц, то бустер даст не более +10 дополнительных очков. Это отличный способ вывести ваш сервер сразу на первые места в рейтинге.
        
        \`\`\`Бустерам нашего дискорд-сервера предоставляется безлимитная премиум-подписка на любой выбранный сервер (которым владеет пользователь) на период буста дискорд-сервера. Для получения услуги по данной акции вам следует обратиться к администрации проекта.\`\`\`
        -
        `)
        .addFields({ name: 'Премиум-подписка', value: '249₽ или 105₴', inline: true }, { name: 'Cloud-бустер', value: '199₽ или 85₴', inline: true })
        .setImage('https://mineshare.top/img/mineshare-underline.png');

    const rules_channel = await client.channels.fetch("912844244312543333");
    const services_channel = await client.channels.fetch("912853199193534485");

    //services_channel.send({ embeds: [imageEmbed] });
    //services_channel.send({ embeds: [servicesEmbed] });
});

client.on('guildMemberAdd', member => {
    console.log('User: ' + member.user.username + ' has joined the server!');
    let role = member.guild.roles.cache.find(role => role.name === "📔 | Участник");
    member.roles.add(role);
});


dotenv.config();

client.login(process.env.DISCORD_TOKEN);
