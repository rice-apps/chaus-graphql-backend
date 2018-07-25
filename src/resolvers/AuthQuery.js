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
  // var response = await request(url, async (err, response, body) => {
  //   if (err) return {};
  //   // XML Stuff that we don't need to worry about
  //   return xmlParser(body, {
  //     tagNameProcessors: [stripPrefix],
  //     explicitArray: false
  //   }, async (err, result) => {
  //     if (err) return {};
  //     serviceResponse = result.serviceResponse;
  //     // If this property is not null, then authSucceeded
  //     var authSucceeded = serviceResponse.authenticationSuccess;
  //     // Check for success
  //     if (authSucceeded) {
  //       // Check for user in DB
  //       user = await context.db.mutation.upsertUser({
  //         where: { netid: authSucceeded.user },
  //         create: { netid: authSucceeded.user },
  //         update: {}
  //       }, `{ id netid firstName lastName role }`);
  //       // Create JWT Token
  //       var token = jwt.sign({
  //         data: user.netid,
  //         id: user.id
  //       }, config.secret, { expiresIn: "30d" });
  //       // Bundle final response
  //       var authPayload = {
  //         user: user,
  //         token: token
  //       };
  //       // Return Auth Payload containing user and token
  //       // return authPayload;
  //       return user;
  //     }
  //     else {
  //       return {};
  //     }
  //   });
  // });
}

function user(root, args, context, info) {
  return context.db.query.user({ where: { id: root.user.id } }, info)
}

module.exports = { initialAuthentication }

// Reference
// Login Process
async function login(parent, args, context, info) {
  // 1: Validate ticket against CAS Server
  var url = `${config.CASValidateURL}?ticket=${args.ticket}&service=${config.thisServiceURL}`;
  return await request(url, (err, response, body) => {
    if (err) return {};
    // 2: Parse XML
    return xmlParser(body, {
                tagNameProcessors: [stripPrefix],
                explicitArray: false
            }, async (err, result) => {
              if (err) return {};
              serviceResponse = result.serviceResponse;
              var authSucceded = serviceResponse.authenticationSuccess;
              // 3: Check if authentication succeeded
              if (authSucceded) {
                // 4: Check if user authenticated exists in our DB
                const existingUser = await context.db.query.users({
                  netid: authSucceded.user
                }, `{ id }`)
                if (existingUser) {
                  var token = jwt.sign({
                    data: authSucceded,
                    userID: existingUser.id
                  }, config.secret)
                  return token
                }
                else {
                  const newUser = await context.db.mutation.createUser({
                    data: { netid: authSucceded.user }
                  }, `{ id }`)
                  var token = jwt.sign({
                    data: authSucceded,
                    userID: newUser.id
                  }, config.secret)
                  return token
                }
              }
            });
          })
}