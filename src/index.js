// This is how we use GraphQL & Express together
const { GraphQLServer } = require('graphql-yoga')
// This is how we can use Prisma for context
const { Prisma } = require('prisma-binding')

// Resolvers: Allow us to interact with our DB in specified ways
const Query = require('./resolvers/Query')
const Mutation = require('./resolvers/Mutation')
// const AuthPayload = require('./resolvers/AuthPayload')
// const Subscription = require('./resolvers/Subscription')
// const Feed = require('./resolvers/Feed')
// Create resolver object
const resolvers = {
  Query, Mutation
}


// Initializes server based on schema, resolvers, context (prisma-bindings)
const server = new GraphQLServer({
  // The usual schema we defined
  typeDefs: 'src/schema.graphql',
  resolvers,
  context: (req) => ({
    // Requires Node v8
    ...req,
    // A prisma binding
    db: new Prisma({
      // This is generated from our .graphqlconfig.yml file
      typeDefs: 'src/generated/prisma.graphql',
      // Endpoint of our Prisma DB
      endpoint: 'https://us1.prisma.sh/will-mundy-9280b5/chaus-gql/dev',
      // Local Endpoint
      // endpoint: 'http://localhost:4466/chaus-graphql/dev',
      // Since we are interacting with our Prisma Backend, we need its secret to access
      secret: 'itsCHAUSbiatches',
      debug: true,
    }),
  }),
})
// Starts server
server.start(() => console.log(`Server is running on http://localhost:4000`))
