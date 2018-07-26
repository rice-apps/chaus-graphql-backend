const { authenticateUser } = require('./queryResolvers/AuthQueries');
const { users } = require('./queryResolvers/UserQueries');
const { schedules, shift, availabilities } = require('./queryResolvers/ScheduleQueries');

module.exports = {
  users,
  schedules,
  shift,
  availabilities,
  authenticateUser
}
