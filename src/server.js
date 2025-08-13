const express = require("express");
const mysql = require("mysql2");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { buffer } = require("stream/consumers");

const app = express();
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({extended: true}));
app.use('/icons', express.static(path.join(__dirname, 'icons')));
app.use('/shares', express.static(path.join(__dirname, 'shares')));

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});


const db = mysql.createPool({
  host: "127.0.0.1",
  user: "fshare",
  password: "fshare",
  database: "fshare_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const saltRounds = 12;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads");
    },
    filename: function(req, file, cb) {
        cb(null, file.fieldname + "-" + Math.floor(+Date.now() / 1000));
    }
});

const upload = multer({
    storage: multer.memoryStorage()
}).single("file");

function generateSessionID(length) {
    const characters = "qwertzuiopasdfghjklyxcvbnmQWERTZUIOPASDFGHJKLYXCVBNM0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters[Math.floor(Math.random() * characters.length)];
    }
    return result;
}

function encryptBuffer(buffer, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, encrypted, authTag]);
}

setInterval(() => {
    db.query("SELECT * FROM shares WHERE expires <= ?", [Math.floor(Date.now() / 1000)], (err, results) => {
        if (err) console.error(err);
        if (results.length > 0) {
            results.forEach(e => {
                db.query("DELETE FROM shares WHERE id = ?", [e.id], (err) => {
                    if (err) console.error(err);
                });
                const expiredPath = path.join(__dirname, "shares", String(e.owner), e.customname);
                fs.unlink(expiredPath, (err) => {
                    console.error(err);
                })
            })
        }
    })
}, 10000)

app.post("/api/login", (req, res) => {
    const {username, password} = req.body;
    const query = "SELECT * FROM users WHERE username = ?";
    db.query(query, [username], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Internal error");
        }
        if (results.length > 0) {
            const hashed = results[0].password;
            bcrypt.compare(password, hashed, (err, match) => {
                if (!match) return res.status(401).send("Invalid credentials")
                const session_id = generateSessionID(32);
                db.query("UPDATE users SET session = ? WHERE username = ?", [session_id, username], (err) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Internal error");
                    }

                    db.query("INSERT INTO logins (user_id, login_time) VALUES (?, ?)", [results[0]["id"], Math.floor(+new Date() / 1000)]);
                    
                    res.cookie("session_id", session_id, {
                        httpOnly: false,
                        maxAge: 7 * 864e5,
                        path: "/",
                        sameSite: "lax"
                    });
                    return res.status(200).send("Authenticated");
                });
            })
        }
        else {
            return res.status(401).send("Invalid credentials");
        }
    });
});

app.get("/api/hashpass", (req, res) => {
    const password = req.query.psw;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) return res.status(500).send("Internal error");
        return res.status(200).json(hash);
    })
})

app.get("/api/auth", (req, res) => {
    const sid = req.query.sid;
    const query = "SELECT * FROM users WHERE session = ?";
    db.query(query, [sid], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Internal error");
        }
        if (result.length > 0) {
            return res.status(200).send("Authorized");
        }
        else {
            return res.status(401).send("Unauthorized");
        }
    })
});

app.get("/api/userdata", (req, res) => {
    const sid = req.query.sid;
    const query = "SELECT * FROM users WHERE session = ?";
    db.query(query, [sid], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Internal error");
        }
        if (result.length > 0) {
            const user = result[0];
            db.query("SELECT login_time FROM logins WHERE user_id = ? ORDER BY login_time DESC LIMIT 1", [user.id], (err, loginResult) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Internal error");
                }

                user.last_login = loginResult.length > 0 ? loginResult[0].login_time : null;

                return res.status(200).json(user);
            })
        }
        else {
            return res.status(401).send("Unauthorized");
        }
    })
})


app.post("/api/upload", (req, res) => {
    upload(req, res, async (err) => {
        if (err) {
            console.error("Upload error:", err);
            return res.status(500).send("Upload error");
        }

        const sessionID = req.headers["session-id"];
        const crypto_key = req.headers["crypto-key"];

        if (!sessionID || !crypto_key) {
            return res.status(400).send("Invalid headers");
        }
        if (!req.file) {
            return res.status(400).send("Invalid file");
        }

        db.query("SELECT id, used, space FROM users WHERE session = ?", [sessionID], async (err, results) => {
            if (err || results.length === 0) {
                return res.status(403).send("Unauthorized or database error");
            }

            const user = results[0];
            const fileSize = req.file.size;
            const availableSpace = user.space - user.used;

            if (fileSize > availableSpace) {
                return res.status(413).send("Quota exceeded");
            }

            const userDir = path.join(__dirname, "uploads", String(user.id));
            fs.mkdirSync(userDir, { recursive: true });
            const filename = `${Date.now()}_${req.file.originalname}`;
            const filePath = path.join(userDir, filename);

            try {
                let keyBuffer = Buffer.alloc(32);
                Buffer.from(crypto_key).copy(keyBuffer);

                const hash = crypto.createHash("sha256");
                hash.update(req.file.buffer);
                const fileHash = hash.digest("hex");

                const encryptedBuffer = encryptBuffer(req.file.buffer, keyBuffer);
                await fs.promises.writeFile(filePath, encryptedBuffer);


                db.query("UPDATE users SET used = used + ?, files = files + 1 WHERE id = ?", [encryptedBuffer.length, user.id], (err) => {
                    if (err) return res.status(500).send("Database error");

                    db.query("INSERT INTO files (filename, owner, hash) VALUES (?, ?, ?)", [filename, user.id, fileHash], (err) => {
                        if (err) return res.status(500).send("Database error");

                        return res.status(200).send("Upload successful");
                    });
                });
            } catch (e) {
                console.error("Encryption or save error:", e);
                return res.status(500).send("Failed to encrypt or save file");
            }
        });
    });
});

