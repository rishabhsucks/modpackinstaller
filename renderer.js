// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

// Imports
const fs = require('fs')
const path = require('path')
const unzipper = require('unzipper')
const { DownloaderHelper } = require('node-downloader-helper');
const copydir = require('copy-dir')
const childprocess = require('child_process');

// Write messages under text input
function writeOnScreen(message) {
    document.getElementById('error').innerHTML = message;
    document.getElementById('error').style.display = "block";
}

// Convert bytes to megabytes
const bytesToMegaBytes = bytes => bytes / (1024*1024);

// Store temp in appdata
function correctPath(pathToFile) {
    if (process.platform == 'darwin') {
        applicationSupportPath = "/Users/" + process.env.USER + "/Library/Application Support/modpackInstaller"
        pathToFile = pathToFile.substring(1)
        pathToFile = applicationSupportPath + pathToFile
    }
    if (process.platform == "win32") {
        appdataPath = path.join(process.env.APPDATA, "/modpackInstaller")
        pathToFile = pathToFile.substring(1)
        pathToFile = path.join(appdataPath, pathToFile)
    }
    return pathToFile
}

function isModpack() {
    if (!(fs.existsSync(correctPath("./modpack")))) {
        return false;
    }
    if (!(fs.existsSync(correctPath("./modpack/installer")))) {
        return false;
    }
    if(!(fs.existsSync(correctPath("./modpack/installer/profile.json")))) {
        return false;
    }
    if (!(fs.existsSync(correctPath("./modpack/installer/installer.jar")))) {
        return false;
    }
    return true;
}

// Add path to JSON
function prepareJson(profileData) {
    tempProfile = profileData["profiles"]["profile"]
    if (process.platform == "darwin") {
        tempProfile["gameDir"] = path.join("/Users/", process.env.USER, "/Library/Application Support/minecraft/", tempProfile["gameDir"])
    }
    if (process.platform == "win32") {
        tempProfile["gameDir"] = path.join(process.env.APPDATA.replace("\\", "/"), "/", tempProfile["gameDir"])
    }

    return tempProfile
}

// Edit Launcher Profiles
function editLauncherProfiles(tempProfile, callback) {
    if (process.platform == "darwin") {
        launcherProfilePath = path.join("/Users/", process.env.USER, "/Library/Application Support/minecraft/launcher_profiles.json")
    }
    if (process.platform == "win32") {
        launcherProfilePath = path.join(process.env.APPDATA, "/.minecraft/launcher_profiles.json")
    }
    fs.readFile(launcherProfilePath, 'utf8', (err, data) => {
        profileName = tempProfile["name"].toLowerCase().replace(" ", "")
        launcherProfileData = JSON.parse(data)
        launcherProfileData["profiles"][profileName] = tempProfile

        fs.writeFile(launcherProfilePath, JSON.stringify(launcherProfileData), 'utf8', () => {
            callback()
        })
    })
}

// Clean up files
function cleanUp() {
    writeOnScreen("Cleaning up")
    if (fs.existsSync(correctPath("./modpack.zip"))) {
        fs.unlinkSync(correctPath("./modpack.zip"))
    }
    if (fs.existsSync(correctPath("./installer.jar.log"))) {
        fs.unlinkSync(correctPath("./installer.jar.log"))
    }
    if (fs.existsSync(correctPath("./modpack"))) {
        fs.rmSync(correctPath("./modpack"), { recursive: true })
    }

    if (process.platform == "darwin") {
        applicationSupportPath = "/Users/" + process.env.USER + "/Library/Application Support/modpackInstaller"
        if(fs.existsSync(applicationSupportPath)) {
            fs.rmSync(applicationSupportPath, {recursive: true})
        }
    }
    if (process.platform == "win32") {
        appdataPath = path.join(process.env.APPDATA, "/modpackInstaller")
        if (fs.existsSync(appdataPath)) {
            fs.rmSync(appdataPath, { recursive: true })
        }
    }
}

// Clean up in case of errors
function cleanError() {
    try {
        profilePath = correctPath("./modpack/installer/profile.json")
        fs.readFile(profilePath, "utf8", (err, data) => {
            profileData = JSON.parse(data)
            tempProfile = prepareJson(profileData)
            if (fs.existsSync(tempProfile["gameDir"])) {
                fs.rmSync(tempProfile["gameDir"], { recursive: true })
            }
        })
    }
    catch (error) {

    }
    cleanUp()
}

// Download Files
function download(url, dest, name, callback) {
    const dl = new DownloaderHelper(url, dest, {fileName: name});
    dl.on('end', callback)
    dl.on('progress.throttled', stats =>
    {
        writeOnScreen("Downloading: " + stats.progress.toFixed(0) + "% " + bytesToMegaBytes(stats.speed).toFixed(2) + "MB/s");
    })
    dl.on('error', () => {
        cleanUp()
        writeOnScreen("Invalid Download Link!")
        document.getElementById('loader').style.display = "none"
    })
    dl.start();
}

// Install function
function install() {
    console.log("Installing on " + process.platform)
    if (process.platform == "darwin") {
        if (!fs.existsSync("/Users/" + process.env.USER + "/Library/Application Support/modpackInstaller")) {
            fs.mkdirSync("/Users/" + process.env.USER + "/Library/Application Support/modpackInstaller")
        }
    } 
    if (process.platform == "win32") {
        if (!fs.existsSync(path.join(process.env.APPDATA, "/modpackInstaller"))) {
            fs.mkdirSync(path.join(process.env.APPDATA, "/modpackInstaller"))
        }
    }

    document.getElementById('loader').style.display = "block"
    let profileData;
    console.log("Using modpack at " + document.getElementById('link').value)
    try {
        downloadLink = document.getElementById('link').value
        if (!(downloadLink.substr(downloadLink.length - 4) == ".zip")) {
            cleanUp()
            writeOnScreen("Link is not a valid download link!")
            document.getElementById('loader').style.display = "none"
        }
        else {
            download(document.getElementById('link').value, correctPath("./"), "modpack.zip", () => {
                writeOnScreen("Extracting");
                fs.createReadStream(correctPath('./modpack.zip'))
                    .pipe(unzipper.Extract({ path: correctPath('./') })).on('close', () => {
                        writeOnScreen("Verifying Modpack")
                        if (!(isModpack())) {
                            cleanUp();
                            writeOnScreen("Link is not a valid modpack!");
                            document.getElementById('loader').style.display = "none"
                        }
                        else {
                            writeOnScreen("Moving Game Directory");
                            profilePath = correctPath("./modpack/installer/profile.json")
                            fs.readFile(profilePath, "utf8", (err, data) => {
                                profileData = JSON.parse(data)
                                tempProfile = prepareJson(profileData)
                                copydir.sync(correctPath("./modpack"), tempProfile["gameDir"])
                                writeOnScreen("Installing Modloader")
                                childprocess.exec('java -jar \"' + correctPath('./modpack/installer/installer.jar') + "\"", { encoding: 'utf-8', cwd: correctPath("./")}, () => {
                                    writeOnScreen("Inserting Profile")
                                    editLauncherProfiles(tempProfile, () => {
                                        cleanUp()
                                        console.log("done!")
                                        document.getElementById('loader').style.display = "none"
                                        writeOnScreen("Modpack Successfully Installed")
                                    })
                                });
                            });
                        }   
                });
        
            })
        }
    }
    catch (error) {
        cleanError()
        writeOnScreen("Error Installing Modpack")
        document.getElementById('loader').style.display = "none"
    }
}

// Add install function to button
document.getElementById('install').onclick = install;