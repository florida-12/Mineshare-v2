const dotenv = require('dotenv');
const express = require('express');
const https = require('https');
const path = require('path');
const pg = require('pg');
const fs = require('fs/promises');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Recaptcha = require('express-recaptcha').RecaptchaV2;
const session = require('express-session');
const flash = require('express-flash');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const pgSession = require('connect-pg-simple')(session);
const multer = require('multer');
const bcrypt = require('bcrypt');
const axios = require('axios');
const { SitemapStream, streamToPromise } = require('sitemap')
const moment = require('moment-timezone');
const { createGzip } = require('zlib')
const { Readable } = require('stream')
const app = express();


dotenv.config();


app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'assets')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const recaptcha = new Recaptcha(process.env.RECAPTCHA_SITE_KEY, process.env.RECAPTCHA_SECRET_KEY);

const pool = new pg.Pool({
    user: process.env.DATABASE_USER,
    host: 'mineshare.top',
    database: 'mineshare_v2',
    password: process.env.DATABASE_PASSWORD,
    port: 5432,
});

const poolConfigOpts = {
    user: process.env.DATABASE_USER,
    host: 'mineshare.top',
    database: 'mineshare_v2',
    password: process.env.DATABASE_PASSWORD,
    port: 5432
}
const poolInstance = new pg.Pool(poolConfigOpts);
const postgreStore = new pgSession({
    pool: poolInstance,
    createTableIfMissing: true,
})

app.use(session({
    store: postgreStore,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
    secret: process.env.SESSION_SECRET,
    resave: true,
    saveUninitialized: true
}));

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

const multerParser = bodyParser.text({ type: '/' });
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'banner') {
            cb(null, 'media/pictures/');
        } else if (file.fieldname === 'illustrations') {
            cb(null, 'media/illustrations/');
        } else {
            cb(null, 'media/');
        }
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname);
        const filename = uuidv4() + ext;
        cb(null, filename);
    }
});
const upload = multer({ storage: storage });

let footer_html;
let sitemap;

fs.readFile(path.join(__dirname, 'views/footer.ejs'), 'utf-8')
    .then(content => {
        footer_html = content;
    })
    .catch(error => {
        console.error('Error reading file:', error);
        process.exit(1);
    }
    );

async function generatePassword() {
    const minLength = 8;
    const maxLength = 20;
    const passwordLength = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_-+=<>?";

    let password = "";
    for (let i = 0; i < passwordLength; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset.charAt(randomIndex);
    }
    console.log(password);
    const hashedPassword = await bcrypt.hash(password, 10);
    return hashedPassword;
}

passport.use(new LocalStrategy({
    usernameField: 'email',
    passwordField: 'password',
}, async (email, password, done) => {
    try {
        // Проверяем, существует ли пользователь в базе данных по email
        const userQuery = 'SELECT * FROM users WHERE email = $1';
        const userResult = await pool.query(userQuery, [email]);

        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            // Сравниваем хэшированный пароль с введенным
            const match = await bcrypt.compare(password, user.password);

            if (match) {
                return done(null, user);
            } else {
                return done(null, false, { message: 'Incorrect password.' });
            }
        } else {
            return done(null, false, { message: 'User not found.' });
        }
    } catch (error) {
        return done(error, null);
    }
}));

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT,
    clientSecret: process.env.GOOGLE_SECRET,
    callbackURL: '/auth/google/callback',
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            const userQuery = 'SELECT * FROM users WHERE email = $1';
            const userResult = await pool.query(userQuery, [profile.emails[0].value]);

            if (userResult.rows.length > 0) {
                return done(null, userResult.rows[0]);
            } else {
                const password = await generatePassword();   //random password

                const newUserResult = await pool.query('INSERT INTO users (email, password, regip) VALUES ($1, $2, $3) RETURNING *', [profile.emails[0].value, password, 'GOOGLE']);

                return done(null, newUserResult.rows[0]);
            }
        } catch (error) {
            return done(error, null);
        }
    }));

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const userQuery = 'SELECT * FROM users WHERE id = $1';
        const userResult = await pool.query(userQuery, [id]);

        if (userResult.rows.length > 0) {
            done(null, userResult.rows[0]);
        } else {
            done(null, false);
        }
    } catch (error) {
        done(error, null);
    }
});

