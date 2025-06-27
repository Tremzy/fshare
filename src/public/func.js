function getCookie(name) {
    const cookies = document.cookie.split("; ");
    for (const cookie of cookies) {
        const [key, value] = cookie.split("=");
        if (key == name) {
            return value;
        }
    }
    return null;
}

function setCookie(name, value, days = 7) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${value}; expires=${expires}; path=/`;
}

function deleteFile(file) {
    const session = getCookie("session_id");
    if (session) {
        fetch(`/api/deletefile?sid=${session}&fname=${encodeURIComponent(file)}`, {method: "POST"})
        .then(res => {
            if (res.status === 200) {
                window.location.reload();
            }
        })
    }
}

function hashFile(file) {
    const session = getCookie("session_id");
    if (session) {
        fetch(`/api/hashfile?sid=${session}&fname=${encodeURIComponent(file)}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(data => {
            document.getElementById("server-side-hash").value = data.hash;
            document.querySelector(".window-overlay").style.display = "flex";
        })
        .catch(err => {
            alert("Failed to get hash: " + err.message);
        });
    }
}

function compareHash(hash1, hash2) {
    if (hash1 === hash2) {
        return true;
    }
    else {
        return false;
    }
}

function copyFileUrl(filepath) {
    filepath = `http://storage.vastagjaban.hu${filepath}`
    const textarea = document.createElement("textarea");
    textarea.value = filepath;

    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.left = "-1000px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
        const success = document.execCommand("copy");
        showToast("Copied to clipboard!");
    } catch (err) {
        alert("Fallback copy failed: " + err);
    }
    document.body.removeChild(textarea);
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.textContent = message;
    toast.style.opacity = "1";
    setTimeout(() => {
        toast.style.opacity = "0";
    }, 2000);
}

function showImageInspect(title, path) {
    document.querySelector(".inspect-title").innerText = title;
    const img = document.createElement("img");
    img.src = path;
    document.querySelector(".inspect-body").appendChild(img);
    document.querySelector(".inspect-overlay").style.display = "flex";
}

function showVideoInspect(title, path) {
    document.querySelector(".inspect-title").innerText = title;
    const vid = document.createElement("video");
    vid.src = path;
    vid.setAttribute("controls", "controls")
    document.querySelector(".inspect-body").appendChild(vid);
    document.querySelector(".inspect-overlay").style.display = "flex";
}

