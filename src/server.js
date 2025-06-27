const express = require("express");
const mysql = require("mysql2");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto")

const app = express();
app.use(express.json());
app.use(express.static("public"));
app.use(express.urlencoded({extended: true}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/icons', express.static(path.join(__dirname, 'icons')));


const db = mysql.createPool({
  host: "127.0.0.1",
  user: "fshare",
  password: "fshare",
  database: "fshare_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

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

app.post("/api/login", (req, res) => {
    const {username, password} = req.body;
    const query = "SELECT * FROM users WHERE username = ? AND password = ?";
    db.query(query, [username, password], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Internal error");
        }
        if (results.length > 0) {
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
        }
        else {
            return res.status(401).send("Invalid credentials");
        }
    });
});

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
    upload(req, res, err => {
        if (err) {
            console.error("Upload error:", err);
            return res.status(500).send("Upload error");
        }
        const sessionID = req.headers["session-id"];
        if (!sessionID) {
            return res.status(400).send("Invalid session");
        }
        if (!req.file) {
            return res.status(400).send("Invalid file");
        }
        db.query("SELECT id, used, space FROM users WHERE session = ?", [sessionID], (err, results) => {
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

            fs.writeFile(filePath, req.file.buffer, err => {
                if (err) {
                    console.error("File save error:", err);
                    return res.status(500).send("Failed to save file");
                }
                const hash = crypto.createHash("sha256");
                const stream = fs.createReadStream(filePath);

                stream.on("data", chunk => hash.update(chunk));
                stream.on("end", () => {
                    const fileHash = hash.digest("hex");
                    db.query("UPDATE users SET used = used + ?, files = files + 1 WHERE id = ?", [fileSize, user.id], (err) => {
                        if (err) return res.status(500).send("Database error");
                        db.query("INSERT INTO files (filename, owner, hash) VALUES (?, ?, ?)", [filename, user.id, fileHash], (err) => {
                            if (err) return res.status(500).send("Database error");
                            return res.status(200).send("Upload successful");
                        })
                    });

                })
                stream.on("error", () => res.status(500).send("Internal error"));
            });
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