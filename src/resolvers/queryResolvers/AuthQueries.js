const jwt = require('jsonwebtoken');
var config = require('../../config');

function authenticateUser(parent, args, context, info) {
    // Get token from input
    var { token } = args;
    // Verify token
    var decoded = jwt.verify(token, config.secret);
    // Return user object
    return decoded.user;
}

module.exports = {
    authenticateUser
}