app.post('/register', recaptcha.middleware.verify, async (req, res) => {
    if (req.recaptcha.error) {
        return res.send('Проверка reCaptcha не удалась');
    }

    const { email, password, password_repeat } = req.body;

    if (password != password_repeat) return res.status(400).json({ message: 'Password mismatch.' });

    try {
        const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (userResult.rows.length > 0) {
            res.status(400).json({ message: 'User already exists.' });
        } else {
            const hashedPassword = await bcrypt.hash(password, 10);

            let regip = req.headers['x-forwarded-for'];
            if (regip == undefined) regip = '0.0.0.0';

            const newUserResult = await pool.query('INSERT INTO users (email, password, regip) VALUES ($1, $2, $3) RETURNING *', [email, hashedPassword, regip]);
            res.redirect('/')
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Роуты для аутентификации
app.post('/login', passport.authenticate('local', {
    successRedirect: '/account',
    failureRedirect: '/',
    failureFlash: true,
}));

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
    passport.authenticate('google', { successRedirect: '/account', failureRedirect: '/' }));

app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
});

function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    res.redirect('/');
}

app.get('/account', isAuthenticated, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE owner = $1;`, [req.user.id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        if (req.user.admin) {
            pool.query(`SELECT * FROM servers ORDER BY -id;`, (err, admin_servers) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Internal Server Error');
                }

                admin_servers.rows.forEach(server => {
                    const regdate = new Date(server.regdate);

                    const moscowTime = moment.tz(regdate, 'Europe/Moscow');

                    const formattedDate = moscowTime.locale('ru').format('DD MMMM (HH:mm)');

                    server.regdate = formattedDate;
                });

                return res.render('account', { url: req.url, user: req.user, servers: result.rows, admin_servers: admin_servers.rows, footer: footer_html });
            });
        } else {
            res.render('account', { url: req.url, user: req.user, servers: result.rows, admin_servers: null, footer: footer_html });
        }
    });
});

app.post('/account/server-check', isAuthenticated, async (req, res) => {
    try {
        let { ip, port } = req.body;
        if (!port) port = '25565';

        const serverQueryResult = await new Promise((resolve, reject) => {
            pool.query(`SELECT * FROM servers WHERE ip = $1 AND port = $2;`, [ip, port], (err, server) => {
                if (err) {
                    console.error(err);
                    reject(err);
                } else {
                    resolve(server);
                }
            });
        });

        if (serverQueryResult.rows.length > 0) {
            return res.send('Сервер с таким IP-адресом уже существует');
        }

        const response = await axios.get(`https://api.mcstatus.io/v2/status/java/${ip}:${port}`);

        if (response.data.online) {
            await new Promise((resolve, reject) => {
                pool.query(`INSERT INTO servers_buffer (ip, port, owner) VALUES ($1, $2, $3);`, [ip, port, req.user.id], (err, result) => {
                    if (err) {
                        console.error(err);
                        reject(err);
                    } else {
                        resolve(result);
                    }
                });
            });

            res.redirect('/account/server-create');
        } else {
            res.redirect('/account');
        }
    } catch (error) {
        console.error('Ошибка при проверке сервера:', error.message);
        res.redirect('/account');
    }
});

