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

function generateSessionID(length) {
    const characters = "qwertzuiopasdfghjklyxcvbnmQWERTZUIOPASDFGHJKLYXCVBNM0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += characters[Math.floor(Math.random() * characters.length)];
    }
    return result;
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
    const sessionID = req.headers["session-id"];
    const originalName = req.headers["file-name"];

    if (!sessionID || !originalName) {
        return res.status(400).send("Missing headers");
    }

        db.query("SELECT id, used, space FROM users WHERE session = ?", [sessionID], async (err, results) => {
            if (err || results.length === 0) {
                return res.status(403).send("Unauthorized or database error");
            }

        const user = results[0];
        const availableSpace = user.space - user.used;
        const userDir = path.join(__dirname, "uploads", String(user.id));

        fs.mkdir(userDir, { recursive: true }, (err) => {
            if (err) return res.status(500).send("Server error");
            
            const filename = `${Date.now()}_${path.basename(originalName)}`;
            const filePath = path.join(userDir, filename);

            let written = 0;
            const output = fs.createWriteStream(filePath);
            
            req.on("data", chunk => {
                written += chunk.length;
                if(written > availableSpace) {
                    req.destroy();
                    output.destroy();
                    fs.unlink(filePath, () => {});
                    return res.status(413).send("Quota exceeded");
                }
            });
            req.pipe(output);

            output.on("finish", () => {
                db.query("UPDATE users SET used = used + ?, files = files + 1 WHERE id = ?", [written, user.id], (err) => {
                    if (err) return res.status(500).send("Database error");
                    
                    const hash = crypto.createHash("sha256");
                    const hashStream = fs.createReadStream(filePath);
                    hashStream.on("data", chunk => hash.update(chunk));
                    hashStream.on("end", () => {
                        const fileHash = hash.digest("hex");
                        db.query("INSERT INTO files (filename, owner, hash) VALUES (?, ?, ?)", [filename, user.id, fileHash], (err) => {
                            if (err) return res.status(500).send("Database error");
                            res.status(200).send("Upload successful");
                        });
                    })
                });
            });
            req.on("error", (err) => {
                console.error("Request error:", err);
                fs.unlink(filePath, () => {});
            });

            output.on("error", (err) => {
                console.error("Write error:", err);
                fs.unlink(filePath, () => {});
                res.status(500).send("Write error");
            });
        });
    });
});

app.get("/api/sharefile", (req, res) => {
    const { session, source } = req.headers;
    if (!session || !source) {
        return res.status(400).send("Invalid headers");
    }

    db.query("SELECT id FROM users WHERE session = ?", [session], (err, results) => {
        if (err || results.length === 0) {
            return res.status(403).send("User not found");
        }

        const userid = results[0].id;
        const sFileSource = path.basename(decodeURIComponent(source));

        const filepath = path.join(__dirname, "uploads", userid.toString(), sFileSource);
        fs.stat(filepath, (err, stats) => {
            if (err || !stats.isFile()) {
                return res.status(404).send("File not found");
            }

            res.writeHead(200, {
                "Content-Type": "application/octet-stream",
                "Content-Disposition": `attachment; filename="${encodeURIComponent(sFileSource)}"`
            });

            const readStream = fs.createReadStream(filepath);
            readStream.pipe(res);
        });
    });
});

app.post("/api/sharefile/finish", (req, res) => {
    let { session, source, filename, expires } = req.headers;
    filename = decodeURIComponent(filename);
    source = decodeURIComponent(source);
    const eoptions = [3600, 86400, 604800, 2592000];
    const esex = eoptions[Number(expires)] ?? 86400;
    db.query("SELECT id FROM users WHERE session = ?", [session], (err, results) => {
        const userId = results[0].id;
        const userDir = path.join(__dirname, "shares", userId.toString());
        fs.mkdirSync(userDir, { recursive: true });

        const filePath = path.join(userDir, filename);
        
        const chunks = []
        req.on("data", chunk => chunks.push(chunk));
        req.on("end", () => {
            const fileBuffer = Buffer.concat(chunks);
            fs.writeFile(filePath, fileBuffer, err => {
                if (err) {
                    console.error("Write failed: ", err);
                    return res.status(500).send("Internal server error");
                }

                const readyPath = path.join("/shares", userId.toString(), encodeURIComponent(filename));
                const currentUNIX = Math.floor(Date.now() / 1000);
                db.query("INSERT INTO shares (origin, customname, created, expires, owner) VALUES (?, ?, ?, ?, ?)", [source, filename, currentUNIX, currentUNIX + esex, userId], (err, results) => {
                    if (err) {
                        return res.status(500).send("Failed to save share");
                    }
                })
                db.query("UPDATE users SET files_shared = files_shared + 1 WHERE  id = ?", [userId], (err) => {
                    if (err) {
                        return res.status(500).send("Failed to save share");
                    }
                })
                res.json(JSON.stringify({ status: "done", path: readyPath}));
            })
        })
    });
})

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
    const filePath = path.join(__dirname, 'uploads', userId, filename);

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            return res.status(404).send("File not found");
        }

        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on("error", err => {
            console.error("File stream error: ", err);
            res.status(500).end("Server error");
        })
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