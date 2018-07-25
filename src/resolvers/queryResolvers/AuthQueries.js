const jwt = require('jsonwebtoken');
var config = require('../../config');

async function authenticateUser(parent, args, context, info) {
    // Get token from input
    var { token } = args;
    // Verify token
    var updatedUser = {};
    const jwtPromise = new Promise((resolve, reject) => {
        jwt.verify(token, config.secret, (err, decoded) => {
            if (err) {
                return reject();
            }
            resolve(decoded);
        });
    });
    await jwtPromise
    .then(async (decoded) => {
        updatedUser = await context.db.query.user({
            where: { netid: decoded.user.netid }
        }, `{ id netid firstName lastName role }`);
    })
    .catch((err) => {});
    return updatedUser;
}

module.exports = {
    authenticateUser
}