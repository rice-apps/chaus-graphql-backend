const { authenticateUser } = require('./queryResolvers/AuthQueries');
const { user, users } = require('./queryResolvers/UserQueries');
const { schedules, shift, availabilities } = require('./queryResolvers/ScheduleQueries');

module.exports = {
  users,
  user,
  schedules,
  shift,
  availabilities,
  authenticateUser
}
