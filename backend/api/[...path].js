const { app, prepareApp } = require("../index");

let readyPromise;

module.exports = async (req, res) => {
  if (!readyPromise) {
    readyPromise = prepareApp();
  }
  await readyPromise;
  return app(req, res);
};
