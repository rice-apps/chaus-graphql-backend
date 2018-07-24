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

async function shift(parent, args, context, info) {
  return context.db.query.shifts(
    { where: { id: args.filter } },
    info
  )
}

async function availabilities(parent, args, context, info) {
  return context.db.query.userAvailabilities(
    { where: { id_contains: args.filter } },
    info
  )
}

// async function feed(parent, args, context, info) {
//   const where = args.filter
//     ? {
//       // Similar to a real GraphQL query; can explore options using Schema API in Playground
//         OR: [
//           { url_contains: args.filter },
//           { description_contains: args.filter },
//         ],
//       }
//     : {}
//
//   const queriedLinks = await context.db.query.links(
//     // Pagination & Ordering/Sorting options
//     { where, skip: args.skip, first: args.first, orderBy: args.orderBy },
//     // Setting the selection set to id only
//     `{ id }`,
//   )
//
//   const countSelectionSet = `
//     {
//       aggregate {
//         count
//       }
//     }
//   `
//   const linksConnection = await context.db.query.linksConnection({}, countSelectionSet)
//
//   return {
//     count: linksConnection.aggregate.count,
//     // Returns IDs which the next resolver will handle
//     linkIds: queriedLinks.map(link => link.id),
//   }
// }

module.exports = {
  users,
  schedules,
  shift,
  availabilities
}
