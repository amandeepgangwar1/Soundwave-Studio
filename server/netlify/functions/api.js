const serverless = require("serverless-http");
const { app, prepareApp } = require("../../index");

const expressHandler = serverless(app);

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await prepareApp();
  return expressHandler(event, context);
};