app.post("/api/sharefile", (req, res) => {
    const { session, source, filename, crypto_key, expires } = req.headers;
    if (!session || !source || !filename || !crypto_key || !expires) {
        console.log(req.headers)
        return res.status(400).send("Invalid headers");
    }

    db.query("SELECT id FROM users WHERE session = ?", [session], (err, results) => {
        if (err || results.length === 0) {
            return res.status(403).send("User not found");
        }

        const userid = results[0].id;
        const expireOptions = [3600, 86400, 604800, 2592000];
        const expireIndex = Number(expires);
        const expireSeconds = expireOptions[expireIndex] ?? 86400;
        const sFileSource = path.basename(source);
        const sFileName = path.basename(filename);
        const filepath = path.join(__dirname, "uploads", userid.toString(), sFileSource);
        fs.stat(filepath, (err, stats) => {
            if (err || !stats.isFile()) {
                return res.status(404).send("File not found");
            }
    
            let keyBuffer = Buffer.alloc(32);
            Buffer.from(crypto_key).copy(keyBuffer);
    
            const readStream = fs.createReadStream(filepath);
            const buffers = [];
    
            readStream.on('error', err => {
                console.error("Read error:", err);
                res.status(500).send("Read error");
            });

            readStream.on('data', chunk => buffers.push(chunk));
            readStream.on('end', () => {
                try {
                    const fileBuffer = Buffer.concat(buffers);
                    const iv = fileBuffer.slice(0, 12);
                    const authTag = fileBuffer.slice(fileBuffer.length - 16);
                    const encryptedContent = fileBuffer.slice(12, fileBuffer.length - 16);
    
                    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
                    decipher.setAuthTag(authTag);
    
                    const decrypted = Buffer.concat([
                        decipher.update(encryptedContent),
                        decipher.final()
                    ]);
    
                    const sharedDir = path.join(__dirname, "shares", userid.toString());
                    const sharedFilePath = path.join(sharedDir, sFileName);
    
                    fs.mkdir(sharedDir, { recursive: true }, (err) => {
                        if (err) {
                            console.error("Directory creation failed:", err);
                            return res.status(500).send("Server error");
                        }
    
                        fs.writeFile(sharedFilePath, decrypted, (err) => {
                            if (err) {
                                console.error("Write failed:", err);
                                return res.status(500).send("Write failed");
                            }
                            const relativeFilePath = path.join("/shares", userid.toString(), sFileName);
                            const currentUNIX = Math.floor(Date.now() / 1000);
                            db.query("INSERT INTO shares (origin, customname, created, expires, owner) VALUES (?, ?, ?, ?, ?)", [sFileSource, sFileName, currentUNIX, currentUNIX + expireSeconds, userid], (err, results) => {
                                if (err) {
                                    return res.status(500).send("Failed to save share");
                                }
                            })
                            db.query("UPDATE users SET files_shared = files_shared + 1 WHERE id = ?", [userid], (err) => {
                                if(err) {
                                    console.log(err)
                                }
                            })
                            res.status(200).json({ path: relativeFilePath });
                        });
                    });
    
                } catch (e) {
                    console.error("Decryption failed:", e);
                    res.status(400).send("Decryption failed");
                }
            });
        });
    });
});

app.get("/api/usershares", (req, res) => {
    const session = req.headers.session;
    db.query("SELECT id FROM users WHERE session = ?", [session], (err, results) => {
        if (err || results.length == 0) return res.status(403).send("Unauthorized");
        const userid = results[0].id;
        db.query("SELECT * FROM shares WHERE owner = ?", [userid], (err, results) => {
            if (err) return res.status(500).send("Internal error");
            return res.json(results);
        })
    })
})

