// This file is required by the index.html file and will
// be executed in the renderer process for that window.
// No Node.js APIs are available in this process because
// `nodeIntegration` is turned off. Use `preload.js` to
// selectively enable features needed in the rendering
// process.

// -- { Imports } --
const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");
const { DownloaderHelper } = require("node-downloader-helper");
const copydir = require("copy-dir");
const childprocess = require("child_process");

//  -- { Util functions } --

// Write messages under text input
function writeOnScreen(message) {
  document.getElementById("error").innerHTML = message;
  document.getElementById("error").style.display = "block";
}

// Convert bytes to megabytes
const bytesToMegaBytes = (bytes) => bytes / (1024 * 1024);

// Store temp files in appdata
function correctPath(pathToFile) {
  if (process.platform == "darwin") {
    applicationSupportPath =
      "/Users/" +
      process.env.USER +
      "/Library/Application Support/modpackInstaller";
    pathToFile = pathToFile.substring(1);
    pathToFile = applicationSupportPath + pathToFile;
  }
  if (process.platform == "win32") {
    appdataPath = path.join(process.env.APPDATA, "/modpackInstaller");
    pathToFile = pathToFile.substring(1);
    pathToFile = path.join(appdataPath, pathToFile);
  }
  return pathToFile;
}

// Determine if a downloaded file is a modpack
function isModpack() {
  if (!fs.existsSync(correctPath("./modpack"))) {
    return false;
  }
  if (!fs.existsSync(correctPath("./modpack/installer"))) {
    return false;
  }
  if (!fs.existsSync(correctPath("./modpack/installer/profile.json"))) {
    return false;
  }
  if (!fs.existsSync(correctPath("./modpack/installer/installer.jar"))) {
    return false;
  }
  return true;
}

// Add correct path to game JSON
function prepareJson(profileData) {
  tempProfile = profileData["profiles"]["profile"];
  if (process.platform == "darwin") {
    tempProfile["gameDir"] = path.join(
      "/Users/",
      process.env.USER,
      "/Library/Application Support/minecraft/",
      tempProfile["gameDir"]
    );
  }
  if (process.platform == "win32") {
    tempProfile["gameDir"] = path.join(
      process.env.APPDATA.replace("\\", "/"),
      "/",
      tempProfile["gameDir"]
    );
  }

  return tempProfile;
}

// Edit Launcher Profiles
function editLauncherProfiles(tempProfile, callback) {
  if (process.platform == "darwin") {
    launcherProfilePath = path.join(
      "/Users/",
      process.env.USER,
      "/Library/Application Support/minecraft/launcher_profiles.json"
    );
  }
  if (process.platform == "win32") {
    launcherProfilePath = path.join(
      process.env.APPDATA,
      "/.minecraft/launcher_profiles.json"
    );
  }
  fs.readFile(launcherProfilePath, "utf8", (err, data) => {
    profileName = tempProfile["name"].toLowerCase().replace(" ", "");
    launcherProfileData = JSON.parse(data);
    launcherProfileData["profiles"][profileName] = tempProfile;

    fs.writeFile(
      launcherProfilePath,
      JSON.stringify(launcherProfileData),
      "utf8",
      () => {
        callback();
      }
    );
  });
}

// Get bundled Java from Minecraft launcher
function getJavaRuntime() {
  if (process.platform == "darwin") {
    return path.join(
      "/Users/",
      process.env.USER,
      "/Library/Application Support/minecraft/runtime/jre-x64/jre.bundle/Contents/Home/bin/java"
    );
  }
  if (process.platform == "win32") {
    // TODO
    return "java";
  }
}

// Clean up files
function cleanUp() {
  writeOnScreen("Cleaning up");
  if (fs.existsSync(correctPath("./modpack.zip"))) {
    fs.unlinkSync(correctPath("./modpack.zip"));
  }
  if (fs.existsSync(correctPath("./installer.jar.log"))) {
    fs.unlinkSync(correctPath("./installer.jar.log"));
  }
  if (fs.existsSync(correctPath("./modpack"))) {
    fs.rmSync(correctPath("./modpack"), { recursive: true });
  }

  if (process.platform == "darwin") {
    applicationSupportPath =
      "/Users/" +
      process.env.USER +
      "/Library/Application Support/modpackInstaller";
    if (fs.existsSync(applicationSupportPath)) {
      fs.rmSync(applicationSupportPath, { recursive: true });
    }
  }
  if (process.platform == "win32") {
    appdataPath = path.join(process.env.APPDATA, "/modpackInstaller");
    if (fs.existsSync(appdataPath)) {
      fs.rmSync(appdataPath, { recursive: true });
    }
  }
}

// Clean up in case of errors
function cleanError() {
  try {
    profilePath = correctPath("./modpack/installer/profile.json");
    fs.readFile(profilePath, "utf8", (err, data) => {
      profileData = JSON.parse(data);
      tempProfile = prepareJson(profileData);
      if (fs.existsSync(tempProfile["gameDir"])) {
        fs.rmSync(tempProfile["gameDir"], { recursive: true });
      }
    });
  } catch (error) {}
  cleanUp();
}

