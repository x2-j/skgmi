import { sqlite3 } from "sqlite3";
import crypto from 'crypto';

const sqlite3 = require('sqlite3').verbose();
export let conn: typeof sqlite3["Database"] | null;

export function hashIt(input: string): string {
  const salt = '!fA3$@#33:ad624:!1535';

  return crypto.createHash('md5').update(`${salt}:${input}:${salt}`).digest("hex");
}

export const db = () => {
  conn = new sqlite3.Database('data/users.db', sqlite3.OPEN_READWRITE, (err: any) => {
    if (err && err.code == "SQLITE_CANTOPEN") {
      var created = new sqlite3.Database('data/users.db', (err: string) => {
        if (err) {
            console.log("createDatabase: Getting error " + err);
            // exit(1);
            process.exit(1)
        }
        createTables();
      });
      conn = created;
    } else if (err) {
      console.log("Getting error " + err);
      // exit(1);
      process.exit(1)
    }
  });

  return conn;
}

function createTables() {
  if (!conn) return;

  conn.exec(`CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      corporation TEXT,
      discord_id TEXT NOT NULL UNIQUE,
      hash TEXT NOT NULL,
      status TEXT,
      access_token TEXT,
      refresh_token TEXT,
      character_id TEXT
  );`, () => {
    console.log('Table created...')
  });
}

export function createUser(discordId: string): Promise<void> {
  
  return new Promise(async (resolve, reject) => {
    if (!conn) return reject();
    try {
      const user = await getUser(discordId);
      if (user) {
        console.log('User already exists')
        return reject();
      }

      const hash = hashIt(discordId);
      conn.run('INSERT INTO users VALUES (null, null, null, ?, ?, ?, null, null, null)', [discordId, hash, 'pending'])

      logAllUsers()
      resolve();
       
    } catch (error) {
      console.log(error)
      reject();
    }
  });
}

export function updateUser(discordId: string, values: [string, string][]): void {
  if (!conn) return;
  if (!values) return;
  if (!discordId) return;

  const query = `UPDATE users SET ${values.map((value) => {
    return ` ${value[0]} = "${value[1]}"`
  }).toString()} WHERE discord_id = ?`;
  conn.run(query, [discordId]);
  console.log('User updated ' + discordId)
  console.log(query)
  logAllUsers()
}

export function deleteUser(discordId: string): Promise<void> {
  if (!conn) return new Promise((resolve, reject) => {reject()});

  return new Promise((resolve, reject) => {
    conn.run('DELETE FROM users WHERE discord_id = ?', [discordId], () => {
      console.log('User deleted ' + discordId)
      logAllUsers()
      resolve();
    })
  })
}

export function getUser(discordId: string): Promise<any> {
  if (!conn) return new Promise((resolve, reject) => {reject()});

  return new Promise((resolve, reject) => {
    conn.get('SELECT * FROM users WHERE discord_id = ? LIMIT 1', [discordId], (err: any, rows: any) => {
      if (err) {
        console.log(err)
        reject();
      }

      console.table(rows)
      resolve(rows)
    })
  })
}

export function getUserByHash(hash: string): Promise<any> {
  if (!conn) return new Promise((resolve, reject) => {reject()});

  return new Promise((resolve, reject) => {
    conn.get('SELECT * FROM users WHERE hash = ? LIMIT 1', [hash], (err: any, rows: any) => {
      if (err) {
        console.log(err)
        reject();
      }
  
      console.table(rows)
      resolve(rows)
    })
  })
}

export function logAllUsers(): void {
  if (!conn) return;

  conn.all('SELECT * FROM users', (err: any, rows: any) => {
    if (err) {
      console.log(err)
      return;
    }
    console.log('Users')
    console.table(rows)
  })
}
