const jwt = require('jsonwebtoken')
// Used to sign JWT tokens (independent from PRISMA secret)
const APP_SECRET = 'GraphQL-is-aw3some'
// List of Days
const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
                      'Saturday', 'Sunday']

// Helper function called by resolvers which require auth
function getUserId(context) {
  // Retrieves Authorization header
  const Authorization = context.request.get('Authorization')
  if (Authorization) {
    // Gets token
    const token = Authorization.replace('Bearer ', '')
    // Verifies token against APP_SECRET; if verified returns user specified
    // in token
    const { userId } = jwt.verify(token, APP_SECRET)
    return userId
  }

  throw new Error('Not authenticated')
}

module.exports = {
  APP_SECRET,
  getUserId,
  DAYS_OF_WEEK
}