// Download Files
function download(url, dest, name, callback) {
  const dl = new DownloaderHelper(url, dest, { fileName: name });
  dl.on("end", callback);
  dl.on("progress.throttled", (stats) => {
    writeOnScreen(
      "Downloading: " +
        stats.progress.toFixed(0) +
        "% " +
        bytesToMegaBytes(stats.speed).toFixed(2) +
        "MB/s"
    );
  });
  dl.on("error", () => {
    cleanUp();
    writeOnScreen("Invalid Download Link!");
    document.getElementById("loader").style.display = "none";
  });
  dl.start();
}

// Start and stop loader
function startLoader() {
  document.getElementById("loader").style.display = "block";
}

function stopLoader() {
  document.getElementById("loader").style.display = "none";
}

// TODO - Increase list of downloadable websites
function isModpackURL(downloadLink) {
  if (downloadLink.substr(downloadLink.length - 4) == ".zip") {
    return true;
  } else if (
    downloadLink.includes("dropbox") &&
    downloadLink.charAt(downloadLink.length - 1) == "1"
  ) {
    return true;
  } else {
    return false;
  }
}

// -- { Installer stages } --

// Make temporary dirs
function makeTempDirs() {
  console.log("Installing on " + process.platform);
  if (process.platform == "darwin") {
    if (
      !fs.existsSync(
        "/Users/" +
          process.env.USER +
          "/Library/Application Support/modpackInstaller"
      )
    ) {
      fs.mkdirSync(
        "/Users/" +
          process.env.USER +
          "/Library/Application Support/modpackInstaller"
      );
    }
  }
  if (process.platform == "win32") {
    if (!fs.existsSync(path.join(process.env.APPDATA, "/modpackInstaller"))) {
      fs.mkdirSync(path.join(process.env.APPDATA, "/modpackInstaller"));
    }
  }
}

// Download modpack
function downloadModpack(callback) {
  startLoader();
  console.log("Using modpack at " + document.getElementById("link").value);
  downloadLink = document.getElementById("link").value;
  if (isModpackURL(downloadLink)) {
    download(
      document.getElementById("link").value,
      correctPath("./"),
      "modpack.zip",
      callback
    );
  } else {
    cleanUp();
    writeOnScreen("Link is not a valid download link!");
    stopLoader();
  }
}

// extract modpack zip
function extractModpack(callback) {
  writeOnScreen("Extracting");
  fs.createReadStream(correctPath("./modpack.zip"))
    .pipe(unzipper.Extract({ path: correctPath("./") }))
    .on("close", callback);
}

// verify that the modpack is a modpack
function verifyModpack(callback) {
  writeOnScreen("Verifying");
  if (!isModpack()) {
    cleanUp();
    writeOnScreen("Link is not a valid modpack!");
    stopLoader();
    throw error;
  }
  callback();
}

// move the modpack to the target directory
function moveModpack(callback) {
  writeOnScreen("Moving Game Directory");
  profilePath = correctPath("./modpack/installer/profile.json");
  fs.readFile(profilePath, "utf8", (err, data) => {
    let profileData = JSON.parse(data);
    tempProfile = prepareJson(profileData);
    if (fs.existsSync(tempProfile["gameDir"])) {
      fs.unlinkSync(path.join(tempProfile["gameDir"], "/mods"));
      copydir.sync(
        correctPath("./modpack/mods"),
        path.join(tempProfile["gameDir"], "/mods")
      );
    } else {
      copydir.sync(correctPath("./modpack"), tempProfile["gameDir"]);
    }
    callback(tempProfile);
  });
}

// install the modloader (forge, fabric, etc)
function installModloader(callback) {
  writeOnScreen("Installing Modloader");
  childprocess.exec(
    `"${getJavaRuntime()}" -jar "` +
      correctPath("./modpack/installer/installer.jar") +
      `"`,
    { encoding: "utf-8", cwd: correctPath("./") },
    callback
  );
}

// install the launcher profile
function installProfile(tempProfile, callback) {
  writeOnScreen("Inserting Profile");
  editLauncherProfiles(tempProfile, callback);
}

// cleanup
function cleanInstall() {
  cleanUp();
  console.log("done!");
  stopLoader();
  writeOnScreen("Modpack Successfully Installed");
}

// -- { Main install function } --
function install() {
  startLoader();
  try {
    makeTempDirs();
    downloadModpack(() =>
      extractModpack(() =>
        verifyModpack(() =>
          moveModpack((tempProfile) =>
            installProfile(tempProfile, () =>
              installModloader(() => cleanInstall())
            )
          )
        )
      )
    );
  } catch (error) {
    cleanError();
    writeOnScreen("Error Installing Modpack");
    stopLoader();
  }
}

// Add install function to button
document.getElementById("install").onclick = install;