app.get('/account/server-create', isAuthenticated, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers_buffer WHERE owner = $1 ORDER BY -id LIMIT 1;`, [req.user.id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        if (result.rows.length > 0) {
            pool.query(`SELECT * FROM tags;`, (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Internal Server Error');
                }

                res.render('server-create', { tags: result.rows });
            });
        } else {
            res.redirect('/account');
        }
    });
});

app.post('/account/server-create', isAuthenticated, async (req, res) => {
    let { title, description, mode, version, license, tags } = req.body;
    if (license == 'Без лицензии') {
        license = false;
    } else {
        license = true;
    }

    pool.query(`SELECT ip, port FROM servers_buffer WHERE owner = $1;`, [req.user.id], (err, data) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        pool.query(`INSERT INTO servers (title, description, ip, port, mode, version, license, premium_color, owner) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id;`, [title, description, data.rows[0].ip, data.rows[0].port, mode, version, license, 'blue', req.user.id], async (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }

            let server_id = result.rows[0].id;

            tags.forEach(tag_id => {
                pool.query(`INSERT INTO servers_tags (server_id, tag_id) VALUES ($1, $2);`, [server_id, tag_id], (err, result) => {
                    if (err) {
                        console.error(err);
                    }
                });
            });

            result = await pool.query('DELETE FROM servers_buffer WHERE owner = $1;', [req.user.id]);

            res.redirect('/account');
        });
    });
});

app.get('/account/server/:id/edit', isAuthenticated, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE id = $1;`, [req.params.id], (err, server) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        if (server.rows.length > 0) {
            if (server.rows[0].owner != req.user.id) {
                res.redirect('/account');
            }

            pool.query(`SELECT * FROM tags;`, (err, tags) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Internal Server Error');
                }

                pool.query(`SELECT tag_id FROM servers_tags WHERE server_id = $1;`, [req.params.id], (err, server_tags) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send('Internal Server Error');
                    }

                    res.render('server-edit', { servers: server.rows, tags: tags.rows, server_tags: server_tags.rows });
                });
            });
        } else {
            res.redirect('/account');
        }
    });
});

app.post('/account/server/:id/edit', isAuthenticated, multerParser, upload.fields([{ name: 'banner', maxCount: 1 }, { name: 'illustrations', maxCount: 6 }]), (req, res) => {
    let { title, description, mode, version, license, tags, website, premium_color } = req.body;
    if (license == 'Без лицензии') {
        license = false;
    } else {
        license = true;
    }
    if (!premium_color) premium_color = 'blue';

    if (req.files['banner']) {
        pool.query(`UPDATE servers SET banner = $1 WHERE id = $2;`, [req.files['banner'][0].filename, req.params.id], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }
        });
    }

    if (tags) {
        pool.query(`DELETE FROM servers_tags WHERE server_id = $1;`, [req.params.id], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }

            tags.forEach(tag => {
                pool.query(`INSERT INTO servers_tags (server_id, tag_id) VALUES ($1, $2);`, [req.params.id, tag], (err) => {
                    if (err) {
                        console.error(err);
                    }
                });
            });
        });
    }

    pool.query(`UPDATE servers SET title = $1, description = $2, mode = $3, version = $4, license = $5, website = $6, premium_color = $7 WHERE id = $8;`, [title, description, mode, version, license, website, premium_color, req.params.id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        if (req.files['illustrations']) {
            req.files['illustrations'].forEach(illustration => {
                pool.query(`INSERT INTO servers_illustrations (server_id, image) VALUES ($1, $2);`, [req.params.id, illustration.filename], (err, result) => {
                    if (err) console.error(err);
                });
            });
        }

        res.redirect('/account');
    });
});

app.get('/media/pictures/:uuid', async (req, res) => {
    const imagePath = path.join(__dirname, '/media/pictures/', `${req.params.uuid}`);

    try {
        await fs.access(imagePath);
        res.sendFile(imagePath);
    } catch (error) {
        res.status(404).send('File not found');
    }
});

app.get('/media/illustrations/:uuid', async (req, res) => {
    const imagePath = path.join(__dirname, '/media/illustrations/', `${req.params.uuid}`);

    try {
        await fs.access(imagePath);
        res.sendFile(imagePath);
    } catch (error) {
        res.status(404).send('File not found');
    }
});

app.get('/', recaptcha.middleware.render, (req, res) => {
    if (!req.query.search) {
        pool.query(`SELECT * FROM servers WHERE ban = false ORDER BY -rate;`, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }

            res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
        });
    } else {
        pool.query(`SELECT * FROM servers WHERE LOWER(title) LIKE '%${req.query.search.toLowerCase()}%' AND ban = false ORDER BY -rate;`, (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }

            res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
        });
    }
});

