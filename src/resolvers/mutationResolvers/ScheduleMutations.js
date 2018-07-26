// Imports
const { DAYS_OF_WEEK } = require('../../utils')

// Schedule Mutations
/**
 * Complex function which builds a schedule 
 * @param {*} args.weekNo
 * TODO: Accomodate better filters for multiple calendars
 */
async function createSchedule(parent, args, context, info) {
    // Get all current users
    const users = await context.db.query.users({
      where: {}
    }, `{ id }`);
    // Build Week
    const schedule = await context.db.mutation.createSchedule({
      data: { ...args }
    }, `{ id }`)
    // Build Days
    let dayObjects = []
    for (var i in DAYS_OF_WEEK) {
      var dayName = DAYS_OF_WEEK[i]
      dayObjects.push(context.db.mutation.createDay({
        data: { dayName }
      }, `{ id dayName shifts { id } }`))
    }
    // Wait for everything to build
    dayObjects = await Promise.all(dayObjects)
    // Build Shifts in each day
    let allShifts = []
    for (i in dayObjects) {
      // Get day id
      var id = dayObjects[i].id;
      // Shift Array for this specific day
      let dayShifts = []
      // Daily hours
      var dailyOpen = 7;
      var dailyClose = 24;
      // M-Th: open through hours 7am - midnight
      if (i < 4) {
        var open = 7;
        var close = 24;
      }
      // Friday: iterate through hours 7am - 5pm
      else if (i == 4) {
        var open = 7;
        var close = 16;
      }
      // Saturday: iterate through hours 10am - 5pm
      else if (i == 5) {
        var open = 10;
        var close = 16;
      }
      // Sunday: iterate through hours 2pm - midnight
      else if (i == 6) {
        var open = 14;
        var close = 24;
      }
      for (var startTime = dailyOpen; startTime <= dailyClose; startTime++) {
        // Each shift is 1 hour long
        var endTime = startTime + 1;
        // Set open or closed
        if (startTime >= open && startTime <= close) {
          var closed = false;
        }
        else {
          var closed = true;
        }
        // Create shift object
        var shift = context.db.mutation.createShift({
          data: { 
            startTime, endTime, closed, 
            day: { connect: { id: id } } 
          }
        }, `{ id closed }`);
        // Add shift to list of shifts for day
        dayShifts.push(shift);
      }
      // Add array of day's shifts to array of all shifts
      allShifts.push(dayShifts);
    }
    // Wait for all shifts to Build (in a parallel batch)
    allShifts = await Promise.all(allShifts.map((shiftArray) => Promise.all(shiftArray)));
    // Create user availabilities
    console.log(allShifts);
    // Execute all tasks in parallel by using async to map thru each shift of each day
    allShifts.map(async (shiftArray) => shiftArray.map(async (shift) => {
      if (!shift.closed) {
        for (let user of users) {
          await context.db.mutation.updateShift({
            /*
            This is tricky. Let's walkthru it step by step.
            1) data: represents data we want to UPDATE
            2) availabilities: this is what aspect of updateShift we want to change
            3) create: this is the command we need in order to CREATE a new element
                       in the array. Command can be found in generated file; in the
                       UserAvailabilityUpdateManyWithoutShiftInput input.
            4) To create a UserAvailability object, we need to turn to the input of
               UserAvailabilityCreateWithoutShiftInput, which specifies that the
               properties of 'user' and 'availability' must be filled (altho availability
               is optional). So we fill both fields out
            5) Inside the user property, we need to create a relation between the User
               object and this UserAvailability object. Thus, we use 'connect', and
               only need to specify the id (as it is a unique property for each user).
            6) Finally, since updateShift takes two arguments, we need to do the other
               one, which is 'where'. This just allows us to specify which exact
               shift object needs to be updated. In this case, we just specify the
               id to be shift.id (obtained by map)
            */
            data: { availabilities: {
              create: {
                user: { connect: { id: user.id } },
                availability: 0
              }
            } },
            // Get current shift
            where: { id: shift.id }
          })
        }
      }
    }));
    // No Promise.all needed because we awaited in previous command
    // Attach each shift array to its respective day
    let dayUpdates = [];
    // i is integer; index of dayObjects corresponds to index of allShifts
    for (i in dayObjects) {
      // Get Shift Objects by Id (since createShift doesn't return actual shift objects,
      // which the following mutation needs)
      // dayShifts = []
      // for (let shift in allShifts[i]) {
      //   dayShifts.push(context.db.query.shifts({
      //     where: { id: allShifts[i][shift]}
      //   }))
      // }
      dayUpdates.push(context.db.mutation.updateDay({
        data: {
          /*
          allShifts[i] is a list of shift objects with id, which allows us to form relation between
          Shift Objects in allShifts and the shifts field of Day Object
          */
          shifts: { connect: allShifts[i].map( (shift) => {
            // Decontruct to omit closed property
            var { closed, ...shift } = shift;
            return shift;
          }) }
        },
        // Only adjusting corresponding Day Object; ensured to be unique because id
        where: { id: dayObjects[i].id }
      }, `{ id }`));
    }
    // Wait for all days to be updated with new shifts
    dayUpdates = await Promise.all(dayUpdates);
    // Create UsersScheduled Objects
    var userSchedules = [];
    // Map through each user in parallel
    users.map(async (user) => {
      var userSchedule = context.db.mutation.createUserSchedule({
        data: {
          // Create relation to user object by id
          user: { connect: { id: user.id } },
          scheduledShifts: []
        }
      }, `{ id }`);
      // Currently a promise
      userSchedules.push(userSchedule);
    });
    userSchedules = await Promise.all(userSchedules);
    // Add days to week
    return context.db.mutation.updateSchedule({
      data: {
        week: { connect: dayUpdates },
        userSchedules: { connect: userSchedules }
      },
      where: { id: schedule.id }
    }, info);
    // return {
    //   schedule
    // }
}

