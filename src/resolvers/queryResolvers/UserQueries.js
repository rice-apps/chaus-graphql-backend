// Imports

/**
 * Function: Returns list of users matching filter criteria
 * @param {*} args.filter: Filters list of users based on property
 * TODO: Add possible criteria like role
 */
async function users(parent, args, context, info) {
    const where = args.filter
      ? {
        OR: [
          { netid_contains: args.filter },
          { firstName_contains: args.filter },
          { lastName_contains: args.filter }
        ]
      }
      : {}
    return context.db.query.users(
      { where },
      info
    )
}

module.exports = {
    users
}