app.get('/random', (req, res) => {
    pool.query(`SELECT id FROM servers WHERE ban = false;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        const servers = result.rows.map(row => row.id);
        const server = servers[Math.floor(Math.random() * servers.length)];

        res.redirect(`/server/${server}`);
    });
});

app.get('/1.20', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.20.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.19', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.19.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.18', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.18.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.17', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.17.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.16', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.16.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.15', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.15.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.14', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.14.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.13', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.13.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.12', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.12.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.11', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.11.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.10', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.10.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.9', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.9.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/1.8', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.8.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});


app.get('/1.7', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND version = '1.7.X' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/vanilla', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND mode = 'Ванилла' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/anarchy', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND mode = 'Анархия' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/mmo-rpg', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND mode = 'MMO-RPG' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/mini-games', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND mode = 'Мини-игры' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/adventure', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND mode = 'Приключение' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/construction', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE ban = false AND mode = 'Строительство' ORDER BY -rate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/server/:id', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM servers WHERE id = $1;`, [req.params.id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        let servers = result.rows;

        pool.query(`SELECT * FROM servers_tags WHERE server_id = $1;`, [req.params.id], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }

            const tagIds = result.rows.map(tagMapping => tagMapping.tag_id);
            if (tagIds.length > 0) {
                const placeholders = tagIds.map((_, index) => `$${index + 1}`).join(',');

                pool.query(`SELECT name, friendly_name FROM tags WHERE name IN (${placeholders});`, tagIds, (err, tags) => {
                    if (err) console.error('Error executing query:', err);

                    pool.query(`SELECT image FROM servers_illustrations WHERE server_id = $1 LIMIT 6;`, [req.params.id], async (err, illustrations) => {
                        if (err) console.error('Error executing query:', err);

                        let comments = await pool.query(`SELECT sc.user_id, u.username, u.skin, u.admin, sc.message, sc.date FROM servers_comments sc JOIN users u ON sc.user_id = u.id WHERE sc.server_id = $1;`, [req.params.id]);
                        if (comments.rows.length > 0) {
                            comments.rows.forEach(comment => {
                                const date = new Date(comment.date);
            
                                const moscowTime = moment.tz(date, 'Europe/Moscow');
            
                                const formattedDate = moscowTime.locale('ru').format('DD.MM');
            
                                comment.date = formattedDate;
                            });
                        }

                        res.render('server', { user: req.user, servers: servers, tags: tags.rows, illustrations: illustrations.rows, comments: (comments.rows.length > 0) ? comments.rows : null, footer: footer_html, captcha: res.recaptcha });
                    });
                });
            } else {
                pool.query(`SELECT image FROM servers_illustrations WHERE server_id = $1 LIMIT 6;`, [req.params.id], async (err, illustrations) => {
                    if (err) console.error('Error executing query:', err);

                    const comments = await pool.query(`SELECT sc.user_id, u.username, u.skin, u.admin, sc.message FROM servers_comments sc JOIN users u ON sc.user_id = u.id WHERE sc.server_id = $1;`, [req.params.id]);
                    if (comments.rows.length > 0) {
                        comments.rows.forEach(comment => {
                            const date = new Date(comment.date);
        
                            const moscowTime = moment.tz(date, 'Europe/Moscow');
        
                            const formattedDate = moscowTime.locale('ru').format('DD.MM');
        
                            comment.date = formattedDate;
                        });
                    }

                    res.render('server', { user: req.user, servers: servers, tags: null, illustrations: illustrations.rows, comments: (comments.rows.length > 0) ? comments.rows : null, footer: footer_html, captcha: res.recaptcha });
                });
            }
        });
    });
});

app.post('/server/:id/comment', isAuthenticated, (req, res) => {
    let { message } = req.body;

    pool.query(`SELECT * FROM servers_comments WHERE server_id = $1 AND user_id = $2;`, [req.params.id, req.user.id], (err, result) => {
        if (err) console.error('Error executing query:', err);

        if (result.rows.length >= 1) return res.redirect(`/server/${req.params.id}`);

        pool.query(`INSERT INTO servers_comments (server_id, user_id, message) VALUES ($1, $2, $3);`, [req.params.id, req.user.id, message], (err) => {
            if (err) console.error('Error executing query:', err);
    
            return res.redirect(`/server/${req.params.id}`);
        });
    });
});

