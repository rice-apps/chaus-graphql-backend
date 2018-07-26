// Imports

/**
 * Returns all schedules matching filter criteria
 * @param {*} args.filter: 
 * TODO: Add criteria
 */
async function schedules(parent, args, context, info) {
    const where = args.filter
        ? {
        OR: [
            {weekNo: args.filter}
        ]
        }
        : {}

    return context.db.query.schedules(
        { where },
        info
    )
}
  
/**
 * Returns shifts array matching id
 * @param {*} args.filter: 
 * TODO: Change to only return one instead of array
 */
async function shift(parent, args, context, info) {
    return context.db.query.shifts(
        { where: { id: args.filter } },
        info
    )
}
  
/**
 * Returns user availability array where object matches id
 * @param {*} args.filter: 
 * TODO: Change to filter based on user
 */
async function availabilities(parent, args, context, info) {
    return context.db.query.userAvailabilities(
        { where: { id_contains: args.filter } },
        info
    )
}

/**
 * Returns single user availability object matching id
 * @param {*} args.filter: 
 * TODO: Create this
 */

module.exports = {
    schedules,
    shift,
    availabilities
};