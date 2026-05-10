const fs = require("node:fs");

function normalize(error) {
  if (error && error.code === "EISDIR" && error.syscall === "readlink") {
    error.code = "EINVAL";
    error.message = error.message.replace("EISDIR", "EINVAL");
  }

  return error;
}

const readlink = fs.readlink.bind(fs);
fs.readlink = function patchedReadlink(path, options, callback) {
  if (typeof options === "function") {
    return readlink(path, (error, linkString) => {
      options(error ? normalize(error) : null, linkString);
    });
  }

  return readlink(path, options, (error, linkString) => {
    callback(error ? normalize(error) : null, linkString);
  });
};

const readlinkSync = fs.readlinkSync.bind(fs);
fs.readlinkSync = function patchedReadlinkSync(path, options) {
  try {
    return readlinkSync(path, options);
  } catch (error) {
    throw normalize(error);
  }
};

const promisesReadlink = fs.promises.readlink.bind(fs.promises);
fs.promises.readlink = async function patchedPromisesReadlink(path, options) {
  try {
    return await promisesReadlink(path, options);
  } catch (error) {
    throw normalize(error);
  }
};