app.post('/server/:id/like', isAuthenticated, (req, res) => {
    pool.query(`SELECT * FROM servers_likes WHERE server_id = $1 AND user_id = $2;`, [req.params.id, req.user.id], (err, result) => {
        if (err) console.error('Error executing query:', err);

        if (result.rows.length >= 1) return res.redirect(`/server/${req.params.id}`);

        pool.query(`INSERT INTO servers_likes (server_id, user_id) VALUES ($1, $2);`, [req.params.id, req.user.id], (err) => {
            if (err) console.error('Error executing query:', err);
    
            return res.redirect(`/server/${req.params.id}`);
        });
    });
});

app.get('/tournaments', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    res.render('tournaments', { user: req.user, footer: footer_html, captcha: res.recaptcha });
});

app.get('/tournament/bedwars', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    res.render('bedwars', { user: req.user, footer: footer_html, captcha: res.recaptcha });
});

app.get('/shop', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    res.render('shop', { user: req.user, footer: footer_html, captcha: res.recaptcha });
});

app.get('/news', recaptcha.middleware.render, (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    pool.query(`SELECT * FROM news ORDER BY regdate;`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('news', { user: req.user, news: result.rows, footer: footer_html, captcha: res.recaptcha });
    });
});

app.get('/terms', (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    const pdfFilePath = path.join(__dirname, 'views/terms.pdf');

    const options = {
        headers: {
            'Content-Disposition': 'inline; filename="terms.pdf"',
            'Content-Type': 'application/pdf',
        },
    };

    res.sendFile(pdfFilePath, options, (err) => {
        if (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    });
});

app.get('/privacy', (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    const pdfFilePath = path.join(__dirname, 'views/privacy.pdf');

    const options = {
        headers: {
            'Content-Disposition': 'inline; filename="privacy.pdf"',
            'Content-Type': 'application/pdf',
        },
    };

    res.sendFile(pdfFilePath, options, (err) => {
        if (err) {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }
    });
});

app.get('/sitemap.xml', function (req, res) {
    res.header('Content-Type', 'application/xml');
    res.header('Content-Encoding', 'gzip');
    // if we have a cached entry send it
    if (sitemap) {
        return res.send(sitemap);
    }

    const currentDate = new Date().toISOString();

    try {
        const smStream = new SitemapStream({ hostname: 'https://mineshare.top' });
        const pipeline = smStream.pipe(createGzip());

        smStream.write({
            url: '/', lastmod: currentDate, changefreq: 'daily', priority: 1, img: [{ url: 'https://mineshare.top/media/pictures/1db268dd-09e3-450d-8596-4f44ab60aced.gif', caption: 'go.playmine.org' },
            { url: 'https://mineshare.top/media/pictures/de884d99-0580-4c2f-aa98-3fa6851f3f19.gif', caption: 'mclucky.net' },
            { url: 'https://mineshare.top/media/pictures/27148d9c-7666-491e-96ee-8087a790903e.gif', caption: 'mc.restartcraft.fun' },
            { url: 'https://mineshare.top/media/pictures/2bd8f013-715b-4dee-825b-8368e25e8ff7.gif', caption: 'mc.tntland.fun' },
            { url: 'https://mineshare.top/media/pictures/e3270066-768a-4495-9863-6f0937ad7f71.png', caption: 'tmine.su' },
            { url: 'https://mineshare.top/media/pictures/c2102efb-1b0e-4853-9d3c-417cbc043111.gif', caption: 'mc.aquamc.su' },
            { url: 'https://mineshare.top/media/pictures/cbd0a41a-26f0-4eb5-9eea-cb5dc1fa5632.gif', caption: 'play.mc-dnc.online' },
            { url: 'https://mineshare.top/media/pictures/456b7736-a952-4a6a-8409-5c3831501ff2.png', caption: '51game.ru' },
            { url: 'https://mineshare.top/img/default-server-picture.gif', caption: 'play.astrixmc.net' },
            { url: 'https://mineshare.top/media/pictures/5140388e-08fb-41fe-8b69-decd78f7f666.gif', caption: 'bawlcraft.20tps.ru' }]
        });
        smStream.write({ url: '/terms', lastmod: currentDate, changefreq: 'weekly', priority: 0.8 });
        smStream.write({ url: '/privacy', lastmod: currentDate, changefreq: 'weekly', priority: 0.8 });
        smStream.write({ url: '/tournaments', lastmod: currentDate, changefreq: 'weekly', priority: 0.9 });
        smStream.write({ url: '/tournament/bedwars', lastmod: currentDate, changefreq: 'weekly', priority: 0.8 });
        smStream.write({ url: '/shop', lastmod: currentDate, changefreq: 'weekly', priority: 0.9 });
        smStream.write({ url: '/news', lastmod: currentDate, changefreq: 'weekly', priority: 0.9 });
        smStream.write({ url: '/1.20', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.19', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.18', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.17', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.16', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.15', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.14', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.13', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.12', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.11', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.10', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.9', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.8', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/1.7', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/vanilla', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/anarchy', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/mmo-rpg', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/mini-games', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/adventure', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        smStream.write({ url: '/construction', lastmod: currentDate, changefreq: 'daily', priority: 0.8 });
        // cache the response
        streamToPromise(pipeline).then(sm => sitemap = sm);
        // make sure to attach a write stream such as streamToPromise before ending
        smStream.end();
        // stream write the response
        pipeline.pipe(res).on('error', (e) => { throw e });
    } catch (e) {
        console.error(e);
        res.status(500).end();
    }
})

app.get('/obs/bedwars/4x2', (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    const jsonData = [
        { username: 'SteveBomb', hp: Math.floor(Math.random() * 21).toString(), skin: 'f757bd31-9fda-4112-ad9b-e2ae1015bf6e', team: 'blue' },
        { username: 'Alexa500', hp: Math.floor(Math.random() * 21).toString(), skin: '1d8e2124-bad7-473a-bd97-c2481e943a59', team: 'blue' },
        { username: 'Lololo228', hp: Math.floor(Math.random() * 21).toString(), skin: '664b5930-6b14-4f8a-aaf1-dae7edafac91', team: 'blue' },
        { username: 'Creeper44', hp: Math.floor(Math.random() * 21).toString(), skin: '664b5930-6b14-4f8a-aaf1-dae7edafac91', team: 'blue' },
        { username: 'li_88888888', hp: Math.floor(Math.random() * 21).toString(), skin: '0054354f-8bf7-41ad-84a0-e80508dd61bb', team: 'red' },
        { username: 'TurboTurbo', hp: Math.floor(Math.random() * 21).toString(), skin: 'a3c76ff9-abc5-4853-a2f8-74e49d89daf2', team: 'red' },
        { username: 'MarkusHOPE', hp: Math.floor(Math.random() * 21).toString(), skin: '5c7cc4de-aee2-44e0-a7b7-fa6557ff944d', team: 'red' },
        { username: 'PedroRemond', hp: Math.floor(Math.random() * 21).toString(), skin: 'aeb5e52a-8f4a-4dcf-9387-88738b70098d', team: 'red' }
    ];

    res.send(jsonData);
});


async function startServer() {
    try {
        // Загрузка закрытого ключа и сертификата
        const privateKey = await fs.readFile('config/private.key', 'utf8');
        const certificate = await fs.readFile('config/certificate.crt', 'utf8');

        const credentials = { key: privateKey, cert: certificate };

        // Создание HTTPS-сервера
        const httpsServer = https.createServer(credentials, app);

        // Прослушивание порта
        httpsServer.listen(443, () => {
            console.log(`---------- RUNNING ----------`);
        });
    } catch (err) {
        console.error('Ошибка при чтении файлов:', err);
    }
}

startServer();