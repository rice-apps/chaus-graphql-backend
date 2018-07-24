const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
var request = require('request');
var xmlParser = require('xml2js').parseString;
var config = require('../config');
const { APP_SECRET, DAYS_OF_WEEK, getUserId } = require('../utils')

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

// Login Process
async function login(parent, args, context, info) {
  // 1: Validate ticket against CAS Server
  var url = `${config.CASValidateURL}?ticket=${args.ticket}&service=${config.thisServiceURL}`;
  return await request(url, (err, response, body) => {
    if (err) return {};
    // 2: Parse XML
    return xmlParser(body, {
                tagNameProcessors: [stripPrefix],
                explicitArray: false
            }, async (err, result) => {
              if (err) return {};
              serviceResponse = result.serviceResponse;
              var authSucceded = serviceResponse.authenticationSuccess;
              // 3: Check if authentication succeeded
              if (authSucceded) {
                // 4: Check if user authenticated exists in our DB
                const existingUser = await context.db.query.users({
                  netid: authSucceded.user
                }, `{ id }`)
                if (existingUser) {
                  var token = jwt.sign({
                    data: authSucceded,
                    userID: existingUser.id
                  }, config.secret)
                  return token
                }
                else {
                  const newUser = await context.db.mutation.createUser({
                    data: { netid: authSucceded.user }
                  }, `{ id }`)
                  var token = jwt.sign({
                    data: authSucceded,
                    userID: newUser.id
                  }, config.secret)
                  return token
                }
              }
            });
          })
}

// Schedule Mutations
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

async function addUserToSchedules(parent, args, context, info) {
  // Find user in DB
  let User = await context.db.query.users({
    where: { netid_contains: args.netid }
  }, `{ id }`);
  // Should only be one value
  User = User[0];
  // Get all schedules
  const schedules = await context.db.query.schedules({
    where: {}
  }, `{ id week { id shifts { id } } }`);
  let requests = [];
  // Iterate thru each schedule
  for (var currentSchedule of schedules) {
    // Iterate thru each day of schedule
    for (var day of currentSchedule.week) {
      // Map thru each shift asynchronously
      // WHY: This makes the process much faster since the await statements execute in parallel
      day.shifts.map(async (shift) => {
        // Find out whether user availability object already created for this user in this shift
        const existingAvailability = await context.db.query.userAvailabilities({
          where: { user: { id: User.id }, shift: { id: shift.id } }
        }, `{ id }`);
        // Above will return array of 1 object, so we just need 0th element
        existingAvailability[0] ?
        // If it exists
        console.log("Already Exists!") :
        // If not
        // Create User Availability Variable
        requests.push(context.db.mutation.createUserAvailability({
          data: {
            shift: { connect: { id: shift.id } },
            user: { connect: { id: User.id } },
            availability: 0
          }
        }, `{ id }`));
      });
    }
  }
  // Executed remaining statements in parallel
  await Promise.all(requests);
  return User;
}

async function deleteSchedule(parent, args, context, info) {
  return context.db.mutation.deleteSchedule({
    where: { id: args.id }
  });
}

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

function updateShiftAvailability(parent, args, context, info) {
  return context.db.mutation.updateUserAvailability({
    data: { availability: args.availability },
    where: { id: id }
  }, `{ id }`);
}

/*
Inputs
  parent: Same as root
  args: object containing args specified in schema (url, description)
  context: allows resolvers to communicate with each other; able to pass data
  and functions to the resolvers
  info: carries info on the incoming GraphQL query
*/
// async function signup(parent, args, context, info) {
//   // Encrypts user's password
//   const password = await bcrypt.hash(args.password, 10)
//   // Creates user in the Prisma DB using a binding, and hardcodes 'id' into
//   // selection set so that users can't access other fields (like password)
//   const user = await context.db.mutation.createUser({
//     data: { ...args, password },
//   }, `{ id }`)
//
//   // Signed JWT with APP_SECRET
//   const token = jwt.sign({ userId: user.id }, APP_SECRET)
//
//   return {
//     token,
//     user,
//   }
// }
//
// async function login(parent, args, context, info) {
//   // Using Prisma Binding to retrieve existing user from db who has this email
//   const user = await context.db.query.user({ where: { email: args.email } }, ` { id password } `)
//   if (!user) {
//     throw new Error('No such user found')
//   }
//
//   // Validates user submitted password to the one stored
//   const valid = await bcrypt.compare(args.password, user.password)
//   if (!valid) {
//     throw new Error('Invalid password')
//   }
//
//   // Creates signed JWT
//   const token = jwt.sign({ userId: user.id }, APP_SECRET)
//
//   return {
//     token,
//     user,
//   }
// }
//
// function post(parent, args, context, info) {
//   // Uses our helper functiont to verify user
//   const userId = getUserId(context)
//   // Uses our prisma binding mutation
//   return context.db.mutation.createLink(
//     {
//       data: {
//         url: args.url,
//         description: args.description,
//         // connect creates a relation between user & link
//         postedBy: { connect: { id: userId } },
//       },
//     },
//     info,
//   )
// }
//
// async function vote(parent, args, context, info) {
//   // Validation of user
//   const userId = getUserId(context)
//
//   // Check if the user has already voted
//   const linkExists = await context.db.exists.Vote({
//     user: { id: userId },
//     // Link ID is an arg from schema
//     link: { id: args.linkId },
//   })
//   if (linkExists) {
//     throw new Error(`Already voted for link: ${args.linkId}`)
//   }
//
//   // If user hasn't already voted, create a vote object
//   return context.db.mutation.createVote(
//     {
//       data: {
//         // Associate UserID and LinkID to Vote
//         user: { connect: { id: userId } },
//         link: { connect: { id: args.linkId } },
//       },
//     },
//     info,
//   )
// }
//
// module.exports = {
//     signup,
//     login,
//     post,
//     vote
// }

module.exports = {
  createUser,
  updateUser,
  deleteUser,
  addUserToSchedules,
  createSchedule,
  deleteSchedule,
  updateShiftAvailabilities,
  updateShiftAvailability,
  updateShiftScheduled
}
