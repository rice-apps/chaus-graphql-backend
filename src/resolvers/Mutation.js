// Side resolvers
const { initialAuthentication } = require('./mutationResolvers/AuthMutations');
const { 
  createUser, 
  updateUser, 
  deleteUser } = require('./mutationResolvers/UserMutations');
const { 
  createSchedule, 
  deleteSchedule, 
  updateShiftAvailabilities, 
  updateShiftScheduled } = require('./mutationResolvers/ScheduleMutations');

module.exports = {
  createUser,
  updateUser,
  deleteUser,
  createSchedule,
  deleteSchedule,
  updateShiftAvailabilities,
  updateShiftScheduled,
  initialAuthentication
}
