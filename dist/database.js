"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.conn = void 0;
exports.hashIt = hashIt;
exports.createUser = createUser;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
exports.getUser = getUser;
exports.getUserByHash = getUserByHash;
exports.logAllUsers = logAllUsers;
const crypto_1 = __importDefault(require("crypto"));
const sqlite3 = require('sqlite3').verbose();
function hashIt(input) {
    const salt = '!fA3$@#33:ad624:!1535';
    return crypto_1.default.createHash('md5').update(`${salt}:${input}:${salt}`).digest("hex");
}
const db = () => {
    exports.conn = new sqlite3.Database('data/users.db', sqlite3.OPEN_READWRITE, (err) => {
        if (err && err.code == "SQLITE_CANTOPEN") {
            var created = new sqlite3.Database('data/users.db', (err) => {
                if (err) {
                    console.log("createDatabase: Getting error " + err);
                    process.exit(1);
                }
                createTables();
            });
            exports.conn = created;
        }
        else if (err) {
            console.log("Getting error " + err);
            process.exit(1);
        }
    });
    return exports.conn;
};
exports.db = db;
function createTables() {
    if (!exports.conn)
        return;
    exports.conn.exec(`CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      corporation TEXT,
      discord_id TEXT NOT NULL UNIQUE,
      hash TEXT NOT NULL,
      status TEXT,
      character_id TEXT
  );`, () => {
        console.log('Table created...');
    });
}
function createUser(discordId) {
    return new Promise(async (resolve, reject) => {
        if (!exports.conn)
            return reject();
        try {
            const user = await getUser(discordId);
            if (user) {
                console.log('User already exists');
                return reject();
            }
            const hash = hashIt(discordId);
            exports.conn.run('INSERT INTO users VALUES (null, null, null, ?, ?, ?, null)', [discordId, hash, 'pending']);
            logAllUsers();
            resolve();
        }
        catch (error) {
            console.log(error);
            reject();
        }
    });
}
function updateUser(discordId, values) {
    if (!exports.conn)
        return;
    if (!values)
        return;
    if (!discordId)
        return;
    const query = `UPDATE users SET ${values.map((value) => {
        return ` ${value[0]} = "${value[1]}"`;
    }).toString()} WHERE discord_id = ?`;
    exports.conn.run(query, [discordId]);
    console.log('User updated ' + discordId);
    console.log(query);
    logAllUsers();
}
function deleteUser(discordId) {
    if (!exports.conn)
        return new Promise((resolve, reject) => { reject(); });
    return new Promise((resolve, reject) => {
        exports.conn.run('DELETE FROM users WHERE discord_id = ?', [discordId], () => {
            console.log('User deleted ' + discordId);
            logAllUsers();
            resolve();
        });
    });
}
function getUser(discordId) {
    if (!exports.conn)
        return new Promise((resolve, reject) => { reject(); });
    return new Promise((resolve, reject) => {
        exports.conn.get('SELECT * FROM users WHERE discord_id = ? LIMIT 1', [discordId], (err, rows) => {
            if (err) {
                console.log(err);
                reject();
            }
            console.table(rows);
            resolve(rows);
        });
    });
}
function getUserByHash(hash) {
    if (!exports.conn)
        return new Promise((resolve, reject) => { reject(); });
    return new Promise((resolve, reject) => {
        exports.conn.get('SELECT * FROM users WHERE hash = ? LIMIT 1', [hash], (err, rows) => {
            if (err) {
                console.log(err);
                reject();
            }
            console.table(rows);
            resolve(rows);
        });
    });
}
function logAllUsers() {
    if (!exports.conn)
        return;
    exports.conn.all('SELECT * FROM users', (err, rows) => {
        if (err) {
            console.log(err);
            return;
        }
        console.log('Users');
        console.table(rows);
    });
}