function toggleFileView(view) {
    if (view == "gallery") {
        if (window.fmView == "gallery") return;
        setCookie("fmView", "gallery");
        document.getElementById("fm-list-view").style.backgroundColor = "#00bcd4";
        document.getElementById("fm-gallery-view").style.backgroundColor = "#0e97a9";
        window.fmView = "gallery";

        const file_list = document.getElementById("file-list");
        file_list.style.display = "flex";
        file_list.style.flexWrap = "wrap";
        file_list.style.justifyContent = "center";

        const gridStyle = getCookie("gridStyle");

        for (const li of file_list.children) {
            li.classList.add("gallery-view-box");
            const filepath = li.querySelector(".file-actions a").href;
            const ext = filepath.split('.').pop().toLowerCase();
            if (gridStyle === "fluid") {
                li.style.width = "auto";
            }
            else if (gridStyle === "grid") {
                li.style.width = "25%";
            }

            const extMap = {
                video: ["mp4", "mov", "webm", "ogg"],
                image: ["jpg", "jpeg", "png", "gif", "bmp", "svg", "webp"],
                audio: ["mp3", "wav", "ogg"],
                iso: ["iso"],
                exe: ["exe"],
                dll: ["dll"],
                doc: ["doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "rtf", "txt", "log", "md", "csv", "odt", "ods", "odp"],
                code: ["js", "jsx", "ts", "tsx", "py", "c", "cpp", "cc", "h", "hpp", "cxx", "java", "cs", "html", "htm", "css", "php", "phtml", "sh", "bash", "zsh", "rb", "go", "rs", "lua", "sql", "json", "yml", "yaml", "ini", "cfg", "conf", "toml"]
            };

            let fileType = "unknown";
            for (const type in extMap) {
                if (extMap[type].includes(ext)) {
                    fileType = type;
                    break;
                }
            }

            let preview;
            if (fileType === "video") {
                preview = document.createElement("video");
                preview.src = filepath;
                preview.onclick = () => {
                    showVideoInspect(filepath.split("/").pop(), filepath);
                }
                preview.style.cursor = "pointer";
            } else if (fileType === "image") {
                preview = document.createElement("img");
                preview.onclick = () => {
                    showImageInspect(filepath.split("/").pop(), filepath);
                }
                preview.style.cursor = "pointer";
                preview.src = filepath;
            } else if (fileType === "audio") {
                preview = document.createElement("audio");
                preview.src = filepath;
                preview.setAttribute("controls", "controls");
            } else if (fileType === "iso") {
                preview = document.createElement("img");
                preview.src = "/icons/iso";
            } else if (fileType === "exe") {
                preview = document.createElement("img");
                preview.src = "/icons/exe";
            } else if (fileType === "dll") {
                preview = document.createElement("img");
                preview.src = "/icons/dll";
            } else if (fileType === "doc") {
                preview = document.createElement("img");
                preview.src = "/icons/doc";
            } else if (fileType === "code") {
                preview = document.createElement("img");
                preview.src = "/icons/code";
            } else {
                preview = document.createElement("img");
                preview.src = "/icons/file";
            }

            preview.setAttribute("width", "100%");
            li.insertBefore(preview, li.firstChild);
        }
    }
    else if (view == "list") {
        if (window.fmView == "list") return;
        setCookie("fmView", "list")
        document.getElementById("fm-list-view").style.backgroundColor = "#0e97a9";
        document.getElementById("fm-gallery-view").style.backgroundColor = "#00bcd4";
        window.fmView = "list";

        const file_list = document.getElementById("file-list");
        file_list.style.display = "block";
        file_list.style.flexWrap = "nowrap";
        file_list.style.justifyContent = "start";

        for(const li of file_list.children) {
            li.classList.remove("gallery-view-box");
            li.querySelectorAll("img").forEach(img => {
                img.remove();
            })
            li.querySelectorAll("video").forEach(vid => {
                vid.remove();
            })
            li.style.width = "auto";
        }
    }
}

function toggleGridStyle(override = false) {
    const selector = document.getElementById("grid-system");
    let selectedOption = selector.value;

    if (!override) {
        const savedValue = getCookie("gridStyle");
        if (savedValue.length == 0 | savedValue == "null") {
            selector.value = "grid";
            selectedOption = "grid";
        }
        else {
            selector.value = savedValue;
            selectedOption = savedValue;
        }
    }

    if (selectedOption === "fluid") {
        document.querySelectorAll(".gallery-view-box").forEach(box => {
            box.style.width = "auto";
        });

        setCookie("gridStyle", selectedOption);
    } else {
        document.querySelectorAll(".gallery-view-box").forEach(box => {
            box.style.width = "25%";
        });

        setCookie("gridStyle", selectedOption);
    }
}



//DASHBOARD CODE


(() => {
    if (!window.location.pathname.includes("dashboard.html")) return;
    let userData = null;

    const session = getCookie("session_id");
    if (!session) {
        window.location.href = "index.html";
    } else {
        fetch(`/api/userdata?sid=${session}`)
            .then(res => {
                if (res.status !== 200) {
                    window.location.href = "index.html";
                    return null;
                }
                return res.text();
            })
            .then(text => {
                if (!text) return;
                userData = JSON.parse(text);
            })
            .then(() => {
                const onReady = () => {
                    if (!userData) return;

                    document.getElementById("logout").addEventListener("click", () => {
                        setCookie("session_id", "");
                        window.location.href = "index.html";
                    });

                    document.getElementById("user-greet-text").innerText += ` ${userData["username"]}`;
                    document.getElementById("used-total-storage").innerText = `${(userData["used"] / 1024 ** 3).toFixed(2)} GiB / ${(userData["space"] / 1024 ** 3).toFixed(2)} GiB`;
                    document.getElementById("files-uploaded").innerText = `${userData["files"]} files`;
                    document.getElementById("last-login").innerText = `${new Date(userData["last_login"] * 1000).toLocaleString()}`;
                    
                    document.getElementById("fm-list-view").addEventListener("click", () => {
                        toggleFileView("list");
                    })

                    document.getElementById("fm-gallery-view").addEventListener("click", () => {
                        toggleFileView("gallery");
                    })

                    document.getElementById("upload-file").addEventListener("change", () => {
                        const file = document.getElementById("upload-file").files[0];
                        document.getElementById("selected-file-name").textContent = file ? file.name : "No file selected";
                    });

                    document.getElementById("close-compare-window").addEventListener("click", () => {
                        document.getElementById("server-side-hash").value = "";
                        document.getElementById("client-side-hash").value = "";
                        document.querySelector(".win-main").querySelectorAll("p").forEach(pElement => {
                            pElement.removeAttribute("style");
                        })
                        document.querySelector(".window-overlay").style.display = "none"
                    })

                    document.querySelector(".inspect-close").addEventListener("click", () => {
                        document.querySelector(".inspect-overlay").style.display = "none";
                        document.querySelector(".inspect-body img, .inspect-body video").remove();
                        document.querySelector(".inspect-title").innerText = "";
                    })

                    document.querySelector(".inspect-overlay").addEventListener("click", (e) => {
                        if (e.target.classList[0] === "inspect-overlay") {
                            document.querySelector(".inspect-overlay").style.display = "none";
                            document.querySelector(".inspect-body img, .inspect-body video").remove();
                            document.querySelector(".inspect-title").innerText = "";
                        }
                    })

                    document.getElementById("compare-hash").addEventListener("click", () => {
                        document.querySelector(".win-main").querySelectorAll("p").forEach(pElement => {
                            pElement.removeAttribute("style");
                        })
                        const ssh = document.getElementById("server-side-hash").value;
                        const csh = document.getElementById("client-side-hash").value;
                        const same = compareHash(ssh, csh);
                        if (same) {
                            document.getElementById("compare-success").style.display = "flex";
                        }
                        else {
                            document.getElementById("compare-fail").style.display = "flex";
                        }
                    })

                    const fileManager = document.querySelector('.file-manager');
                    const fileInput = document.getElementById('upload-file');
                    const fileNameLabel = document.getElementById('selected-file-name');
                    const overlay = document.querySelector(".drag-n-drop-overlay");

                    let dragCounter = 0;

                    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt =>
                        fileManager.addEventListener(evt, e => e.preventDefault())
                    );

                    fileManager.addEventListener('dragenter', () => {
                        dragCounter++;
                        overlay.style.display = "flex";
                        fileManager.classList.add('drag-hover');
                    });

                    fileManager.addEventListener('dragleave', () => {
                        dragCounter--;
                        if (dragCounter === 0) {
                            overlay.style.display = "none";
                            fileManager.classList.remove('drag-hover');
                        }
                    });

                    fileManager.addEventListener('drop', (e) => {
                        dragCounter = 0;
                        overlay.style.display = "none";
                        fileManager.classList.remove('drag-hover');

                        const files = e.dataTransfer.files;
                        if (files.length > 0) {
                            fileInput.files = files;
                            fileNameLabel.textContent = files[0].name;
                        }
                    });

                    document.getElementById("grid-system").addEventListener("change", (e) => {
                        toggleGridStyle(true);
                    });

                    document.getElementById("upload-form").addEventListener("submit", function (e) {
                        document.querySelector(".loading-overlay").style.display = "flex";
                        e.preventDefault();
                        const fileInput = document.getElementById("upload-file");
                        const file = fileInput.files[0];

                        const formData = new FormData();
                        formData.append("file", file);

                        fetch("/api/upload", {
                            method: "POST",
                            headers: {
                                "session-id": getCookie("session_id")
                            },
                            body: formData
                        })
                        .then(res => res.text())
                        .then(text => {
                            window.location.reload();
                        })
                        .catch(err => console.error("Upload failed:", err));
                    });

                    fetch(`/api/files?sid=${session}`)
                    .then(res => res.json())
                    .then(files => {
                        const fileList = document.getElementById("file-list");
                        fileList.innerHTML = "";
                        if (files.length === 0) {
                            fileList.innerHTML = "<li>just a web and a lonely spider...</li>";
                            return;
                        }

                        files.forEach(file => {
                            const li = document.createElement("li");
                            li.className = "file-entry";

                            const nameSpan = document.createElement("span");
                            nameSpan.className = "file-name";
                            nameSpan.textContent = file;
                            nameSpan.title = file;

                            const actionsDiv = document.createElement("div");
                            actionsDiv.className = "file-actions";

                            const downloadLink = document.createElement("a");
                            downloadLink.href = `/uploads/${userData.id}/${encodeURIComponent(file)}`;
                            downloadLink.innerHTML = `
                                <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="white" viewBox="0 0 24 24">
                                <path fill-rule="evenodd" d="M13 11.15V4a1 1 0 1 0-2 0v7.15L8.78 8.374a1 1 0 1 0-1.56 1.25l4 5a1 1 0 0 0 1.56 0l4-5a1 1 0 1 0-1.56-1.25L13 11.15Z" clip-rule="evenodd"/>
                                <path fill-rule="evenodd" d="M9.657 15.874 7.358 13H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2.358l-2.3 2.874a3 3 0 0 1-4.685 0ZM17 16a1 1 0 1 0 0 2h.01a1 1 0 1 0 0-2H17Z" clip-rule="evenodd"/>
                                </svg>
                                `;
                            downloadLink.className = "icon-button";
                            downloadLink.setAttribute("title", "Download");
                            downloadLink.setAttribute("target", "_blank");

                            const deleteButton = document.createElement("button");
                            deleteButton.innerHTML = `
                                <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="white" viewBox="0 0 24 24">
                                <path fill-rule="evenodd" d="M8.586 2.586A2 2 0 0 1 10 2h4a2 2 0 0 1 2 2v2h3a1 1 0 1 1 0 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a1 1 0 0 1 0-2h3V4a2 2 0 0 1 .586-1.414ZM10 6h4V4h-4v2Zm1 4a1 1 0 1 0-2 0v8a1 1 0 1 0 2 0v-8Zm4 0a1 1 0 1 0-2 0v8a1 1 0 1 0 2 0v-8Z" clip-rule="evenodd"/>
                                </svg>
                                `;
                            deleteButton.className = "icon-button";
                            deleteButton.setAttribute("title", "Delete");
                            deleteButton.onclick = () => deleteFile(file);

                            const hashbutton = document.createElement("button");
                            hashbutton.innerHTML = `
                                <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                                <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 3v4a1 1 0 0 1-1 1H5m5 4-2 2 2 2m4-4 2 2-2 2m5-12v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7.914a1 1 0 0 1 .293-.707l3.914-3.914A1 1 0 0 1 9.914 3H18a1 1 0 0 1 1 1Z"/>
                                </svg>
                                `;
                            hashbutton.className = "icon-button";
                            hashbutton.setAttribute("title", "File hash");
                            hashbutton.onclick = () => hashFile(file);

                            const sharebutton = document.createElement("button");
                            sharebutton.innerHTML = `
                            <svg class="w-6 h-6 text-gray-800 dark:text-white" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24">
                            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.213 9.787a3.391 3.391 0 0 0-4.795 0l-3.425 3.426a3.39 3.39 0 0 0 4.795 4.794l.321-.304m-.321-4.49a3.39 3.39 0 0 0 4.795 0l3.424-3.426a3.39 3.39 0 0 0-4.794-4.795l-1.028.961"/>
                            </svg>
                            `;
                            sharebutton.className = "icon-button";
                            sharebutton.setAttribute("title", "Share file");
                            sharebutton.onclick = () => copyFileUrl(`/uploads/${userData.id}/${encodeURIComponent(file)}`);

                            actionsDiv.appendChild(sharebutton);
                            actionsDiv.appendChild(hashbutton);
                            actionsDiv.appendChild(downloadLink);
                            actionsDiv.appendChild(deleteButton);

                            li.appendChild(nameSpan);
                            li.appendChild(actionsDiv);
                            fileList.appendChild(li);
                        });
                    const savedView = getCookie("fmView");
                    if (savedView == "gallery") {
                        toggleFileView("gallery");
                    }
                    else {
                        toggleFileView("list")
                    }
                    
                    toggleGridStyle(false);

                    
                    const searchInput = document.getElementById("searchfile");
                    const file_list = document.getElementById("file-list");
                    const allFiles = Array.from(file_list.children);

                    searchInput.addEventListener("input", () => {
                        const currentInput = searchInput.value.toLowerCase();
                        const matchingFiles = allFiles.filter(file => {
                            const name = file.querySelector(".file-name").innerText.toLowerCase();
                            return name.includes(currentInput);
                        })

                        file_list.innerHTML = "";
                        matchingFiles.forEach(file => {
                            file_list.appendChild(file);
                        })
                    })

                    })

                    document.querySelector(".dashboard-container").style.display = "block";
                    document.querySelector(".loading-overlay").style.display = "none";
                };

                if (document.readyState === "loading") {
                    document.addEventListener("DOMContentLoaded", onReady);
                } else {
                    onReady();
                }
            });
    }
})();