const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
var rp = require('request-promise');
var xmlParser = require('xml2js').parseString;
var stripPrefix = require('xml2js').processors.stripPrefix;
var config = require('../config');

async function initialAuthentication(root, args, context, info) {
  // First authenticate ticket using IDP API
  var url = `${config.CASValidateURL}?ticket=${args.ticket}&service=${config.thisServiceURL}`;
  // Initialize response object
  var authPayload = {};
  // Get xml data from CAS
  var xmlBody = await rp(url);
  // Parse XML and wait for callback to finish
  await xmlParser(xmlBody, {
    tagNameProcessors: [stripPrefix],
    explicitArray: false
  }, async (err, result) => {
    if (err) return {};
    serviceResponse = result.serviceResponse;
    // If this property is not null, then authSucceeded
    authSucceeded = serviceResponse.authenticationSuccess;
  });
  // Check for success
  if (authSucceeded) {
    // Check for user in DB
    var user = await context.db.mutation.upsertUser({
      where: { netid: authSucceeded.user },
      create: { netid: authSucceeded.user },
      update: {}
    }, `{ id netid firstName lastName role }`);
    // Create JWT Token
    var token = jwt.sign({
      data: user.netid,
      id: user.id
    }, config.secret, { expiresIn: "30d" });
    // Bundle final response
    var authPayload = {
      user: user,
      token: token
    };
  }
  return authPayload;
}

module.exports = { initialAuthentication }