/**
 * Delete schedule given id
 * @param {*} args.id: ID of schedule to delete 
 */
async function deleteSchedule(parent, args, context, info) {
    return context.db.mutation.deleteSchedule({
      where: { id: args.id }
    });
}

/**
 * Update shift availabilities of given shifts for a given netid
 * @param {*} args.netid: 
 * @param {*} args.shiftAvailabilities: 
 */
async function updateShiftAvailabilities(parent, args, context, info) {
    // Update Many UserAvailibilities
    // 1-4 -- availability
    let availabilityUpdates = []
    for (let i = 1; i <= 4; i++) {
      // Check which shift availabilities are 1, 2, 3, 4 and group them together
      let filteredShifts = args.shiftAvailabilities
      // Only get objects where availability == i
      .filter((shiftAvail) => shiftAvail.availability == i)
      // Only get the shift property of that object
      .map((shiftObj) => shiftObj.shift);
      console.log(filteredShifts);
      // Create mutations based on group, and then will execute in parallel later
      availabilityUpdates.push(
        context.db.mutation.updateManyUserAvailabilities({
          data: { availability: i },
          // Only updates shifts where user matches & shift matches with filteredShifts
          where: { user: { netid: args.netid }, shift: { id_in: filteredShifts } }
        })
      );
    }
    // console.log("Here!");
    // Execute all updates in parallel
    await Promise.all(availabilityUpdates);
    console.log(availabilityUpdates);
    return "meme";
}

/**
 * Update shift's scheduled users
 * @param {*} args.id: Shift to update
 * @param {*} args.users: Users to be scheduled for shift
 */
async function updateShiftScheduled(parent, args, context, info) {
    // Get existing scheduled users
    const currentShift = await context.db.query.shift({
      where: { id: args.id }
    }, `{ scheduled { netid } }`);
    // Remove netids not in input
    var usersToRemove = currentShift.scheduled.filter((user) => {
      var { netid } = user;
      // If netid not in updated scheduled list, user will be removed
      var filteredUsers = args.users.filter((user) => {
        // Check if netid currently scheduled is equal to that of user in input
        return netid == user.netid;
      });
      // If length == 0, then user not in input, and will be removed
      return filteredUsers.length == 0;
    });
    // Remove shifts from usersToRemove scheduled property
    usersToRemove.map(async (user) => {
      // First get associated UserSchedule object id
      var userScheduleObj = await context.db.query.userSchedules({
        where: { user: { netid: user.netid } },
        first: 1
      }, `{ id }`);
      // We receive an array, so we need to pluck the first value
      userScheduleId = userScheduleObj[0].id;
      context.db.mutation.updateUserSchedule({
        data: {
          // Disconnect unscheduled shift from user
          scheduledShifts: { disconnect: { id: args.id } }
        },
        // Find UserSchedule object by user
        where: { id: userScheduleId }
      });
    });
    // Add shifts to users not being removed
    args.users.map(async (user) => {
      var userScheduleObj = await context.db.query.userSchedules({
        where: { user: { netid: user.netid } },
        first: 1
      }, `{ id }`);
      // We receive an array, so we need to pluck the first value's id
      userScheduleId = userScheduleObj[0].id;
      context.db.mutation.updateUserSchedule({
        data: {
          // Connect newly scheduled shift for user
          scheduledShifts: { connect: { id: args.id } }
        },
        // Find UserSchedule object by user
        where: { id: userScheduleId }
      });
    });
    return context.db.mutation.updateShift({
      data: { scheduled: {
        disconnect: usersToRemove,
        connect: args.users
      } },
      where: { id: args.id }
    }, `{ id }`);
}


module.exports = {
    createSchedule,
    deleteSchedule,
    updateShiftAvailabilities,
    updateShiftScheduled
}