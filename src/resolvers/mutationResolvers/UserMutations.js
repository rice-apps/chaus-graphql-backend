// Imports

// User Mutations
async function createUser(parent, args, context, info) {
    // Creates user in DB (must be capitalized bc of how its returned)
    const User = await context.db.mutation.createUser({
        data: { ...args }
    }, `{ id netid firstName lastName }`);
    // Adds user to all shifts of every schedule
    // Where we will store all our requests (to execute at end)
    let requests = [];
    // Get all schedules
    const schedules = await context.db.query.schedules({
        where: {}
    }, `{ id week { id shifts { id } } }`);
    // Iterate thru each schedule
    for (var currentSchedule of schedules) {
        // Add user to userSchedule property for every schedule
        requests.push(context.db.mutation.updateSchedule({
        data: {
            userSchedules: { create: {
            user: { connect: { id: User.id } },
            scheduledShifts: []
            }}
        },
        where: { id: currentSchedule.id }
        }));
        // Iterate thru each day of schedule
        for (var day of currentSchedule.week) {
        // Iterate thru each shift of day
        for (var shift of day.shifts) {
            // Create User Availability Variable
            requests.push(context.db.mutation.createUserAvailability({
            data: {
                    shift: { connect: { id: shift.id } },
                    user: { connect: { id: User.id } },
                    availability: 0
                    }
            }, `{ id }`));
        }
        }
    }
    // Executed all in parallel
    await Promise.all(requests);
    return User;
}

async function updateUser(parent, args, context, info) {
    // Using Prisma Binding to retrieve existing user from db who has this email
    let user = await context.db.query.user({ where: { netid: args.netid } }, ` { id } `)
    if (!user) {
      throw new Error('No such user found')
    }
  
    // Iterate through args, set updatedProperties to updated values
    Object.keys(args).map((arg) => {
      // Get the new arg value by key
      let argVal = args[arg]
      // Replace property in user variable
      user = {...user, [arg]: argVal}
    });
  
    // Destructuring to separate id field, which we need for 'where'
    let {id, ...updatedUser} = user;
  
    //Updates user object with new properties
    return context.db.mutation.updateUser({
      data: {...updatedUser},
      where: { id }
    }, info)
}
  
async function deleteUser(parent, args, context, info) {
    // Prisma has cascading delete system, so we just delete user & prisma handles
    // deletion of connected user availabilities
    return context.db.mutation.deleteUser({
        where: {netid: args.netid}
    }, info)
}

module.exports = {
    createUser,
    updateUser,
    deleteUser
}