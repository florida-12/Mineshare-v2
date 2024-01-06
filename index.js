const dotenv = require('dotenv');
const express = require('express');
const https = require('https');
const path = require('path');
const pg = require('pg');
const fs = require('fs/promises');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const flash = require('express-flash');
const { v4: uuidv4 } = require('uuid');
const bodyParser = require('body-parser');
const pgSession = require('connect-pg-simple')(session);
const multer = require('multer');
const bcrypt = require('bcrypt');
const axios = require('axios');
const app = express();


dotenv.config();


app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
const multerParser = bodyParser.text({ type: '/' });
app.use(express.static(path.join(__dirname, 'assets')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


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

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'banner') {
            cb(null, 'media/banners/');
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

app.post('/register', async (req, res) => {
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

    pool.query(`SELECT * FROM servers WHERE owner = $1`, [req.user.id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('account', { url: req.url, user: req.user, servers: result.rows, footer: footer_html });
    });
});

app.post('/account/server-check', isAuthenticated, async (req, res) => {
    let { ip, port } = req.body;
    if (!port) port = '25565';

    try {
        const response = await axios.get(`https://api.mcstatus.io/v2/status/java/${ip}:${port}`);

        if (response.data.online) {
            pool.query(`INSERT INTO servers_buffer (ip, port, owner) VALUES ($1, $2, $3);`, [ip, port, req.user.id], (err, result) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send('Internal Server Error');
                }

                res.redirect('/account/server-create');
            });
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

    pool.query(`SELECT * FROM servers_buffer WHERE owner = $1;`, [req.user.id], (err, result) => {
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

        pool.query(`INSERT INTO servers (title, description, ip, port, mode, version, license, owner) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id;`, [title, description, data.rows[0].ip, data.rows[0].port, mode, version, license, req.user.id], async (err, result) => {
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

            result = await pool.query('DELETE FROM servers_buffer WHERE id = $1;', [server_id]);

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
    let { title, description, mode, version, license, website, premium_color } = req.body;
    if (license == 'Без лицензии') {
        license = false;
    } else {
        license = true;
    }

    if (req.files['banner']) {
        pool.query(`UPDATE servers SET banner = $1 WHERE id = $2;`, [req.files['banner'][0].filename, req.params.id], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Internal Server Error');
            }
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

app.get('/media/banners/:uuid', async (req, res) => {
    const imagePath = path.join(__dirname, '/media/banners/', `${req.params.uuid}`);

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

app.get('/', (req, res) => {
    pool.query(`SELECT * FROM servers`, (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Internal Server Error');
        }

        res.render('servers', { url: req.url, user: req.user, servers: result.rows, footer: footer_html });
    });
});

app.get('/server/:id', (req, res) => {
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

                    pool.query(`SELECT image FROM servers_illustrations WHERE server_id = $1;`, [req.params.id], (err, illustrations) => {
                        if (err) console.error('Error executing query:', err);

                        res.render('server', { user: req.user, servers: servers, tags: tags.rows, illustrations: illustrations.rows, footer: footer_html });
                    });
                });
            } else {
                pool.query(`SELECT image FROM servers_illustrations WHERE server_id = $1 LIMIT 6;`, [req.params.id], (err, illustrations) => {
                    if (err) console.error('Error executing query:', err);

                    res.render('server', { user: req.user, servers: servers, tags: null, illustrations: illustrations.rows, footer: footer_html });
                });
            }
        });
    });
});

app.get('/tournaments/bedwars', (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    res.render('bedwars', { user: req.user, footer: footer_html });
});

app.get('/shop', (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    res.render('shop', { user: req.user, footer: footer_html });
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

app.get('/obs/bedwars/4x2', (req, res) => {
    if (!req.path.endsWith('/') && req.path !== '/') return res.redirect(301, req.path + '/');

    const jsonData = [
        { username: 'SteveBomb', hp: Math.floor(Math.random() * 21).toString(), skin: 'f757bd31-9fda-4112-ad9b-e2ae1015bf6e', team: 'blue'},
        { username: 'Alexa500', hp: Math.floor(Math.random() * 21).toString(), skin: '1d8e2124-bad7-473a-bd97-c2481e943a59', team: 'blue'},
        { username: 'Lololo228', hp: Math.floor(Math.random() * 21).toString(), skin: '664b5930-6b14-4f8a-aaf1-dae7edafac91', team: 'blue'},
        { username: 'Creeper44', hp: Math.floor(Math.random() * 21).toString(), skin: '664b5930-6b14-4f8a-aaf1-dae7edafac91', team: 'blue'},
        { username: 'li_88888888', hp: Math.floor(Math.random() * 21).toString(), skin: '0054354f-8bf7-41ad-84a0-e80508dd61bb', team: 'red'},
        { username: 'TurboTurbo', hp: Math.floor(Math.random() * 21).toString(), skin: 'a3c76ff9-abc5-4853-a2f8-74e49d89daf2', team: 'red'},
        { username: 'MarkusHOPE', hp: Math.floor(Math.random() * 21).toString(), skin: '5c7cc4de-aee2-44e0-a7b7-fa6557ff944d', team: 'red'},
        { username: 'PedroRemond', hp: Math.floor(Math.random() * 21).toString(), skin: 'aeb5e52a-8f4a-4dcf-9387-88738b70098d', team: 'red'}
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