app.post("/api/revokeshare", (req, res) => {
    const { session, id } = req.headers;
    db.query("SELECT id FROM users WHERE session = ?", [session], (err, results) => {
        if (err || results.length == 0) return res.status(403).send("Unauthorized");
        const userid = results[0].id;
        db.query("SELECT customname FROM shares WHERE id = ? AND owner = ?", [id, userid], (err, results) => {
            if (err || results.length == 0) return res.status(404).send("File not found");
            const customName = results[0].customname;
            const sharedPath = path.join(__dirname, "shares", String(userid), customName);
            db.query("DELETE FROM shares WHERE id = ? AND owner = ?", [id, userid], (err) => {
                if (err) return res.status(500).send("eror");
                fs.unlink(sharedPath, (err) => {
                    console.log(err);
                    db.query("UPDATE users SET files_shared = files_shared - 1 WHERE id = ?", [userid], (err) => {
                        console.log(err)
                    })
                    return res.status(200).send("Share revoked")
                });
            })
        }) 
    })
})

app.get('/uploads/:userId/:filename', (req, res) => {
    const { userId, filename } = req.params;
    const keyFromHeader = req.headers['crypto-key'];
    const keyFromQuery = req.query['crypto-key'];
    const cryptoKey = keyFromHeader || keyFromQuery;

    if (!cryptoKey) {
        return res.status(400).send("Missing crypto-key header");
    }

    const filePath = path.join(__dirname, 'uploads', userId, filename);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            return res.status(404).send("File not found");
        }

        let keyBuffer = Buffer.alloc(32);
        Buffer.from(cryptoKey).copy(keyBuffer);

        const readStream = fs.createReadStream(filePath);

        let iv;
        let authTag;
        let decipher;
        let headerRead = false;
        let chunks = [];
        let totalLength = 0;

        const buffers = [];
        readStream.on('data', chunk => buffers.push(chunk));
        readStream.on('end', () => {
            const fileBuffer = Buffer.concat(buffers);

            iv = fileBuffer.slice(0, 12);
            authTag = fileBuffer.slice(fileBuffer.length - 16);
            const encryptedContent = fileBuffer.slice(12, fileBuffer.length - 16);

            decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, iv);
            decipher.setAuthTag(authTag);

            try {
                const decrypted = Buffer.concat([
                    decipher.update(encryptedContent),
                    decipher.final()
                ]);

                res.setHeader('Content-Length', decrypted.length);
                res.setHeader('Content-Type', 'application/octet-stream');
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

                res.send(decrypted);
            } catch (e) {
                console.error("Decryption failed:", e);
                res.status(400).send("Decryption failed");
            }
        });

        readStream.on('error', err => {
            console.error("File read error:", err);
            res.status(500).send("Internal server error");
        });
    });
});


app.get("/api/files", (req, res) => {
    const sid = req.query.sid;
    db.query("SELECT id FROM users WHERE session = ?", [sid], (err, result) => {
        if (err) return res.status(500).send("Internal error");
        if (result.length === 0) return res.status(401).send("Unauthorized");
        const userId = result[0].id;
        const userDir = path.join(__dirname, "uploads", String(userId));
        fs.readdir(userDir, (err, files) => {
            if (err) {
                if (err.code === "ENOENT") return res.json([]);
                return res.status(500).send("Failed to read files");
            }
            return res.json(files);
        });
    })
})

app.post("/api/deletefile", (req, res) => {
    const sid = req.query.sid;
    const filename = req.query.fname;
    if (!filename) return res.status(400).send("Invalid filename");
    db.query("SELECT id FROM users WHERE session = ?", [sid], (err, result) => {
        if (err) return res.status(500).send("Internal error");
        if (result.length === 0) return res.status(401).send("Unathorized");
        const userId = result[0].id;
        const filePath = path.join(__dirname, "uploads", String(userId), path.basename(filename));
        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) return res.status(404).send("File not found");

            const fileSize = stats.size;

            fs.unlink(filePath, (err) => {
            if (err) return res.status(500).send("Internal error");

            db.query("UPDATE users SET files = files - 1, used = GREATEST(used - ?, 0) WHERE id = ?", [fileSize, userId], (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Database error");
                }
                db.query("DELETE FROM files WHERE filename = ? AND owner = ?", [filename, userId], (err) => {
                    if (err) {
                        console.error(err)
                        return res.status(500).send("Database error");
                    }
                    return res.status(200).send("Deleted");
                })
                }
            );
            });
        })
    })
})

app.get("/api/hashfile", (req, res) => {
    const sid = req.query.sid;
    const filename = req.query.fname;
    if (!filename) return res.status(400).send("No file provided");

    db.query("SELECT * FROM users WHERE session = ?", [sid], (err, users) => {
        if (err) return res.status(500).send("Internal error");
        if (users.length === 0) return res.status(401).send("Unauthorized");

        db.query("SELECT hash FROM files WHERE owner = ? AND filename = ?", [users[0].id, filename], (err, files) => {
            if (err) return res.status(500).send("Internal error");
            if (files.length === 0) return res.status(404).send("File not found");

            return res.json({ hash: files[0].hash });
        });
    });
});

const PORT = 5005;
app.listen(PORT, () => {
    console.log(`Started server on port ${PORT}`);
});