import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import { Client, GatewayIntentBits } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds, "GuildMessages", "DirectMessages", "MessageContent", "GuildMembers", "GuildModeration"] });
const hbs = require('hbs');
const path = require('path')

dotenv.config();

import { createUser, db, deleteUser, getUserByHash, hashIt, logAllUsers, updateUser } from './database'

const APP_URL = process.env.NODE_ENV === 'production' ? 'https://chambray-magenta-bellusaurus.glitch.me' : 'http://localhost:3000';
const CALLBACK_URI = APP_URL + '/sso/'

const app: Express = express();
const EXPRESS_PORT = process.env.PORT || 3000;

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, '../views'))

hbs.localsAsTemplateData(app);
app.use(express.static(path.join(__dirname, '../public')));

const sqlite = db();
let discord: Client | null = null;

// Routes ----------------------------------------------------------------------

// SSO Callback Route
app.get("/sso", async (req: Request, res: Response) => {
  const code = req.query.code;
  const state = req.query.state;

  if (!code || !state) {
    res.render('404');
    process.exit(1);
  }

  try {
    await verifyUser(code as string, state as string);
    res.render('verified');
  } catch (error) {
    res.render('404');
  }
});


// Log Users
app.get("/users", (req: Request, res: Response) => {
  logAllUsers()
  res.render('404');
});


// Index Route
app.get("/:hash?", (req: Request, res: Response) => {
  const hash = req.params.hash;

  app.locals.clientID = process.env.CLIENT_ID;
  app.locals.redirectUri = encodeURIComponent(CALLBACK_URI);
  app.locals.hash = hash;

  res.render('index');
});


// 404 Route
app.get("*", (req: Request, res: Response) => res.render('404'));


// Initialise
app.listen(EXPRESS_PORT, () => {
  console.log(`[server]: Server is running at ${APP_URL}`);

  // Discord Bot
  client.on('ready', () => {
    if (!client.user) return;
    
    discord = client;
    console.log(`Logged in as ${client.user.tag}!`);

    client.guilds.cache.get(process.env.GUILD_ID)?.client.user?.setActivity('use !verify to link your EVE-Online account');

    // On discord messasge
    client.guilds.cache.get(process.env.GUILD_ID)?.client.on('messageCreate', async message => {
      console.log(message)
      if (message.author.bot) return;

      if (message.content === '!verify') {
        await createUser(message.author.id).catch(() => {});
        message.reply("I've just sent you a verification link! Please check your DMs.");
        message.author.send(`Please login to EVE-Online via our verification portal: ${APP_URL}/${hashIt(message.author.id)}.\n\n Verification links are tied to Discord accounts and can be deleted at any time using \`!delete\` in the \`#eve-account-link\` channel.`);
      }

      if (message.content === '!delete') {
        await deleteUser(message.author.id);
        // bot.removeGuildMemberRole(process.env.GUILD_ID, msg.author.id, '1256266722982498354', 'Character is unverified').then(() => {
        //   bot.removeGuildMemberRole(process.env.GUILD_ID, msg.author.id, '1256264080893804544', 'Character is unverified');
        // });
        
        message.reply("Your account has been deleted.");
        // Use discord.js to remove role 1256266722982498354 from user with id msg.author.id and reason 'Character is unverified'

        // GuildMemberManager add role to user with id msg.author.id and reason 'Character is unverified'
        client.guilds.cache.get(process.env.GUILD_ID)?.members.fetch(message.author.id).then(member => {
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
function verifyUser(code: string, state: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    const user = await getUserByHash(state);
    if (!user) {
      reject('User not found');
    }

    console.log(user)
    const discordId = user.discord_id;

    try {
      const key = await fetch('https://login.eveonline.com/v2/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${process.env.CLIENT_ID}:${process.env.SECRET}`).toString('base64')}`
        },
        body: `grant_type=authorization_code&code=${code}`
      })
      const data = await key.json();
      const token = data.access_token;
      const refresh = data.refresh_token;

      const authToken = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };

      // validate token and get character publicData
      const verify = await fetch('https://login.eveonline.com/oauth/verify', authToken);
      const oauth = await verify.json();
      console.log(oauth);

      const character = await fetch('https://esi.evetech.net/latest/characters/' + oauth.CharacterID + '/', authToken)
      const charData = await character.json();
      console.log(charData);

      const corporation = await fetch('https://esi.evetech.net/latest/corporations/' + charData.corporation_id + '/', authToken)
      const corp = await corporation.json();
      console.log(corp);

      updateUser(discordId, [
        ['hash', state],
        ['status', 'verified'],
        ['access_token', token],
        ['refresh_token', refresh],
        ['character_id', oauth.CharacterID],
        ['corporation', corp.name],
        ['username', charData.name]
      ])

      discord?.guilds.cache.get(process.env.GUILD_ID)?.members.fetch(discordId).then(member => {
        member.roles.add('1256266722982498354', 'Character is verified');
        member.setNickname(charData.name);
        if (corp.name === 'Sakagami Incorporated') member.roles.add('1256264080893804544', 'Character is in Sakagami Incorporated');
      });

      resolve();

    } catch (error) {
      console.error(error);
      reject();
    }
  });
}
