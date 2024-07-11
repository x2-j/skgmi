"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const discord_js_1 = require("discord.js");
const client = new discord_js_1.Client({
    intents: [
        discord_js_1.GatewayIntentBits.Guilds,
        'GuildMessages',
        'DirectMessages',
        'MessageContent',
        'GuildMembers',
        'GuildModeration'
    ]
});
const hbs = require('hbs');
const path = require('path');
dotenv_1.default.config();
const database_1 = require("./database");
const APP_URL = process.env.NODE_ENV === 'production'
    ? 'https://chambray-magenta-bellusaurus.glitch.me'
    : 'http://localhost:3000';
const CALLBACK_URI = APP_URL + '/sso/';
const app = (0, express_1.default)();
const EXPRESS_PORT = process.env.PORT || 3000;
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, '../views'));
hbs.localsAsTemplateData(app);
app.use(express_1.default.static(path.join(__dirname, '../public')));
const sqlite = (0, database_1.db)();
let discord = null;
// Routes ----------------------------------------------------------------------
// SSO Callback Route
app.get('/sso', async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    if (!code || !state) {
        res.render('404');
        process.exit(1);
    }
    try {
        await verifyUser(code, state);
        res.render('verified');
    }
    catch (error) {
        res.render('404');
    }
});
// Log Users
app.get('/users', (req, res) => {
    (0, database_1.logAllUsers)();
    res.render('404');
});
// Index Route
app.get('/:hash?', (req, res) => {
    const hash = req.params.hash;
    app.locals.clientID = process.env.CLIENT_ID;
    app.locals.redirectUri = encodeURIComponent(CALLBACK_URI);
    app.locals.hash = hash;
    res.render('index');
});
// 404 Route
app.get('*', (req, res) => res.render('404'));
// Initialise
app.listen(EXPRESS_PORT, () => {
    console.log(`[server]: Server is running at ${APP_URL}`);
    // Discord Bot
    client.on('ready', () => {
        if (!client.user)
            return;
        discord = client;
        console.log(`Logged in as ${client.user.tag}!`);
        if (!process.env.GUILD_ID)
            return;
        client.guilds.cache
            .get(process.env.GUILD_ID)
            ?.client.user?.setActivity('use !verify to link your EVE-Online account');
        client.guilds.cache
            .get(process.env.GUILD_ID)
            ?.client.on('messageCreate', async (message) => {
            console.log(message);
            if (message.author.bot)
                return;
            if (message.content === '!verify') {
                await (0, database_1.createUser)(message.author.id).catch(() => { });
                message.reply("I've just sent you a verification link! Please check your DMs.");
                message.author.send(`Please login to EVE-Online via our verification portal: ${APP_URL}/${(0, database_1.hashIt)(message.author.id)}.\n\n Verification links are tied to Discord accounts and can be deleted at any time using \`!delete\` in the \`#eve-account-link\` channel.`);
            }
            if (message.content === '!delete') {
                await (0, database_1.deleteUser)(message.author.id);
                message.reply('Your account has been deleted.');
                if (!process.env.GUILD_ID)
                    return;
                client.guilds.cache
                    .get(process.env.GUILD_ID)
                    ?.members.fetch(message.author.id)
                    .then((member) => {
                    member.roles.remove('1256266722982498354', 'Character is unverified');
                    member.roles.remove('1256264080893804544', 'Character is unverified');
                });
            }
        });
    });
    // bot.connect();
    client.login(process.env.DISCORD_AUTH);
});
// EVE-Online SSO --------------------------------------------------------------
function verifyUser(code, state) {
    return new Promise(async (resolve, reject) => {
        const user = await (0, database_1.getUserByHash)(state);
        if (!user) {
            reject('User not found');
        }
        console.log(user);
        const discordId = user.discord_id;
        try {
            const key = await fetch('https://login.eveonline.com/v2/oauth/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    Authorization: `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.SECRET}`).toString('base64')}`
                },
                body: `grant_type=authorization_code&code=${code}`
            });
            const data = await key.json();
            const token = data.access_token;
            const refresh = data.refresh_token;
            const authToken = {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            };
            // validate token and get character publicData
            const verify = await fetch('https://login.eveonline.com/oauth/verify', authToken);
            const oauth = await verify.json();
            console.log(oauth);
            const character = await fetch('https://esi.evetech.net/latest/characters/' + oauth.CharacterID + '/', authToken);
            const charData = await character.json();
            console.log(charData);
            const corporation = await fetch('https://esi.evetech.net/latest/corporations/' +
                charData.corporation_id +
                '/', authToken);
            const corp = await corporation.json();
            console.log(corp);
            (0, database_1.updateUser)(discordId, [
                ['hash', state],
                ['status', 'verified'],
                ['character_id', oauth.CharacterID],
                ['corporation', corp.name],
                ['username', charData.name]
            ]);
            if (!process.env.GUILD_ID)
                return;
            discord?.guilds.cache
                .get(process.env.GUILD_ID)
                ?.members.fetch(discordId)
                .then((member) => {
                member.roles.add('1256266722982498354', 'Character is verified');
                member.setNickname(charData.name);
                if (corp.name === 'Sakagami Incorporated')
                    member.roles.add('1256264080893804544', 'Character is in Sakagami Incorporated');
            });
            resolve();
        }
        catch (error) {
            console.error(error);
            reject();
        }
    });
}
