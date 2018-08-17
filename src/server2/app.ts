import * as Hapi from "hapi"
import * as Inert from "inert"
import { graphiqlHapi, graphqlHapi } from "apollo-server-hapi"
import * as Boom from "boom";
import * as Path from "path"
import * as moment from "moment"
import * as HapiBasicAuth from "hapi-auth-basic"
import { HapiAuthJWT } from "./utils/auth/plugins/hapi-auth-jwt"
import setGraphiqlStrategy from "./utils/auth/strategies/auth-basic-graphiql"
import setGraphqlStrategy from "./utils/auth/strategies/auth-jwt-graphql"
import { config } from "./config"
import { getSchema } from "./graphql/default"
import routeHandler_auth from "./routes/auth"
import routeHandler_Root from "./routes/root"
import ApiGraphQL, { GraphQLContext } from "./graphql/V1";
import database2 from "@server/database2";
import HapiLogPlugin from "@server/utils/Logger/hapi-log-plugin"

moment.locale("fr");

let server: Hapi.Server = undefined;

export const getServer = () => server;

async function createServer(){

    // -- création du serveur
    server = new Hapi.Server({ 
        ...config.server,
        //debug: { request: ['error'] }
    });

    // -- cache
    const cache = server.cache({ segment: "sessions", expiresIn: 1 * 24 * 60 * 60 * 1000 });
    server.app["cache"] = cache;

    // -- enregistrement de plugins
    await server.register(HapiBasicAuth);       // authentification basic
    await server.register(HapiAuthJWT);         // authentification basic jwt
    await server.register(Inert);               // static files and directory
    await server.register(HapiLogPlugin)        // log server

    // -- enregistrement des stratégies d'authentifications
    setGraphiqlStrategy(server);
    setGraphqlStrategy(server);

    //#region ROUTES

    // -- /
    server.route({
        method: "GET",
        path: "/",
        options: {
            log: { collect: true }
        },
        handler: routeHandler_Root
    })

    // -- files
    server.route({
        method: 'GET',
        path: '/static/{param*}',
        handler: {
            directory: {
                path: "./build/static",
                listing: false,
                index: false
            }
        }
    })

    // -- /api_v1/graphql
    await server.register({
        plugin: graphqlHapi as any,
        options: {
            path: "/api_v1/graphql",
            route: {
                auth: "auth-jwt-graphql",
            },
            graphqlOptions: (request: Hapi.Request) => {
                return {
                    schema: ApiGraphQL.getSchema(),
                    context: {
                        auth: request.auth,
                        request: request,
                        credentials: request.auth.credentials,
                        db: database2
                    } as GraphQLContext,
                    formatError: err => {
                        console.debug(err);
                        if(err.originalError && Boom.isBoom(err.originalError)){

                        }
                        return err;
                    },
                    debug: true
                }
            }
        },
    })

    // -- /api_v1/graphiql
    await server.register({
        plugin: graphiqlHapi as any,
        options:{
            path: "/api_v1/graphiql",
            route: {
                description: "GraphiQL Endpoint (documentation)",
                auth: "auth-basic-graphiql",
                ext: {
                    onPreResponse: [{
                        method: async (request, reply: Hapi.ResponseToolkit) => {
                            let _response = request.response;
                            let _token = (request.auth && request.auth.credentials) ? request.auth.credentials.token : undefined;

                            if(_response.isBoom || !_response.source || !_token){
                                return reply.continue;
                            }
                            return reply.response(request.response.source.replace("</head>", `
                                <script>
                                window.__TOKEN = "${_token}";
                                console.info("A new AccessToken '${_token}' was automatically injected into this debug session.");
                                </script>
                                </head>
                            `));
                        }
                    }]
                }
            },
            graphiqlOptions: {
                endpointURL: "/api_v1/graphql",
                passHeader: "'Authorization': window.__TOKEN ? 'JWT ' + window.__TOKEN : ''"
            }
        }
    })

    // -- /api/graphql
    /*
    await server.register({
        plugin: graphqlHapi as any,
        options: {
            path: "/api/graphql",
            route: {
                auth: "auth-jwt-graphql",
            },
            graphqlOptions: (request: Hapi.Request) => {
                return {
                    schema: getSchema(),
                    context: {
                        auth: request.auth,
                        request: request,
                        credentials: request.auth.credentials
                    },
                    formatError: err => {
                        console.debug(err);
                        if(err.originalError && Boom.isBoom(err.originalError)){

                        }
                        return err;
                    },
                    debug: true
                }
            }
        },
    })

    // -- /graphiql
    await server.register({
        plugin: graphiqlHapi as any,
        options:{
            path: "/graphiql",
            route: {
                description: "GraphiQL Endpoint (documentation)",
                auth: "auth-basic-graphiql",
                ext: {
                    onPreResponse: [{
                        method: async (request, reply: Hapi.ResponseToolkit) => {
                            let _response = request.response;
                            let _token = (request.auth && request.auth.credentials) ? request.auth.credentials.token : undefined;

                            if(_response.isBoom || !_response.source || !_token){
                                return reply.continue;
                            }
                            return reply.response(request.response.source.replace("</head>", `
                                <script>
                                window.__TOKEN = "${_token}";
                                console.info("A new AccessToken '${_token}' was automatically injected into this debug session.");
                                </script>
                                </head>
                            `));
                        }
                    }]
                }
            },
            graphiqlOptions: {
                endpointURL: "/api/graphql",
                passHeader: "'Authorization': window.__TOKEN ? 'JWT ' + window.__TOKEN : ''"
            }
        }
    })*/

    // -- /auth
    server.route({
        method: "POST",
        path: "/auth",
        handler: routeHandler_auth
    })

    // -- /all pages
    server.route({
        method: "*",
        path: "/{p*}",
        options: {
            log: { collect: true }
        },
        handler: (request, reply) => {
            return reply.response("Not found").code(404);
            //return "Not found";
        }
    })

    //#endregion

    return server;
}


export default createServer;